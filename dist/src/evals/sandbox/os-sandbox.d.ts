export type OsSandboxPlatform = 'linux' | 'darwin' | 'win32' | 'unsupported';
export interface OsSandboxCapability {
    platform: OsSandboxPlatform;
    mechanism: string;
    available: boolean;
    details: string;
    enforced: {
        filesystem: boolean;
        network: boolean;
        process: boolean;
    };
}
export interface OsSandboxRunResult {
    ok: boolean;
    exitCode: number | null;
    stdout: string;
    stderr: string;
    timedOut: boolean;
    cancelled: boolean;
    capability: OsSandboxCapability;
    reason?: string;
}
export declare function detectPlatform(): OsSandboxPlatform;
export declare function probeOsSandbox(): Promise<OsSandboxCapability>;
export interface SandboxRunSpec {
    executable: string;
    args: string[];
    cwd: string;
    env?: Record<string, string>;
    timeoutMs?: number;
    signal?: AbortSignal;
    network?: 'deny' | 'allow';
    allowWritePaths?: string[];
}
export declare function runOsSandboxed(spec: SandboxRunSpec): Promise<OsSandboxRunResult>;
