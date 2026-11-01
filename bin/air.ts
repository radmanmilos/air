#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import { loadConfig, migrateConfig } from '../src/config/loader';
import { createHealthTracker } from '../src/health/tracker';
import { selectCandidate, selectCandidateFrom, isBlockedByAllowlist, formatRouteDecision } from '../src/router/router';
import { AiderAdapter } from '../src/adapters/aider';
import { availableAdapters, adapterStatus } from '../src/adapters/registry';
import { runProcess } from '../src/execution/runner';
import { classifyOutcome } from '../src/types/outcome';
import { getErrorAction, triggersFailover, type ErrorCategory } from '../src/types/errors';
import { defaultStateForTask, type ResultState } from '../src/types/result';
import type { TaskInput } from '../src/types';
import { snapshotGit, snapshotDelta, formatDirtyReport, formatDeltaReport } from '../src/context/checkpoint';
import { makeRunId, writeTaskState, appendTaskIndex } from '../src/execution/task-state';
import { trace } from '../src/observability/trace';
import { redact } from '../src/security/redact';
import { checkVerifyTrust, runVerify, formatVerifyReport } from '../src/context/verify';
import { startMcp } from '../src/mcp/server';
import { buildHandoffPack } from '../src/context/handoff';
import { checkModels, formatModelCheck } from '../src/router/check-models';
import { EXIT_CODES, type ExitCode } from '../src/types/exit-codes';
import { defaultAllowList, checkHandoffAllowlist } from '../src/security/allowlist';

const program = new Command();

program
  .name('air')
  .description('Unified AI tool orchestrator')
  .version('0.1.0');

function listAdapters(config?: any): any[] {
  // Production registry: real adapters only, discovered from PATH.
  // MockAdapter is test-only and injected explicitly by tests.
  return availableAdapters(config);
}

