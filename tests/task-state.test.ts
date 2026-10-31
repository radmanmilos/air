import { makeRunId, writeTaskState, readTaskState, appendTaskIndex } from '../src/execution/task-state';
import { paths } from '../src/config/paths';
import { describe, it, expect, beforeAll } from 'vitest';

describe('task state (R2-11)', () => {
  beforeAll(async () => {
    // Ensure cache dir exists for the default paths singleton.
    const { mkdir } = await import('node:fs/promises');
    await mkdir(paths.cacheDir, { recursive: true });
  });

  it('writes and reads back a task state', async () => {
    const runId = makeRunId();
    await writeTaskState({
      runId,
      task: 'test',
      cwd: '/tmp',
      adapter: 'mock',
      provider: 'openrouter',
      model: 'mock-model',
      state: 'RUNNING',
      startedAt: new Date().toISOString(),
      hops: 1,
      maxHops: 3,
    });
    const loaded = await readTaskState(runId);
    expect(loaded).not.toBeNull();
    expect(loaded?.runId).toBe(runId);
    expect(loaded?.state).toBe('RUNNING');
  });

  it('appends to the task index', async () => {
    const runId = makeRunId();
    await appendTaskIndex(runId);
    const { readJsonFile } = await import('../src/utils/atomic');
    const idx = await readJsonFile<{ ids: string[] }>(`${paths.tasksDir}/index.json`);
    expect(idx?.ids).toContain(runId);
  });
});