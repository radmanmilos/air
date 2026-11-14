import { ModelProviderError } from './types.js';
/**
 * Registry for model API providers. Kept separate from the execution-adapter
 * registry: model providers do not launch coding agents or shell processes.
 */
export class ModelProviderRegistry {
    providers = new Map();
    register(provider) {
        if (!provider.id.trim()) {
            throw new ModelProviderError('PROVIDER_ERROR', 'Model provider id must not be empty', 'registry');
        }
        if (this.providers.has(provider.id)) {
            throw new ModelProviderError('PROVIDER_ERROR', 'Model provider is already registered: ' + provider.id, provider.id);
        }
        this.providers.set(provider.id, provider);
    }
    get(providerId) {
        const provider = this.providers.get(providerId);
        if (!provider) {
            throw new ModelProviderError('PROVIDER_UNAVAILABLE', 'No model provider is registered with id: ' + providerId, providerId);
        }
        return provider;
    }
    has(providerId) {
        return this.providers.has(providerId);
    }
    list() {
        return [...this.providers.values()];
    }
}
