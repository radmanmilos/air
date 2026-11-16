import { describe, expect, it } from 'vitest';
import { detectPlatform, probeOsSandbox, runOsSandboxed } from '../../src/evals/sandbox/os-sandbox';

describe('os-sandbox primitives', () => {
  it('detects the current platform', () => {
    expect(['linux', 'darwin', 'win32', 'unsupported']).toContain(detectPlatform());
  });

  it('returns a structured capability probe', async () => {
    const cap = await probeOsSandbox();
    expect(cap).toHaveProperty('available');
    expect(cap).toHaveProperty('mechanism');
    expect(cap).toHaveProperty('enforced');
    if (!cap.available) {
      expect(cap.enforced.network).toBe(false);
    }
  });

  it('fails closed without executing when the OS sandbox is unavailable', async () => {
    const cap = await probeOsSandbox();
    if (cap.available) return; // skip assertion on supported platforms
    const result = await runOsSandboxed({ executable: 'echo', args: ['hi'], cwd: process.cwd() });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/unsupported/);
    expect(result.stdout).toBe('');
  });

  it('runs a trivial command under the OS sandbox when available', async () => {
    const cap = await probeOsSandbox();
    if (!cap.available) return;
    const result = await runOsSandboxed({ executable: process.platform === 'win32' ? 'cmd' : 'true', args: [], cwd: process.cwd(), timeoutMs: 10000 });
    // true exits 0; on darwin sandbox-exec wrapping true should succeed
    if (cap.platform === 'linux' || cap.platform === 'darwin') {
      expect(result.ok).toBe(true);
    }
  });
});
