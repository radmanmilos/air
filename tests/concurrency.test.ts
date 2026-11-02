import { acquireSeat, withSeat } from '../src/utils/concurrency';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('cross-process concurrency cap (R5-09)', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'air-seat-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('acquires a seat under the cap', async () => {
    const handle = await acquireSeat('t1', 2, { seatDir: dir, timeoutMs: 1000 });
    expect(handle).toBeTruthy();
    await handle!.release();
  });

  it('blocks when the cap is reached and returns null on timeout', async () => {
    const first = await acquireSeat('t1', 1, { seatDir: dir, timeoutMs: 1000 });
    expect(first).toBeTruthy();
    // Same name: the cap is already held, so the second acquisition must fail.
    const second = await acquireSeat('t1', 1, { seatDir: dir, timeoutMs: 200 });
    expect(second).toBeNull();
    await first!.release();
  });

  it('runs a function while holding a seat', async () => {
    let ran = false;
    const result = await withSeat('t1', 2, async () => {
      ran = true;
      return 7;
    }, { seatDir: dir, timeoutMs: 1000 });
    expect(ran).toBe(true);
    expect(result).toBe(7);
  });
});