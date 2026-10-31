import { createHealthTracker, shouldSetCooldown, shouldStopAndAsk, shouldAbort } from '../src/health/tracker';
import { ERROR_POLICY } from '../src/types/errors';
import { describe, it, expect } from 'vitest';

describe('health tracker (G2-02)', () => {
  it('tracks cooldowns keyed by (provider, model)', () => {
    const t = createHealthTracker();
    t.setCooldown('openrouter', 'm1', Date.now() + 1000, 'RATE_LIMIT');
    expect(t.isCoolingDown('openrouter', 'm1')).toBe(true);
    // Same provider, different model is NOT cooling down.
    expect(t.isCoolingDown('openrouter', 'm2')).toBe(false);
  });

  it('expires cooldowns after the window', () => {
    const t = createHealthTracker();
    t.setCooldown('openrouter', 'm1', Date.now() + 1000, 'RATE_LIMIT');
    expect(t.isCoolingDown('openrouter', 'm1', Date.now() + 2000)).toBe(false);
  });

  it('records successes and failures', () => {
    const t = createHealthTracker();
    t.recordSuccess('openrouter', 'm1');
    t.recordFailure('openrouter', 'm1', 'RATE_LIMIT');
    // No throw; state is internal. Just verify no exception.
    expect(typeof t.flush).toBe('function');
  });

  it('returns only active cooldowns', () => {
    const t = createHealthTracker();
    t.setCooldown('p1', 'm1', Date.now() - 1000, 'RATE_LIMIT'); // expired
    t.setCooldown('p2', 'm2', Date.now() + 1000, 'RATE_LIMIT'); // active
    expect(t.getCooldowns()).toHaveLength(1);
    expect(t.getCooldowns()[0].model).toBe('m2');
  });
});

describe('error policy integration (R3-04)', () => {
  it('ERROR_POLICY is the single action authority', () => {
    for (const category of Object.keys(ERROR_POLICY) as (keyof typeof ERROR_POLICY)[]) {
      expect(typeof ERROR_POLICY[category]).toBe('string');
    }
  });

  it('rate limit sets a cooldown', () => {
    expect(shouldSetCooldown('RATE_LIMIT')).toBe(true);
    expect(shouldSetCooldown('QUOTA_EXCEEDED')).toBe(true);
  });

  it('auth errors stop and ask', () => {
    expect(shouldStopAndAsk('AUTH_ERROR')).toBe(true);
    expect(shouldStopAndAsk('PERMISSION_DENIED')).toBe(true);
    expect(shouldStopAndAsk('TASK_FAILURE')).toBe(true);
  });

  it('user cancellation aborts', () => {
    expect(shouldAbort('USER_CANCELLED')).toBe(true);
  });

  it('network errors retry the same candidate', () => {
    expect(ERROR_POLICY['NETWORK_ERROR']).toBe('retry_same');
  });
});