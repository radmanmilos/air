import type { AgentAdapter } from './adapter';
import type { CommandSpec, ParsedEvent, TaskInput } from '../types';
import type { ErrorCategory } from '../types/errors';
export interface LocalAdapterOptions {
    /** Model override; falls back to `AIR_LOCAL_MODEL`, then the worker default. */
    model?: string;
    /** Cache root for request/result files. Defaults to `paths.cacheDir`. */
    cacheDir?: string;
    /**
     * Explicit worker command. Tests use this to point at a fake shim; production
     * leaves it undefined so the provisioned worker is resolved lazily.
     */
    command?: {
        executable: string;
        args: string[];
    } | null;
}
export declare class LocalAdapter implements AgentAdapter {
    id: string;
    provider: string;
    model: string;
    executable?: string;
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
    private readonly cacheDir;
    private readonly explicitModel?;
    private readonly commandOverride?;
    constructor(options?: LocalAdapterOptions);
    private worker;
    canHandle(_task: TaskInput): boolean;
    buildCommand(task: TaskInput): CommandSpec;
    parseOutput(chunk: Buffer | string): ParsedEvent[];
    classifyError(exitCode: number | null, stderr: string, structured?: unknown): ErrorCategory;
}
