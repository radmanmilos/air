// air MCP server.
//
// Exposes run_task, get_task_status, get_task_output, approve_failover,
// cancel_task, get_status over stdio. No prompting on stdin; approval is a
// task-state transition (R2-10). Jobs run in the background so the MCP
// client is not blocked waiting on long tasks.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { loadConfig } from '../config/loader';
import { createHealthTracker } from '../health/tracker';
import { selectCandidate, selectCandidateFrom, isBlockedByAllowlist, formatRouteDecision } from '../router/router';
import { availableAdapters, adapterStatus } from '../adapters/registry';
import { runProcess } from '../execution/runner';
import { classifyOutcome } from '../types/outcome';
import { getErrorAction, triggersFailover, type ErrorCategory } from '../types/errors';
import { defaultStateForTask, type ResultState } from '../types/result';
import { snapshotGit, snapshotDelta, formatDirtyReport } from '../context/checkpoint';
import { buildHandoffPack } from '../context/handoff';
import { makeRunId, writeTaskState, appendTaskIndex, readTaskState } from '../execution/task-state';
import { trace } from '../observability/trace';
import { redact } from '../security/redact';
import { defaultAllowList, checkHandoffAllowlist } from '../security/allowlist';
import { EXIT_CODES } from '../types/exit-codes';

interface Job {
  state: any;
  controller: AbortController;
  promise: Promise<void>;
  adapter?: any;
  taskInput?: any;
  cwd: string;
  isWriteTask: boolean;
  visited: Set<string>;
  hops: number;
  maxHops: number;
  allow: any;
  config: any;
  beforeSnap: any;
}

export const jobs = new Map<string, Job>();

function listAdapters(): any[] {
  return availableAdapters();
}

/** Run a single attempt for an existing job. Updates state, health, and
 * transitions to AWAITING_APPROVAL when a failover-triggering category is
 * observed. Respects hop cap and revisit prevention. */
export async function runAttempt(job: Job, adapter: any, taskInput: any): Promise<void> {
  const { controller, cwd, isWriteTask, state, visited, allow, config, beforeSnap } = job;
  const tracker = createHealthTracker();
  await tracker.load();

  const { outcome } = await runProcess(adapter.buildCommand(taskInput), {
    timeoutMs: config.timeouts.defaultMs,
    maxBufferBytes: config.buffers.maxBytes,
    signal: controller.signal,
  });

  const fact = classifyOutcome(outcome);
  let category: ErrorCategory = (fact.category as ErrorCategory) ?? adapter.classifyError(outcome.exitCode, outcome.stderr, {
    timedOut: outcome.timedOut,
    cancelled: outcome.cancelled,
    spawnError: outcome.spawnError,
  });

  // Update health before the next routing decision.
  if (outcome.cancelled) tracker.recordFailure(adapter.provider, adapter.model, 'USER_CANCELLED');
  else if (outcome.timedOut) {
    tracker.recordFailure(adapter.provider, adapter.model, 'TIMEOUT');
    tracker.setCooldown(adapter.provider, adapter.model, Date.now() + 60_000, 'TIMEOUT');
  } else if (outcome.spawnError) tracker.recordFailure(adapter.provider, adapter.model, 'TOOL_NOT_INSTALLED');
  else if (outcome.exitCode === 0) tracker.recordSuccess(adapter.provider, adapter.model);
  else {
    tracker.recordFailure(adapter.provider, adapter.model, category);
    if (category === 'RATE_LIMIT' || category === 'QUOTA_EXCEEDED') {
      tracker.setCooldown(adapter.provider, adapter.model, Date.now() + 60_000, category);
    }
  }
  await tracker.flush();

  // Determine result from the agent-produced delta relative to the initial
  // snapshot (R5-07). Pre-existing dirt is NOT counted as agent work.
  const afterSnap = snapshotGit(cwd);
  const delta = snapshotDelta(beforeSnap ?? snapshotGit(cwd), afterSnap);
  const changed = delta.dirty;
  let result: ResultState;
  if (outcome.cancelled) result = 'CANCELLED';
  else if (outcome.timedOut || outcome.spawnError) result = 'FAILED';
  else if (outcome.exitCode === 0) {
    if (isWriteTask) result = changed ? 'SUCCEEDED_WITH_CHANGES' : 'NO_CHANGES';
    else result = changed ? 'NEEDS_USER_REVIEW' : 'SUCCEEDED_READ_ONLY';
  } else result = 'FAILED';

  const finalState: any = {
    ...state,
    adapter: adapter.id,
    provider: adapter.provider,
    model: adapter.model,
    state: result === 'SUCCEEDED_WITH_CHANGES' || result === 'SUCCEEDED_READ_ONLY' || result === 'NO_CHANGES' ? 'COMPLETED' : 'FAILED',
    result,
    endedAt: new Date().toISOString(),
    delta: {
      staged: delta.staged,
      unstaged: delta.unstaged,
      untracked: delta.untracked,
      deleted: delta.deleted,
    },
    error: result !== 'SUCCEEDED_WITH_CHANGES' && result !== 'SUCCEEDED_READ_ONLY' && result !== 'NO_CHANGES'
      ? { category, message: outcome.stderr.slice(0, 500) }
      : undefined,
  };
  job.state = finalState;
  await writeTaskState(finalState);
  trace({ runId: job.state.runId, event: 'run_complete', result, category, durationMs: outcome.durationMs, changed, hops: job.hops });

  if (outcome.cancelled || outcome.timedOut || outcome.spawnError || outcome.exitCode !== 0) {
    const action = getErrorAction(category);
    if (triggersFailover(category) && job.hops < job.maxHops) {
      // Resolve the actual next eligible candidate and store it in the
      // proposal (R5-04/R5-05). Never hard-code a placeholder destination.
      const next = await resolveNextCandidate(job);
      if (next) {
        // `auto` mode switches within the same provider/model allow-list only.
        // It must never bypass provider restrictions (R5-04).
        if (job.taskInput.auto) {
          const blocked = isBlockedByAllowlist(next.adapter, job.allow);
          if (blocked) {
            finalState.state = 'FAILED';
            finalState.error = { category: 'PERMISSION_DENIED', message: `Auto-switch blocked: ${blocked}` };
            job.state = finalState;
            await writeTaskState(finalState);
            return;
          }
          // Auto-approve within the allow-list and continue the same run.
          const key = `${next.adapter.id}|${next.adapter.provider}|${next.adapter.model}`;
          job.visited.add(key);
          job.hops++;
          job.adapter = next.adapter;
          job.taskInput = next.taskInput;
          finalState.adapter = next.adapter.id;
          finalState.provider = next.adapter.provider;
          finalState.model = next.adapter.model;
          finalState.hops = job.hops;
          finalState.state = 'RUNNING';
          finalState.startedAt = new Date().toISOString();
          job.state = finalState;
          await writeTaskState(finalState);
          trace({ runId: job.state.runId, event: 'failover_auto', to: next.adapter.id, hops: job.hops });
          await runAttempt(job, next.adapter, next.taskInput);
          return;
        }
        finalState.state = 'AWAITING_APPROVAL';
        finalState.proposedSwitch = {
          adapter: next.adapter.id,
          provider: next.adapter.provider,
          model: next.adapter.model,
          reason: category,
          action,
          task: next.taskInput.prompt,
        };
        job.state = finalState;
        await writeTaskState(finalState);
      }
    }
  }
}

