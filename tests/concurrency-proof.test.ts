import { describe, it, expect } from 'vitest';
import { acquireSeat } from '../src/utils/concurrency';

describe('concurrency proof (T-037)', () => {
  it('respects cap of 2', async () => {
    const h1 = await acquireSeat('proof', 2);
    const h2 = await acquireSeat('proof', 2);
    const h3 = await acquireSeat('proof', 2, { timeoutMs: 200 });
    expect(h1).not.toBeNull();
    expect(h2).not.toBeNull();
    expect(h3).toBeNull();
    await h1!.release();
    await h2!.release();
  });
});
