// Router: priority-list candidate selection with cooldowns and skip reasons.
//
// Phase 2 scope: pick the first eligible candidate. Scoring is deferred until
// misroutes are observed. Every skip is recorded exactly (cooldown_active,
// capability_mismatch, tool_not_registered) — never a generic "not available".

import type { AgentAdapter } from '../adapters/adapter';
import type { ExecutionCandidate, TaskInput } from '../types';
import type { HealthTracker } from '../health/tracker';

export interface SkipRecord {
  candidate: string;
  reason: 'cooldown_active' | 'capability_mismatch' | 'tool_not_registered' | 'cannot_handle';
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

    // Capability checks (informational; canHandle already covers the hard ones).
    if (task.mode === 'ask' && !adapter.capabilities.headlessExecution) {
      skips.push({ candidate: candidate.id, reason: 'capability_mismatch', detail: 'headlessExecution' });
      continue;
    }

    return { task, chosen: candidate, skips, considered: candidates.length };
  }

  return { task, chosen: null, skips, considered: candidates.length };
}

/** Format a RouteDecision for --explain / JSON output. */
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