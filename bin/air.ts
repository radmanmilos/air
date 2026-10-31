#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import { loadConfig, migrateConfig } from '../src/config/loader';
import { createHealthTracker } from '../src/health/tracker';
import { selectCandidate, formatRouteDecision } from '../src/router/router';
import { AiderAdapter } from '../src/adapters/aider';
import { availableAdapters, adapterStatus } from '../src/adapters/registry';
import { runProcess } from '../src/execution/runner';
import { classifyOutcome } from '../src/types/outcome';
import { getErrorAction, triggersFailover, type ErrorCategory } from '../src/types/errors';
import { defaultStateForTask, type ResultState } from '../src/types/result';
import type { TaskInput } from '../src/types';
import { snapshotGit, formatDirtyReport } from '../src/context/checkpoint';
import { makeRunId, writeTaskState, appendTaskIndex } from '../src/execution/task-state';
import { trace } from '../src/observability/trace';
import { redact } from '../src/security/redact';
import { runVerify, formatVerifyReport } from '../src/context/verify';
import { startMcp } from '../src/mcp/server';
import { defaultAllowList, checkHandoffAllowlist, buildHandoff } from '../src/security/allowlist';

const program = new Command();

program
  .name('air')
  .description('Unified AI tool orchestrator')
  .version('0.1.0');