/** Resolve the next eligible candidate for a job, respecting the allow-list
 * and revisit prevention. Searches later candidates when the first selection
 * is blocked or already visited (R5-04/R5-05). Returns null when no
 * candidate is available. */
export async function resolveNextCandidate(job: Job): Promise<{ adapter: any; taskInput: any } | null> {
  const tracker = createHealthTracker();
  await tracker.load();
  const adapters = listAdapters();
  const decision = selectCandidateFrom(
    job.taskInput,
    adapters,
    tracker,
    job.visited,
    job.allow,
  );
  if (!decision.chosen) return null;
  const nextAdapter = adapters.find((a) => a.id === decision.chosen!.id);
  if (!nextAdapter) return null;

  // Recompute the proposal before approval and reject stale approvals if the
  // candidate changed since the proposal was stored (R5-05).
  if (job.state.proposedSwitch) {
    const stored = job.state.proposedSwitch;
    if (
      stored.adapter !== nextAdapter.id ||
      stored.provider !== nextAdapter.provider ||
      stored.model !== nextAdapter.model
    ) {
      return null;
    }
  }

  // Inject handoff into the next run's task prompt.
  const handoff = buildHandoffPack({
    cwd: job.cwd,
    prompt: job.state.task,
    from: { id: job.adapter.id, provider: job.adapter.provider, model: job.adapter.model },
    to: { id: nextAdapter.id, provider: nextAdapter.provider, model: nextAdapter.model },
    mode: job.taskInput.mode,
    files: job.taskInput.files,
    category: job.state.error?.category,
    summary: job.state.error?.message?.slice(0, 200),
    before: job.beforeSnap,
    after: snapshotGit(job.cwd),
  });
  const nextTaskInput = { ...job.taskInput, prompt: `${job.state.task}\n\n--- handoff ---\n${handoff}` };
  return { adapter: nextAdapter, taskInput: nextTaskInput };
}

