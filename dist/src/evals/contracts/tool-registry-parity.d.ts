import type { ModelToolDefinition } from '../../models/types';
export interface NormalizedToolContract {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
}
export interface ToolParityDifference {
    tool: string;
    path: string;
    expected: unknown;
    actual: unknown;
}
export declare function normalizeEvalToolDefinitions(definitions: readonly ModelToolDefinition[]): NormalizedToolContract[];
export declare function compareNormalizedRegistries(expected: readonly NormalizedToolContract[], actual: readonly NormalizedToolContract[]): ToolParityDifference[];
export declare function formatParityDifferences(diffs: readonly ToolParityDifference[], limit?: number): string;
