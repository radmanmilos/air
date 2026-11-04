import type { Config } from './schema';
export interface InstallEntry {
    id: string;
    name: string;
    adapterId: string;
    executable: string;
    provider: string;
    model: string;
    capabilities: Record<string, boolean>;
    description: string;
    tags: string[];
    /** Cost classification: free/freemium/paid/unknown. Defaults to unknown. */
    cost?: 'free' | 'freemium' | 'paid' | 'unknown';
    /** Auth requirement. */
    auth?: 'none' | 'api_key' | 'oauth' | 'subscription';
    /** Free-tier limits. */
    limits?: {
        rpm?: number;
        rpd?: number;
        tpm?: number;
        tpd?: number;
        resetsAt?: string;
    };
    /** Context window in tokens. */
    contextWindow?: number;
    install: {
        method: 'package-manager' | 'direct-download';
        commands?: Record<string, string>;
        urls?: Record<string, Record<string, DownloadUrl>>;
        verify: string;
        version: string;
    };
}
/** Download URL with optional signature file for integrity verification. */
export interface DownloadUrl {
    url: string;
    /** Optional URL to a signature/hash file. If present, AIR downloads it
     *  and verifies the downloaded binary matches before installing. */
    signatureUrl?: string;
}
export interface CatalogData {
    version: number;
    description: string;
    tools: InstallEntry[];
}
/**
 * Load the adapter install catalog: bundled default + optional remote override.
 * Never throws; falls back to bundled on any error.
 */
export declare function loadCatalog(config?: Config): Promise<CatalogData>;
export declare function catalogTool(catalog: CatalogData, id: string): InstallEntry | undefined;
export declare function catalogTools(catalog: CatalogData): InstallEntry[];
