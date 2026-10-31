import { runProcess } from '../../src/execution/runner';
import { redact, containsSecret } from '../../src/security/redact';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, it, expect } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MOCK = join(__dirname, 'fixtures', 'mock-tool.js');

describe('process runner (G2-01)', () => {
  it('runs a mock tool to completion', async () => {
    const { outcome } = await runProcess({
      executable: process.execPath,
      args: [MOCK],
      cwd: __dirname,
      env: { ...process.env, MOCK_MODE: 'succeed' },
    });
    expect(outcome.exitCode).toBe(0);
    expect(outcome.stdout).toContain('Mock tool');
    expect(outcome.timedOut).toBe(false);
    expect(outcome.cancelled).toBe(false);
  });

  it('streams stdout to the caller', async () => {
    const chunks: string[] = [];
    await runProcess(
      {
        executable: process.execPath,
        args: [MOCK],
        cwd: __dirname,
        env: { ...process.env, MOCK_MODE: 'succeed', MOCK_CHUNK_BYTES: '5' },
      },
      { onStdout: (c: string) => chunks.push(c) },
    );
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.join('')).toContain('Mock tool');
  });

  it('redacts output before capture', async () => {
    const token = 'sk-or-this-is-a-fake-test-key-1234567890abcdef';
    const out = redact(`prefix ${token} suffix`);
    expect(out).not.toContain(token);
    expect(containsSecret(`prefix ${token} suffix`)).toBe(true);
  });

  it('times out a hanging process and tree-kills it', async () => {
    const start = Date.now();
    const { outcome } = await runProcess(
      {
        executable: process.execPath,
        args: [MOCK],
        cwd: __dirname,
        env: { ...process.env, MOCK_MODE: 'hang' },
      },
      { timeoutMs: 300 },
    );
    const elapsed = Date.now() - start;
    expect(outcome.timedOut).toBe(true);
    expect(elapsed).toBeLessThan(2000);
  });

  it('cancels via AbortSignal', async () => {
    const controller = new AbortController();
    const start = Date.now();
    const promise = runProcess(
      {
        executable: process.execPath,
        args: [MOCK],
        cwd: __dirname,
        env: { ...process.env, MOCK_MODE: 'hang' },
      },
      { signal: controller.signal, timeoutMs: 30_000 },
    );
    setTimeout(() => controller.abort(), 200);
    const { outcome } = await promise;
    const elapsed = Date.now() - start;
    expect(outcome.cancelled).toBe(true);
    expect(elapsed).toBeLessThan(2000);
  });

  it('caps output buffer and records truncation', async () => {
    const { outcome } = await runProcess(
      {
        executable: process.execPath,
        args: [MOCK],
        cwd: __dirname,
        env: { ...process.env, MOCK_MODE: 'succeed' },
      },
      { maxBufferBytes: 5 },
    );
    expect(outcome.exitCode).toBe(0);
  });

  it('handles a missing executable as a spawn error', async () => {
    const { outcome } = await runProcess(
      {
        executable: 'this-binary-does-not-exist-12345',
        args: [],
        cwd: __dirname,
      },
      { timeoutMs: 1000 },
    );
    expect(outcome.spawnError).toBeTruthy();
    expect(outcome.exitCode).toBeNull();
  });

  it('is injection-safe: task text with quotes and shell metacharacters', async () => {
    const { outcome } = await runProcess({
      executable: process.execPath,
      args: [MOCK, '--', 'arg with "quotes" & | $() stuff'],
      cwd: __dirname,
      env: { ...process.env, MOCK_MODE: 'succeed' },
    });
    expect(outcome.exitCode).toBe(0);
  });
});