// Health tracker with atomic persistence.
// Cooldowns are keyed by (provider, model) — shared provider limits are
// respected because two tools on the same provider share one cooldown.

import { paths } from '../config/paths';
import { readJsonFile } from '../utils/atomic';
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
  const allKeys = new Set<string>([
    ...Object.keys(state.successes),
    ...Object.keys(state.failures),
    ...Object.keys(state.cancellations),
  ]);
  for (const k of allKeys) {
    const s = state.successes[k] ?? 0;
    const f = state.failures[k] ?? 0;
    const c = state.cancellations[k] ?? 0;
    totalSuccesses += s;
    totalFailures += f;
    totalCancellations += c;
    const total = s + f;
    successRate[k] = total > 0 ? s / total : 0;
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

function key(provider: string, model: string): string {
  return `${provider}/${model}`;
}

function freshState(): HealthState {
  // Each tracker gets its own state object so mutations in one tracker
  // cannot leak into another (R5-12).
  return {
    cooldowns: [],
    successes: {},
    failures: {},
    cancellations: {},
  };
}

/** Persist an empty health state under the inter-process lock (R5-09).
 *  Used by tests to reset the shared health file deterministically, and by
 *  `air health reset` if that command is ever implemented. */
export async function resetHealth(): Promise<void> {
  await lockedReadModifyWrite<HealthState>(
    'health',
    paths.healthFile,
    async () => freshState(),
    { timeoutMs: 5000 },
  );
}

export function createHealthTracker(state: HealthState = freshState()): HealthTracker {
  const base: HealthState = JSON.parse(JSON.stringify(state));
  return {
setCooldown(provider, model, untilMs, reason) {
       state.cooldowns = state.cooldowns
         .filter((c) => !(c.provider === provider && c.model === model))
         .concat({ provider, model, until: untilMs, reason });
      },
      clearCooldown(provider, model) {
        state.cooldowns = state.cooldowns.filter(
          (c) => !(c.provider === provider && c.model === model),
        );
        // In-memory only: the removal is persisted by the next flush().
        // This keeps the seam deterministic for tests and avoids a
        // read-modify-write racing with a concurrent flush().
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
    recordFailure(provider, model, _category) {
      state.failures[key(provider, model)] = (state.failures[key(provider, model)] ?? 0) + 1;
    },
    recordCancellation(provider, model) {
      // User cancellation is NOT a provider failure (R5-12). It must not
      // add a failure count or cooldown, and it must never trigger failover.
      state.cancellations[key(provider, model)] = (state.cancellations[key(provider, model)] ?? 0) + 1;
    },
    async flush() {
      const snapshot = { ...state };
      // Compute deltas relative to the base snapshot taken at load/last-flush.
      const deltaSuccesses: Record<string, number> = {};
      for (const k of Object.keys(snapshot.successes)) {
        const d = (snapshot.successes[k] ?? 0) - (base.successes[k] ?? 0);
        if (d > 0) deltaSuccesses[k] = d;
      }
      const deltaFailures: Record<string, number> = {};
      for (const k of Object.keys(snapshot.failures)) {
        const d = (snapshot.failures[k] ?? 0) - (base.failures[k] ?? 0);
        if (d > 0) deltaFailures[k] = d;
      }
      const deltaCancellations: Record<string, number> = {};
      for (const k of Object.keys(snapshot.cancellations)) {
        const d = (snapshot.cancellations[k] ?? 0) - (base.cancellations[k] ?? 0);
        if (d > 0) deltaCancellations[k] = d;
      }
      await lockedReadModifyWrite<HealthState>(
        'health',
        paths.healthFile,
        async (current) => {
          const basePersisted: HealthState = current ?? freshState();
          const merged: HealthState = {
            cooldowns: [
              ...basePersisted.cooldowns.filter(
                (c) => !snapshot.cooldowns.some((s) => s.provider === c.provider && s.model === c.model),
              ),
              ...snapshot.cooldowns,
            ],
            successes: { ...basePersisted.successes },
            failures: { ...basePersisted.failures },
            cancellations: { ...basePersisted.cancellations },
          };
          for (const k of Object.keys(deltaSuccesses)) {
            merged.successes[k] = (merged.successes[k] ?? 0) + deltaSuccesses[k];
          }
          for (const k of Object.keys(deltaFailures)) {
            merged.failures[k] = (merged.failures[k] ?? 0) + deltaFailures[k];
          }
          for (const k of Object.keys(deltaCancellations)) {
            merged.cancellations[k] = (merged.cancellations[k] ?? 0) + deltaCancellations[k];
          }
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
      // Reset base to current persisted state.
      base.cooldowns = [...(state.cooldowns ?? [])];
      base.successes = { ...(state.successes ?? {}) };
      base.failures = { ...(state.failures ?? {}) };
      base.cancellations = { ...(state.cancellations ?? {}) };
    },
    async load() {
      const loaded = await readJsonFile<HealthState>(paths.healthFile);
      if (loaded) {
        state.cooldowns = loaded.cooldowns ?? [];
        state.successes = loaded.successes ?? {};
        state.failures = loaded.failures ?? {};
        state.cancellations = loaded.cancellations ?? {};
      }
      base.cooldowns = [...(state.cooldowns ?? [])];
      base.successes = { ...(state.successes ?? {}) };
      base.failures = { ...(state.failures ?? {}) };
      base.cancellations = { ...(state.cancellations ?? {}) };
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