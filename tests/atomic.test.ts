import { atomicWriteJson, readJsonFile } from '../src/utils/atomic';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, it, expect } from 'vitest';

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
    const { readdir } = await import('node:fs/promises');
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
});