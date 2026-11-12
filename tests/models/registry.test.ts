import { describe, expect, it } from 'vitest';
import { ModelProviderRegistry } from '../../src/models/provider-registry';
import { ModelRegistry } from '../../src/models/model-registry';
import { ModelProviderError } from '../../src/models/types';
import type { ModelProvider } from '../../src/models/providers/provider';

function provider(id: string): ModelProvider {
  return {
    id,
    chat: async () => {
      throw new Error('not used');
    },
    embed: async () => {
      throw new Error('not used');
    },
    health: async () => ({ provider: id, online: true }),
    listModels: async () => [],
    showModel: async (model) => ({ name: model }),
  };
}

describe('ModelProviderRegistry', () => {
  it('registers providers without replacing existing implementations', () => {
    const registry = new ModelProviderRegistry();
    const ollama = provider('ollama');
    registry.register(ollama);
    expect(registry.get('ollama')).toBe(ollama);
    expect(registry.has('ollama')).toBe(true);
    expect(registry.list()).toEqual([ollama]);
    expect(() => registry.register(provider('ollama'))).toThrow(ModelProviderError);
  });

  it('fails explicitly for an unregistered provider', () => {
    const registry = new ModelProviderRegistry();
    expect(() => registry.get('hosted')).toThrow(/No model provider is registered/);
  });
});

describe('ModelRegistry', () => {
  it('tracks discovered models and only reports runtime-declared capabilities', () => {
    const registry = new ModelRegistry();
    registry.syncProvider('ollama', [
      { name: 'qwen3.5:4b', digest: 'abc', capabilities: ['chat', 'tool_calling'] },
      { name: 'nomic-embed-text:latest' },
    ], '2026-11-12T00:00:00.000Z');

    expect(registry.get('ollama', 'qwen3.5:4b')).toMatchObject({ availability: 'available', digest: 'abc' });
    expect(registry.supports('ollama', 'qwen3.5:4b', 'tool_calling')).toBe(true);
    expect(registry.supports('ollama', 'nomic-embed-text:latest', 'embeddings')).toBeUndefined();
  });

  it('marks removed models missing and provider-offline capabilities unknown', () => {
    const registry = new ModelRegistry();
    registry.syncProvider('ollama', [{ name: 'qwen3.5:4b', capabilities: ['chat'] }], '2026-11-12T00:00:00.000Z');
    registry.syncProvider('ollama', [], '2026-11-12T00:01:00.000Z');
    expect(registry.get('ollama', 'qwen3.5:4b')?.availability).toBe('missing');
    expect(registry.supports('ollama', 'qwen3.5:4b', 'chat')).toBe(false);

    registry.syncProvider('ollama', [{ name: 'qwen3.5:4b', capabilities: ['chat'] }]);
    registry.markProviderUnavailable('ollama');
    expect(registry.get('ollama', 'qwen3.5:4b')?.availability).toBe('unknown');
    expect(registry.supports('ollama', 'qwen3.5:4b', 'chat')).toBeUndefined();
  });
});
