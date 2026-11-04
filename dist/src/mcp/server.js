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
import { z } from 'zod';
import { loadConfig } from '../config/loader.js';
import { loadCatalog, catalogTools } from '../config/catalog.js';
import { createHealthTracker } from '../health/tracker.js';
import { adapterStatus, availableAdapters } from '../adapters/registry.js';
import { Orchestrator } from '../orchestrator/orchestrator.js';
import { snapshotGit } from '../context/checkpoint.js';
import { makeRunId, writeTaskState, appendTaskIndex, readTaskState } from '../execution/task-state.js';
import { runProcess } from '../execution/runner.js';
import { classifyOutcome } from '../types/outcome.js';
import { snapshotDelta } from '../context/checkpoint.js';
import { buildHandoffPack } from '../context/handoff.js';
import { redact } from '../security/redact.js';
import { installAdapter, upgradeAdapter, uninstallAdapter } from '../installer/installer.js';
import { getErrorAction, triggersFailover } from '../types/errors.js';
export const jobs = new Map();
// Backward-compatible exports for in-process job lifecycle tests.
// These operate on Job-compatible objects and are not used by the MCP
// server itself (execution is delegated to the Orchestrator).
export async function runAttempt(job, adapter, taskInput) {
    const { controller, cwd, isWriteTask, config, beforeSnap } = job;
    const tracker = createHealthTracker();
    await tracker.load();
    const { outcome } = await runProcess(adapter.buildCommand(taskInput), {
        timeoutMs: config.timeouts.defaultMs,
        maxBufferBytes: config.buffers.maxBytes,
        signal: controller.signal,
        stdoutTailBytes: 2048,
        stderrTailBytes: 2048,
        onStdout: () => { },
        onStderr: () => { },
    });
    const fact = classifyOutcome(outcome);
    let category = fact.category ?? adapter.classifyError(outcome.exitCode, outcome.stderr, {
        timedOut: outcome.timedOut,
        cancelled: outcome.cancelled,
        spawnError: outcome.spawnError,
    });
    if (outcome.cancelled)
        tracker.recordCancellation(adapter.provider, adapter.model);
    else if (outcome.timedOut) {
        tracker.recordFailure(adapter.provider, adapter.model, 'TIMEOUT');
        tracker.setCooldown(adapter.provider, adapter.model, Date.now() + 60_000, 'TIMEOUT');
    }
    else if (outcome.spawnError)
        tracker.recordFailure(adapter.provider, adapter.model, 'TOOL_NOT_INSTALLED');
    else if (outcome.exitCode === 0)
        tracker.recordSuccess(adapter.provider, adapter.model);
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
    let result;
    if (outcome.cancelled)
        result = 'CANCELLED';
    else if (outcome.timedOut || outcome.spawnError)
        result = 'FAILED';
    else if (outcome.exitCode === 0) {
        if (isWriteTask)
            result = changed ? 'SUCCEEDED_WITH_CHANGES' : 'NO_CHANGES';
        else
            result = changed ? 'NEEDS_USER_REVIEW' : 'SUCCEEDED_READ_ONLY';
    }
    else
        result = 'FAILED';
    const finalState = {
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
export async function resolveNextCandidate(job) {
    const tracker = createHealthTracker();
    await tracker.load();
    const { selectCandidateFrom } = await import('../router/router.js');
    const adapters = await availableAdapters();
    const decision = selectCandidateFrom(job.taskInput, adapters, tracker, job.visited, job.allow);
    if (!decision.chosen)
        return null;
    const nextAdapter = adapters.find((a) => a.id === decision.chosen.id);
    if (!nextAdapter)
        return null;
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
async function runTaskInBackground(orch, job) {
    try {
        const session = await orch.start(job.state.task, job.cwd, {
            runId: job.runId,
            controller: job.controller,
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
        }
        else {
            const s = orch.get(session.runId);
            if (s)
                job.state = s;
        }
        await writeTaskState(job.state).catch(() => { });
    }
    catch (err) {
        const s = orch.get(job.runId);
        if (s) {
            s.state = 'FAILED';
            s.error = { category: 'PROCESS_CRASH', message: String(err).slice(0, 500) };
            job.state = s;
            await writeTaskState(s).catch(() => { });
        }
    }
}
export async function startMcp(transport) {
    const server = new McpServer({ name: 'air', version: '0.1.0' });
    server.registerTool('run_task', {
        title: 'Run a task',
        description: 'Route and run a task through an AI coding tool.',
        inputSchema: {
            task: z.string().describe('Task description'),
            cwd: z.string().optional().describe('Working directory'),
            readOnly: z.boolean().optional().describe('Treat as read-only'),
            auto: z.boolean().optional().describe('Auto-switch on failover'),
            allowProvider: z.union([z.string(), z.array(z.string())]).optional().describe('Allowed providers for failover'),
        },
    }, async (args) => {
        const runId = makeRunId();
        const controller = new AbortController();
        const cwd = args.cwd ?? process.cwd();
        const snap = snapshotGit(cwd);
        const isWriteTask = !args.readOnly;
        if (isWriteTask && snap.dirty) {
            const { formatDirtyReport } = await import('../context/checkpoint.js');
            const report = formatDirtyReport(snap);
            const st = {
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
        let mcpAdapters;
        if (process.env.AIR_MOCK_ADAPTER) {
            const { MockAdapter } = await import('../adapters/mock.js');
            mcpAdapters = [new MockAdapter()];
        }
        const orch = new Orchestrator({
            adapters: mcpAdapters,
            config,
            mcpMode: true,
        });
        const fallbackState = {
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
                : (typeof args.allowProvider === 'string' ? args.allowProvider.split(',').map((s) => s.trim()).filter(Boolean) : undefined),
        };
        const job = {
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
    });
    server.registerTool('get_task_status', {
        title: 'Get task status',
        description: 'Return the current state of a task.',
        inputSchema: { runId: z.string().describe('Task run id') },
    }, async (args) => {
        const job = jobs.get(args.runId);
        const state = job?.state ?? (await readTaskState(args.runId));
        if (!state)
            return { content: [{ type: 'text', text: `Unknown runId: ${args.runId}` }] };
        return { content: [{ type: 'text', text: JSON.stringify(state) }] };
    });
    server.registerTool('get_task_output', {
        title: 'Get task output',
        description: 'Return captured stdout/stderr for a task.',
        inputSchema: { runId: z.string().describe('Task run id') },
    }, async (args) => {
        const job = jobs.get(args.runId);
        const state = job?.state ?? (await readTaskState(args.runId));
        if (!state)
            return { content: [{ type: 'text', text: `Unknown runId: ${args.runId}` }] };
        const tail = state.outputTail ?? '';
        const truncated = state.stdoutTruncated || state.stderrTruncated;
        const meta = truncated ? ' [output truncated]' : '';
        return { content: [{ type: 'text', text: tail + meta }] };
    });
    server.registerTool('resume_task', {
        title: 'Resume task',
        description: 'Resume a previous session with an optional new task. Carries forward handoff context from the prior run.',
        inputSchema: {
            runId: z.string().describe('Previous session run id to resume'),
            task: z.string().optional().describe('New task (defaults to previous task)'),
            cwd: z.string().optional().describe('Working directory'),
            readOnly: z.boolean().optional().describe('Treat as read-only'),
            auto: z.boolean().optional().describe('Auto-switch on failover'),
        },
    }, async (args) => {
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
        }
        catch (err) {
            return { content: [{ type: 'text', text: `Resume failed: ${String(err?.message || err)}` }] };
        }
    });
    server.registerTool('approve_failover', {
        title: 'Approve failover',
        description: 'Approve a proposed failover for a task and continue execution with the next candidate. The provider/model in the consent payload must match the pending proposal exactly (R5-04).',
        inputSchema: {
            runId: z.string().describe('Task run id'),
            provider: z.string().optional().describe('Consent for this exact provider (must match the proposal)'),
            model: z.string().optional().describe('Consent for this exact model (must match the proposal)'),
            proposalHash: z.string().optional().describe('Consent bound to this exact proposal hash'),
            hash: z.string().optional().describe('Alias for proposalHash'),
        },
    }, async (args) => {
        const job = jobs.get(args.runId);
        if (!job)
            return { content: [{ type: 'text', text: `Unknown runId: ${args.runId}` }] };
        const state = job.state;
        if (state.state !== 'AWAITING_APPROVAL') {
            return { content: [{ type: 'text', text: `Task not awaiting approval (state=${state.state})` }] };
        }
        const proposal = state.proposedSwitch;
        if (!proposal) {
            return { content: [{ type: 'text', text: 'No pending failover proposal for this task.' }] };
        }
        // Bind the approval to the exact pending proposal (R5-04, R6-05).
        const expectedProvider = proposal.to?.provider ?? proposal.provider;
        const expectedModel = proposal.to?.model ?? proposal.model;
        if (args.provider !== undefined && args.provider !== expectedProvider) {
            return { content: [{ type: 'text', text: `Consent provider ${args.provider} does not match proposal provider ${expectedProvider}.` }] };
        }
        if (args.model !== undefined && args.model !== expectedModel) {
            return { content: [{ type: 'text', text: `Consent model ${args.model} does not match proposal model ${expectedModel}.` }] };
        }
        const suppliedHash = args.proposalHash ?? args.hash;
        if (!suppliedHash || !proposal.hash || suppliedHash !== proposal.hash) {
            return { content: [{ type: 'text', text: 'Consent proposal hash does not match the pending proposal.' }] };
        }
        // Resume the orchestrator loop after approval.
        try {
            const session = await job.orch?.resumeAfterApproval(args.runId);
            if (!session) {
                return { content: [{ type: 'text', text: 'Failed to resume failover.' }] };
            }
            return { content: [{ type: 'text', text: `Approved failover for ${args.runId}. Switching to ${proposal.to.id} (${proposal.to.provider}/${proposal.to.model}).` }] };
        }
        catch (err) {
            return { content: [{ type: 'text', text: `Failover resume failed: ${String(err?.message || err)}` }] };
        }
    });
    server.registerTool('cancel_task', {
        title: 'Cancel task',
        description: 'Cancel a running task.',
        inputSchema: { runId: z.string().describe('Task run id') },
    }, async (args) => {
        const job = jobs.get(args.runId);
        if (!job)
            return { content: [{ type: 'text', text: `Unknown runId: ${args.runId}` }] };
        job.controller.abort();
        try {
            await job.promise;
        }
        catch { /* noop */ }
        const fresh = await readTaskState(args.runId);
        if (fresh)
            job.state = fresh;
        if (job.state.state !== 'CANCELLED')
            job.state.state = 'CANCELLED';
        await writeTaskState(job.state).catch(() => { });
        return { content: [{ type: 'text', text: `Cancelled ${args.runId}.` }] };
    });
    server.registerTool('get_status', {
        title: 'Get status',
        description: 'Return agent/provider/model availability and active cooldowns.',
        inputSchema: {},
    }, async () => {
        const tracker = createHealthTracker();
        await tracker.load();
        const data = {
            tools: adapterStatus(),
            cooldowns: tracker.getCooldowns().map((c) => ({ provider: c.provider, model: c.model, until: c.until, reason: c.reason })),
        };
        return { content: [{ type: 'text', text: JSON.stringify(data) }] };
    });
    server.registerTool('list_adapters', {
        title: 'List adapters',
        description: 'Return all catalog entries with install status (installed, version, installStatus, available, verified).',
        inputSchema: {},
    }, async () => {
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
    });
    server.registerTool('install_adapter', {
        title: 'Install adapter',
        description: 'Install a free AI adapter. Requires explicit confirm=true (write operation).',
        inputSchema: {
            id: z.string().describe('Adapter catalog id to install'),
            confirm: z.boolean().optional().describe('Explicit consent to install (must be true)'),
        },
    }, async (args) => {
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
        }
        catch (err) {
            return { content: [{ type: 'text', text: `Install failed: ${String(err?.message || err)}` }] };
        }
    });
    server.registerTool('upgrade_adapter', {
        title: 'Upgrade adapter',
        description: 'Upgrade an adapter to the catalog version. Requires explicit confirm=true (write operation).',
        inputSchema: {
            id: z.string().describe('Adapter catalog id to upgrade'),
            confirm: z.boolean().optional().describe('Explicit consent to upgrade (must be true)'),
        },
    }, async (args) => {
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
        }
        catch (err) {
            return { content: [{ type: 'text', text: `Upgrade failed: ${String(err?.message || err)}` }] };
        }
    });
    server.registerTool('uninstall_adapter', {
        title: 'Uninstall adapter',
        description: 'Uninstall an adapter. Requires explicit confirm=true (write operation).',
        inputSchema: {
            id: z.string().describe('Adapter catalog id to uninstall'),
            confirm: z.boolean().optional().describe('Explicit consent to uninstall (must be true)'),
        },
    }, async (args) => {
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
        }
        catch (err) {
            return { content: [{ type: 'text', text: `Uninstall failed: ${String(err?.message || err)}` }] };
        }
    });
    server.registerTool('chat_send', {
        title: 'Send a chat message',
        description: 'Append a user message to a conversation and return an ack (non-blocking).',
        inputSchema: {
            conversationId: z.string().optional().describe('Conversation id (creates one if omitted)'),
            message: z.string().describe('User message'),
        },
    }, async (args) => {
        const { createConversation, loadConversation, saveConversation, appendMessage, injectResult } = await import('../conversation.js');
        const { decide } = await import('../conversation/decide.js');
        const { planFromRequest } = await import('../planner.js');
        let conv = args.conversationId ? loadConversation(args.conversationId) : null;
        if (!conv)
            conv = createConversation();
        saveConversation(conv);
        await appendMessage(conv.id, { role: 'user', content: args.message });
        const actions = decide(args.message, conv);
        const replies = [];
        for (const a of actions) {
            if (a.type === 'spawn_job') {
                // Start job in background via orchestrator; link to conversation.
                const { loadConfig } = await import('../config/loader.js');
                const { config } = await loadConfig({ cwd: process.cwd() });
                const { Orchestrator } = await import('../orchestrator/orchestrator.js');
                const orch = new Orchestrator({ config, mcpMode: true });
                const contextParts = [a.goal];
                if (conv.summary)
                    contextParts.push(`Context summary: ${conv.summary}`);
                if (conv.facts && conv.facts.length > 0)
                    contextParts.push(`Facts: ${conv.facts.join('; ')}`);
                const enriched = contextParts.join('\n');
                const plan = planFromRequest(enriched, a.hints ?? {});
                const item = plan.workItems[0];
                const session = await orch.start(item.objective, process.cwd(), { mode: 'auto', freeOnly: conv.userPreferences.freeOnly });
                conv.activeWorkIds.push(session.runId);
                saveConversation(conv);
                replies.push(`Started job ${session.runId}.`);
                // Background completion inject.
                (async () => {
                    try {
                        const { readTaskState } = await import('../execution/task-state.js');
                        let state = null;
                        while (true) {
                            state = await readTaskState(session.runId);
                            if (state && (state.state === 'COMPLETED' || state.state === 'FAILED' || state.state === 'CANCELLED'))
                                break;
                            await new Promise((r) => setTimeout(r, 500));
                        }
                        const { compileJobResult } = await import('../result-compiler.js');
                        const facts = {
                            runId: session.runId,
                            result: state?.result ?? state?.state ?? 'FAILED',
                            adapterId: state?.adapter ?? session.adapterId,
                            provider: state?.provider ?? session.provider,
                            model: state?.model ?? session.model,
                            changedFiles: state?.delta ? [...(state.delta.staged || []), ...(state.delta.unstaged || []), ...(state.delta.untracked || [])] : [],
                            outputTail: state?.outputTail,
                            error: state?.error,
                        };
                        const summary = compileJobResult(facts);
                        await injectResult(conv.id, summary, session.runId);
                        conv.activeWorkIds = conv.activeWorkIds.filter((x) => x !== session.runId);
                        saveConversation(conv);
                    }
                    catch { /* noop */ }
                })();
            }
            else if (a.type === 'answer') {
                await appendMessage(conv.id, { role: 'assistant', content: 'Acknowledged.' });
                replies.push('Acknowledged.');
            }
            else if (a.type === 'clarify') {
                await appendMessage(conv.id, { role: 'assistant', content: a.question });
                replies.push(a.question);
            }
            else if (a.type === 'status') {
                replies.push(`messages=${conv.messages.length} active=${conv.activeWorkIds.join(',')}`);
            }
            else if (a.type === 'cancel_job') {
                replies.push(`Cancel requested for ${a.jobId}.`);
            }
        }
        if (replies.length === 0)
            replies.push('Acknowledged.');
        await appendMessage(conv.id, { role: 'assistant', content: replies.join(' ') });
        return { content: [{ type: 'text', text: `conversation=${conv.id}\n${replies.join(' ')}` }] };
    });
    server.registerTool('get_conversation', {
        title: 'Get conversation',
        description: 'Return a conversation thread.',
        inputSchema: { conversationId: z.string().describe('Conversation id') },
    }, async (args) => {
        const { loadConversation } = await import('../conversation.js');
        const conv = loadConversation(args.conversationId);
        if (!conv)
            return { content: [{ type: 'text', text: 'not found' }] };
        return { content: [{ type: 'text', text: JSON.stringify(conv) }] };
    });
    server.registerTool('list_conversations', {
        title: 'List conversations',
        description: 'List conversation ids with updatedAt and title.',
        inputSchema: {},
    }, async () => {
        const { listConversations, loadConversation } = await import('../conversation.js');
        const ids = listConversations();
        const rows = ids.map((id) => {
            const c = loadConversation(id);
            return { id, updatedAt: c?.updatedAt, title: c?.title };
        });
        return { content: [{ type: 'text', text: JSON.stringify(rows) }] };
    });
    server.registerTool('list_jobs', {
        title: 'List jobs',
        description: 'List jobs filtered by conversation activeWorkIds (or all known).',
        inputSchema: { conversationId: z.string().optional().describe('Optional conversation id') },
    }, async (args) => {
        const { loadConversation } = await import('../conversation.js');
        const { readTaskState } = await import('../execution/task-state.js');
        let ids = [];
        if (args?.conversationId) {
            const conv = loadConversation(args.conversationId);
            ids = conv?.activeWorkIds ?? [];
        }
        else {
            // all jobs in memory
            ids = [...jobs.keys()];
        }
        const rows = await Promise.all(ids.map(async (id) => {
            const st = jobs.get(id)?.state ?? (await readTaskState(id));
            return { runId: id, state: st?.state, result: st?.result };
        }));
        return { content: [{ type: 'text', text: JSON.stringify(rows) }] };
    });
    const serverTransport = transport ?? new StdioServerTransport();
    await server.connect(serverTransport);
    // Abort all jobs on process signals (H-08).
    const abortAll = () => {
        for (const job of jobs.values()) {
            try {
                job.controller.abort();
            }
            catch { /* noop */ }
            job.state.state = 'CANCELLED';
            writeTaskState(job.state).catch(() => { });
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
