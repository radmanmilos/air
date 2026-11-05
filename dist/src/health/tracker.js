// Health tracker with atomic persistence.
// Cooldowns are keyed by (provider, model) — shared provider limits are
// respected because two tools on the same provider share one cooldown.
import { paths } from '../config/paths';
import { readJsonFile } from '../utils/atomic';
import { lockedReadModifyWrite } from '../utils/lock';
import { getErrorAction } from '../types/errors';
/** Build a structured health snapshot from a HealthState (R5-18). */
export function healthSnapshot(state, now = Date.now()) {
    let totalSuccesses = 0;
    let totalFailures = 0;
    let totalCancellations = 0;
    const successRate = {};
    const allKeys = new Set([
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
function key(provider, model) {
    return `${provider}/${model}`;
}
function freshState() {
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
export async function resetHealth() {
    await lockedReadModifyWrite('health', paths.healthFile, async () => freshState(), { timeoutMs: 5000 });
}
export function createHealthTracker(state = freshState()) {
    const base = JSON.parse(JSON.stringify(state));
    return {
        setCooldown(provider, model, untilMs, reason) {
            state.cooldowns = state.cooldowns
                .filter((c) => !(c.provider === provider && c.model === model))
                .concat({ provider, model, until: untilMs, reason });
        },
        clearCooldown(provider, model) {
            state.cooldowns = state.cooldowns.filter((c) => !(c.provider === provider && c.model === model));
            // In-memory only: the removal is persisted by the next flush().
            // This keeps the seam deterministic for tests and avoids a
            // read-modify-write racing with a concurrent flush().
        },
        isCoolingDown(provider, model, now = Date.now()) {
            return state.cooldowns.some((c) => c.provider === provider && c.model === model && c.until > now);
        },
        getCooldown(provider, model, now = Date.now()) {
            return (state.cooldowns.find((c) => c.provider === provider && c.model === model && c.until > now) ?? null);
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
            const deltaSuccesses = {};
            for (const k of Object.keys(snapshot.successes)) {
                const d = (snapshot.successes[k] ?? 0) - (base.successes[k] ?? 0);
                if (d > 0)
                    deltaSuccesses[k] = d;
            }
            const deltaFailures = {};
            for (const k of Object.keys(snapshot.failures)) {
                const d = (snapshot.failures[k] ?? 0) - (base.failures[k] ?? 0);
                if (d > 0)
                    deltaFailures[k] = d;
            }
            const deltaCancellations = {};
            for (const k of Object.keys(snapshot.cancellations)) {
                const d = (snapshot.cancellations[k] ?? 0) - (base.cancellations[k] ?? 0);
                if (d > 0)
                    deltaCancellations[k] = d;
            }
            await lockedReadModifyWrite('health', paths.healthFile, async (current) => {
                const basePersisted = current ?? freshState();
                const merged = {
                    cooldowns: [
                        ...basePersisted.cooldowns.filter((c) => !snapshot.cooldowns.some((s) => s.provider === c.provider && s.model === c.model)),
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
            }, { timeoutMs: 5000 });
            // Refresh in-memory state from the merged result so subsequent
            // mutations in this process see the latest persisted state.
            const reloaded = await readJsonFile(paths.healthFile);
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
            const loaded = await readJsonFile(paths.healthFile);
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
        snapshot(now) {
            return healthSnapshot(state, now);
        },
    };
}
/** Decide whether a failure should set a cooldown based on ERROR_POLICY. */
export function shouldSetCooldown(category) {
    return getErrorAction(category) === 'wait_cooldown';
}
/** Decide whether a failure should stop and ask the user. */
export function shouldStopAndAsk(category) {
    return getErrorAction(category) === 'stop_ask_user';
}
/** Decide whether a failure should abort immediately. */
export function shouldAbort(category) {
    return getErrorAction(category) === 'abort';
}
