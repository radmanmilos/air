import type { ModelProvider } from './providers/provider';
import { ModelProviderError } from './types';

/**
 * Registry for model API providers. Kept separate from the execution-adapter
 * registry: model providers do not launch coding agents or shell processes.
 */
export class ModelProviderRegistry {
  private readonly providers = new Map<string, ModelProvider>();

  register(provider: ModelProvider): void {
    if (!provider.id.trim()) {
      throw new ModelProviderError('PROVIDER_ERROR', 'Model provider id must not be empty', 'registry');
    }
    if (this.providers.has(provider.id)) {
      throw new ModelProviderError(
        'PROVIDER_ERROR',
        'Model provider is already registered: ' + provider.id,
        provider.id,
      );
    }
    this.providers.set(provider.id, provider);
  }

  get(providerId: string): ModelProvider {
    const provider = this.providers.get(providerId);
    if (!provider) {
      throw new ModelProviderError(
        'PROVIDER_UNAVAILABLE',
        'No model provider is registered with id: ' + providerId,
        providerId,
      );
    }
    return provider;
  }

  has(providerId: string): boolean {
    return this.providers.has(providerId);
  }

  list(): ModelProvider[] {
    return [...this.providers.values()];
  }
}
