import { atomicWriteJson, readJsonFile } from '../src/utils/atomic';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, it, expect, vi, afterEach } from 'vitest';
import * as fsPromises from 'node:fs/promises';

describe('atomic writes (G2-11, R2-11)', () => {
  const dir = join(tmpdir(), `air-atomic-${process.pid}`);

  it('writes JSON atomically and reads it back', async () => {
    const file = join(dir, 'health.json');
    await atomicWriteJson(file, { cooldowns: [], successes: {}, failures: {} });
    const loaded = await readJsonFile<{ cooldowns: unknown[] }>(file);
    expect(loaded?.cooldowns).toEqual([]);
  });

  it('does not leave temp files behind', async () => {
    const file = join(dir, 'state.json');
    await atomicWriteJson(file, { ok: true });
    const entries = await readdir(dir);
    const tmps = entries.filter((e) => e.includes('.tmp.'));
    expect(tmps.length).toBe(0);
  });

  it('returns null for missing files', async () => {
    const loaded = await readJsonFile(join(dir, 'nope.json'));
    expect(loaded).toBeNull();
  });

  it('creates parent directories', async () => {
    const file = join(dir, 'nested', 'deep', 'state.json');
    await atomicWriteJson(file, { ok: true });
    const loaded = await readJsonFile<{ ok: boolean }>(file);
    expect(loaded?.ok).toBe(true);
  });

  describe('transient Windows rename failures', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('retries a transient EPERM instead of failing the write', async () => {
      const realRename = fsPromises.rename;
      let calls = 0;
      const rename = (async (from: string, to: string) => {
        calls += 1;
        if (calls < 3) {
          const error = new Error('EPERM: operation not permitted') as NodeJS.ErrnoException;
          error.code = 'EPERM';
          throw error;
        }
        return realRename(from, to);
      }) as typeof fsPromises.rename;

      const file = join(dir, 'retry.json');
      await atomicWriteJson(file, { ok: true }, { rename });

      expect(calls).toBe(3);
      expect((await readJsonFile<{ ok: boolean }>(file))?.ok).toBe(true);
    });

    it('cleans up the temp file when the rename keeps failing', async () => {
      const rename = (async () => {
        const error = new Error('EPERM: operation not permitted') as NodeJS.ErrnoException;
        error.code = 'EPERM';
        throw error;
      }) as typeof fsPromises.rename;

      const file = join(dir, 'failing', 'state.json');
      await expect(atomicWriteJson(file, { ok: true }, { rename })).rejects.toThrow(/EPERM/);

      const entries = await readdir(join(dir, 'failing'));
      expect(entries.filter((entry) => entry.includes('.tmp.'))).toEqual([]);
    });
  });
});