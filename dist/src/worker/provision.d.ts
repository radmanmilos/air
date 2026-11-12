/** Minimum Python the worker supports (see packages/local-worker/pyproject.toml). */
export declare const MINIMUM_PYTHON: readonly [number, number];
export interface WorkerLayout {
    /** Absolute path to `packages/local-worker`. */
    packageDir: string;
    /** Cache directory owned by the worker (`cacheDir/worker`). */
    rootDir: string;
    /** Virtualenv directory (`cacheDir/worker/venv`). */
    venvDir: string;
    /** Interpreter inside the virtualenv. */
    pythonPath: string;
    /** Install marker recording which package version was installed. */
    markerFile: string;
}
export interface ProvisionStep {
    name: 'package' | 'venv' | 'install';
    ok: boolean;
    detail: string;
}
export interface ProvisionResult {
    ok: boolean;
    layout: WorkerLayout;
    created: boolean;
    steps: ProvisionStep[];
    error?: string;
}
export type DoctorCheckId = 'python' | 'venv' | 'worker' | 'ollama' | 'models';
export interface DoctorCheck {
    id: DoctorCheckId;
    label: string;
    ok: boolean;
    skipped?: boolean;
    detail: string;
    hint?: string;
}
export interface DoctorReport {
    ok: boolean;
    checks: DoctorCheck[];
}
export interface ProvisionOptions {
    cacheDir?: string;
    packageDir?: string;
    force?: boolean;
    python?: string;
    log?: (line: string) => void;
}
export interface DoctorOptions {
    cacheDir?: string;
    packageDir?: string;
    offline?: boolean;
    ollamaUrl?: string;
}
/**
 * Walk up from this module until `packages/local-worker/pyproject.toml` is
 * found. Works from source, from `dist/`, and from the npm package layout.
 */
export declare function findWorkerPackage(startDir?: string): string;
export declare function venvPython(venvDir: string, platform?: string): string;
export declare function workerLayout(options?: {
    cacheDir?: string;
    packageDir?: string;
    platform?: string;
}): WorkerLayout;
export declare function systemPythonCandidates(platform?: string): string[];
export declare function buildVenvArgs(venvDir: string): string[];
export declare function buildInstallArgs(packageDir: string): string[];
/** Parse `3.14.6` / `Python 3.14.6` into numeric parts. */
export declare function parsePythonVersion(output: string): [number, number, number] | null;
export declare function meetsMinimumPython(version: readonly [number, number, number] | null, minimum?: readonly [number, number]): boolean;
export interface SystemPython {
    executable: string;
    version: [number, number, number];
    raw: string;
}
/**
 * Create the venv (unless it exists) and install the bundled worker package
 * into it. Idempotent: a matching install marker is reused unless `force`.
 */
export declare function provisionLocalWorker(options?: ProvisionOptions): Promise<ProvisionResult>;
/** The command AIR uses to run one job. `null` when the worker is not provisioned. */
export declare function workerCommand(layout?: WorkerLayout): {
    executable: string;
    args: string[];
} | null;
export interface WorkerInstallInfo {
    provisioned: boolean;
    version?: string;
    python?: string;
}
/**
 * One-stop availability probe used by the registry, status, and the local
 * adapter. Never throws when the bundled package is missing or the marker is
 * unreadable.
 */
export declare function workerInstallInfo(options?: {
    cacheDir?: string;
    packageDir?: string;
    platform?: string;
}): WorkerInstallInfo;
export declare function formatProvisionResult(result: ProvisionResult): string;
export declare function formatDoctorReport(report: DoctorReport): string;
/** Report whether a local job can run. Read-only: it never provisions. */
export declare function doctorLocalWorker(options?: DoctorOptions): Promise<DoctorReport>;
