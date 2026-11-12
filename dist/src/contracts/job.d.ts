export declare const CONTRACT_VERSION: 1;
/** Exit codes the worker process returns. These are contract, not CLI, codes. */
export declare const WORKER_EXIT_CODES: {
    readonly COMPLETED: 0;
    readonly INVALID_REQUEST: 2;
    readonly WORKER_FAILED: 3;
    readonly CANCELLED: 4;
    readonly PROVIDER_UNAVAILABLE: 5;
};
export type WorkerExitName = keyof typeof WORKER_EXIT_CODES;
export type WorkerExitCode = (typeof WORKER_EXIT_CODES)[WorkerExitName];
export type JobErrorCategory = 'INVALID_REQUEST' | 'PROVIDER_UNAVAILABLE' | 'WORKER_FAILED' | 'CANCELLED' | 'INTERNAL';
export type JobState = 'COMPLETED' | 'FAILED' | 'CANCELLED';
export interface JobRequest {
    contractVersion: typeof CONTRACT_VERSION;
    runId: string;
    task: string;
    cwd: string;
    readOnly?: boolean;
    allowShell?: boolean;
    allowNetwork?: boolean;
    model?: string;
    maxSteps?: number;
    configPath?: string;
}
export interface JobToolCall {
    name: string;
    ok: boolean;
}
export interface JobResult {
    contractVersion: typeof CONTRACT_VERSION;
    runId: string;
    state: JobState;
    answer?: string;
    error?: {
        category: JobErrorCategory;
        message: string;
    };
    startedAt?: string;
    endedAt?: string;
    steps?: number;
    toolCalls?: JobToolCall[];
    changedFiles?: string[];
}
/** Map a worker outcome to its process exit code. */
export declare function workerExitCode(name: WorkerExitName): WorkerExitCode;
type JsonSchema = Record<string, unknown>;
/**
 * Locate the canonical contract file.
 *
 * `AIR_CONTRACT_PATH` wins; otherwise walk up from this module until
 * `contracts/job.schema.json` is found. That works from source
 * (`src/contracts`), from the build (`dist/src/contracts`), and from the npm
 * layout (`node_modules/air/dist/src/contracts`).
 */
export declare function schemaPath(): string;
export declare function loadSchema(path?: string): JsonSchema;
/** Validate against `#/$defs/<definition>`. Returns error strings. */
export declare function validate(value: unknown, definition: string, schema?: JsonSchema): string[];
export declare function validateRequest(value: unknown, schema?: JsonSchema): string[];
export declare function validateResult(value: unknown, schema?: JsonSchema): string[];
/** Schema keywords this validator does not implement. Must stay empty. */
export declare function unsupportedKeywords(schema?: JsonSchema): string[];
export {};
