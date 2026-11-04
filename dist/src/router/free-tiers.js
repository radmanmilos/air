// Runtime-configurable free-tier overrides (T7-023).
let overrides = {};
export function setFreeTierOverrides(map) {
    overrides = { ...map };
}
export function loadFreeTierOverridesFromEnv() {
    const raw = process.env.AIR_FREE_TIER_OVERRIDES;
    if (!raw)
        return;
    try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object')
            setFreeTierOverrides(parsed);
    }
    catch { /* ignore */ }
}
export function isFreeOverride(provider, model) {
    return overrides[`${provider}/${model}`];
}
