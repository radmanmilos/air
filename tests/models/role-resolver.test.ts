import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, parseConfig } from '../../src/config/schema';
import { resolveModelRole } from '../../src/models/role-resolver';

describe('resolveModelRole', () => {
  it('resolves each logical role without conflating it with an execution adapter', () => {
    const resolved = resolveModelRole(DEFAULT_CONFIG, 'coder');
    expect(resolved).toMatchObject({
      role: 'coder',
      providerId: 'ollama',
      model: 'qwen2.5-coder:7b',
      baseUrl: 'http://127.0.0.1:11434',
      maxConcurrentGenerative: 1,
    });
  });

  it('honors a user-selected model for one role', () => {
    const config = parseConfig({
      version: 2,
      models: {
        roles: {
          coordinator: { provider: 'ollama', model: 'qwen3.5:4b-custom' },
        },
      },
    });
    expect(resolveModelRole(config, 'coordinator').model).toBe('qwen3.5:4b-custom');
    expect(resolveModelRole(config, 'coder').model).toBe('qwen2.5-coder:7b');
  });

  it('does not silently fall back when the configured provider is disabled', () => {
    const config = parseConfig({
      version: 2,
      models: {
        providers: { ollama: { enabled: false } },
      },
    });
    expect(() => resolveModelRole(config, 'coordinator')).toThrow(
      expect.objectContaining({ code: 'PROVIDER_UNAVAILABLE' }),
    );
  });
});
