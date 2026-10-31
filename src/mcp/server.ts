// air MCP server.
//
// Exposes run_task, get_task_status, get_task_output, approve_failover,
// cancel_task, get_status over stdio. No prompting on stdin; approval is a
// task-state transition (R2-10).

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { loadConfig } from '../config/loader';
import { createHealthTracker } from '../health/tracker';
import { selectCandidate, formatRouteDecision } from '../router/router';
import { GooseAdapter } from '../adapters/goose';
import { MockAdapter } from '../../tests/mock-adapter';
import { runProcess } from '../execution/runner';
import { classifyOutcome } from '../types/outcome';
import { getErrorAction, triggersFailover, type ErrorCategory } from '../types/errors';
import { defaultStateForTask, type ResultState } from '../types/result';
import { snapshotGit, formatDirtyReport } from '../context/checkpoint';
import { makeRunId, writeTaskState, appendTaskIndex, readTaskState } from '../execution/task-state';
import { trace } from '../observability/trace';
import { redact } from '../security/redact';
import { defaultAllowList } from '../security/allowlist';

const tasks = new Map<string, { state: any; controller: AbortController }>();

function listAdapters(): any[] {
  return [new MockAdapter(), new GooseAdapter()];
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
      tasks.set(runId, { state: { runId, state: 'QUEUED' }, controller });
      await appendTaskIndex(runId);

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
          maxHops: 0,
          error: { category: 'PERMISSION_DENIED', message: formatDirtyReport(snap) },
        };
        tasks.set(runId, { state: st, controller });
        await writeTaskState(st);
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
        tasks.set(runId, { state: st, controller });
        await writeTaskState(st);
        return { content: [{ type: 'text', text: `No eligible candidate.\n${formatRouteDecision(decision)}` }] };
      }

      const chosen = decision.chosen;
      const adapter = adapters.find((a) => a.id === chosen.id)!;
      const spec = adapter.buildCommand(taskInput);
      const running = {
        runId,
        task: args.task,
        cwd,
        adapter: chosen.id,
        provider: chosen.provider,
        model: chosen.model,
        state: 'RUNNING' as const,
        startedAt: new Date().toISOString(),
        hops: 1,
        maxHops: config.failover.maxHops,
      };
      tasks.set(runId, { state: running, controller });
      await writeTaskState(running);
      trace({ runId, event: 'router_pick', chosen: chosen.id, skips: decision.skips });

      const { outcome } = await runProcess(spec, {
        timeoutMs: config.timeouts.defaultMs,
        maxBufferBytes: config.buffers.maxBytes,
        signal: controller.signal,
      });

      const fact = classifyOutcome(outcome);
      let category: ErrorCategory = (fact.category as ErrorCategory) ?? adapter.classifyError(outcome.exitCode, outcome.stderr);
      let result: ResultState;
      if (outcome.cancelled) result = 'CANCELLED';
      else if (outcome.timedOut || outcome.spawnError) result = 'FAILED';
      else if (outcome.exitCode === 0) result = defaultStateForTask(!!args.readOnly, outcome.stdout.length > 0);
      else result = 'FAILED';

      const finalState: any = {
        ...running,
        state: result === 'SUCCEEDED_WITH_CHANGES' || result === 'SUCCEEDED_READ_ONLY' ? 'COMPLETED' : 'FAILED',
        result,
        endedAt: new Date().toISOString(),
        error: result !== 'SUCCEEDED_WITH_CHANGES' && result !== 'SUCCEEDED_READ_ONLY'
          ? { category, message: outcome.stderr.slice(0, 500) }
          : undefined,
      };
      tasks.set(runId, { state: finalState, controller });
      await writeTaskState(finalState);
      trace({ runId, event: 'run_complete', result, category, durationMs: outcome.durationMs });

      if (outcome.cancelled) return { content: [{ type: 'text', text: 'Cancelled.' }] };
      if (outcome.timedOut) return { content: [{ type: 'text', text: `Timed out (${category}).` }] };
      if (outcome.spawnError) return { content: [{ type: 'text', text: `Tool not available: ${outcome.spawnError.message}` }] };
      if (outcome.exitCode !== 0) {
        const action = getErrorAction(category);
        if (triggersFailover(category)) {
          finalState.state = 'AWAITING_APPROVAL';
          finalState.proposedSwitch = { adapter: 'goose', provider: 'openai', model: 'gpt-4o', reason: category };
          tasks.set(runId, { state: finalState, controller });
          await writeTaskState(finalState);
          return { content: [{ type: 'text', text: `Failover proposed (${category}). Action: ${action}. Call approve_failover(runId="${runId}") to proceed.` }] };
        }
        return { content: [{ type: 'text', text: `Failed (${category}). Action: ${action}` }] };
      }
return { content: [{ type: 'text', text: `Succeeded (${result}).` }] };
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
      const t = tasks.get(args.runId) ?? (await readTaskState(args.runId));
      if (!t) return { content: [{ type: 'text', text: `Unknown runId: ${args.runId}` }] };
      const state = t.state ?? t;
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
      const t = tasks.get(args.runId) ?? (await readTaskState(args.runId));
      if (!t) return { content: [{ type: 'text', text: `Unknown runId: ${args.runId}` }] };
      return { content: [{ type: 'text', text: redact(JSON.stringify(t.state?.output ?? '')) }] };
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
      const t = tasks.get(args.runId);
      if (!t) return { content: [{ type: 'text', text: `Unknown runId: ${args.runId}` }] };
      if (t.state.state !== 'AWAITING_APPROVAL') {
        return { content: [{ type: 'text', text: `Task not awaiting approval (state=${t.state.state})` }] };
      }
      t.state.state = 'SWITCHING';
      await writeTaskState(t.state);
      return { content: [{ type: 'text', text: `Approved failover for ${args.runId}. Next candidate: ${t.state.proposedSwitch?.adapter ?? 'unknown'}.` }] };
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
      const t = tasks.get(args.runId);
      if (!t) return { content: [{ type: 'text', text: `Unknown runId: ${args.runId}` }] };
      t.controller.abort();
      t.state.state = 'CANCELLED';
      await writeTaskState(t.state);
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
        tools: listAdapters().map((a) => ({ id: a.id, provider: a.provider, model: a.model, available: true })),
        cooldowns: tracker.getCooldowns().map((c) => ({ provider: c.provider, model: c.model, until: c.until, reason: c.reason })),
      };
      return { content: [{ type: 'text', text: JSON.stringify(data) }] };
    },
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

import { fileURLToPath } from 'node:url';

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  startMcp().catch((err) => {
    console.error('MCP server failed:', err);
    process.exit(1);
  });
}