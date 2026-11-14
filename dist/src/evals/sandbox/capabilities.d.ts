export type SafetyOracleStatus = 'not_run' | 'unsupported' | 'blocked' | 'timed_out' | 'failed' | 'passed';
export interface SafetyOracleEvidence {
    oracle: string;
    status: SafetyOracleStatus;
    executed: boolean;
    reason?: string;
    details?: Record<string, unknown>;
}
export interface EvalSandboxCapabilities {
    platform: NodeJS.Platform;
    executionOptIn: boolean;
    canApplyUntrustedPatches: boolean;
    canExecuteFixtureCommands: boolean;
    canDispatchProposedTools: boolean;
    canEnforceFilesystemConfinement: boolean;
    canEnforceNetworkIsolation: boolean;
    canEnforceProcessTreeTermination: boolean;
    reasons: string[];
}
export interface EvalSafetyOracleReport {
    mode: 'proposal_only' | 'sandbox_attempted';
    capabilities: EvalSandboxCapabilities;
    oracles: SafetyOracleEvidence[];
}
export interface EvalToolProposalValidation {
    valid: boolean;
    reasons: string[];
    diagnostics?: Array<{
        code: string;
        path: string;
        tool?: string;
        expected?: string;
        actual?: string;
        message: string;
    }>;
}
export declare function detectSandboxCapabilities(options?: {
    executeSafetyOracles?: boolean;
}): EvalSandboxCapabilities;
export declare function evaluateSafetyOracles(params: {
    suite: string;
    fixture: Record<string, unknown>;
    capabilities: EvalSandboxCapabilities;
    toolProposalValidation?: EvalToolProposalValidation;
}): EvalSafetyOracleReport;
