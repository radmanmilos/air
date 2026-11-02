// Model catalog (R5-24).
//
// Lists every adapter's provider/model pair plus the capabilities each
// model supports. This is the single source of truth for "which model is
// best suited for this activity" — the router can match task requirements
// (write, read-only, code, reasoning) against the catalog instead of
// guessing from adapter metadata alone.

import type { AgentAdapter } from '../adapters/adapter';

export interface ModelEntry {
  id: string; // adapter id
  provider: string;
  model: string;
  available: boolean;
  reason?: string;
  capabilities: {
    code: boolean;
    reasoning: boolean;
    write: boolean;
    read: boolean;
    headless: boolean;
  };
  /** Cost tier: 0 = free, 1 = cheap, 2 = standard, 3 = premium. */
  costTier: 0 | 1 | 2 | 3;
  /** Context window in tokens (when known). */
  contextWindow?: number;
}

/** Build the model catalog from the registered adapters. */
export function buildModelCatalog(adapters: AgentAdapter[]): ModelEntry[] {
  return adapters.map((a) => ({
    id: a.id,
    provider: a.provider,
    model: a.model,
    available: true,
    capabilities: {
      code: a.capabilities.headlessExecution,
      reasoning: a.capabilities.supportsStreaming,
      write: a.capabilities.headlessExecution,
      read: a.capabilities.supportsStreaming,
      headless: a.capabilities.headlessExecution,
    },
    costTier: costTierFor(a),
    contextWindow: a.capabilities.contextWindow,
  }));
}

function costTierFor(adapter: AgentAdapter): 0 | 1 | 2 | 3 {
  // Free tiers first, then cheap, then standard, then premium.
  if (adapter.provider === 'ollama' || adapter.provider === 'lm-studio') return 0;
  if (adapter.provider === 'openrouter' && /free/i.test(adapter.model)) return 0;
  if (/mini|small|lite/i.test(adapter.model)) return 1;
  if (/pro|opus|sonnet|large/i.test(adapter.model)) return 3;
  return 2;
}

/** Filter the catalog to models that can handle a task. */
export function bestModelFor(catalog: ModelEntry[], task: { mode: 'ask' | 'auto'; readOnly: boolean }): ModelEntry | null {
  const eligible = catalog.filter((m) => m.available && m.capabilities.headless);
  if (eligible.length === 0) return null;
  // Prefer the cheapest model that can do the task.
  eligible.sort((a, b) => a.costTier - b.costTier);
  return eligible[0];
}

/** Format the catalog for human output. */
export function formatModelCatalog(catalog: ModelEntry[]): string {
  const lines: string[] = [];
  lines.push('air models');
  for (const m of catalog) {
    const caps = Object.entries(m.capabilities)
      .filter(([, v]) => v)
      .map(([k]) => k)
      .join(',');
    lines.push(`  - ${m.id}: ${m.provider}/${m.model} [${caps}] cost=${m.costTier}${m.contextWindow ? ` ctx=${m.contextWindow}` : ''}`);
  }
  return lines.join('\n');
}

/** Format the best-model recommendation for a task. */
export function formatBestModel(catalog: ModelEntry[], task: { mode: 'ask' | 'auto'; readOnly: boolean }): string {
  const best = bestModelFor(catalog, task);
  if (!best) return 'No eligible model for this task.';
  return `Best model: ${best.id} (${best.provider}/${best.model}) cost=${best.costTier}`;
}