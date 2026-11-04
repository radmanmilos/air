import type { CommandSpec, ProcessOutcome } from '../types';
export interface RunOptions {
    timeoutMs?: number;
    signal?: AbortSignal;
    maxBufferBytes?: number;
    stdoutTailBytes?: number;
    stderrTailBytes?: number;
    onStdout?: (chunk: string) => void;
    onStderr?: (chunk: string) => void;
}
export interface RunResult {
    outcome: ProcessOutcome;
}
export declare function runProcess(spec: CommandSpec, options?: RunOptions): Promise<RunResult>;
