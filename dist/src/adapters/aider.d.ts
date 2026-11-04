import type { AgentAdapter } from '../adapters/adapter';
import type { ErrorCategory, CommandSpec, ParsedEvent, TaskInput } from '../types';
export declare class AiderAdapter implements AgentAdapter {
    id: string;
    provider: string;
    model: string;
    executable: string;
    capabilities: {
        headlessExecution: boolean;
        structuredOutput: boolean;
        fileEditing: boolean;
        shellAccess: boolean;
        imageInput: boolean;
        supportsCancellation: boolean;
        supportsStreaming: boolean;
        contextWindow: number;
    };
    canHandle(_task: TaskInput): boolean;
    buildCommand(task: TaskInput): CommandSpec;
    parseOutput(chunk: Buffer | string): ParsedEvent[];
    /**
     * Classify a failure from exit code + stderr evidence.
     *
     * Aider exits 0 even when it made no changes — exit 0 is never proof of
     * success, but it is also never a failure category. This method is only
     * meaningful on non-zero / signal / timeout paths.
     */
    classifyError(exitCode: number | null, stderr: string, structured?: unknown): ErrorCategory;
}
/** Run the aider adapter through the shared process runner. */
export declare function runAider(task: TaskInput, options?: {
    timeoutMs?: number;
    signal?: AbortSignal;
    maxBufferBytes?: number;
}): Promise<import("..").RunResult>;
