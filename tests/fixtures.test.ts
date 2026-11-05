import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, it, expect } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MOCK = join(__dirname, 'fixtures', 'mock-tool.js');

interface MockOpts {
  env?: Record<string, string>;
  timeout?: number;
}

interface MockResult {
  code: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
}

function run(mode: string, opts: MockOpts = {}): Promise<MockResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [MOCK], {
      env: { ...process.env, MOCK_MODE: mode, ...(opts.env || {}) },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (b: Buffer) => (stdout += b.toString()));
    child.stderr.on('data', (b: Buffer) => (stderr += b.toString()));
    const timer = opts.timeout
      ? setTimeout(() => {
          try {
            if (process.platform === 'win32' && child.pid) {
              const { spawn: sp } = require('node:child_process');
              sp('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
            }
          } catch { /* noop */ }
          reject(new Error('timeout'));
        }, opts.timeout)
      : null;
    child.on('error', reject);
    child.on('close', (code: number | null, signal: NodeJS.Signals | null) => {
      if (timer) clearTimeout(timer);
      resolve({ code, signal, stdout, stderr });
    });
  });
}

describe('mock-tool fixture', () => {
  it('succeed mode exits 0 with output', async () => {
    const r = await run('succeed');
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('Mock tool');
  });

  it('rate_limit mode exits non-zero with stderr evidence', async () => {
    const r = await run('rate_limit');
    expect(r.code).not.toBe(0);
    expect(r.stderr).toMatch(/rate limit/i);
  });

  it('auth mode exits non-zero with auth error', async () => {
    const r = await run('auth');
    expect(r.code).not.toBe(0);
    expect(r.stderr).toMatch(/api key/i);
  });

  it('false_positive prints limit words in stdout prose but exits 0', async () => {
    const r = await run('false_positive');
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/rate limiter/);
  });

  it('no_changes exits 0 with no output', async () => {
    const r = await run('no_changes');
    expect(r.code).toBe(0);
    expect(r.stdout).toBe('');
  });

  it('crash exits non-zero', async () => {
    const r = await run('crash');
    expect(r.code).not.toBe(0);
  });

  it('hang is killable via timeout', async () => {
    await expect(run('hang', { timeout: 500 })).rejects.toThrow(/timeout/);
  });

  it('stdout_prose_limit exits 0 and must not be classified as rate_limit', async () => {
    const r = await run('stdout_prose_limit');
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/429/);
  });

  it('chunked stdout is reassembled', async () => {
    const r = await run('succeed', { env: { MOCK_CHUNK_BYTES: '5' } });
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('Mock tool');
  });
});