import { createHealthTracker } from '../src/health/tracker';
import { selectCandidate, selectCandidateFrom, isBlockedByAllowlist, formatRouteDecision } from '../src/router/router';
import { MockAdapter } from './mock-adapter';
import { describe, it, expect } from 'vitest';

describe('router (G2-05)', () => {
  const adapter = new MockAdapter();

  it('picks the first eligible candidate', () => {
    const tracker = createHealthTracker();
    const decision = selectCandidate(
      { id: 't1', prompt: 'do thing', cwd: '/tmp', mode: 'ask' },
      [adapter],
      tracker,
    );
    expect(decision.chosen).toBeTruthy();
    expect(decision.chosen?.id).toBe('mock');
    expect(decision.skips).toEqual([]);
  });

  it('skips candidates on cooldown with exact reason', () => {
    const tracker = createHealthTracker();
    tracker.setCooldown('openrouter', 'mock-model', Date.now() + 60_000, 'RATE_LIMIT');
    const decision = selectCandidate(
      { id: 't1', prompt: 'do thing', cwd: '/tmp', mode: 'ask' },
      [adapter],
      tracker,
    );
    expect(decision.chosen).toBeNull();
    expect(decision.skips).toHaveLength(1);
    expect(decision.skips[0].reason).toBe('cooldown_active');
    expect(decision.skips[0].detail).toContain('until');
  });

  it('formats a decision for --explain', () => {
    const tracker = createHealthTracker();
    const decision = selectCandidate(
      { id: 't1', prompt: 'do thing', cwd: '/tmp', mode: 'ask' },
      [adapter],
      tracker,
    );
    const text = formatRouteDecision(decision);
    expect(text).toContain('Chosen: mock');
    expect(text).toContain('Considered 1');
  });

  it('records cannot_handle when adapter rejects', () => {
    const tracker = createHealthTracker();
    const alwaysFalse = { ...adapter, canHandle: () => false } as any;
    const decision = selectCandidate(
      { id: 't1', prompt: 'do thing', cwd: '/tmp', mode: 'ask' },
      [alwaysFalse],
      tracker,
    );
    expect(decision.chosen).toBeNull();
    expect(decision.skips[0].reason).toBe('cannot_handle');
  });

  it('selectCandidateFrom skips visited candidates (R5-05)', () => {
    const tracker = createHealthTracker();
    const visited = new Set(['mock|openrouter|mock-model']);
    const decision = selectCandidateFrom(
      { id: 't1', prompt: 'do thing', cwd: '/tmp', mode: 'ask' },
      [adapter],
      tracker,
      visited,
      null,
    );
    expect(decision.chosen).toBeNull();
    expect(decision.skips[0].reason).toBe('already_visited');
  });

  it('selectCandidateFrom skips allow-list blocked candidates (R5-04)', () => {
    const tracker = createHealthTracker();
    const allow = { providers: ['other'], models: ['other-model'] };
    const decision = selectCandidateFrom(
      { id: 't1', prompt: 'do thing', cwd: '/tmp', mode: 'ask' },
      [adapter],
      tracker,
      new Set(),
      allow,
    );
    expect(decision.chosen).toBeNull();
    expect(decision.skips[0].reason).toBe('allow_list_blocked');
  });

  it('isBlockedByAllowlist returns null when allowed', () => {
    expect(isBlockedByAllowlist(adapter, { providers: ['openrouter'], models: ['mock-model'] })).toBeNull();
  });

  it('isBlockedByAllowlist blocks a different provider', () => {
    expect(isBlockedByAllowlist(adapter, { providers: ['other'], models: ['mock-model'] })).toContain('openrouter');
  });
});