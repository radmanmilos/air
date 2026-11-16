import type { ModelChatRequest, ModelMessage, ModelToolCall, ModelToolDefinition } from '../models/types';
import type { ModelProvider } from '../models/providers/provider';
import type { EvalToolProposalValidation } from './sandbox/capabilities';
declare const EVAL_SUITES: readonly ["coordinator", "planner", "tool-calling", "coder", "debugging", "reviewer", "summarizer", "embeddings"];
export type EvalSuite = (typeof EVAL_SUITES)[number];
export interface EvalRunnerOptions {
    suite: EvalSuite;
    model: string;
    baseUrl: string;
    output?: string;
    repetitions: number;
    warmups: number;
    context: number;
    promptVersion: string;
    timeoutMs: number;
    /** Opt-in attempt to execute safety/acceptance oracles in a sandbox. Default false (proposal-only). */
    executeSafetyOracles?: boolean;
}
interface EvalWorkspaceLike {
    path: string;
    cleanup(): Promise<void>;
}
export interface EvalRunnerDependencies {
    provider?: ModelProvider;
    createWorkspace?: (fixtureName: string) => Promise<EvalWorkspaceLike>;
    /** Optional override for tests/integration; defaults to platform capability detection. */
    detectSandboxCapabilities?: (options: {
        executeSafetyOracles?: boolean;
    }) => import('./sandbox/capabilities').EvalSandboxCapabilities;
}
export interface EvalFixtureCase extends Record<string, unknown> {
    id: string;
}
interface EvalDocument {
    id: string;
    title: string;
    text: string;
    status?: string;
}
interface EvalCatalog {
    cases?: EvalFixtureCase[];
    corpus?: EvalDocument[];
    queries?: EvalFixtureCase[];
}
interface RankedDocument {
    id: string;
    score: number;
}
type ToolProposalDiagnosticCode = 'missing_tool_call' | 'malformed_tool_call' | 'unknown_tool' | 'invalid_tool_call_type' | 'arguments_not_object' | 'missing_required' | 'unexpected_property' | 'type_mismatch' | 'invalid_enum' | 'unsupported_schema' | 'invalid_schema';
interface ToolProposalDiagnostic {
    code: ToolProposalDiagnosticCode | string;
    path: string;
    tool?: string;
    expected?: string;
    actual?: string;
    message: string;
}
export interface EvalCliHelp {
    help: true;
}
export declare function evalHelp(): string;
export declare function parseEvalArgs(args: string[]): EvalRunnerOptions | EvalCliHelp;
/** Redact secret-like strings in persisted/diagnostic records without removing evaluation evidence fields. */
declare function redactSecretsForRecord(value: unknown, depth?: number): unknown;
export declare function suiteContract(suite: Exclude<EvalSuite, 'embeddings'>): {
    format?: 'json' | Record<string, unknown>;
    tools?: ModelToolDefinition[];
    schemaName?: string;
    schemaHash?: string;
    toolSetHash?: string;
};
export { redactSecretsForRecord as sanitizeEvalRecordValue };
export declare function buildEvalMessages(suite: Exclude<EvalSuite, 'embeddings'>, fixture: EvalFixtureCase, workspaceFiles?: Record<string, string>): ModelMessage[];
export declare function buildEvalChatRequest(suite: Exclude<EvalSuite, 'embeddings'>, model: string, messages: ModelMessage[], context: number, timeoutMs: number): ModelChatRequest;
export declare function cosineSimilarity(left: number[], right: number[]): number;
export declare function rankTopDocuments(queryVector: number[], documents: EvalDocument[], documentVectors: number[][], limit?: number): RankedDocument[];
export declare function validateToolCallProposal(toolCall: ModelToolCall | undefined | unknown, allowed?: ModelToolDefinition[]): EvalToolProposalValidation & {
    diagnostics: ToolProposalDiagnostic[];
};
export declare function runGenerationSuite(options: EvalRunnerOptions, catalog: EvalCatalog, provider: ModelProvider, outputPath: string, dependencies: EvalRunnerDependencies): Promise<number>;
export declare function runEvaluation(options: EvalRunnerOptions, dependencies?: EvalRunnerDependencies): Promise<{
    outputPath: string;
    measuredCases: number;
    modelDigest: string | null;
}>;