async function runAction(task: string, options: { files?: string[]; auto?: boolean; allowDirty?: boolean; readOnly?: boolean }) {
  console.log(chalk.cyan('air run'));
  console.log(chalk.gray('Task:'), task);

  const cwd = process.cwd();
  const snap = snapshotGit(cwd);
  const isWriteTask = !options.readOnly;

  if (isWriteTask && snap.dirty && !options.allowDirty) {
    console.log(chalk.red(formatDirtyReport(snap)));
    process.exit(EXIT_CODES.CONFIG_OR_DIRTY);
  }

  const { config } = await loadConfig({ cwd });
  const tracker = createHealthTracker();
  await tracker.load();

  const adapters = listAdapters(config);
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
    const decision = selectCandidateFrom(
      taskInput,
      adapters,
      tracker,
      visited,
      allow,
    );
    if (!decision.chosen) {
      console.log(chalk.red('No eligible candidate.'));
      console.log(chalk.gray(formatRouteDecision(decision)));
      process.exit(EXIT_CODES.ALL_EXHAUSTED);
    }

    const chosen = decision.chosen;
    const adapter = adapters.find((a) => a.id === chosen.id)!;
    const revisitKey = `${chosen.id}|${chosen.provider}|${chosen.model}`;
    if (visited.has(revisitKey)) {
      console.log(chalk.red(`Candidate ${chosen.id} already visited; refusing to loop.`));
      process.exit(EXIT_CODES.ALL_EXHAUSTED);
    }
    visited.add(revisitKey);
    hops++;

    // Build the task's provider-destination policy from the actual first
    // selected candidate, not adapters[0] (R5-04).
    if (hops === 1) {
      allow.providers = [chosen.provider];
      allow.models = [chosen.model];
    }

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

    // Determine result from the agent-produced delta relative to the initial
    // snapshot, not from whether the tree is dirty at all (R5-07). Pre-
    // existing staged/unstaged/untracked files are NOT counted as agent
    // changes, so read-only tasks with unrelated initial dirt are not marked
    // as modified by AIR.
    const afterSnap = snapshotGit(cwd);
    const delta = snapshotDelta(beforeSnap, afterSnap);
    const changed = delta.dirty;
    let result: ResultState;
    if (outcome.cancelled) {
      result = 'CANCELLED';
    } else if (outcome.timedOut || outcome.spawnError) {
      result = 'FAILED';
    } else if (outcome.exitCode === 0) {
      if (isWriteTask) {
        result = changed ? 'SUCCEEDED_WITH_CHANGES' : 'NO_CHANGES';
      } else {
        // Read-only: pre-existing dirt is not agent work.
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
      delta: {
        staged: delta.staged,
        unstaged: delta.unstaged,
        untracked: delta.untracked,
        deleted: delta.deleted,
      },
      error: result !== 'SUCCEEDED_WITH_CHANGES' && result !== 'SUCCEEDED_READ_ONLY' && result !== 'NO_CHANGES'
        ? { category, message: outcome.stderr.slice(0, 500) }
        : undefined,
    });

    trace({ runId, event: 'run_complete', result, category, durationMs: outcome.durationMs, hops, changed, delta: formatDeltaReport(delta) });

    if (outcome.cancelled) {
      console.log(chalk.yellow('Cancelled by user.'));
      process.exit(EXIT_CODES.USER_CANCELLED);
    }
    if (outcome.timedOut) {
      console.log(chalk.red('Timed out.'));
      process.exit(EXIT_CODES.TIMEOUT);
    }
    if (outcome.spawnError) {
      console.log(chalk.red(`Tool not available: ${outcome.spawnError.message}`));
      process.exit(EXIT_CODES.TASK_FAILURE);
    }
    if (outcome.exitCode === 0) {
      if (result === 'NO_CHANGES') {
        console.log(chalk.yellow('Tool exited 0 but no workspace changes detected (NO_CHANGES).'));
        process.exit(EXIT_CODES.NO_CHANGES);
      }
      console.log(chalk.green(`Succeeded (${result}).`));
      process.exit(EXIT_CODES.SUCCESS);
    }

    // Non-zero exit: decide failover.
    const action = getErrorAction(category);
    if (triggersFailover(category) && hops < maxHops) {
      // Resolve the next eligible candidate using the shared policy:
      // executable availability, verification/enabled state, cooldown,
      // allow-list, capabilities and revisit prevention (R5-04/R5-05).
      const nextDecision = selectCandidateFrom(
        { ...taskInput, preferredTool: undefined },
        adapters,
        tracker,
        visited,
        allow,
      );
      const next = nextDecision.chosen;
      if (!next) {
        console.log(chalk.red(`No alternative candidate (${category}). Action: ${action}`));
        process.exit(EXIT_CODES.ALL_EXHAUSTED);
      }
      const nextAdapter = adapters.find((a) => a.id === next.id)!;

      // Provider-destination policy (R5-04): a change of provider or model
      // requires an allow-list entry or explicit one-task consent. `--auto`
      // must never bypass provider restrictions.
      const allowCheck = checkHandoffAllowlist(adapter, nextAdapter, allow);
      const proposal = {
        runId,
        from: { id: adapter.id, provider: adapter.provider, model: adapter.model },
        to: { id: nextAdapter.id, provider: nextAdapter.provider, model: nextAdapter.model },
        category,
        action,
        task: taskInput.prompt,
        handoff: buildHandoffPack({
          cwd,
          prompt: task,
          from: { id: adapter.id, provider: adapter.provider, model: adapter.model },
          to: { id: nextAdapter.id, provider: nextAdapter.provider, model: nextAdapter.model },
          mode: options.auto ? 'auto' : 'ask',
          files: options.files,
          category,
          summary: outcome.stderr.slice(0, 200),
          outputTail: outcome.stderr.slice(-2048),
          before: beforeSnap,
          after: afterSnap,
        }),
      };

      if (!allowCheck.ok) {
        console.log(chalk.yellow(`Handoff blocked: ${allowCheck.reason}. Action: ${action}`));
        console.log(chalk.gray(`Proposed switch to ${nextAdapter.id} (${nextAdapter.provider}/${nextAdapter.model}) was blocked by the provider-destination policy.`));
        process.exit(EXIT_CODES.ALL_EXHAUSTED);
      }

      if (options.auto) {
        // `--auto` switches within the same provider/model allow-list only.
        // It must never bypass provider restrictions (R5-04).
        taskInput.prompt = `${task}\n\n--- handoff ---\n${proposal.handoff}`;
        console.log(chalk.yellow(`Auto-switching to ${next.id} (${category}).`));
        console.log(chalk.gray(proposal.handoff));
        continue;
      }

      // `ask` (default): propose the failover and continue in the same process
      // when the user approves. Never label a proposal-only exit as
      // ALL_EXHAUSTED (R5-04).
      const approved = await promptApproveFailover(proposal);
      if (!approved) {
        console.log(chalk.yellow(`Failover declined for ${runId}.`));
        process.exit(EXIT_CODES.ALL_EXHAUSTED);
      }
      taskInput.prompt = `${task}\n\n--- handoff ---\n${proposal.handoff}`;
      console.log(chalk.yellow(`Approved failover; switching to ${next.id} (${category}).`));
      console.log(chalk.gray(proposal.handoff));
      continue;
    }
    console.log(chalk.red(`Failed (${category}). Action: ${action}`));
    process.exit(EXIT_CODES.TASK_FAILURE);
  }

  console.log(chalk.red(`Hop cap reached (${maxHops}).`));
  process.exit(EXIT_CODES.ALL_EXHAUSTED);
}

