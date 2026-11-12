// Run state persistence.
//
// Task state lives under `<cacheDir>/tasks/<runId>.json`. Written atomically
// (temp-file-plus-rename) so concurrent CLI + MCP processes cannot observe a
// half-written file. Multiple tasks never overwrite one another: each run
// gets a unique id.
//
// Task-index updates are guarded by an inter-process lock (R5-09) so two
// processes reading/modifying/writing the index simultaneously cannot lose
// task IDs.

import { paths } from '../config/paths';
import { atomicWriteJson, readJsonFile } from '../utils/atomic';
import { lockedReadModifyWrite } from '../utils/lock';
import type { ResultState } from '../types/result';

export interface TaskState {
  runId: string;
  task: string;
  cwd: string;
  adapter: string;
  provider: string;
  model: string;
  state: 'QUEUED' | 'RUNNING' | 'FAILURE_DETECTED' | 'AWAITING_APPROVAL' | 'SWITCHING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  result?: ResultState;
  startedAt: string;
  endedAt?: string;
  hops: number;
  maxHops: number;
  proposedSwitch?: {
    adapter: string;
    provider: string;
    model: string;
    reason: string;
    action?: string;
    task?: string;
    hash?: string;
  };
  outputTail?: string;
  stdoutTruncated?: boolean;
  stderrTruncated?: boolean;
  error?: { category: string; message: string };
  /** Real git worktree allocated for a write job (isolation, T-030). */
  worktreePath?: string;
  worktreeBranch?: string;
  /** Source repository the worktree was branched from. */
  sourceCwd?: string;
  /** Source HEAD the worktree branched from; used by `air merge` preview. */
  sourceHead?: string;
  delta?: {
    staged: string[];
    unstaged: string[];
    untracked: string[];
    deleted: string[];
  };
}

function stateFile(runId: string): string {
  return `${paths.tasksDir}/${runId}.json`;
}

export async function writeTaskState(state: TaskState): Promise<void> {
  await atomicWriteJson(stateFile(state.runId), state);
}

export async function readTaskState(runId: string): Promise<TaskState | null> {
  return readJsonFile<TaskState>(stateFile(runId));
}

export async function listTaskStates(): Promise<TaskState[]> {
  // Best-effort: read known ids from a sidecar index if present.
  const index = await readJsonFile<{ ids: string[] }>(`${paths.tasksDir}/index.json`);
  if (!index?.ids) return [];
  const out: TaskState[] = [];
  for (const id of index.ids) {
    const s = await readTaskState(id);
    if (s) out.push(s);
  }
  return out;
}

/**
 * Append a run id to the task index under an inter-process lock so two
 * concurrent processes cannot lose task IDs (R5-09).
 */
export async function appendTaskIndex(runId: string): Promise<void> {
  const indexFile = `${paths.tasksDir}/index.json`;
  await lockedReadModifyWrite<{ ids: string[] }>(
    'task-index',
    indexFile,
    async (current) => {
      const ids = current?.ids ?? [];
      if (!ids.includes(runId)) ids.push(runId);
      return { ids };
    },
    { timeoutMs: 5000 },
  );
}

export function makeRunId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `run-${ts}-${rand}`;
}