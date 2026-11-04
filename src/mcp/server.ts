// air MCP server.
//
// Exposes run_task, get_task_status, get_task_output, approve_failover,
// cancel_task, get_status over stdio. No prompting on stdin; approval is a
// task-state transition (R2-10). Jobs run in the background so the MCP
// client is not blocked waiting on long tasks.
//
// All task execution is delegated to the Orchestrator so CLI and MCP share
// one execution path (no duplicated failover/run logic).

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { z } from 'zod';
import { loadConfig } from '../config/loader';
import { loadCatalog, catalogTools } from '../config/catalog';
import { createHealthTracker } from '../health/tracker';
import { adapterStatus, availableAdapters } from '../adapters/registry';
import { Orchestrator } from '../orchestrator/orchestrator';
import { snapshotGit } from '../context/checkpoint';
import { makeRunId, writeTaskState, appendTaskIndex, readTaskState } from '../execution/task-state';
import { runProcess } from '../execution/runner';
import { classifyOutcome } from '../types/outcome';
import { snapshotDelta } from '../context/checkpoint';
import { buildHandoffPack } from '../context/handoff';
import { redact } from '../security/redact';
import { installAdapter, upgradeAdapter, uninstallAdapter } from '../installer/installer';
import { getErrorAction, triggersFailover, type ErrorCategory } from '../types/errors';
import type { ResultState } from '../types/result';

interface Job {
  state: any;
  controller: AbortController;
  promise: Promise<void>;
  orch?: Orchestrator;
  runId: string;
  cwd: string;
}

export const jobs = new Map<string, Job>();

