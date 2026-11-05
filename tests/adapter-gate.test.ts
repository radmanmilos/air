import { execSync } from 'node:child_process';
import { listAdapters, availableAdapters, adapterStatus } from '../src/adapters/registry';
import { selectCandidate } from '../src/router/router';
import { createHealthTracker } from '../src/health/tracker';
import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockExecSync = vi.mocked(execSync);

vi.mock('node:child_process', () => ({
  ...vi.importActual('node:child_process'),
  execSync: vi.fn(),
}));

describe('adapter verification gate (R5-02)', () => {
  beforeEach(() => {
    // Simulate all adapters installed on PATH.
    mockExecSync.mockImplementation((cmd: string) => {
      const c = String(cmd);
      return Buffer.from(`/usr/bin/${c.split(' ')[0]}\n`);
    });
  });
  it('only verified + enabled adapters are routed by default', () => {
    const routed = availableAdapters();
    const ids = routed.map((a) => a.id);
    expect(ids).toContain('aider');
    expect(ids).toContain('goose');
    // opencode, kilocode, ollama are now verified and routed by default.
    // codex and github-copilot remain unverified (paid keys required).
    expect(ids).not.toContain('codex');
    expect(ids).not.toContain('github-copilot');
  });

  it('all adapters are visible in status', () => {
    const status = adapterStatus();
    const ids = status.map((s) => s.id);
    expect(ids).toContain('opencode');
    expect(ids).toContain('kilocode');
    expect(ids).toContain('codex');
    expect(ids).toContain('github-copilot');
    const verified = status.filter((s) => s.verified);
    // aider, goose, opencode, kilocode, ollama are verified.
    expect(verified.length).toBe(5);
    expect(verified.map((s) => s.id)).toContain('aider');
    expect(verified.map((s) => s.id)).toContain('goose');
    expect(verified.map((s) => s.id)).toContain('opencode');
    expect(verified.map((s) => s.id)).toContain('kilocode');
    expect(verified.map((s) => s.id)).toContain('ollama');
  });

  it('availableAdapters includes all verified adapters when installed', () => {
    const routed = availableAdapters();
    const ids = routed.map((a) => a.id);
    expect(ids).toContain('aider');
    expect(ids).toContain('goose');
    expect(ids).toContain('opencode');
    expect(ids).toContain('kilocode');
    expect(ids).toContain('ollama');
    expect(ids).not.toContain('codex');
    expect(ids).not.toContain('github-copilot');
  });

  it('router routes verified adapters with an explicit skip reason', () => {
    const tracker = createHealthTracker();
    // Use the full list so the router can see all adapters.
    const all = listAdapters().map((a) => a.adapter);
    const decision = selectCandidate(
      { id: 't1', prompt: 'fix', cwd: '/tmp', mode: 'ask' },
      all,
      tracker,
    );
    // The chosen one must be verified.
    if (decision.chosen) {
      const routed = availableAdapters();
      expect(routed.some((a) => a.id === decision.chosen!.id)).toBe(true);
    }
    // Every skip reason is exact, never a generic "not available".
    for (const s of decision.skips) {
      expect(['cooldown_active', 'capability_mismatch', 'cannot_handle', 'tool_not_registered']).toContain(s.reason);
    }
  });

  it('PATH presence enables verified adapters', () => {
    const status = adapterStatus();
    const opencode = status.find((s) => s.id === 'opencode')!;
    expect(opencode.verified).toBe(true);
    const aider = status.find((s) => s.id === 'aider')!;
    expect(aider.verified).toBe(true);
  });
});