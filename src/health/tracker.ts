// Health tracker with atomic persistence.
// Cooldowns are keyed by (provider, model) — shared provider limits are
// respected because two tools on the same provider share one cooldown.

import { paths } from '../config/paths';
import { atomicWriteJson, readJsonFile } from '../utils/atomic';
import { lockedReadModifyWrite } from '../utils/lock';
import type { ErrorCategory } from '../types/errors';
import { getErrorAction } from '../types/errors';

export interface CooldownEntry {
  provider: string;
  model: string;
  until: number; // epoch ms
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
export function healthSnapshot(state: HealthState, now: number = Date.now()): HealthSnapshot {
  let totalSuccesses = 0;
  let totalFailures = 0;
  let totalCancellations = 0;
  const successRate: Record<string, number> = {};
  for (const [k, s] of Object.entries(state.successes)) {
    totalSuccesses += s;
    const f = state.failures[k] ?? 0;
    totalCancellations += state.cancellations[k] ?? 0;
    totalFailures += f;
    const total = s + f;
    successRate[k] = total > 0 ? s / total : 0;
  }
  for (const [k, c] of Object.entries(state.cancellations)) {
    totalCancellations += c;
    if (!(k in successRate)) successRate[k] = 0;
  }
  const active = state.cooldowns.filter((c) => c.until > now);
  return {
    cooldowns: active,
    successes: state.successes,
    failures: state.failures,
    cancellations: state.cancellations,
    totalSuccesses,
    totalFailures,
    totalCancellations,
    successRate,
    hasActiveCooldown: active.length > 0,
  };
}

export interface HealthTracker {
  setCooldown(provider: string, model: string, untilMs: number, reason: ErrorCategory): void;
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

const EMPTY: HealthState = { cooldowns: [], successes: {}, failures: {}, cancellations: {} };

function key(provider: string, model: string): string {
  return `${provider}/${model}`;
}

export function createHealthTracker(state: HealthState = { ...EMPTY }): HealthTracker {
  return {
    setCooldown(provider, model, untilMs, reason) {
      state.cooldowns = state.cooldowns
        .filter((c) => !(c.provider === provider && c.model === model))
        .concat({ provider, model, until: untilMs, reason });
    },
    isCoolingDown(provider, model, now = Date.now()) {
      return state.cooldowns.some(
        (c) => c.provider === provider && c.model === model && c.until > now,
      );
    },
    getCooldown(provider, model, now = Date.now()) {
      return (
        state.cooldowns.find(
          (c) => c.provider === provider && c.model === model && c.until > now,
        ) ?? null
      );
    },
    getCooldowns(now = Date.now()) {
      return state.cooldowns.filter((c) => c.until > now);
    },
    recordSuccess(provider, model) {
      state.successes[key(provider, model)] = (state.successes[key(provider, model)] ?? 0) + 1;
    },
    recordFailure(provider, model, category) {
      state.failures[key(provider, model)] = (state.failures[key(provider, model)] ?? 0) + 1;
    },
    recordCancellation(provider, model) {
      // User cancellation is NOT a provider failure (R5-12). It must not
      // add a failure count or cooldown, and it must never trigger failover.
      state.cancellations[key(provider, model)] = (state.cancellations[key(provider, model)] ?? 0) + 1;
    },
    async flush() {
      // Serialize the read-modify-write cycle across processes (R5-09):
      // re-read persisted state, merge in our in-memory mutations, and
      // write atomically under the lock. Two concurrent flushes cannot
      // overwrite each other.
      const snapshot = { ...state };
      await lockedReadModifyWrite<HealthState>(
        'health',
        paths.healthFile,
        async (current) => {
          const base: HealthState = current ?? { ...EMPTY };
          const merged: HealthState = {
            cooldowns: [
              ...base.cooldowns.filter(
                (c) => !snapshot.cooldowns.some((s) => s.provider === c.provider && s.model === c.model),
              ),
              ...snapshot.cooldowns,
            ],
            successes: { ...base.successes, ...snapshot.successes },
            failures: { ...base.failures, ...snapshot.failures },
            cancellations: { ...base.cancellations, ...snapshot.cancellations },
          };
          return merged;
        },
        { timeoutMs: 5000 },
      );
      // Refresh in-memory state from the merged result so subsequent
      // mutations in this process see the latest persisted state.
      const reloaded = await readJsonFile<HealthState>(paths.healthFile);
      if (reloaded) {
        state.cooldowns = reloaded.cooldowns ?? [];
        state.successes = reloaded.successes ?? {};
        state.failures = reloaded.failures ?? {};
        state.cancellations = reloaded.cancellations ?? {};
      }
    },
    async load() {
      const loaded = await readJsonFile<HealthState>(paths.healthFile);
      if (loaded) {
        state.cooldowns = loaded.cooldowns ?? [];
        state.successes = loaded.successes ?? {};
        state.failures = loaded.failures ?? {};
        state.cancellations = loaded.cancellations ?? {};
      }
    },
    snapshot(now?: number) {
      return healthSnapshot(state, now);
    },
  };
}

/** Decide whether a failure should set a cooldown based on ERROR_POLICY. */
export function shouldSetCooldown(category: ErrorCategory): boolean {
  return getErrorAction(category) === 'wait_cooldown';
}

/** Decide whether a failure should stop and ask the user. */
export function shouldStopAndAsk(category: ErrorCategory): boolean {
  return getErrorAction(category) === 'stop_ask_user';
}

/** Decide whether a failure should abort immediately. */
export function shouldAbort(category: ErrorCategory): boolean {
  return getErrorAction(category) === 'abort';
}