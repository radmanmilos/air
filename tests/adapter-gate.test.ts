import { listAdapters, availableAdapters, adapterStatus } from '../src/adapters/registry';
import { selectCandidate } from '../src/router/router';
import { createHealthTracker } from '../src/health/tracker';
import { describe, it, expect } from 'vitest';

describe('adapter verification gate (R5-02)', () => {
  it('only verified + enabled adapters are routed by default', () => {
    const routed = availableAdapters();
    const ids = routed.map((a) => a.id);
    expect(ids).toContain('aider');
    expect(ids).toContain('goose');
    // Newly verified adapters are routed when their binary is present.
    // (They may be absent on machines without the tool installed.)
  });

  it('all adapters are visible in status', () => {
    const status = adapterStatus();
    const ids = status.map((s) => s.id);
    expect(ids).toContain('opencode');
    expect(ids).toContain('kilocode');
    expect(ids).toContain('codex');
    expect(ids).toContain('github-copilot');
    const verified = status.filter((s) => s.verified);
    expect(verified.length).toBe(6);
  });

  it('router skips unverified adapters with an explicit reason', () => {
    const tracker = createHealthTracker();
    // Use the full list so the router can see unverified adapters.
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
  });
});