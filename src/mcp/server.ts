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
import { selectCandidate, formatRouteDecision } from '../router/router';
import { availableAdapters, adapterStatus } from '../adapters/registry';
import { runProcess } from '../execution/runner';
import { classifyOutcome } from '../types/outcome';
import { getErrorAction, triggersFailover, type ErrorCategory } from '../types/errors';
import { defaultStateForTask, type ResultState } from '../types/result';
import { snapshotGit, formatDirtyReport } from '../context/checkpoint';
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
}

const jobs = new Map<string, Job>();

function listAdapters(): any[] {
  return availableAdapters();
}

async function runJob(job: Job): Promise<void> {
  const { state, controller, adapter, taskInput, cwd, isWriteTask } = job;
  const { config } = await loadConfig({ cwd });
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

  const afterSnap = snapshotGit(cwd);
  const changed = afterSnap.staged.length > 0 || afterSnap.unstaged.length > 0 || afterSnap.untracked.length > 0;
  let result: ResultState;
  if (outcome.cancelled) result = 'CANCELLED';
  else if (outcome.timedOut || outcome.spawnError) result = 'FAILED';
  else if (outcome.exitCode === 0) {
    if (isWriteTask) result = changed ? 'SUCCEEDED_WITH_CHANGES' : 'NO_CHANGES';
    else result = changed ? 'NEEDS_USER_REVIEW' : 'SUCCEEDED_READ_ONLY';
  } else result = 'FAILED';

  const finalState: any = {
    ...state,
    state: result === 'SUCCEEDED_WITH_CHANGES' || result === 'SUCCEEDED_READ_ONLY' || result === 'NO_CHANGES' ? 'COMPLETED' : 'FAILED',
    result,
    endedAt: new Date().toISOString(),
    error: result !== 'SUCCEEDED_WITH_CHANGES' && result !== 'SUCCEEDED_READ_ONLY' && result !== 'NO_CHANGES'
      ? { category, message: outcome.stderr.slice(0, 500) }
      : undefined,
  };
  job.state = finalState;
  await writeTaskState(finalState);
  trace({ runId: job.state.runId, event: 'run_complete', result, category, durationMs: outcome.durationMs, changed });

  if (outcome.cancelled || outcome.timedOut || outcome.spawnError || outcome.exitCode !== 0) {
    const action = getErrorAction(category);
    if (triggersFailover(category)) {
      finalState.state = 'AWAITING_APPROVAL';
      finalState.proposedSwitch = { adapter: 'goose', provider: 'openai', model: 'gpt-4o', reason: category };
      job.state = finalState;
      await writeTaskState(finalState);
    }
  }
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
      const allow = defaultAllowList(adapters);
      const taskInput: any = {
        id: runId,
        prompt: args.task,
        cwd,
        mode: args.auto ? 'auto' : 'ask',
        readOnly: !!args.readOnly,
      };

      const decision = selectCandidate(taskInput, adapters, tracker);
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
      description: 'Approve a proposed failover for a task.',
      inputSchema: { runId: z.string().describe('Task run id') },
    },
    async (args: any) => {
      const job = jobs.get(args.runId);
      if (!job) return { content: [{ type: 'text', text: `Unknown runId: ${args.runId}` }] };
      if (job.state.state !== 'AWAITING_APPROVAL') {
        return { content: [{ type: 'text', text: `Task not awaiting approval (state=${job.state.state})` }] };
      }
      job.state.state = 'SWITCHING';
      await writeTaskState(job.state);
      return { content: [{ type: 'text', text: `Approved failover for ${args.runId}. Next candidate: ${job.state.proposedSwitch?.adapter ?? 'unknown'}.` }] };
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