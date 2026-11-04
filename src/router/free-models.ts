// Runtime discovery of a free OpenRouter model (avoids hardcoding dead models).

const PREFERRED = [
  'google/gemma-4-31b-it:free',
  'meta-llama/llama-3.3-70b-instruct:free',
  'qwen/qwen-2.5-72b-instruct:free',
  'mistralai/mistral-small-3.1-24b-instruct:free',
];

let cached: { model: string; ts: number } | null = null;
const TTL = 60 * 60 * 1000;

export async function pickFreeOpenRouterModel(): Promise<string | undefined> {
  if (cached && Date.now() - cached.ts < TTL) return cached.model;
  try {
    const res = await fetch('https://openrouter.ai/api/v1/models', { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return undefined;
    const data: any = await res.json();
    const models: any[] = data?.data ?? [];
    const ids = new Set(models.map((m) => m?.id));
    // Prefer known-good free models that are currently available.
    for (const p of PREFERRED) {
      if (ids.has(p)) {
        cached = { model: p, ts: Date.now() };
        return p;
      }
    }
    // Fall back to any :free model.
    const free = models.filter((m) => /:free$/i.test(m?.id ?? ''));
    if (free[0]?.id) {
      cached = { model: free[0].id, ts: Date.now() };
      return free[0].id;
    }
  } catch { /* noop */ }
  return undefined;
}