import { runAttempt, resolveNextCandidate, jobs } from '../src/mcp/server';
import { MockAdapter } from '../src/adapters/mock';
import { writeTaskState, appendTaskIndex, makeRunId } from '../src/execution/task-state';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// In-process integration test for the MCP failover lifecycle (G3-02, G3-12).
// Exercises runAttempt and resolveNextCandidate directly with a mock
// adapter, bypassing the stdio transport.

let dir: string;
let originalMockMode: string | undefined;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'air-mcp-job-'));
  originalMockMode = process.env.MOCK_MODE;
});

afterEach(() => {
  if (originalMockMode === undefined) delete process.env.MOCK_MODE;
  else process.env.MOCK_MODE = originalMockMode;
  rmSync(dir, { recursive: true, force: true });
  jobs.clear();
});

function makeJob(adapter: any, prompt = 'fix', mode: 'ask' | 'auto' = 'ask') {
  const runId = makeRunId();
  const controller = new AbortController();
  const state: any = {
    runId,
    task: prompt,
    cwd: dir,
    adapter: adapter.id,
    provider: adapter.provider,
    model: adapter.model,
    state: 'RUNNING',
    startedAt: new Date().toISOString(),
    hops: 1,
    maxHops: 3,
  };
  const job: any = {
    state,
    controller,
    promise: Promise.resolve(),
    adapter,
    taskInput: { id: runId, prompt, cwd: dir, mode, readOnly: mode === 'ask' },
    cwd: dir,
    isWriteTask: mode !== 'ask' || !prompt.includes('read'),
    visited: new Set([`${adapter.provider}/${adapter.model}`]),
    hops: 1,
    maxHops: 3,
    allow: { providers: [adapter.provider], models: [adapter.model] },
    config: { timeouts: { defaultMs: 30_000 }, buffers: { maxBytes: 1_000_000 }, failover: { maxHops: 3, cooldownMinutes: 1 } },
  };
  jobs.set(runId, job);
  return job;
}

describe('mcp job lifecycle (G3-02, G3-12)', () => {
  it('run_attempt with a succeeding mock completes with SUCCEEDED_READ_ONLY', async () => {
    process.env.MOCK_MODE = 'succeed';
    const adapter = new MockAdapter();
    const job = makeJob(adapter, 'read the file', 'ask');
    job.isWriteTask = false;
    await runAttempt(job, adapter, job.taskInput);
    expect(job.state.state).toBe('COMPLETED');
    expect(job.state.result).toBe('SUCCEEDED_READ_ONLY');
  });

  it('run_attempt with rate_limit transitions to AWAITING_APPROVAL', async () => {
    process.env.MOCK_MODE = 'rate_limit';
    const adapter = new MockAdapter();
    const job = makeJob(adapter, 'fix the bug', 'ask');
    await runAttempt(job, adapter, job.taskInput);
    expect(job.state.state).toBe('AWAITING_APPROVAL');
    expect(job.state.error?.category).toBe('RATE_LIMIT');
    expect(job.state.proposedSwitch).toBeTruthy();
  });

  it('resolve_next_candidate returns null when no alternative exists', async () => {
    process.env.MOCK_MODE = 'rate_limit';
    const adapter = new MockAdapter();
    const job = makeJob(adapter, 'fix', 'ask');
    // Mark the only candidate as visited so resolveNextCandidate finds nothing.
    job.visited.add(`${adapter.provider}/${adapter.model}`);
    const next = await resolveNextCandidate(job);
    expect(next).toBeNull();
  });

  it('job is registered in the jobs map', () => {
    const adapter = new MockAdapter();
    const job = makeJob(adapter, 'fix', 'ask');
    expect(jobs.get(job.state.runId)).toBe(job);
  });
});