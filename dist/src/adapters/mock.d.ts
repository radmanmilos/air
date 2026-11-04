import type { AgentAdapter } from './adapter';
import type { ErrorCategory, CommandSpec, ParsedEvent, TaskInput } from '../types';
export declare class MockAdapter implements AgentAdapter {
    id: string;
    provider: string;
    model: string;
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
    classifyError(exitCode: number | null, stderr: string, structured?: unknown): ErrorCategory;
}
