export interface CapturedOutput {
    content: string;
    bytes: number;
    truncated: boolean;
    fullTruncated: boolean;
}
export interface ProcessOutcome {
    exitCode: number | null;
    signal: NodeJS.Signals | null;
    spawnError?: {
        code?: string;
        message: string;
    };
    timedOut: boolean;
    cancelled: boolean;
    stdout: string;
    stderr: string;
    stdoutBytes: number;
    stderrBytes: number;
    stdoutTruncated: boolean;
    stderrTruncated: boolean;
    stdoutTail: string;
    stderrTail: string;
    startedAt: string;
    endedAt: string;
    durationMs: number;
}
export declare function classifyOutcome(outcome: ProcessOutcome): {
    category: 'TIMEOUT' | 'USER_CANCELLED' | 'PROCESS_CRASH' | 'TOOL_NOT_INSTALLED' | null;
};
/** Count UTF-8 bytes of a string. */
export declare function utf8Bytes(s: string): number;
/** Append a chunk to a rolling tail buffer, keeping only the last `cap` bytes. */
export declare function appendTail(buf: string, chunk: string, cap: number): {
    content: string;
    bytes: number;
    truncated: boolean;
    fullTruncated: boolean;
};
