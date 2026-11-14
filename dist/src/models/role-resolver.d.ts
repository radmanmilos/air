import type { Config, ModelRole } from '../config/schema';
export interface ResolvedModelRole {
    role: ModelRole;
    providerId: 'ollama';
    model: string;
    baseUrl: string;
    keepAlive: string;
    maxConcurrentGenerative: number;
    localFirst: boolean;
}
/**
 * Resolve a logical AIR role to its configured provider/model pair.
 *
 * This function does not probe runtime availability, pull models, or fall
 * back to another provider. Those decisions belong to explicit registry and
 * resource-manager services.
 */
export declare function resolveModelRole(config: Config, role: ModelRole): ResolvedModelRole;
