export interface CoderOracleExecutionResult {
    executed: boolean;
    passed: boolean;
    exitCode: number | null;
    stdout: string;
    stderr: string;
    timedOut: boolean;
    cancelled: boolean;
    reason: string;
    patchApplied: boolean;
    patchError?: string;
    sandboxMechanism: string;
    sandboxAvailable: boolean;
}
export declare function executeCoderOracle(params: {
    workspacePath: string;
    patch: string;
    command: string;
    timeoutMs?: number;
    signal?: AbortSignal;
}): Promise<CoderOracleExecutionResult>;
