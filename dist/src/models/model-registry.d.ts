import type { ModelCapability, ModelDescriptor } from './types';
type ModelAvailability = 'available' | 'missing' | 'unknown';
export interface ModelRegistryEntry extends ModelDescriptor {
    providerId: string;
    availability: ModelAvailability;
    checkedAt: string;
}
/**
 * In-memory snapshot of models discovered from providers. Capability data is
 * optional and is never inferred from model names or download size.
 */
export declare class ModelRegistry {
    private readonly entries;
    syncProvider(providerId: string, models: ModelDescriptor[], checkedAt?: string): void;
    markProviderUnavailable(providerId: string, checkedAt?: string): void;
    get(providerId: string, model: string): ModelRegistryEntry | undefined;
    list(providerId?: string): ModelRegistryEntry[];
    supports(providerId: string, model: string, capability: ModelCapability): boolean | undefined;
    private key;
}
export {};
