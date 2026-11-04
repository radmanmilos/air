import { getInstallStatus, type InstallRecord } from './status';
import type { InstallEntry } from '../config/catalog';
import type { Config } from '../config/schema';
export interface PlatformInfo {
    platform: 'win32' | 'darwin' | 'linux' | 'other';
    arch: 'x64' | 'arm64' | 'ia32' | 'other';
}
/** Install an adapter via package-manager or direct-download. */
export declare function installAdapter(entry: InstallEntry, config?: Config): Promise<InstallRecord>;
/** Upgrade an adapter to the catalog version if outdated. */
export declare function upgradeAdapter(entry: InstallEntry, config?: Config): Promise<InstallRecord>;
/** Uninstall an adapter. */
export declare function uninstallAdapter(entry: InstallEntry): Promise<void>;
/**
 * Auto-install missing adapters when catalog.autoInstall is enabled.
 *
 * Fire-and-forget: installs are kicked off in the background so the current
 * task is not blocked. Newly installed adapters become available for
 * subsequent tasks. Failures are recorded in installs.json and logged to
 * stderr only (never stdout, to protect the MCP protocol).
 *
 * @param installFn - optional override for testing (defaults to installAdapter)
 * @param getInstallStatusFn - optional override for testing (defaults to getInstallStatus)
 */
export declare function autoInstallMissing(config: Config, installFn?: typeof installAdapter, getInstallStatusFn?: typeof getInstallStatus): Promise<void>;
