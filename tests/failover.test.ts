import { describe, it, expect } from 'vitest';
import { checkHandoffAllowlist } from '../src/security/allowlist';
import { MockAdapter } from './mock-adapter';
import { GooseAdapter } from '../src/adapters/goose';
import { defaultAllowList } from '../src/security/allowlist';

describe('failover gate (R2-02, R-07)', () => {
  it('blocks cross-provider handoff by default', () => {
    const mock = new MockAdapter();
    const goose = new GooseAdapter();
    const allow = defaultAllowList([mock]);
    const check = checkHandoffAllowlist(mock, goose, allow);
    expect(check.ok).toBe(false);
    expect(check.reason).toContain('openai');
  });

  it('permits same-provider model switch when model is listed', () => {
    const mock = new MockAdapter();
    const other = { ...mock, model: 'mock-model-2' } as any;
    const allow = { providers: ['openrouter'], models: ['mock-model', 'mock-model-2'] };
    const check = checkHandoffAllowlist(mock, other, allow);
    expect(check.ok).toBe(true);
  });
});