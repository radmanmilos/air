// Provider allow-list (R-07).
//
// Default policy: only the first-attempt provider is allowed. A proposed
// replacement that changes provider must be disclosed and requires explicit
// user consent. `auto` failover must never bypass provider restrictions.

import type { AgentAdapter } from '../adapters/adapter';
import type { TaskInput } from '../types';

export interface AllowList {
  providers: string[];
  models: string[];
}

/** Build the task's provider-destination policy from the actual first
 *  selected candidate (R5-04). Never use adapters[0] directly: the first
 *  adapter in the list may be cooling down or blocked, in which case the
 *  policy must describe the candidate actually chosen for the task. */
export function defaultAllowList(
  adapters: AgentAdapter[],
  chosen?: { provider: string; model: string } | null,
): AllowList {
  const first = chosen ?? adapters[0];
  return {
    providers: first ? [first.provider] : [],
    models: first ? [first.model] : [],
  };
}

export function isProviderAllowed(provider: string, allow: AllowList): boolean {
  return allow.providers.includes(provider);
}

export function isModelAllowed(model: string, allow: AllowList): boolean {
  return allow.models.includes(model);
}

export function checkHandoffAllowlist(
  from: AgentAdapter,
  to: AgentAdapter,
  allow: AllowList,
): { ok: boolean; reason?: string } {
  if (from.provider === to.provider) {
    // Same provider, different model: allowed if the model is allow-listed.
    if (!isModelAllowed(to.model, allow)) {
      return { ok: false, reason: `model ${to.model} not in allow-list` };
    }
    return { ok: true };
  }
  if (!isProviderAllowed(to.provider, allow)) {
    return { ok: false, reason: `provider ${to.provider} not in allow-list` };
  }
  // Cross-provider: an explicitly allowed provider may use any of its models.
  return { ok: true };
}

export function buildHandoff(task: TaskInput, from: AgentAdapter, to: AgentAdapter): string {
  const lines: string[] = [];
  lines.push(`# air handoff`);
  lines.push(`- task: ${task.prompt}`);
  lines.push(`- from: ${from.id} (${from.provider}/${from.model})`);
  lines.push(`- to: ${to.id} (${to.provider}/${to.model})`);
  lines.push(`- mode: ${task.mode}`);
  if (task.files && task.files.length > 0) {
    lines.push(`- files: ${task.files.join(', ')}`);
  }
  lines.push(`- continue from the current working tree; do not reset or revert.`);
  return lines.join('\n');
}