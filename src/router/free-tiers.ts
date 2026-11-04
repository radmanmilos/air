// Runtime-configurable free-tier overrides (T7-023).

let overrides: Record<string, boolean> = {};

export function setFreeTierOverrides(map: Record<string, boolean>): void {
  overrides = { ...map };
}

export function loadFreeTierOverridesFromEnv(): void {
  const raw = process.env.AIR_FREE_TIER_OVERRIDES;
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') setFreeTierOverrides(parsed as Record<string, boolean>);
  } catch { /* ignore */ }
}

export function isFreeOverride(provider: string, model: string): boolean | undefined {
  return overrides[`${provider}/${model}`];
}