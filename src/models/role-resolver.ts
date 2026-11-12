import type { Config, ModelRole } from '../config/schema';
import { ModelProviderError } from './types';

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
export function resolveModelRole(config: Config, role: ModelRole): ResolvedModelRole {
  const assignment = config.models.roles[role];
  const provider = config.models.providers[assignment.provider];
  if (!provider || !provider.enabled) {
    throw new ModelProviderError(
      'PROVIDER_UNAVAILABLE',
      'Configured model provider is disabled or unavailable: ' + assignment.provider,
      assignment.provider,
      assignment.model,
    );
  }
  if (!provider.baseUrl) {
    throw new ModelProviderError(
      'PROVIDER_ERROR',
      'Configured model provider is missing its base URL: ' + assignment.provider,
      assignment.provider,
      assignment.model,
    );
  }
  return {
    role,
    providerId: assignment.provider,
    model: assignment.model,
    baseUrl: provider.baseUrl,
    keepAlive: config.models.keepAlive,
    maxConcurrentGenerative: config.models.maxConcurrentGenerative,
    localFirst: config.models.localFirst,
  };
}
