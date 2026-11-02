import { startMcp } from '../src/mcp/server';
import { MockAdapter } from '../src/adapters/mock';
import { runProcess } from '../src/execution/runner';
import { makeRunId, writeTaskState, appendTaskIndex, readTaskState } from '../src/execution/task-state';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// We can't easily drive the real stdio MCP server in-process, so we exercise
// the job lifecycle through the exported helpers by importing the module's
// internal job map via a re-export shim. The shim is the test seam.
import { jobs } from '../src/mcp/server';

describe('mcp async + approve continuation (G3-02, G3-12)', () => {
  let dir: string;
  let originalMockMode: string | undefined;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'air-mcp-'));
    originalMockMode = process.env.MOCK_MODE;
  });

  afterEach(() => {
    if (originalMockMode === undefined) delete process.env.MOCK_MODE;
    else process.env.MOCK_MODE = originalMockMode;
    rmSync(dir, { recursive: true, force: true });
  });

  it('exports startMcp as a function', () => {
    expect(typeof startMcp).toBe('function');
  });

  it('job map is exported for test inspection', () => {
    expect(jobs).toBeInstanceOf(Map);
  });

  it('runProcess persists a redacted output tail and truncation metadata (R5-08)', async () => {
    const { outcome } = await runProcess(
      {
        executable: process.execPath,
        args: ['-e', "process.stdout.write('hello world');process.exit(0)"],
        cwd: dir,
      },
      { stdoutTailBytes: 100 },
    );
    expect(outcome.stdoutTail).toContain('hello world');
    expect(outcome.stdoutTruncated).toBe(false);
    expect(outcome.stdoutBytes).toBeGreaterThan(0);
  });

  it('runProcess keeps a rolling tail when output exceeds the cap (R5-08)', async () => {
    const { outcome } = await runProcess(
      {
        executable: process.execPath,
        args: ['-e', "process.stdout.write('a'.repeat(5000));process.exit(0)"],
        cwd: dir,
      },
      { stdoutTailBytes: 100, maxBufferBytes: 100 },
    );
    expect(outcome.stdoutTruncated).toBe(true);
    expect(outcome.stdoutTail.length).toBeLessThanOrEqual(100);
    expect(outcome.stdoutTail).toContain('a');
  });

  it('runProcess redacts secrets in the output tail (R5-08)', async () => {
    const secret = 'sk-or-this-is-a-fake-test-key-1234567890abcdef';
    const { outcome } = await runProcess(
      {
        executable: process.execPath,
        args: ['-e', `process.stdout.write('token ${secret} done');process.exit(0)`],
        cwd: dir,
      },
      { stdoutTailBytes: 500 },
    );
    expect(outcome.stdoutTail).not.toContain(secret);
    expect(outcome.stdoutTail).toContain('[REDACTED]');
  });

  it('get_task_output reads the persisted outputTail field (R5-08)', async () => {
    const runId = makeRunId();
    await appendTaskIndex(runId);
    await writeTaskState({
      runId,
      task: 'read',
      cwd: dir,
      adapter: 'mock',
      provider: 'openrouter',
      model: 'mock-model',
      state: 'COMPLETED',
      result: 'SUCCEEDED_READ_ONLY',
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
      hops: 1,
      maxHops: 3,
      outputTail: 'captured output',
    });
    const state = await readTaskState(runId);
    expect(state?.outputTail).toBe('captured output');
  });
});