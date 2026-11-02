// Run state persistence.
//
// Task state lives under `<cacheDir>/tasks/<runId>.json`. Written atomically
// (temp-file-plus-rename) so concurrent CLI + MCP processes cannot observe a
// half-written file. Multiple tasks never overwrite one another: each run
// gets a unique id.

import { paths } from '../config/paths';
import { atomicWriteJson, readJsonFile } from '../utils/atomic';
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
  };
  outputTail?: string;
  stdoutTruncated?: boolean;
  stderrTruncated?: boolean;
  error?: { category: string; message: string };
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

export async function appendTaskIndex(runId: string): Promise<void> {
  const index = await readJsonFile<{ ids: string[] }>(`${paths.tasksDir}/index.json`);
  const ids = index?.ids ?? [];
  if (!ids.includes(runId)) ids.push(runId);
  await atomicWriteJson(`${paths.tasksDir}/index.json`, { ids });
}

export function makeRunId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `run-${ts}-${rand}`;
}