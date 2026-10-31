import { GooseAdapter } from '../src/adapters/goose';
import { AiderAdapter } from '../src/adapters/aider';
import { defaultAllowList, checkHandoffAllowlist, buildHandoff } from '../src/security/allowlist';
import { describe, it, expect } from 'vitest';

describe('provider allow-list (R-07)', () => {
  const goose = new GooseAdapter();
  const aider = new AiderAdapter();

  it('default allow-list covers only the first-attempt provider', () => {
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