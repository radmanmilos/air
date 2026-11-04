import type { AgentAdapter } from '../adapters/adapter';
export interface ModelEntry {
    id: string;
    provider: string;
    model: string;
    available: boolean;
    reason?: string;
    capabilities: {
        code: boolean;
        reasoning: boolean;
        write: boolean;
        read: boolean;
        headless: boolean;
    };
    /** Cost tier: 0 = free, 1 = cheap, 2 = standard, 3 = premium. */
    costTier: 0 | 1 | 2 | 3;
    /** Context window in tokens (when known). */
    contextWindow?: number;
}
/** Build the model catalog from the registered adapters. */
export declare function buildModelCatalog(adapters: AgentAdapter[], opts?: {
    availableMap?: Map<string, {
        available: boolean;
        reason?: string;
    }>;
    costOverrides?: Record<string, number>;
}): ModelEntry[];
/** Filter the catalog to models that can handle a task. */
export declare function bestModelFor(catalog: ModelEntry[], task: {
    mode: 'ask' | 'auto';
    readOnly: boolean;
}): ModelEntry | null;
/** Format the catalog for human output. */
export declare function formatModelCatalog(catalog: ModelEntry[]): string;
/** Format the best-model recommendation for a task. */
export declare function formatBestModel(catalog: ModelEntry[], task: {
    mode: 'ask' | 'auto';
    readOnly: boolean;
}): string;
