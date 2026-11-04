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
export declare function selectCandidate(task: TaskInput, adapters: AgentAdapter[], tracker: HealthTracker, now?: number): RouteDecision;
/**
 * Select the best candidate, excluding already-visited ones and respecting
 * the provider-destination allow-list (R5-04/R5-05). Returns the first
 * eligible candidate, or null when none remain.
 */
export declare function selectCandidateFrom(task: TaskInput, adapters: AgentAdapter[], tracker: HealthTracker, visited: Set<string>, allow: AllowList | null, now?: number): RouteDecision;
/** Shared helper: is this adapter blocked by the provider-destination
 *  allow-list? Returns a reason string when blocked, null when allowed. */
export declare function isBlockedByAllowlist(adapter: AgentAdapter, allow: AllowList | null): string | null;
/** Compute a coarse cost tier for free-first ranking. */
export declare function costTier(c: ExecutionCandidate): number;
export declare function formatRouteDecision(decision: RouteDecision): string;
