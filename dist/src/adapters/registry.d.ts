import type { AgentAdapter, AdapterMeta } from './adapter';
import type { Config } from '../config/schema';
import { type InstallStatus } from '../installer/status';
export interface AdapterInfo {
    adapter: AgentAdapter;
    meta: AdapterMeta;
    available: boolean;
    installed: boolean;
    version?: string;
    installStatus: InstallStatus;
    reason?: string;
}
/**
 * Return the full production adapter registry, including unverified adapters
 * so `air status` can report them. Routing only uses availableAdapters().
 *
 * If `config` is supplied, configured tool overrides (enabled, executable,
 * provider, model) are applied before returning.
 */
export declare function listAdapters(config?: Config): AdapterInfo[];
export declare function availableAdapters(config?: Config): AgentAdapter[];
/** All adapters, including unverified ones, for status reporting. */
export declare function adapterStatus(config?: Config): {
    id: string;
    provider: string;
    model: string;
    available: boolean;
    installed: boolean;
    version?: string;
    installStatus: InstallStatus;
    verified: boolean;
    enabled: boolean;
    reason?: string;
}[];
/** Adapters that are routed by default (verified + enabled + available). */
export declare function routedAdapters(config?: Config): AgentAdapter[];
/** Re-check PATH and install status for a single adapter after install/uninstall. */
export declare function refreshAdapterAvailability(id: string): AdapterInfo | undefined;
/**
 * Dynamic adapter loading via catalog factoryModule has been removed for
 * security (remote code execution). Adapters are registered statically.
 * Kept as a no-op for backwards compatibility.
 */
export declare function ensureDynamicAdaptersLoaded(_config?: Config): Promise<void>;
/** Return dynamically loaded adapters (empty until ensureDynamicAdaptersLoaded() is called). */
export declare function getDynamicAdapters(): AdapterInfo[];