async function runJob(job: Job): Promise<void> {
  await runAttempt(job, job.adapter!, job.taskInput!);
}

export async function startMcp(): Promise<void> {
  const server = new McpServer({ name: 'air', version: '0.1.0' });

  server.registerTool(
    'run_task',
    {
      title: 'Run a task',
      description: 'Route and run a task through an AI coding tool.',
      inputSchema: {
        task: z.string().describe('Task description'),
        cwd: z.string().optional().describe('Working directory'),
        readOnly: z.boolean().optional().describe('Treat as read-only'),
        auto: z.boolean().optional().describe('Auto-switch on failover'),
      },
    },
    async (args: any) => {
      const runId = makeRunId();
      const controller = new AbortController();
      const cwd = args.cwd ?? process.cwd();
      const snap = snapshotGit(cwd);
      const isWriteTask = !args.readOnly;

      if (isWriteTask && snap.dirty) {
        const st: any = {
          runId,
          task: args.task,
          cwd,
          adapter: 'none',
          provider: 'none',
          model: 'none',
          state: 'FAILED',
          startedAt: new Date().toISOString(),
          hops: 0,
          maxHops: 1,
          error: { category: 'PERMISSION_DENIED', message: formatDirtyReport(snap) },
        };
        await writeTaskState(st);
        await appendTaskIndex(runId);
        return { content: [{ type: 'text', text: formatDirtyReport(snap) }] };
      }

      const { config } = await loadConfig({ cwd });
      const tracker = createHealthTracker();
      await tracker.load();
      const adapters = listAdapters();
      const visited = new Set<string>();
      const allow: any = { providers: [], models: [] };
      const taskInput: any = {
        id: runId,
        prompt: args.task,
        cwd,
        mode: args.auto ? 'auto' : 'ask',
        readOnly: !!args.readOnly,
      };

      const decision = selectCandidateFrom(taskInput, adapters, tracker, visited, allow);
      if (!decision.chosen) {
        const st: any = {
          runId,
          task: args.task,
          cwd,
          adapter: 'none',
          provider: 'none',
          model: 'none',
          state: 'FAILED',
          startedAt: new Date().toISOString(),
          hops: 0,
          maxHops: config.failover.maxHops,
          error: { category: 'MODEL_UNAVAILABLE', message: formatRouteDecision(decision) },
        };
        await writeTaskState(st);
        await appendTaskIndex(runId);
        return { content: [{ type: 'text', text: `No eligible candidate.\n${formatRouteDecision(decision)}` }] };
      }

      const chosen = decision.chosen;
      const adapter = adapters.find((a) => a.id === chosen.id)!;
      // Build the task's provider-destination policy from the actual first
      // selected candidate, not adapters[0] (R5-04).
      allow.providers = [chosen.provider];
      allow.models = [chosen.model];
      visited.add(`${chosen.id}|${chosen.provider}|${chosen.model}`);
      const running: any = {
        runId,
        task: args.task,
        cwd,
        adapter: chosen.id,
        provider: chosen.provider,
        model: chosen.model,
        state: 'RUNNING',
        startedAt: new Date().toISOString(),
        hops: 1,
        maxHops: config.failover.maxHops,
      };
      await writeTaskState(running);
      await appendTaskIndex(runId);
      trace({ runId, event: 'router_pick', chosen: chosen.id, skips: decision.skips });

      const job: Job = {
        state: running,
        controller,
        promise: Promise.resolve(),
        adapter,
        taskInput,
        cwd,
        isWriteTask,
        visited,
        hops: 1,
        maxHops: config.failover.maxHops,
        allow,
        config,
        beforeSnap: snap,
      };
      job.promise = runJob(job).catch((err) => {
        job.state.error = { category: 'PROCESS_CRASH', message: String(err).slice(0, 500) };
        job.state.state = 'FAILED';
        writeTaskState(job.state);
      });
      jobs.set(runId, job);

      return {
        content: [{ type: 'text', text: `Started task ${runId}. Poll get_task_status(runId="${runId}").` }],
      };
    },
  );

  server.registerTool(
    'get_task_status',
    {
      title: 'Get task status',
      description: 'Return the current state of a task.',
      inputSchema: { runId: z.string().describe('Task run id') },
    },
    async (args: any) => {
      const job = jobs.get(args.runId);
      const state = job?.state ?? (await readTaskState(args.runId));
      if (!state) return { content: [{ type: 'text', text: `Unknown runId: ${args.runId}` }] };
      return { content: [{ type: 'text', text: JSON.stringify(state) }] };
    },
  );

  server.registerTool(
    'get_task_output',
    {
      title: 'Get task output',
      description: 'Return captured stdout/stderr for a task.',
      inputSchema: { runId: z.string().describe('Task run id') },
    },
    async (args: any) => {
      const job = jobs.get(args.runId);
      const state = job?.state ?? (await readTaskState(args.runId));
      if (!state) return { content: [{ type: 'text', text: `Unknown runId: ${args.runId}` }] };
      return { content: [{ type: 'text', text: redact(JSON.stringify(state.output ?? '')) }] };
    },
  );

  server.registerTool(
    'approve_failover',
    {
      title: 'Approve failover',
      description: 'Approve a proposed failover for a task and continue execution with the next candidate. The provider/model in the consent payload must match the pending proposal exactly (R5-04).',
      inputSchema: {
        runId: z.string().describe('Task run id'),
        provider: z.string().optional().describe('Consent for this exact provider (must match the proposal)'),
        model: z.string().optional().describe('Consent for this exact model (must match the proposal)'),
      },
    },
    async (args: any) => {
      const job = jobs.get(args.runId);
      if (!job) return { content: [{ type: 'text', text: `Unknown runId: ${args.runId}` }] };
      if (job.state.state !== 'AWAITING_APPROVAL') {
        return { content: [{ type: 'text', text: `Task not awaiting approval (state=${job.state.state})` }] };
      }
      const proposal = job.state.proposedSwitch;
      if (!proposal) {
        return { content: [{ type: 'text', text: 'No pending failover proposal for this task.' }] };
      }
      // Bind the approval to the exact pending proposal (R5-04). A stale or
      // mismatched consent payload is refused.
      if (args.provider !== undefined && args.provider !== proposal.provider) {
        return { content: [{ type: 'text', text: `Consent provider ${args.provider} does not match proposal provider ${proposal.provider}.` }] };
      }
      if (args.model !== undefined && args.model !== proposal.model) {
        return { content: [{ type: 'text', text: `Consent model ${args.model} does not match proposal model ${proposal.model}.` }] };
      }
      job.state.state = 'SWITCHING';
      await writeTaskState(job.state);

      // Resolve the next candidate, respecting allow-list and revisit rules.
      const next = await resolveNextCandidate(job);
      if (!next) {
        job.state.state = 'FAILED';
        job.state.error = { category: 'MODEL_UNAVAILABLE', message: 'No eligible alternative candidate after approval.' };
        await writeTaskState(job.state);
        return { content: [{ type: 'text', text: 'No eligible alternative candidate after approval.' }] };
      }

      const key = `${next.adapter.id}|${next.adapter.provider}|${next.adapter.model}`;
      job.visited.add(key);
      job.hops++;
      job.adapter = next.adapter;
      job.taskInput = next.taskInput;
      job.state.adapter = next.adapter.id;
      job.state.provider = next.adapter.provider;
      job.state.model = next.adapter.model;
      job.state.hops = job.hops;
      job.state.state = 'RUNNING';
      job.state.startedAt = new Date().toISOString();
      await writeTaskState(job.state);
      trace({ runId: args.runId, event: 'failover_approved', to: next.adapter.id, hops: job.hops });

      job.promise = runAttempt(job, next.adapter, next.taskInput).catch((err) => {
        job.state.error = { category: 'PROCESS_CRASH', message: String(err).slice(0, 500) };
        job.state.state = 'FAILED';
        writeTaskState(job.state);
      });

      return { content: [{ type: 'text', text: `Approved failover for ${args.runId}. Switching to ${next.adapter.id} (${next.adapter.provider}/${next.adapter.model}).` }] };
    },
  );

  server.registerTool(
    'cancel_task',
    {
      title: 'Cancel task',
      description: 'Cancel a running task.',
      inputSchema: { runId: z.string().describe('Task run id') },
    },
    async (args: any) => {
      const job = jobs.get(args.runId);
      if (!job) return { content: [{ type: 'text', text: `Unknown runId: ${args.runId}` }] };
      job.controller.abort();
      job.state.state = 'CANCELLED';
      await writeTaskState(job.state);
      return { content: [{ type: 'text', text: `Cancelled ${args.runId}.` }] };
    },
  );

  server.registerTool(
    'get_status',
    {
      title: 'Get status',
      description: 'Return agent/provider/model availability and active cooldowns.',
      inputSchema: {},
    },
    async () => {
      const tracker = createHealthTracker();
      await tracker.load();
      const data = {
        tools: adapterStatus(),
        cooldowns: tracker.getCooldowns().map((c) => ({ provider: c.provider, model: c.model, until: c.until, reason: c.reason })),
      };
      return { content: [{ type: 'text', text: JSON.stringify(data) }] };
    },
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

if (typeof require !== 'undefined' && require.main === module) {
  startMcp().catch((err) => {
    console.error('MCP server failed:', err);
    process.exit(1);
  });
}