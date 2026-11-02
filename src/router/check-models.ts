// Model check (N-10).
//
// Lists the registered adapters with their provider/model, and verifies
// that every adapter's provider/model is allowed by the global allow-list.
// Never executes a tool — read-only.

import { availableAdapters, adapterStatus } from '../adapters/registry';
import { defaultAllowList } from '../security/allowlist';

export interface ModelCheckResult {
  adapters: { id: string; provider: string; model: string; available: boolean; reason?: string }[];
  allowed: { id: string; ok: boolean; reason?: string }[];
  allOk: boolean;
}

export function checkModels(): ModelCheckResult {
  const adapters = availableAdapters();
  const allow = defaultAllowList(adapters);
  const result: ModelCheckResult = { adapters: adapterStatus(), allowed: [], allOk: true };

  for (const a of adapters) {
    const providerOk = allow.providers.includes(a.provider);
    const modelOk = allow.models.includes(a.model);
    const ok = providerOk && modelOk;
    if (!ok) result.allOk = false;
    result.allowed.push({
      id: a.id,
      ok,
      reason: ok ? undefined : `provider=${a.provider} model=${a.model}`,
    });
  }

  return result;
}

export function formatModelCheck(result: ModelCheckResult): string {
  const lines: string[] = [];
  lines.push('air models check');
  for (const a of result.adapters) {
    lines.push(`  - ${a.id}: ${a.provider}/${a.model}${a.available ? '' : ` (unavailable: ${a.reason ?? 'missing'})`}`);
  }
  lines.push('Allow-list:');
  for (const a of result.allowed) {
    lines.push(`  - ${a.id}: ${a.ok ? 'OK' : `BLOCKED (${a.reason})`}`);
  }
  lines.push(`All allowed: ${result.allOk ? 'yes' : 'no'}`);
  return lines.join('\n');
}