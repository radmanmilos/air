// Model catalog (R5-24).
//
// Lists every adapter's provider/model pair plus the capabilities each
// model supports. This is the single source of truth for "which model is
// best suited for this activity" — the router can match task requirements
// (write, read-only, code, reasoning) against the catalog instead of
// guessing from adapter metadata alone.
/** Build the model catalog from the registered adapters. */
export function buildModelCatalog(adapters, opts = {}) {
    return adapters.map((a) => {
        const av = opts.availableMap?.get(a.id);
        return {
            id: a.id,
            provider: a.provider,
            model: a.model,
            available: av?.available ?? true,
            reason: av?.reason,
            capabilities: {
                code: !!a.capabilities.fileEditing || !!a.capabilities.headlessExecution,
                reasoning: !!a.capabilities.supportsStreaming,
                write: !!a.capabilities.fileEditing,
                read: !!a.capabilities.headlessExecution,
                headless: !!a.capabilities.headlessExecution,
            },
            costTier: costTierFor(a, opts.costOverrides),
            contextWindow: a.capabilities.contextWindow,
        };
    });
}
function costTierFor(adapter, overrides) {
    if (overrides && overrides[adapter.id] !== undefined) {
        const v = overrides[adapter.id];
        if (v === 0 || v === 1 || v === 2 || v === 3)
            return v;
    }
    // Free tiers first, then cheap, then standard, then premium.
    if (adapter.provider === 'ollama' || adapter.provider === 'lm-studio')
        return 0;
    if (adapter.provider === 'openrouter' && /free/i.test(adapter.model))
        return 0;
    if (/mini|small|lite/i.test(adapter.model))
        return 1;
    if (/pro|opus|sonnet|large/i.test(adapter.model))
        return 3;
    return 2;
}
/** Filter the catalog to models that can handle a task. */
export function bestModelFor(catalog, task) {
    const eligible = catalog.filter((m) => {
        if (!m.available)
            return false;
        if (!m.capabilities.headless)
            return false;
        if (task.mode === 'auto' && !m.capabilities.headless)
            return false;
        if (!task.readOnly && !m.capabilities.write)
            return false;
        if (task.readOnly && !m.capabilities.read && !m.capabilities.headless)
            return false;
        return true;
    });
    if (eligible.length === 0)
        return null;
    // Prefer the cheapest model that can do the task; tie-break by larger context window.
    eligible.sort((a, b) => a.costTier - b.costTier || (b.contextWindow ?? 0) - (a.contextWindow ?? 0));
    return eligible[0];
}
/** Format the catalog for human output. */
export function formatModelCatalog(catalog) {
    const lines = [];
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
export function formatBestModel(catalog, task) {
    const best = bestModelFor(catalog, task);
    if (!best)
        return 'No eligible model for this task.';
    return `Best model: ${best.id} (${best.provider}/${best.model}) cost=${best.costTier}`;
}