/** Interactive approval prompt for a failover proposal (R5-04). Reads from
 *  stdin so the same process can approve and continue the run. Falls back to
 *  declining when stdin is not a TTY. */
async function promptApproveFailover(proposal: {
  runId: string;
  from: { id: string; provider: string; model: string };
  to: { id: string; provider: string; model: string };
  category: string;
  action: string;
  handoff: string;
}): Promise<boolean> {
  if (!process.stdin.isTTY) {
    // Non-interactive: decline by default so `ask` never auto-switches.
    return false;
  }
  process.stdout.write(chalk.cyan('\nair: failover proposed\n'));
  process.stdout.write(chalk.gray(`  run:      ${proposal.runId}\n`));
  process.stdout.write(chalk.gray(`  from:     ${proposal.from.id} (${proposal.from.provider}/${proposal.from.model})\n`));
  process.stdout.write(chalk.gray(`  to:       ${proposal.to.id} (${proposal.to.provider}/${proposal.to.model})\n`));
  process.stdout.write(chalk.gray(`  reason:   ${proposal.category}\n`));
  process.stdout.write(chalk.gray(`  action:   ${proposal.action}\n`));
  process.stdout.write(chalk.gray(`  handoff:  ${proposal.handoff.split('\n')[0]}\n`));
  process.stdout.write(chalk.cyan('Approve failover? [y/N] '));

  return new Promise<boolean>((resolve) => {
    const onAnswer = (data: Buffer) => {
      const raw = data.toString().trim().toLowerCase();
      process.stdin.removeListener('data', onAnswer);
      process.stdin.resume();
      resolve(raw === 'y' || raw === 'yes');
    };
    process.stdin.setEncoding('utf8');
    process.stdin.removeListener('data', onAnswer);
    process.stdin.on('data', onAnswer);
    process.stdin.resume();
  });
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
    // CLI-supplied commands are always trusted (G3-11).
    const trust = checkVerifyTrust(cmd, [], options.cwd ?? process.cwd(), 'cli');
    if (!trust.trusted) {
      console.log(chalk.red(`Verify refused: ${trust.reason}`));
      process.exit(EXIT_CODES.CONFIG_OR_DIRTY);
    }
    const result = runVerify(cmd, options.cwd ?? process.cwd());
    console.log(formatVerifyReport(result));
    process.exit(result.ok ? 0 : 1);
  });

program
  .command('verify-repo')
  .description('Run the repo-configured verify command through the trust gate')
  .option('--cwd <dir>', 'Working directory')
  .action(async (options: { cwd?: string }) => {
    const cwd = options.cwd ?? process.cwd();
    const { config } = await loadConfig({ cwd });
    if (!config.verify.enabled || !config.verify.command) {
      console.log(chalk.yellow('No verify command configured for this repo.'));
      process.exit(EXIT_CODES.CONFIG_OR_DIRTY);
    }
    // Repo-config commands are refused unless the cwd is in the global
    // trusted-repos list (G3-11). CLI-supplied commands are always trusted.
    const trust = checkVerifyTrust([config.verify.command], config.trustedRepos ?? [], cwd, 'repo');
    if (!trust.trusted) {
      console.log(chalk.red(`Verify refused: ${trust.reason}`));
      process.exit(EXIT_CODES.CONFIG_OR_DIRTY);
    }
    const cmd = config.verify.command.split(/\s+/).filter(Boolean);
    const result = runVerify(cmd, cwd);
    console.log(formatVerifyReport(result));
    process.exit(result.ok ? 0 : 1);
  });

program
  .command('models')
  .description('List registered adapters and check provider/model allow-list')
  .action(() => {
    const result = checkModels();
    console.log(formatModelCheck(result));
    process.exit(result.allOk ? 0 : 1);
  });

program.parse();
