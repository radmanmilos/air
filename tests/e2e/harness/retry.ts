// tests/e2e/harness/retry.ts
export async function retry<T>(fn: () => Promise<T>, attempts = 3, delayMs = 250): Promise<T> {
  let lastErr: any;
  for (let i = 0; i < attempts; i++) {
    try { return await fn(); } catch (err) { lastErr = err; if (i < attempts - 1) await new Promise((r) => setTimeout(r, delayMs)); }
  }
  throw lastErr;
}