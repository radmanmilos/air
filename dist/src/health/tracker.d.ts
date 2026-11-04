import type { ErrorCategory } from '../types/errors';
export interface CooldownEntry {
    provider: string;
    model: string;
    until: number;
    reason: ErrorCategory;
}
export interface HealthState {
    cooldowns: CooldownEntry[];
    successes: Record<string, number>;
    failures: Record<string, number>;
    cancellations: Record<string, number>;
}
export interface HealthSnapshot {
    cooldowns: CooldownEntry[];
    successes: Record<string, number>;
    failures: Record<string, number>;
    cancellations: Record<string, number>;
    /** Total number of recorded successes across all providers/models. */
    totalSuccesses: number;
    /** Total number of recorded failures across all providers/models. */
    totalFailures: number;
    /** Total number of recorded cancellations across all providers/models. */
    totalCancellations: number;
    /** Per-(provider, model) success rate as a number in [0, 1]. */
    successRate: Record<string, number>;
    /** True when at least one (provider, model) is currently cooling down. */
    hasActiveCooldown: boolean;
}
/** Build a structured health snapshot from a HealthState (R5-18). */
export declare function healthSnapshot(state: HealthState, now?: number): HealthSnapshot;
export interface HealthTracker {
    setCooldown(provider: string, model: string, untilMs: number, reason: ErrorCategory): void;
    /** Remove a cooldown for (provider, model). In-memory only; persisted by flush(). */
    clearCooldown(provider: string, model: string): void;
    isCoolingDown(provider: string, model: string, now?: number): boolean;
    getCooldown(provider: string, model: string, now?: number): CooldownEntry | null;
    getCooldowns(now?: number): CooldownEntry[];
    recordSuccess(provider: string, model: string): void;
    recordFailure(provider: string, model: string, category: ErrorCategory): void;
    /** Record a user cancellation. NOT a provider failure (R5-12). */
    recordCancellation(provider: string, model: string): void;
    flush(): Promise<void>;
    load(): Promise<void>;
    snapshot(now?: number): HealthSnapshot;
}
/** Persist an empty health state under the inter-process lock (R5-09).
 *  Used by tests to reset the shared health file deterministically, and by
 *  `air health reset` if that command is ever implemented. */
export declare function resetHealth(): Promise<void>;
export declare function createHealthTracker(state?: HealthState): HealthTracker;
/** Decide whether a failure should set a cooldown based on ERROR_POLICY. */
export declare function shouldSetCooldown(category: ErrorCategory): boolean;
/** Decide whether a failure should stop and ask the user. */
export declare function shouldStopAndAsk(category: ErrorCategory): boolean;
/** Decide whether a failure should abort immediately. */
export declare function shouldAbort(category: ErrorCategory): boolean;
