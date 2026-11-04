export interface VerifyResult {
    ok: boolean;
    code: number | null;
    stdout: string;
    stderr: string;
    command: string[];
}
export interface VerifyTrust {
    trusted: boolean;
    source: 'cli' | 'global' | 'repo' | 'none';
    reason?: string;
}
export declare function checkVerifyTrust(command: string[], trustedRepos: string[], cwd: string, source: 'cli' | 'repo'): VerifyTrust;
export declare function runVerify(command: string[], cwd: string, timeoutMs?: number): Promise<VerifyResult>;
export declare function formatVerifyReport(result: VerifyResult): string;
