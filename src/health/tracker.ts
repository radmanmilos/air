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
}

export interface HealthTracker {
  setCooldown(provider: string, model: string, untilMs: number, reason: ErrorCategory): void;
  isCoolingDown(provider: string, model: string, now?: number): boolean;
  getCooldown(provider: string, model: string, now?: number): CooldownEntry | null;
  getCooldowns(now?: number): CooldownEntry[];
  recordSuccess(provider: string, model: string): void;
  recordFailure(provider: string, model: string, category: ErrorCategory): void;
  flush(): Promise<void>;
  load(): Promise<void>;
}

const EMPTY: HealthState = { cooldowns: [], successes: {}, failures: {} };

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
      }
    },
    async load() {
      const loaded = await readJsonFile<HealthState>(paths.healthFile);
      if (loaded) {
        state.cooldowns = loaded.cooldowns ?? [];
        state.successes = loaded.successes ?? {};
        state.failures = loaded.failures ?? {};
      }
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