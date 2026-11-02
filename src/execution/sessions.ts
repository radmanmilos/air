// Session manager for multi-session parallel execution (R5-25).
//
// Air can run multiple tasks concurrently, each on its own model, by
// creating independent sessions. A session owns its own job state, health
// tracker, and concurrency seat. Sessions share the global health file
// under the inter-process lock, but each session's cooldowns are scoped to
// its own (provider, model) pair.
//
// Sessions are coordinated by the MCP server; the CLI runs one session at a
// time unless --parallel is passed.

import { createHealthTracker } from '../health/tracker';
import { acquireSeat, withSeat } from '../utils/concurrency';
import { makeRunId, writeTaskState, appendTaskIndex } from '../execution/task-state';
import { snapshotGit } from '../context/checkpoint';
import type { AgentAdapter } from '../adapters/adapter';
import type { TaskInput } from '../types';

export interface SessionConfig {
  id: string;
  task: string;
  cwd: string;
  adapter: AgentAdapter;
  mode: 'ask' | 'auto';
  readOnly: boolean;
  files?: string[];
  maxHops?: number;
  timeoutMs?: number;
}

export interface SessionHandle {
  id: string;
  runId: string;
  promise: Promise<void>;
  cancel: () => void;
}

/**
 * Run a single session to completion.
 *
 * The session acquires a concurrency seat (respecting maxConcurrentAgents),
 * runs the adapter's process, and persists task state on completion.
 */
export async function runSession(config: SessionConfig): Promise<SessionHandle> {
  const { id, task, cwd, adapter, mode, readOnly, files, maxHops = 3, timeoutMs = 300_000 } = config;
  const runId = makeRunId();
  const tracker = createHealthTracker();
  await tracker.load();

  const controller = new AbortController();
  const promise = (async () => {
    await withSeat(id, 1, async () => {
      const beforeSnap = snapshotGit(cwd);
      const taskInput: TaskInput = {
        id: runId,
        prompt: task,
        cwd,
        files,
        mode,
        readOnly,
      };
      const state: any = {
        runId,
        task,
        cwd,
        adapter: adapter.id,
        provider: adapter.provider,
        model: adapter.model,
        state: 'RUNNING',
        startedAt: new Date().toISOString(),
        hops: 1,
        maxHops,
      };
      await writeTaskState(state);
      await appendTaskIndex(runId);

      const { runProcess } = await import('../execution/runner');
      const { outcome } = await runProcess(adapter.buildCommand(taskInput), {
        timeoutMs,
        signal: controller.signal,
        stdoutTailBytes: 2048,
        stderrTailBytes: 2048,
      });

      const { classifyOutcome } = await import('../types/outcome');
      const fact = classifyOutcome(outcome);
      const category = (fact.category as any) ?? adapter.classifyError(outcome.exitCode, outcome.stderr, {
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

      const { snapshotDelta } = await import('../context/checkpoint');
      const afterSnap = snapshotGit(cwd);
      const delta = snapshotDelta(beforeSnap, afterSnap);
      const changed = delta.dirty;
      let result: string;
      if (outcome.cancelled) result = 'CANCELLED';
      else if (outcome.timedOut || outcome.spawnError) result = 'FAILED';
      else if (outcome.exitCode === 0) {
        if (!readOnly) result = changed ? 'SUCCEEDED_WITH_CHANGES' : 'NO_CHANGES';
        else result = changed ? 'NEEDS_USER_REVIEW' : 'SUCCEEDED_READ_ONLY';
      } else result = 'FAILED';

      await writeTaskState({
        ...state,
        state: result === 'SUCCEEDED_WITH_CHANGES' || result === 'SUCCEEDED_READ_ONLY' || result === 'NO_CHANGES' ? 'COMPLETED' : 'FAILED',
        result,
        endedAt: new Date().toISOString(),
        delta: {
          staged: delta.staged,
          unstaged: delta.unstaged,
          untracked: delta.untracked,
          deleted: delta.deleted,
        },
        outputTail: outcome.stdoutTail,
        stdoutTruncated: outcome.stdoutTruncated,
        stderrTruncated: outcome.stderrTruncated,
        error: result !== 'SUCCEEDED_WITH_CHANGES' && result !== 'SUCCEEDED_READ_ONLY' && result !== 'NO_CHANGES'
          ? { category, message: outcome.stderr.slice(0, 500) }
          : undefined,
      });
    });
  })();

  return {
    id,
    runId,
    promise,
    cancel: () => controller.abort(),
  };
}

/**
 * Run multiple sessions concurrently, each on its own model.
 *
 * Sessions are started in parallel up to maxConcurrentAgents; excess sessions
 * wait for a seat. Each session is independent: its own job state, health
 * tracker, and concurrency seat.
 */
export async function runSessions(configs: SessionConfig[]): Promise<SessionHandle[]> {
  const handles: SessionHandle[] = [];
  for (const config of configs) {
    handles.push(await runSession(config));
  }
  // Wait for all sessions to settle; a cancelled session does not abort
  // the others.
  await Promise.allSettled(handles.map((h) => h.promise));
  return handles;
}