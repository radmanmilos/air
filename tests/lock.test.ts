import { acquireLock, withLock, lockedReadModifyWrite } from '../src/utils/lock';
import { atomicWriteJson, readJsonFile } from '../src/utils/atomic';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('inter-process lock (R5-09)', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'air-lock-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('acquires and releases a lock', async () => {
    const handle = await acquireLock('test', { lockDir: dir, timeoutMs: 1000 });
    expect(handle).toBeTruthy();
    await handle!.release();
  });

  it('returns null when the lock cannot be acquired within the timeout', async () => {
    const handle = await acquireLock('test', { lockDir: dir, timeoutMs: 1000 });
    expect(handle).toBeTruthy();
    // A second acquisition of the same name should fail fast.
    const second = await acquireLock('test', { lockDir: dir, timeoutMs: 200 });
    expect(second).toBeNull();
    await handle!.release();
  });

  it('reclaims a stale lock (dead PID)', async () => {
    // Write a lock file pointing at a PID that does not exist.
    const lockPath = `${dir}/stale.lock`;
    await atomicWriteJson(lockPath, { pid: 999_999_999, start: 1, name: 'stale', acquiredAt: 0 });
    const handle = await acquireLock('stale', { lockDir: dir, timeoutMs: 1000 });
    expect(handle).toBeTruthy();
    await handle!.release();
  });

  it('withLock runs the function and releases on return', async () => {
    let ran = false;
    const result = await withLock('test', async () => {
      ran = true;
      return 42;
    }, { lockDir: dir, timeoutMs: 1000 });
    expect(ran).toBe(true);
    expect(result).toBe(42);
  });

  it('withLock returns null when the lock cannot be acquired', async () => {
    const first = await acquireLock('test', { lockDir: dir, timeoutMs: 1000 });
    expect(first).toBeTruthy();
    const result = await withLock('test', async () => 42, { lockDir: dir, timeoutMs: 200 });
    expect(result).toBeNull();
    await first!.release();
  });

  it('lockedReadModifyWrite makes read-modify-write atomic', async () => {
    const file = `${dir}/state.json`;
    const result = await lockedReadModifyWrite<{ ids: string[] }>(
      'test',
      file,
      async (current) => {
        const ids = current?.ids ?? [];
        ids.push('a');
        return { ids };
      },
      { lockDir: dir, timeoutMs: 1000 },
    );
    expect(result?.ids).toEqual(['a']);
    const reloaded = await readJsonFile<{ ids: string[] }>(file);
    expect(reloaded?.ids).toEqual(['a']);
  });
});