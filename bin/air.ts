#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import { loadConfig, migrateConfig } from '../src/config/loader';
import { createHealthTracker } from '../src/health/tracker';
import { selectCandidate, formatRouteDecision } from '../src/router/router';
import { AiderAdapter } from '../src/adapters/aider';
import { MockAdapter } from '../tests/mock-adapter';
import { runProcess } from '../src/execution/runner';
import { classifyOutcome } from '../src/types/outcome';
import { getErrorAction, triggersFailover, type ErrorCategory } from '../src/types/errors';
import { defaultStateForTask, type ResultState } from '../src/types/result';
import type { TaskInput } from '../src/types';
import { snapshotGit, formatDirtyReport } from '../src/context/checkpoint';
import { makeRunId, writeTaskState, appendTaskIndex } from '../src/execution/task-state';
import { trace } from '../src/observability/trace';
import { redact } from '../src/security/redact';
import { classifyError } from '../src/adapters/conformance';

const program = new Command();

program
  .name('air')
  .description('Unified AI tool orchestrator')
  .version('0.1.0');

function listAdapters(): any[] {
  // MVP: only the mock adapter is registered for tests.
  return [new MockAdapter()];
}

async function runAction(task: string, options: { files?: string[]; auto?: boolean; allowDirty?: boolean; readOnly?: boolean }) {
  console.log(chalk.cyan('air run'));
  console.log(chalk.gray('Task:'), task);

  const cwd = process.cwd();
  const snap = snapshotGit(cwd);
  const isWriteTask = !options.readOnly;

  if (isWriteTask && snap.dirty && !options.allowDirty) {
    console.log(chalk.red(formatDirtyReport(snap)));
    process.exit(4);
  }

  const { config } = await loadConfig({ cwd });
  const tracker = createHealthTracker();
  await tracker.load();

  const adapters = listAdapters();
  const runId = makeRunId();
  await appendTaskIndex(runId);

const taskInput: TaskInput = {
    id: runId,
    prompt: task,
    cwd,
    files: options.files,
    mode: options.auto ? 'auto' : 'ask',
    readOnly: !!options.readOnly,
  };

  const decision = selectCandidate(taskInput, adapters, tracker);
  if (!decision.chosen) {
    console.log(chalk.red('No eligible candidate.'));
    console.log(chalk.gray(formatRouteDecision(decision)));
    process.exit(2);
  }

  const chosen = decision.chosen;
  const adapter = adapters.find((a) => a.id === chosen.id)!;
  const spec = adapter.buildCommand(taskInput);

  const state = {
    runId,
    task,
    cwd,
    adapter: chosen.id,
    provider: chosen.provider,
    model: chosen.model,
    state: 'RUNNING' as const,
    startedAt: new Date().toISOString(),
    hops: 1,
    maxHops: config.failover.maxHops,
  };
  await writeTaskState(state);
  trace({ runId, event: 'router_pick', chosen: chosen.id, skips: decision.skips });

  const { outcome } = await runProcess(spec, {
    timeoutMs: config.timeouts.defaultMs,
    maxBufferBytes: config.buffers.maxBytes,
    onStdout: (c: string) => process.stdout.write(c),
    onStderr: (c: string) => process.stderr.write(c),
  });

  const fact = classifyOutcome(outcome);
  let category: ErrorCategory = (fact.category as ErrorCategory) ?? adapter.classifyError(outcome.exitCode, outcome.stderr);

  let result: ResultState;
  if (outcome.cancelled) {
    result = 'CANCELLED';
  } else if (outcome.timedOut) {
    result = 'FAILED';
  } else if (outcome.spawnError) {
    result = 'FAILED';
  } else if (outcome.exitCode === 0) {
    // Exit 0 alone is not proof of success; MVP treats exit 0 with output as success.
    result = defaultStateForTask(!!options.readOnly, outcome.stdout.length > 0);
  } else {
    result = 'FAILED';
  }

  const endedAt = new Date().toISOString();
  await writeTaskState({
    ...state,
    state: result === 'SUCCEEDED_WITH_CHANGES' || result === 'SUCCEEDED_READ_ONLY' ? 'COMPLETED' : 'FAILED',
    result,
    endedAt,
    error: result !== 'SUCCEEDED_WITH_CHANGES' && result !== 'SUCCEEDED_READ_ONLY'
      ? { category, message: outcome.stderr.slice(0, 500) }
      : undefined,
  });

  trace({ runId, event: 'run_complete', result, category, durationMs: outcome.durationMs });

  if (outcome.cancelled) {
    console.log(chalk.yellow('Cancelled by user.'));
    process.exit(3);
  }
  if (outcome.timedOut) {
    console.log(chalk.red('Timed out.'));
    process.exit(1);
  }
  if (outcome.spawnError) {
    console.log(chalk.red(`Tool not available: ${outcome.spawnError.message}`));
    process.exit(1);
  }
  if (outcome.exitCode !== 0) {
    const action = getErrorAction(category);
    if (triggersFailover(category) && options.auto) {
      console.log(chalk.yellow(`Failover proposed (${category}). Action: ${action}. Auto-switch not wired yet in Phase 2.`));
    } else {
      console.log(chalk.red(`Failed (${category}). Action: ${action}`));
    }
    process.exit(1);
  }
  console.log(chalk.green(`Succeeded (${result}).`));
  process.exit(0);
}

