// Runtime discovery of a free OpenRouter model (avoids hardcoding dead models).
let cached = null;
const TTL = 60 * 60 * 1000;
export async function pickFreeOpenRouterModel() {
    if (cached && Date.now() - cached.ts < TTL)
        return cached.model;
    try {
        const res = await fetch('https://openrouter.ai/api/v1/models', { signal: AbortSignal.timeout(10000) });
        if (!res.ok)
            return undefined;
        const data = await res.json();
        const models = data?.data ?? [];
        const free = models.filter((m) => {
            const p = m?.pricing?.prompt;
            return p === '0' || p === 0 || (typeof p === 'string' && parseFloat(p) === 0);
        });
        // Prefer models whose id contains :free, then any free.
        const pick = free.find((m) => /:free$/i.test(m?.id ?? '')) ?? free[0];
        if (pick?.id) {
            cached = { model: pick.id, ts: Date.now() };
            return pick.id;
        }
    }
    catch { /* noop */ }
    return undefined;
}
