// Central orchestrator ("brain") for AIR.
//
// Coordinates sessions, selects the best available model/tool for each task,
// persists a session log so work can be resumed/inspected, and exposes a
// single status view. CLI/MCP/sessions become thin wrappers around this.
//
// The full failover loop lives here so CLI and MCP share one execution path.
import { existsSync, readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { lockedReadModifyWrite } from '../utils/lock.js';
import { paths } from '../config/paths.js';
import { loadConfig } from '../config/loader.js';
import { createHealthTracker } from '../health/tracker.js';
import { buildModelCatalog, bestModelFor } from '../router/catalog.js';
import { availableAdapters } from '../adapters/registry.js';
import { acquireSeat } from '../utils/concurrency.js';
import { runProcess } from '../execution/runner.js';
import { classifyOutcome } from '../types/outcome.js';
import { snapshotGit, snapshotDelta, formatDirtyReport, formatDeltaReport } from '../context/checkpoint.js';
import { makeRunId, writeTaskState, appendTaskIndex } from '../execution/task-state.js';
import { trace } from '../observability/trace.js';
import { redact } from '../security/redact.js';
import { buildHandoffPack } from '../context/handoff.js';
import { defaultAllowList, checkHandoffAllowlist } from '../security/allowlist.js';
import { selectCandidateFrom, formatRouteDecision, costTier } from '../router/router.js';
import { getErrorAction, triggersFailover } from '../types/errors.js';
export class Orchestrator {
    deps;
    sessions = new Map();
    handles = new Map();
    events = [];
    logFile;
    constructor(deps = {}) {
        this.deps = deps;
        const cacheDir = deps.cacheDir ?? paths.cacheDir;
        mkdirSync(cacheDir, { recursive: true });
        this.logFile = join(cacheDir, 'orchestrator.json');
        this.load();
    }
    load() {
        try {
            if (existsSync(this.logFile)) {
                const raw = JSON.parse(readFileSync(this.logFile, 'utf8'));
                for (const s of raw.sessions ?? []) {
                    const sess = s;
                    // Crash recovery (T-018): a run persisted as RUNNING but the process
                    // is gone -> mark interrupted, do not auto-restart.
                    if (sess.state === 'RUNNING') {
                        sess.state = 'FAILED';
                        sess.interrupted = true;
                        sess.endedAt = sess.endedAt ?? new Date().toISOString();
                    }
                    this.sessions.set(sess.runId, sess);
                }
                this.events = raw.events ?? [];
            }
        }
        catch { /* ignore corrupt log */ }
    }
    persist() {
        try {
            void lockedReadModifyWrite('orchestrator', this.logFile, async (current) => {
                const base = current ?? { sessions: [], events: [] };
                const byId = new Map((base.sessions ?? []).map((s) => [s.runId, s]));
                for (const s of this.sessions.values())
                    byId.set(s.runId, s);
                const mergedEvents = [...(base.events ?? [])];
                for (const e of this.events) {
                    if (!mergedEvents.some((x) => x.id === e.id))
                        mergedEvents.push(e);
                }
                return { sessions: [...byId.values()], events: mergedEvents };
            });
        }
        catch { /* best-effort */ }
    }
    log(type, detail) {
        const ev = {
            id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
            sequence: this.events.length + 1,
            ts: new Date().toISOString(),
            type,
            detail,
        };
        this.events.push(ev);
        // keep events bounded
        if (this.events.length > 1000)
            this.events.shift();
    }
    get eventsLog() {
        return [...this.events];
    }
    chooseAdapter(task) {
        const adapters = this.deps.adapters ?? availableAdapters(this.deps.config);
        const catalog = buildModelCatalog(adapters);
        const best = bestModelFor(catalog, task);
        if (!best)
            return null;
        const adapter = adapters.find((a) => a.id === best.id) ?? null;
        this.log('model_selected', `${best.id} (${best.provider}/${best.model}) for mode=${task.mode} readOnly=${task.readOnly}`);
        return adapter;
    }
    /**
     * Run a task through the full failover loop.
     *
     * Single execution path shared by CLI and MCP:
     *   1. Dirty-tree check (refuse write tasks on dirty tree unless --allow-dirty)
     *   2. Select candidate (priority list, cooldowns, skip reasons)
     *   3. Run process via shared runner
     *   4. Classify error, update health/cooldowns
     *   5. Compute result from workspace delta (not stdout)
     *   6. On failover-triggering category: propose switch (ask) or auto-switch
     *   7. Repeat until success, abort, hop cap, or no eligible candidate
     */
    async start(task, cwd, options = {}) {
        const readOnly = !!options.readOnly;
        const mode = options.mode ?? 'ask';
        const maxHops = options.maxHops ?? 3;
        const allowDirty = !!options.allowDirty;
        const controller = options.controller ?? new AbortController();
        this.log('request_received', task);
        const snap = snapshotGit(cwd);
        const isWriteTask = !readOnly;
        if (isWriteTask && snap.dirty && !allowDirty) {
            this.log('dirty_tree_refused', task);
            throw new Error(formatDirtyReport(snap));
        }
        this.log('session_started', task);
        const { config } = await loadConfig({ cwd });
        const tracker = createHealthTracker();
        await tracker.load();
        const { fromConfig, enforce } = await import('../permissions/index.js');
        const policy = fromConfig(config);
        const permCheck = enforce(policy, { write: !readOnly, shell: false, network: false });
        if (!permCheck.ok)
            throw new Error(`Permission denied: ${permCheck.reason}`);
        const adaptersRaw = this.deps.adapters ?? availableAdapters(config);
        let adapters = adaptersRaw;
        if (options.freeOnly) {
            adapters = adaptersRaw.filter((a) => costTier({ id: a.id, tool: a.id, provider: a.provider, model: a.model, capabilities: a.capabilities }) === 0);
            if (adapters.length === 0)
                throw new Error('No free-capable adapter available. Use --allow-paid to enable paid fallback.');
        }
        const runId = options.runId ?? makeRunId();
        await appendTaskIndex(runId);
        const { createWorktree } = await import('../workspace/index.js');
        let worktreeInfo = null;
        if (isWriteTask) {
            try {
                worktreeInfo = createWorktree(runId, cwd);
            }
            catch {
                worktreeInfo = null;
            }
        }
        const execCwd = worktreeInfo ? worktreeInfo.worktreePath : cwd;
        const taskInput = {
            id: runId,
            prompt: task,
            cwd: execCwd,
            files: options.files,
            mode,
            readOnly,
        };
        const onSig = () => controller.abort();
        process.on('SIGINT', onSig);
        process.on('SIGTERM', onSig);
        try {
            const allow = defaultAllowList(adapters);
            const visited = new Set();
            let hops = 0;
            // Immutable baseline for the whole work item (T-019).
            const baselineSnap = snapshotGit(execCwd);
            // Failover loop: try candidates until success, abort, or hop cap.
            while (hops < maxHops) {
                const decision = selectCandidateFrom(taskInput, adapters, tracker, visited, null);
                if (!decision.chosen) {
                    this.log('no_adapter', task);
                    throw new Error(formatRouteDecision(decision));
                }
                const chosen = decision.chosen;
                this.log('model_selected', `${chosen.id} (${chosen.provider}/${chosen.model}) for mode=${mode} readOnly=${readOnly}`);
                const adapter = adapters.find((a) => a.id === chosen.id);
                const revisitKey = `${chosen.id}|${chosen.provider}|${chosen.model}`;
                if (visited.has(revisitKey)) {
                    this.log('already_visited', `${chosen.id} refusing to loop`);
                    break;
                }
                visited.add(revisitKey);
                hops++;
                // Build the task's provider-destination policy from the actual first
                // selected candidate (R5-04).
                if (hops === 1) {
                    allow.providers = [chosen.provider, ...(options.allowProviders ?? [])];
                    allow.models = [chosen.model];
                }
                const spec = adapter.buildCommand(taskInput);
                const beforeSnap = snapshotGit(execCwd);
                const state = {
                    runId,
                    task,
                    cwd: execCwd,
                    adapter: chosen.id,
                    provider: chosen.provider,
                    model: chosen.model,
                    state: 'RUNNING',
                    startedAt: new Date().toISOString(),
                    hops,
                    maxHops,
                    worktreePath: worktreeInfo?.worktreePath,
                    worktreeBranch: worktreeInfo?.branch,
                    sourceCwd: worktreeInfo ? cwd : undefined,
                };
                await writeTaskState(state);
                trace({ runId, event: 'router_pick', chosen: chosen.id, skips: decision.skips, hops });
                const seat = await acquireSeat('agent', config.concurrency?.maxConcurrentAgents ?? 1, { timeoutMs: 30000 });
                if (!seat) {
                    throw new Error('SEAT_TIMEOUT: could not acquire a concurrency seat');
                }
                let outcome;
                try {
                    const r = await runProcess(spec, {
                        timeoutMs: config.timeouts.defaultMs,
                        maxBufferBytes: config.buffers.maxBytes,
                        signal: controller.signal,
                        stdoutTailBytes: 2048,
                        stderrTailBytes: 2048,
                        onStdout: (c) => { if (!this.deps.mcpMode)
                            process.stdout.write(c); },
                        onStderr: (c) => { if (!this.deps.mcpMode)
                            process.stderr.write(c); },
                    });
                    outcome = r.outcome;
                }
                finally {
                    await seat.release();
                }
                const fact = classifyOutcome(outcome);
                let category = fact.category ?? adapter.classifyError(outcome.exitCode, outcome.stderr, {
                    timedOut: outcome.timedOut,
                    cancelled: outcome.cancelled,
                    spawnError: outcome.spawnError,
                });
                // Update health tracker before the next routing decision.
                if (outcome.cancelled) {
                    tracker.recordCancellation(adapter.provider, adapter.model);
                }
                else if (outcome.timedOut) {
                    tracker.recordFailure(adapter.provider, adapter.model, 'TIMEOUT');
                    tracker.setCooldown(adapter.provider, adapter.model, Date.now() + config.failover.cooldownMinutes * 60_000, 'TIMEOUT');
                }
                else if (outcome.spawnError) {
                    tracker.recordFailure(adapter.provider, adapter.model, 'TOOL_NOT_INSTALLED');
                }
                else if (outcome.exitCode === 0) {
                    tracker.recordSuccess(adapter.provider, adapter.model);
                }
                else {
                    tracker.recordFailure(adapter.provider, adapter.model, category);
                    if (category === 'RATE_LIMIT' || category === 'QUOTA_EXCEEDED') {
                        tracker.setCooldown(adapter.provider, adapter.model, Date.now() + config.failover.cooldownMinutes * 60_000, category);
                    }
                }
                await tracker.flush();
                // Determine result from the agent-produced delta relative to the initial
                // snapshot, not from whether the tree is dirty at all (R5-07).
                const afterSnap = snapshotGit(execCwd);
                const delta = snapshotDelta(baselineSnap, afterSnap);
                const changed = delta.dirty;
                let result;
                if (outcome.cancelled) {
                    result = 'CANCELLED';
                }
                else if (outcome.timedOut || outcome.spawnError) {
                    result = 'FAILED';
                }
                else if (outcome.exitCode === 0) {
                    if (isWriteTask) {
                        result = changed ? 'SUCCEEDED_WITH_CHANGES' : 'NO_CHANGES';
                    }
                    else {
                        result = changed ? 'NEEDS_USER_REVIEW' : 'SUCCEEDED_READ_ONLY';
                    }
                }
                else {
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
                    outputTail: redact(outcome.stdoutTail ?? outcome.stdout),
                    stdoutTruncated: outcome.stdoutTruncated,
                    stderrTruncated: outcome.stderrTruncated,
                    error: result !== 'SUCCEEDED_WITH_CHANGES' && result !== 'SUCCEEDED_READ_ONLY' && result !== 'NO_CHANGES'
                        ? { category, message: outcome.stderr.slice(0, 500) }
                        : undefined,
                });
                trace({ runId, event: 'run_complete', result, category, durationMs: outcome.durationMs, hops, changed, delta: formatDeltaReport(delta) });
                // Register session for tracking.
                const session = {
                    runId,
                    task,
                    cwd: execCwd,
                    adapterId: chosen.id,
                    provider: chosen.provider,
                    model: chosen.model,
                    readOnly,
                    state: result === 'SUCCEEDED_WITH_CHANGES' || result === 'SUCCEEDED_READ_ONLY' || result === 'NO_CHANGES' ? 'COMPLETED' : result === 'CANCELLED' ? 'CANCELLED' : 'FAILED',
                    startedAt: state.startedAt,
                    endedAt,
                    result,
                };
                this.sessions.set(runId, session);
                this.persist();
                this.log('session_completed', `${runId}: ${session.state}`);
                if (outcome.cancelled) {
                    return session;
                }
                if (outcome.timedOut || outcome.spawnError || outcome.exitCode !== 0) {
                    // Non-zero exit: decide failover.
                    const action = getErrorAction(category);
                    if (triggersFailover(category) && hops < maxHops) {
                        const nextDecision = selectCandidateFrom({ ...taskInput, preferredTool: undefined }, adapters, tracker, visited, null);
                        const next = nextDecision.chosen;
                        if (!next) {
                            // No alternative candidate; session stays FAILED.
                            return session;
                        }
                        const nextAdapter = adapters.find((a) => a.id === next.id);
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
                                mode,
                                files: options.files,
                                category,
                                summary: outcome.stderr.slice(0, 200),
                                outputTail: outcome.stderr.slice(-2048),
                                before: beforeSnap,
                                after: afterSnap,
                            }),
                            hash: createHash('sha256').update(JSON.stringify({
                                from: { id: adapter.id, provider: adapter.provider, model: adapter.model },
                                to: { id: nextAdapter.id, provider: nextAdapter.provider, model: nextAdapter.model },
                                category,
                                task: taskInput.prompt,
                            })).digest('hex'),
                        };
                        if (!allowCheck.ok) {
                            this.log('failover_blocked', `${allowCheck.reason}`);
                            return session;
                        }
                        if (mode === 'auto') {
                            // Auto-switch within the allow-list only. Never bypass provider restrictions.
                            taskInput.prompt = `${task}\n\n--- handoff ---\n${proposal.handoff}`;
                            session.state = 'SWITCHING';
                            session.adapterId = nextAdapter.id;
                            session.provider = nextAdapter.provider;
                            session.model = nextAdapter.model;
                            session.taskInputPrompt = taskInput.prompt;
                            session.visitedKeys = [...visited];
                            session.hops = hops;
                            session.allowProviders = allow.providers;
                            session.allowModels = allow.models;
                            this.sessions.set(runId, session);
                            this.persist();
                            continue;
                        }
                        // ask mode: propose failover and wait for approval.
                        // Save continuation state so MCP/resumeAfterApproval can continue.
                        const approved = await this.handleFailoverProposal(proposal);
                        if (!approved) {
                            this.log('failover_declined', `${runId}`);
                            session.state = 'AWAITING_APPROVAL';
                            session.proposedSwitch = proposal;
                            session.taskInputPrompt = taskInput.prompt;
                            session.visitedKeys = [...visited];
                            session.hops = hops;
                            session.allowProviders = allow.providers;
                            session.allowModels = allow.models;
                            this.sessions.set(runId, session);
                            this.persist();
                            return session;
                        }
                        taskInput.prompt = `${task}\n\n--- handoff ---\n${proposal.handoff}`;
                        session.state = 'SWITCHING';
                        session.adapterId = nextAdapter.id;
                        session.provider = nextAdapter.provider;
                        session.model = nextAdapter.model;
                        session.taskInputPrompt = taskInput.prompt;
                        session.visitedKeys = [...visited];
                        session.hops = hops;
                        session.allowProviders = allow.providers;
                        session.allowModels = allow.models;
                        this.sessions.set(runId, session);
                        this.persist();
                        continue;
                    }
                    // No failover (category doesn't trigger it, or hop cap reached).
                    return session;
                }
                // Success (exit 0).
                return session;
            }
            // Hop cap reached.
            const s = this.sessions.get(runId);
            if (s)
                return s;
            throw new Error(`Hop cap reached (${maxHops}).`);
        }
        finally {
            process.removeListener('SIGINT', onSig);
            process.removeListener('SIGTERM', onSig);
        }
    }
    /**
     * Resume a paused failover loop after failover approval (MCP mode).
     * Continues from the saved continuation state (visited keys, hops, allow
     * lists, task prompt) and switches to the proposed adapter.
     */
    async resumeAfterApproval(runId) {
        const prev = this.sessions.get(runId);
        if (!prev)
            throw new Error(`Unknown session: ${runId}`);
        if (prev.state !== 'AWAITING_APPROVAL' && prev.state !== 'SWITCHING') {
            throw new Error(`Session ${runId} is not awaiting approval (state=${prev.state})`);
        }
        const proposal = prev.proposedSwitch;
        if (!proposal)
            throw new Error(`No pending failover proposal for ${runId}`);
        const { config } = await loadConfig({ cwd: prev.cwd });
        const tracker = createHealthTracker();
        await tracker.load();
        const adapters = this.deps.adapters ?? availableAdapters(config);
        const nextAdapter = adapters.find((a) => a.id === proposal.to.id);
        if (!nextAdapter)
            throw new Error(`Proposed adapter ${proposal.to.id} not available`);
        // Reconstruct loop state from saved continuation.
        const visited = new Set(prev.visitedKeys ?? []);
        let hops = prev.hops ?? 1;
        // Mark the next candidate as visited and advance hops.
        const nextRevisitKey = `${nextAdapter.id}|${nextAdapter.provider}|${nextAdapter.model}`;
        visited.add(nextRevisitKey);
        hops++;
        // Build the new task input with the handoff injected into the prompt.
        const taskInput = {
            id: runId,
            prompt: prev.taskInputPrompt ?? prev.task,
            cwd: prev.cwd,
            files: undefined,
            mode: 'auto', // MCP approval implies auto-continue
            readOnly: prev.readOnly,
        };
        const controller = new AbortController();
        const onSig = () => controller.abort();
        process.on('SIGINT', onSig);
        process.on('SIGTERM', onSig);
        const session = {
            runId,
            task: prev.task,
            cwd: prev.cwd,
            adapterId: nextAdapter.id,
            provider: nextAdapter.provider,
            model: nextAdapter.model,
            readOnly: prev.readOnly,
            state: 'RUNNING',
            startedAt: new Date().toISOString(),
            parentRunId: prev.parentRunId,
        };
        this.sessions.set(runId, session);
        this.persist();
        const spec = nextAdapter.buildCommand(taskInput);
        const beforeSnap = snapshotGit(prev.cwd);
        const state = {
            runId,
            task: prev.task,
            cwd: prev.cwd,
            adapter: nextAdapter.id,
            provider: nextAdapter.provider,
            model: nextAdapter.model,
            state: 'RUNNING',
            startedAt: new Date().toISOString(),
            hops,
            maxHops: config.failover.maxHops,
        };
        await writeTaskState(state);
        trace({ runId, event: 'failover_approved', to: nextAdapter.id, hops });
        const { outcome } = await runProcess(spec, {
            timeoutMs: config.timeouts.defaultMs,
            maxBufferBytes: config.buffers.maxBytes,
            signal: controller.signal,
            stdoutTailBytes: 2048,
            stderrTailBytes: 2048,
            onStdout: (c) => process.stdout.write(c),
            onStderr: (c) => process.stderr.write(c),
        });
        const fact = classifyOutcome(outcome);
        let category = fact.category ?? nextAdapter.classifyError(outcome.exitCode, outcome.stderr, {
            timedOut: outcome.timedOut,
            cancelled: outcome.cancelled,
            spawnError: outcome.spawnError,
        });
        if (outcome.cancelled) {
            tracker.recordCancellation(nextAdapter.provider, nextAdapter.model);
        }
        else if (outcome.timedOut) {
            tracker.recordFailure(nextAdapter.provider, nextAdapter.model, 'TIMEOUT');
            tracker.setCooldown(nextAdapter.provider, nextAdapter.model, Date.now() + config.failover.cooldownMinutes * 60_000, 'TIMEOUT');
        }
        else if (outcome.spawnError) {
            tracker.recordFailure(nextAdapter.provider, nextAdapter.model, 'TOOL_NOT_INSTALLED');
        }
        else if (outcome.exitCode === 0) {
            tracker.recordSuccess(nextAdapter.provider, nextAdapter.model);
        }
        else {
            tracker.recordFailure(nextAdapter.provider, nextAdapter.model, category);
            if (category === 'RATE_LIMIT' || category === 'QUOTA_EXCEEDED') {
                tracker.setCooldown(nextAdapter.provider, nextAdapter.model, Date.now() + config.failover.cooldownMinutes * 60_000, category);
            }
        }
        await tracker.flush();
        const afterSnap = snapshotGit(prev.cwd);
        const delta = snapshotDelta(beforeSnap, afterSnap);
        const changed = delta.dirty;
        const isWriteTask = !prev.readOnly;
        let result;
        if (outcome.cancelled) {
            result = 'CANCELLED';
        }
        else if (outcome.timedOut || outcome.spawnError) {
            result = 'FAILED';
        }
        else if (outcome.exitCode === 0) {
            if (isWriteTask) {
                result = changed ? 'SUCCEEDED_WITH_CHANGES' : 'NO_CHANGES';
            }
            else {
                result = changed ? 'NEEDS_USER_REVIEW' : 'SUCCEEDED_READ_ONLY';
            }
        }
        else {
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
            outputTail: redact(outcome.stdoutTail ?? outcome.stdout),
            stdoutTruncated: outcome.stdoutTruncated,
            stderrTruncated: outcome.stderrTruncated,
            error: result !== 'SUCCEEDED_WITH_CHANGES' && result !== 'SUCCEEDED_READ_ONLY' && result !== 'NO_CHANGES'
                ? { category, message: outcome.stderr.slice(0, 500) }
                : undefined,
        });
        trace({ runId, event: 'run_complete', result, category, durationMs: outcome.durationMs, hops, changed, delta: formatDeltaReport(delta) });
        session.state = result === 'SUCCEEDED_WITH_CHANGES' || result === 'SUCCEEDED_READ_ONLY' || result === 'NO_CHANGES' ? 'COMPLETED' : result === 'CANCELLED' ? 'CANCELLED' : 'FAILED';
        session.result = result;
        session.endedAt = endedAt;
        this.sessions.set(runId, session);
        this.persist();
        return session;
    }
    /**
     * Handle a failover proposal. In MCP mode, set state to AWAITING_APPROVAL
     * and return false so the MCP client can approve later via approve_failover.
     * In CLI mode, use the onFailoverPropose callback (interactive prompt).
     */
    async handleFailoverProposal(proposal) {
        const { mcpMode, onFailoverPropose } = this.deps;
        if (mcpMode) {
            const s = this.sessions.get(proposal.runId);
            if (s) {
                s.state = 'AWAITING_APPROVAL';
                s.proposedSwitch = proposal;
                this.persist();
            }
            return false;
        }
        if (onFailoverPropose) {
            return onFailoverPropose(proposal);
        }
        // Default: interactive prompt (CLI TTY).
        return this.promptApproveFailover(proposal);
    }
    /** Interactive approval prompt for a failover proposal (R5-04). */
    async promptApproveFailover(proposal) {
        if (!process.stdin.isTTY) {
            return false;
        }
        process.stdout.write('\nair: failover proposed\n');
        process.stdout.write(`  run:      ${proposal.runId}\n`);
        process.stdout.write(`  from:     ${proposal.from.id} (${proposal.from.provider}/${proposal.from.model})\n`);
        process.stdout.write(`  to:       ${proposal.to.id} (${proposal.to.provider}/${proposal.to.model})\n`);
        process.stdout.write(`  reason:   ${proposal.category}\n`);
        process.stdout.write(`  action:   ${proposal.action}\n`);
        process.stdout.write(`  handoff:  ${proposal.handoff.split('\n')[0]}\n`);
        process.stdout.write('Approve failover? [y/N] ');
        return new Promise((resolve) => {
            const onAnswer = (data) => {
                const raw = data.toString().trim().toLowerCase();
                process.stdin.removeListener('data', onAnswer);
                process.stdin.resume();
                resolve(raw === 'y' || raw === 'yes');
            };
            process.stdin.setEncoding('utf8');
            process.stdin.on('data', onAnswer);
            process.stdin.resume();
        });
    }
    list() {
        return [...this.sessions.values()];
    }
    get(runId) {
        return this.sessions.get(runId);
    }
    async resume(runId, taskOverride) {
        const prev = this.sessions.get(runId);
        if (!prev)
            throw new Error(`Unknown session: ${runId}`);
        const task = taskOverride ?? prev.task;
        const handoff = `Continue from previous session ${runId} (${prev.result ?? prev.state}).`;
        this.log('resume_requested', `${runId} -> ${task}`);
        const session = await this.start(`${task}\n\n--- handoff ---\n${handoff}`, prev.cwd, { readOnly: prev.readOnly, mode: 'ask' });
        session.parentRunId = runId;
        this.sessions.set(session.runId, session);
        this.persist();
        return session;
    }
    async waitForAll() {
        await Promise.all([...this.handles.values()].map((h) => h.promise));
    }
    async cancel(runId) {
        const h = this.handles.get(runId);
        h?.cancel();
        const s = this.sessions.get(runId);
        if (s) {
            s.state = 'CANCELLED';
            this.persist();
        }
    }
}
