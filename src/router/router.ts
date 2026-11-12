// Router: priority-list candidate selection with cooldowns and skip reasons.
//
// Phase 2 scope: pick the first eligible candidate. Scoring is deferred until
// misroutes are observed. Every skip is recorded exactly (cooldown_active,
// capability_mismatch, tool_not_registered) — never a generic "not available".

import type { AgentAdapter } from '../adapters/adapter';
import type { ExecutionCandidate, TaskInput } from '../types';
import type { HealthTracker } from '../health/tracker';
import type { AllowList } from '../security/allowlist';

export interface SkipRecord {
  candidate: string;
  reason: 'cooldown_active' | 'capability_mismatch' | 'tool_not_registered' | 'cannot_handle' | 'already_visited' | 'allow_list_blocked';
  detail?: string;
}

export interface RouteDecision {
  task: TaskInput;
  chosen: ExecutionCandidate | null;
  skips: SkipRecord[];
  considered: number;
}

/**
 * Select the best candidate from a priority list.
 *
 * Order of checks per candidate:
 *   1. Is the adapter registered / can it handle the task?
 *   2. Is the (provider, model) currently cooling down?
 *   3. Does it have the required capabilities?
 */
export function selectCandidate(
  task: TaskInput,
  adapters: AgentAdapter[],
  tracker: HealthTracker,
  now: number = Date.now(),
): RouteDecision {
  return selectCandidateFrom(task, adapters, tracker, new Set(), null, now);
}

/**
 * Select the best candidate, excluding already-visited ones and respecting
 * the provider-destination allow-list (R5-04/R5-05). Returns the first
 * eligible candidate, or null when none remain.
 */
export function selectCandidateFrom(
  task: TaskInput,
  adapters: AgentAdapter[],
  tracker: HealthTracker,
  visited: Set<string>,
  allow: AllowList | null,
  now: number = Date.now(),
): RouteDecision {
  const skips: SkipRecord[] = [];
  const candidates: ExecutionCandidate[] = [];

  for (const adapter of adapters) {
    candidates.push({
      id: adapter.id,
      tool: adapter.id,
      provider: adapter.provider,
      model: adapter.model,
      capabilities: adapter.capabilities,
    });
  }

  // Free-first ranking: prefer lower cost tier, then local providers, then larger context window.
  const isPreferred = (c: any) => c.id === 'local' || c.id === 'ollama' || c.id === 'opencode' || c.id === 'kilocode';
  candidates.sort((a, b) => costTier(a) - costTier(b) || (isPreferred(a) ? -1 : isPreferred(b) ? 1 : 0));

  for (const candidate of candidates) {
    const adapter = adapters.find((a) => a.id === candidate.id);
    if (!adapter) {
      skips.push({ candidate: candidate.id, reason: 'tool_not_registered' });
      continue;
    }

    if (!adapter.canHandle(task)) {
      skips.push({ candidate: candidate.id, reason: 'cannot_handle' });
      continue;
    }

    if (tracker.isCoolingDown(candidate.provider, candidate.model, now)) {
      const cd = tracker.getCooldown(candidate.provider, candidate.model, now);
      skips.push({
        candidate: candidate.id,
        reason: 'cooldown_active',
        detail: cd ? `until ${cd.until}` : undefined,
      });
      continue;
    }

    // Capability checks.
    if (task.mode === 'ask' && !adapter.capabilities.headlessExecution) {
      skips.push({ candidate: candidate.id, reason: 'capability_mismatch', detail: 'headlessExecution' });
      continue;
    }
    if (task.requiresWrite && !adapter.capabilities.fileEditing) {
      skips.push({ candidate: candidate.id, reason: 'capability_mismatch', detail: 'fileEditing' });
      continue;
    }
    if (task.requiresCode && !adapter.capabilities.fileEditing && !adapter.capabilities.headlessExecution) {
      skips.push({ candidate: candidate.id, reason: 'capability_mismatch', detail: 'code' });
      continue;
    }
    if (task.readOnly === false && !adapter.capabilities.fileEditing) {
      skips.push({ candidate: candidate.id, reason: 'capability_mismatch', detail: 'write' });
      continue;
    }

    // Revisit prevention: skip candidates already visited this run.
    const revisitKey = `${candidate.id}|${candidate.provider}|${candidate.model}`;
    if (visited.has(revisitKey)) {
      skips.push({ candidate: candidate.id, reason: 'already_visited', detail: revisitKey });
      continue;
    }

    // Provider-destination policy (R5-04): a change of provider or model
    // requires an allow-list entry. This is checked here so a blocked
    // candidate does not prevent considering later eligible candidates.
    if (allow) {
      const blocked = isBlockedByAllowlist(adapter, allow);
      if (blocked) {
        skips.push({ candidate: candidate.id, reason: 'allow_list_blocked', detail: blocked });
        continue;
      }
    }

    return { task, chosen: candidate, skips, considered: candidates.length };
  }

  return { task, chosen: null, skips, considered: candidates.length };
}

/** Shared helper: is this adapter blocked by the provider-destination
 *  allow-list? Returns a reason string when blocked, null when allowed. */
export function isBlockedByAllowlist(adapter: AgentAdapter, allow: AllowList | null): string | null {
  if (!allow) return null;
  if (allow.providers.length > 0 && !allow.providers.includes(adapter.provider)) {
    return `provider ${adapter.provider} not in allow-list`;
  }
  if (allow.models.length > 0 && !allow.models.includes(adapter.model)) {
    return `model ${adapter.model} not in allow-list`;
  }
  return null;
}

import { isFreeOverride } from './free-tiers';

/** Compute a coarse cost tier for free-first ranking. */
export function costTier(c: ExecutionCandidate): number {
  const ov = isFreeOverride(c.provider, c.model);
  if (ov === true) return 0;
  if (ov === false) return 2;
  const preferred = c.id === 'local' || c.id === 'ollama' || c.id === 'opencode' || c.id === 'kilocode';
  if (preferred) return -1;
  if (c.provider === 'lm-studio') return 0;
  if (c.provider === 'openrouter' && /free/i.test(c.model)) return 0;
  if (/mini|small|lite/i.test(c.model)) return 1;
  if (/pro|opus|sonnet|large/i.test(c.model)) return 3;
  return 2;
}
export function formatRouteDecision(decision: RouteDecision): string {
  const lines: string[] = [];
  lines.push(`Task: ${decision.task.prompt}`);
  lines.push(`Considered ${decision.considered} candidate(s).`);
  if (decision.chosen) {
    lines.push(`Chosen: ${decision.chosen.id} (${decision.chosen.provider}/${decision.chosen.model})`);
  } else {
    lines.push('Chosen: none');
  }
  for (const s of decision.skips) {
    lines.push(`  - skipped ${s.candidate}: ${s.reason}${s.detail ? ` (${s.detail})` : ''}`);
  }
  return lines.join('\n');
}



