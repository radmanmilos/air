import type { AgentAdapter } from '../adapters/adapter';
import type { ErrorCategory, CommandSpec, ParsedEvent, TaskInput } from '../types';
export declare class GooseAdapter implements AgentAdapter {
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
    classifyError(exitCode: number | null, stderr: string, _structured?: unknown): ErrorCategory;
}
export declare function runGoose(task: TaskInput, options?: {
    timeoutMs?: number;
    signal?: AbortSignal;
    maxBufferBytes?: number;
}): Promise<import("..").RunResult>;
