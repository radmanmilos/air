import type { ModelProvider } from './providers/provider';
/**
 * Registry for model API providers. Kept separate from the execution-adapter
 * registry: model providers do not launch coding agents or shell processes.
 */
export declare class ModelProviderRegistry {
    private readonly providers;
    register(provider: ModelProvider): void;
    get(providerId: string): ModelProvider;
    has(providerId: string): boolean;
    list(): ModelProvider[];
}