// Backward-compatible exports for in-process job lifecycle tests.
// These operate on Job-compatible objects and are not used by the MCP
// server itself (execution is delegated to the Orchestrator).
export async function runAttempt(job: any, adapter: any, taskInput: any): Promise<void> {
  const { controller, cwd, isWriteTask, config, beforeSnap } = job;
  const tracker = createHealthTracker();
  await tracker.load();

  const { outcome } = await runProcess(adapter.buildCommand(taskInput), {
    timeoutMs: config.timeouts.defaultMs,
    maxBufferBytes: config.buffers.maxBytes,
    signal: controller.signal,
    stdoutTailBytes: 2048,
    stderrTailBytes: 2048,
    onStdout: () => {},
    onStderr: () => {},
  });

  const fact = classifyOutcome(outcome);
  let category: ErrorCategory = (fact.category as ErrorCategory) ?? adapter.classifyError(outcome.exitCode, outcome.stderr, {
    timedOut: outcome.timedOut,
    cancelled: outcome.cancelled,
    spawnError: outcome.spawnError,
  });

  if (outcome.cancelled) tracker.recordCancellation(adapter.provider, adapter.model);
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
    ...job.state,
    adapter: adapter.id,
    provider: adapter.provider,
    model: adapter.model,
    state: result === 'SUCCEEDED_WITH_CHANGES' || result === 'SUCCEEDED_READ_ONLY' || result === 'NO_CHANGES' ? 'COMPLETED' : result === 'CANCELLED' ? 'CANCELLED' : 'FAILED',
    result,
    endedAt: new Date().toISOString(),
    delta: {
      staged: delta.staged,
      unstaged: delta.unstaged,
      untracked: delta.untracked,
      deleted: delta.deleted,
    },
    outputTail: redact(outcome.stdoutTail ?? outcome.stdout),
    stdoutTruncated: outcome.stdoutTruncated,
    stderrTruncated: outcome.stderrTruncated,
    error: result !== 'SUCCEEDED_WITH_CHANGES' && result !== 'SUCCEEDED_READ_ONLY' && result !== 'NO_CHANGES'
      ? { category, message: outcome.stderr.slice(0, 500) }
      : undefined,
  };
  job.state = finalState;
  await writeTaskState(finalState);

  if (outcome.cancelled || outcome.timedOut || outcome.spawnError || outcome.exitCode !== 0) {
    const action = getErrorAction(category);
    if (triggersFailover(category) && job.hops < job.maxHops) {
      const next = await resolveNextCandidate(job);
      if (next) {
        if (job.taskInput.auto) {
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

export async function resolveNextCandidate(job: any): Promise<{ adapter: any; taskInput: any } | null> {
  const tracker = createHealthTracker();
  await tracker.load();
  const { selectCandidateFrom } = await import('../router/router');
  const adapters = await availableAdapters();
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

async function runTaskInBackground(orch: Orchestrator, job: Job): Promise<void> {
  try {
    const session = await orch.start(job.state.task, job.cwd, {
      readOnly: !!job.state.readOnly,
      mode: job.state.mode === 'auto' ? 'auto' : 'ask',
       maxHops: job.state.maxHops ?? 3,
       allowProviders: job.state.allowProviders,
     });
    // Read the full task state from disk (includes outputTail, error, etc.)
    // which orch.start() wrote via writeTaskState.
    const fullState = await readTaskState(session.runId);
    if (fullState) {
      job.state = fullState;
    } else {
      const s = orch.get(session.runId);
      if (s) job.state = s as any;
    }
    await writeTaskState(job.state).catch(() => {});
  } catch (err) {
    const s = orch.get(job.runId);
    if (s) {
      (s as any).state = 'FAILED';
      (s as any).error = { category: 'PROCESS_CRASH', message: String(err).slice(0, 500) };
      job.state = s as any;
      await writeTaskState(s as any).catch(() => {});
    }
  }
}

export async function startMcp(transport?: Transport): Promise<{ server: McpServer; transport: Transport }> {
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
        allowProvider: z.union([z.string(), z.array(z.string())]).optional().describe('Allowed providers for failover'),
      },
    },
    async (args: any) => {
      const runId = makeRunId();
      const controller = new AbortController();
      const cwd = args.cwd ?? process.cwd();
      const snap = snapshotGit(cwd);
      const isWriteTask = !args.readOnly;

      if (isWriteTask && snap.dirty) {
        const { formatDirtyReport } = await import('../context/checkpoint');
        const report = formatDirtyReport(snap);
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
          error: { category: 'PERMISSION_DENIED', message: report },
        };
        await writeTaskState(st);
        await appendTaskIndex(runId);
        return { content: [{ type: 'text', text: report }] };
      }

      const { config } = await loadConfig({ cwd });
      let mcpAdapters: any[] | undefined;
      if (process.env.AIR_MOCK_ADAPTER) {
        const { MockAdapter } = await import('../adapters/mock');
        mcpAdapters = [new MockAdapter()];
      }
      const orch = new Orchestrator({
        adapters: mcpAdapters,
        config,
        mcpMode: true,
      });

      const fallbackState: any = {
        runId,
        task: args.task,
        cwd,
        adapter: 'none',
        provider: 'none',
        model: 'none',
        state: 'RUNNING',
        startedAt: new Date().toISOString(),
        hops: 0,
        maxHops: config.failover.maxHops,
        readOnly: !!args.readOnly,
      mode: args.auto ? 'auto' : 'ask',
      allowProviders: Array.isArray(args.allowProvider)
        ? args.allowProvider
        : (typeof args.allowProvider === 'string' ? args.allowProvider.split(',').map((s: string) => s.trim()).filter(Boolean) : undefined),
    };

      const job: Job = {
        state: fallbackState,
        controller,
        promise: Promise.resolve(),
        orch,
        runId,
        cwd,
      };
      const jobPromise = runTaskInBackground(orch, job);
      job.promise = jobPromise;
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
      const tail = state.outputTail ?? '';
      const truncated = state.stdoutTruncated || state.stderrTruncated;
      const meta = truncated ? ' [output truncated]' : '';
      return { content: [{ type: 'text', text: tail + meta }] };
    },
  );

  server.registerTool(
    'resume_task',
    {
      title: 'Resume task',
      description: 'Resume a previous session with an optional new task. Carries forward handoff context from the prior run.',
      inputSchema: {
        runId: z.string().describe('Previous session run id to resume'),
        task: z.string().optional().describe('New task (defaults to previous task)'),
        cwd: z.string().optional().describe('Working directory'),
        readOnly: z.boolean().optional().describe('Treat as read-only'),
        auto: z.boolean().optional().describe('Auto-switch on failover'),
      },
    },
    async (args: any) => {
      const cwd = args.cwd ?? process.cwd();
      const { config } = await loadConfig({ cwd });
      const orch = new Orchestrator({
        adapters: process.env.AIR_MOCK_ADAPTER ? (() => {
          const { MockAdapter } = require('../adapters/mock');
          return [new MockAdapter()];
        })() : undefined,
        config,
        mcpMode: true,
      });
      try {
        const session = await orch.resume(args.runId, args.task);
        return {
          content: [{ type: 'text', text: `Resumed ${session.runId} (parent: ${args.runId}). State: ${session.state}. Result: ${session.result ?? 'pending'}` }],
        };
      } catch (err: any) {
        return { content: [{ type: 'text', text: `Resume failed: ${String(err?.message || err)}` }] };
      }
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
        proposalHash: z.string().optional().describe('Consent bound to this exact proposal hash'),
        hash: z.string().optional().describe('Alias for proposalHash'),
      },
    },
    async (args: any) => {
      const job = jobs.get(args.runId);
      if (!job) return { content: [{ type: 'text', text: `Unknown runId: ${args.runId}` }] };
      const state = job.state;
      if (state.state !== 'AWAITING_APPROVAL') {
        return { content: [{ type: 'text', text: `Task not awaiting approval (state=${state.state})` }] };
      }
      const proposal = state.proposedSwitch;
      if (!proposal) {
        return { content: [{ type: 'text', text: 'No pending failover proposal for this task.' }] };
      }
      // Bind the approval to the exact pending proposal (R5-04).
      if (args.provider !== undefined && args.provider !== proposal.provider) {
        return { content: [{ type: 'text', text: `Consent provider ${args.provider} does not match proposal provider ${proposal.provider}.` }] };
      }
      if (args.model !== undefined && args.model !== proposal.model) {
        return { content: [{ type: 'text', text: `Consent model ${args.model} does not match proposal model ${proposal.model}.` }] };
      }
      const suppliedHash = args.proposalHash ?? args.hash;
      if (suppliedHash !== undefined && proposal.hash && suppliedHash !== proposal.hash) {
        return { content: [{ type: 'text', text: 'Consent proposal hash does not match the pending proposal.' }] };
      }

      // Resume the orchestrator loop after approval.
      try {
        const session = await job.orch?.resumeAfterApproval(args.runId);
        if (!session) {
          return { content: [{ type: 'text', text: 'Failed to resume failover.' }] };
        }
        return { content: [{ type: 'text', text: `Approved failover for ${args.runId}. Switching to ${proposal.to.id} (${proposal.to.provider}/${proposal.to.model}).` }] };
      } catch (err: any) {
        return { content: [{ type: 'text', text: `Failover resume failed: ${String(err?.message || err)}` }] };
      }
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

  server.registerTool(
    'list_adapters',
    {
      title: 'List adapters',
      description: 'Return all catalog entries with install status (installed, version, installStatus, available, verified).',
      inputSchema: {},
    },
    async () => {
      const { config } = await loadConfig({ cwd: process.cwd() });
      const catalog = await loadCatalog(config);
      const tools = catalogTools(catalog);
      const statuses = adapterStatus(config);
      const statusMap = new Map(statuses.map((s) => [s.id, s]));
      const rows = tools.map((t) => {
        const s = statusMap.get(t.id);
        return {
          id: t.id,
          name: t.name,
          adapterId: t.adapterId,
          provider: t.provider,
          model: t.model,
          installed: s?.installed ?? false,
          version: s?.version,
          installStatus: s?.installStatus ?? 'not-installed',
          available: s?.available ?? false,
          verified: s?.verified ?? false,
        };
      });
      return { content: [{ type: 'text', text: JSON.stringify(rows) }] };
    },
  );

  server.registerTool(
    'install_adapter',
    {
      title: 'Install adapter',
      description: 'Install a free AI adapter. Requires explicit confirm=true (write operation).',
      inputSchema: {
        id: z.string().describe('Adapter catalog id to install'),
        confirm: z.boolean().optional().describe('Explicit consent to install (must be true)'),
      },
    },
    async (args: any) => {
      if (args.confirm !== true) {
        return { content: [{ type: 'text', text: 'Install requires confirm=true to proceed.' }] };
      }
      const { config } = await loadConfig({ cwd: process.cwd() });
      const catalog = await loadCatalog(config);
      const entry = catalog.tools.find((t) => t.id === args.id);
      if (!entry) {
        return { content: [{ type: 'text', text: `Unknown adapter: ${args.id}` }] };
      }
      try {
        const result = await installAdapter(entry, config);
        return { content: [{ type: 'text', text: `${args.id}: ${result.status}${result.version ? ` v${result.version}` : ''}${result.error ? ` (error: ${result.error})` : ''}` }] };
      } catch (err: any) {
        return { content: [{ type: 'text', text: `Install failed: ${String(err?.message || err)}` }] };
      }
    },
  );

  server.registerTool(
    'upgrade_adapter',
    {
      title: 'Upgrade adapter',
      description: 'Upgrade an adapter to the catalog version. Requires explicit confirm=true (write operation).',
      inputSchema: {
        id: z.string().describe('Adapter catalog id to upgrade'),
        confirm: z.boolean().optional().describe('Explicit consent to upgrade (must be true)'),
      },
    },
    async (args: any) => {
      if (args.confirm !== true) {
        return { content: [{ type: 'text', text: 'Upgrade requires confirm=true to proceed.' }] };
      }
      const { config } = await loadConfig({ cwd: process.cwd() });
      const catalog = await loadCatalog(config);
      const entry = catalog.tools.find((t) => t.id === args.id);
      if (!entry) {
        return { content: [{ type: 'text', text: `Unknown adapter: ${args.id}` }] };
      }
      try {
        const result = await upgradeAdapter(entry, config);
        return { content: [{ type: 'text', text: `${args.id}: ${result.status}${result.version ? ` v${result.version}` : ''}` }] };
      } catch (err: any) {
        return { content: [{ type: 'text', text: `Upgrade failed: ${String(err?.message || err)}` }] };
      }
    },
  );

  server.registerTool(
    'uninstall_adapter',
    {
      title: 'Uninstall adapter',
      description: 'Uninstall an adapter. Requires explicit confirm=true (write operation).',
      inputSchema: {
        id: z.string().describe('Adapter catalog id to uninstall'),
        confirm: z.boolean().optional().describe('Explicit consent to uninstall (must be true)'),
      },
    },
    async (args: any) => {
      if (args.confirm !== true) {
        return { content: [{ type: 'text', text: 'Uninstall requires confirm=true to proceed.' }] };
      }
      const { config } = await loadConfig({ cwd: process.cwd() });
      const catalog = await loadCatalog(config);
      const entry = catalog.tools.find((t) => t.id === args.id);
      if (!entry) {
        return { content: [{ type: 'text', text: `Unknown adapter: ${args.id}` }] };
      }
      try {
        await uninstallAdapter(entry);
        return { content: [{ type: 'text', text: `${args.id}: uninstalled` }] };
      } catch (err: any) {
        return { content: [{ type: 'text', text: `Uninstall failed: ${String(err?.message || err)}` }] };
      }
    },
  );

  server.registerTool(
    'chat_send',
    {
      title: 'Send a chat message',
      description: 'Append a user message to a conversation and return an ack (non-blocking).',
      inputSchema: {
        conversationId: z.string().optional().describe('Conversation id (creates one if omitted)'),
        message: z.string().describe('User message'),
      },
    },
    async (args: any) => {
      const { createConversation, loadConversation, saveConversation, appendMessage } = await import('../conversation');
      let conv = args.conversationId ? loadConversation(args.conversationId) : null;
      if (!conv) conv = createConversation();
      saveConversation(conv);
      await appendMessage(conv.id, { role: 'user', content: args.message });
      await appendMessage(conv.id, { role: 'assistant', content: 'Acknowledged.' });
      return { content: [{ type: 'text', text: `conversation=${conv.id}` }] };
    },
  );

  server.registerTool(
    'get_conversation',
    {
      title: 'Get conversation',
      description: 'Return a conversation thread.',
      inputSchema: { conversationId: z.string().describe('Conversation id') },
    },
    async (args: any) => {
      const { loadConversation } = await import('../conversation');
      const conv = loadConversation(args.conversationId);
      if (!conv) return { content: [{ type: 'text', text: 'not found' }] };
      return { content: [{ type: 'text', text: JSON.stringify(conv) }] };
    },
  );

  const serverTransport = transport ?? new StdioServerTransport();
  await server.connect(serverTransport);

  // Abort all jobs on process signals (H-08).
  const abortAll = () => {
    for (const job of jobs.values()) {
      try { job.controller.abort(); } catch { /* noop */ }
      job.state.state = 'CANCELLED';
      writeTaskState(job.state).catch(() => {});
    }
  };
  process.on('SIGINT', abortAll);
  process.on('SIGTERM', abortAll);

  return { server, transport: serverTransport };
}

if (typeof require !== 'undefined' && require.main === module) {
  startMcp().catch((err) => {
    console.error('MCP server failed:', err);
    process.exit(1);
  });
}
