import { GooseAdapter } from '../src/adapters/goose';
import { AiderAdapter } from '../src/adapters/aider';
import { defaultAllowList, checkHandoffAllowlist, buildHandoff } from '../src/security/allowlist';
import { describe, it, expect } from 'vitest';

describe('provider allow-list (R-07, R5-04)', () => {
  const goose = new GooseAdapter();
  const aider = new AiderAdapter();

  it('default allow-list covers only the first-attempt provider', () => {
    const allow = defaultAllowList([goose, aider]);
    expect(allow.providers).toEqual(['openai']);
    expect(allow.models).toEqual(['gpt-4o']);
  });

  it('defaultAllowList derives the policy from the actual chosen candidate, not adapters[0] (R5-04)', () => {
    // When the first adapter is cooling down and the second is selected,
    // the allow-list must describe the candidate actually chosen.
    const allow = defaultAllowList([goose, aider], { provider: 'openrouter', model: 'claude-3' });
    expect(allow.providers).toEqual(['openrouter']);
    expect(allow.models).toEqual(['claude-3']);
  });

  it('defaultAllowList falls back to adapters[0] when no candidate is given', () => {
    const allow = defaultAllowList([goose, aider]);
    expect(allow.providers).toEqual(['openai']);
    expect(allow.models).toEqual(['gpt-4o']);
  });

  it('same-provider model switch is allowed when model is listed', () => {
    const otherGoose = { ...goose, model: 'gpt-4o-mini' } as any;
    const check = checkHandoffAllowlist(goose, otherGoose, { providers: ['openai'], models: ['gpt-4o-mini'] });
    expect(check.ok).toBe(true);
  });

  it('cross-provider switch is blocked by default', () => {
    const allow = defaultAllowList([goose, aider]);
    const check = checkHandoffAllowlist(goose, aider, allow);
    expect(check.ok).toBe(false);
    expect(check.reason).toContain('openrouter');
  });

  it('builds a handoff document', () => {
    const handoff = buildHandoff(
      { id: 'r1', prompt: 'fix', cwd: '/tmp', mode: 'ask' },
      goose,
      aider,
    );
    expect(handoff).toContain('# air handoff');
    expect(handoff).toContain('fix');
    expect(handoff).toContain('goose');
    expect(handoff).toContain('aider');
  });
});