function listAdapters(): any[] {
  // Production registry: real adapters only, discovered from PATH.
  // MockAdapter is test-only and injected explicitly by tests.
  return availableAdapters();
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

  const allow = defaultAllowList(adapters);
  const visited = new Set<string>();
  let hops = 0;
  const maxHops = config.failover.maxHops;
  let lastCategory: ErrorCategory = 'UNKNOWN';

  // Failover loop: try candidates until success, abort, or hop cap.
  while (hops < maxHops) {
    const decision = selectCandidate(taskInput, adapters, tracker);
    if (!decision.chosen) {
      console.log(chalk.red('No eligible candidate.'));
      console.log(chalk.gray(formatRouteDecision(decision)));
      process.exit(2);
    }

    const chosen = decision.chosen;
    const adapter = adapters.find((a) => a.id === chosen.id)!;
    const key = `${adapter.provider}/${adapter.model}`;
    if (visited.has(key)) {
      console.log(chalk.red(`Candidate ${chosen.id} already visited; refusing to loop.`));
      process.exit(2);
    }
    visited.add(key);
    hops++;

    const spec = adapter.buildCommand(taskInput);
    const beforeSnap = snapshotGit(cwd);
    const state = {
      runId,
      task,
      cwd,
      adapter: chosen.id,
      provider: chosen.provider,
      model: chosen.model,
      state: 'RUNNING' as const,
      startedAt: new Date().toISOString(),
      hops,
      maxHops,
    };
    await writeTaskState(state);
    trace({ runId, event: 'router_pick', chosen: chosen.id, skips: decision.skips, hops });

    const { outcome } = await runProcess(spec, {
      timeoutMs: config.timeouts.defaultMs,
      maxBufferBytes: config.buffers.maxBytes,
      onStdout: (c: string) => process.stdout.write(c),
      onStderr: (c: string) => process.stderr.write(c),
    });

    const fact = classifyOutcome(outcome);
    let category: ErrorCategory = (fact.category as ErrorCategory) ?? adapter.classifyError(outcome.exitCode, outcome.stderr);
    lastCategory = category;

    // Update health tracker before the next routing decision (R4-03).
    if (outcome.cancelled) {
      tracker.recordFailure(adapter.provider, adapter.model, 'PROCESS_CRASH');
    } else if (outcome.timedOut) {
      tracker.recordFailure(adapter.provider, adapter.model, 'TIMEOUT');
      tracker.setCooldown(adapter.provider, adapter.model, Date.now() + config.failover.cooldownMinutes * 60_000, 'TIMEOUT');
    } else if (outcome.spawnError) {
      tracker.recordFailure(adapter.provider, adapter.model, 'TOOL_NOT_INSTALLED');
    } else if (outcome.exitCode === 0) {
      tracker.recordSuccess(adapter.provider, adapter.model);
    } else {
      tracker.recordFailure(adapter.provider, adapter.model, category);
      if (category === 'RATE_LIMIT' || category === 'QUOTA_EXCEEDED') {
        tracker.setCooldown(adapter.provider, adapter.model, Date.now() + config.failover.cooldownMinutes * 60_000, category);
      }
    }
    await tracker.flush();

    // Determine result from actual workspace delta, not stdout length (G3-03).
    const afterSnap = snapshotGit(cwd);
    const changed = afterSnap.staged.length > 0 || afterSnap.unstaged.length > 0 || afterSnap.untracked.length > 0;
    let result: ResultState;
    if (outcome.cancelled) {
      result = 'CANCELLED';
    } else if (outcome.timedOut || outcome.spawnError) {
      result = 'FAILED';
    } else if (outcome.exitCode === 0) {
      if (isWriteTask) {
        result = changed ? 'SUCCEEDED_WITH_CHANGES' : 'NO_CHANGES';
      } else {
        result = changed ? 'NEEDS_USER_REVIEW' : 'SUCCEEDED_READ_ONLY';
      }
    } else {
      result = 'FAILED';
    }

    const endedAt = new Date().toISOString();
    await writeTaskState({
      ...state,
      state: result === 'SUCCEEDED_WITH_CHANGES' || result === 'SUCCEEDED_READ_ONLY' || result === 'NO_CHANGES' ? 'COMPLETED' : 'FAILED',
      result,
      endedAt,
      error: result !== 'SUCCEEDED_WITH_CHANGES' && result !== 'SUCCEEDED_READ_ONLY' && result !== 'NO_CHANGES'
        ? { category, message: outcome.stderr.slice(0, 500) }
        : undefined,
    });

    trace({ runId, event: 'run_complete', result, category, durationMs: outcome.durationMs, hops, changed });

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
    if (outcome.exitCode === 0) {
      if (result === 'NO_CHANGES') {
        console.log(chalk.yellow('Tool exited 0 but no workspace changes detected (NO_CHANGES).'));
        process.exit(0);
      }
      console.log(chalk.green(`Succeeded (${result}).`));
      process.exit(0);
    }

    // Non-zero exit: decide failover.
    const action = getErrorAction(category);
    if (triggersFailover(category)) {
      if (options.auto && hops < maxHops) {
        const nextDecision = selectCandidate(
          { ...taskInput, preferredTool: undefined },
          adapters.filter((a) => a.id !== adapter.id),
          tracker,
        );
        const next = nextDecision.chosen;
        if (!next) {
          console.log(chalk.red(`No alternative candidate (${category}). Action: ${action}`));
          process.exit(2);
        }
        const nextAdapter = adapters.find((a) => a.id === next.id)!;
        const allowCheck = checkHandoffAllowlist(adapter, nextAdapter, allow);
        if (!allowCheck.ok) {
          console.log(chalk.yellow(`Handoff blocked: ${allowCheck.reason}. Action: ${action}`));
          process.exit(2);
        }
        // Inject handoff into the next run's task prompt.
        const handoff = buildHandoff(taskInput, adapter, nextAdapter);
        taskInput.prompt = `${task}\n\n--- handoff ---\n${handoff}`;
        console.log(chalk.yellow(`Auto-switching to ${next.id} (${category}).`));
        console.log(chalk.gray(handoff));
        continue;
      }
      console.log(chalk.yellow(`Failover proposed (${category}). Action: ${action}.`));
      process.exit(2);
    }
    console.log(chalk.red(`Failed (${category}). Action: ${action}`));
    process.exit(1);
  }

  console.log(chalk.red(`Hop cap reached (${maxHops}).`));
  process.exit(2);
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
      tools: adapterStatus(),
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
    console.log(chalk.gray('Tools:'), data.tools.map((t) => `${t.id}${t.available ? '' : ' (unavailable)'}`).join(', ') || 'none');
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
  .action(async () => {
    // MCP speaks JSON-RPC on stdout; diagnostics go to stderr only.
    process.stderr.write('air mcp: starting MCP server on stdio\n');
    await startMcp();
  });

program
  .command('verify')
  .description('Run an approved verification command (array args, no shell)')
  .argument('<cmd...>', 'Command and arguments')
  .option('--cwd <dir>', 'Working directory')
  .action((cmd: string[], options: { cwd?: string }) => {
    const result = runVerify(cmd, options.cwd ?? process.cwd());
    console.log(formatVerifyReport(result));
    process.exit(result.ok ? 0 : 1);
  });

program.parse();