program
  .command('run')
  .description('Route and run a task')
  .argument('<task>', 'Task description')
  .option('-f, --files <files...>', 'Files to include')
  .option('--auto', 'Auto-switch on failover')
  .option('--allow-dirty', 'Allow running on a dirty working tree (non-destructive)')
  .option('--read-only', 'Treat the task as read-only; empty diff is a valid outcome')
  .action(runAction);
function showStatus(options: { json?: boolean }) {
  const tracker = createHealthTracker();
  return tracker.load().then(() => {
    const data = {
      command: 'status',
      version: '0.1.0',
      tools: [{ id: 'mock', provider: 'openrouter', model: 'mock-model', available: true }],
      providers: ['openrouter'],
      models: ['mock-model'],
      cooldowns: tracker.getCooldowns().map((c) => ({
        provider: c.provider,
        model: c.model,
        until: c.until,
        reason: c.reason,
      })),
      health: [],
    };
    if (options.json) {
      process.stdout.write(JSON.stringify(data) + '\n');
      return;
    }
    console.log(chalk.cyan('air status'));
    console.log(chalk.gray('Tools:'), data.tools.map((t) => t.id).join(', ') || 'none');
    console.log(chalk.gray('Cooldowns:'), data.cooldowns.length);
  });
}

program
  .command('status')
  .description('Show tools, providers, models, and active cooldowns')
  .option('--json', 'Emit machine-readable JSON')
  .action(showStatus);

program
  .command('health')
  .description('Alias for `air status` (tools, providers, models, and active cooldowns)')
  .option('--json', 'Emit machine-readable JSON')
  .action(showStatus);

program
  .command('route-test')
  .description('Test routing without executing')
  .argument('<task>', 'Task description')
  .option('--explain', 'Print routing reasoning without executing')
  .option('--json', 'Emit machine-readable JSON')
  .action(async (task: string, options: { explain?: boolean; json?: boolean }) => {
    const tracker = createHealthTracker();
    await tracker.load();
    const decision = selectCandidate(
      { id: 'route-test', prompt: task, cwd: process.cwd(), mode: 'ask' },
      listAdapters(),
      tracker,
    );
    const report = formatRouteDecision(decision);
    const payload = {
      command: 'route-test',
      task,
      chosen: decision.chosen ? { id: decision.chosen.id, provider: decision.chosen.provider, model: decision.chosen.model } : null,
      skips: decision.skips,
      considered: decision.considered,
    };
    if (options.json) {
      process.stdout.write(JSON.stringify(payload) + '\n');
      return;
    }
    console.log(chalk.cyan('air route-test'));
    console.log(report);
  });

const configCmd = program
  .command('config')
  .description('Show or edit configuration')
  .option('--validate', 'Validate config and report errors')
  .action(async (options: { validate?: boolean }) => {
    if (options.validate) {
      const { config, errors } = await loadConfig({ cwd: process.cwd() });
      if (errors.length > 0) {
        for (const e of errors) console.log(chalk.red(redact(e)));
        process.exit(4);
      }
      console.log(chalk.green('Config is valid.'));
      console.log(chalk.gray('Version:'), config.version);
      console.log(chalk.gray('Failover mode:'), config.failover.mode);
      return;
    }
    console.log(chalk.cyan('air config'));
    console.log(chalk.yellow('Not implemented yet'));
  });

configCmd
  .command('migrate')
  .description('Upgrade config to the current schema version')
  .action(async () => {
    const result = await migrateConfig();
    if (result.ok) {
      console.log(chalk.green(result.message));
    } else {
      console.log(chalk.red(result.message));
      process.exit(4);
    }
  });

program
  .command('mcp')
  .description('Start MCP server (stdio)')
  .action(() => {
    console.log(chalk.cyan('air mcp'));
    console.log(chalk.yellow('Not implemented yet'));
  });

program.parse();
