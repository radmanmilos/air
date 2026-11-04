import type { AgentAdapter } from './adapter';
import type { CommandSpec, TaskInput } from '../types';
import type { ErrorCategory } from '../types/errors';
export declare class OllamaAdapter implements AgentAdapter {
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
    constructor(model?: string);
    canHandle(_task: TaskInput): Promise<boolean>;
    buildCommand(task: TaskInput): CommandSpec;
    parseOutput(chunk: Buffer | string): any[];
    classifyError(exitCode: number | null, stderr: string): ErrorCategory;
}
