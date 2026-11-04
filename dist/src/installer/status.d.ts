export type InstallStatus = 'installed' | 'outdated' | 'failed' | 'not-installed';
export interface InstallRecord {
    installed: boolean;
    version?: string;
    installedAt?: string;
    updatedAt: string;
    status: InstallStatus;
    error?: string;
    installAttempts: number;
}
/** Record install status for an adapter (atomic). */
export declare function recordInstall(adapterId: string, status: InstallStatus, options?: {
    version?: string;
    error?: string;
    installed?: boolean;
}): void;
/** Get install status for an adapter, combining live PATH check + persisted. */
export declare function getInstallStatus(adapterId: string, executable: string): InstallRecord;
/** Check if an adapter binary is currently on PATH. */
export declare function isInstalled(executable: string): boolean;
/** Clear the install record for an adapter (e.g. on uninstall). */
export declare function clearInstall(adapterId: string): void;
