import { access, readFile, writeFile } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createEvalWorkspace } from './helpers/workspace';

const fixtureSource = resolve(
  dirname(fileURLToPath(import.meta.url)),
  'fixtures/payloads/workspaces/coder-discount',
);

describe('evaluation workspace isolation', () => {
  it('copies a fixture into a fresh workspace without mutating the source', async () => {
    const original = await readFile(join(fixtureSource, 'src/discount.js'), 'utf8');
    const workspace = await createEvalWorkspace('coder-discount');
    try {
      expect(workspace.path).not.toBe(fixtureSource);
      expect(await readFile(join(workspace.path, 'src/discount.js'), 'utf8')).toBe(original);
      await writeFile(join(workspace.path, 'src/discount.js'), 'export const changed = true;\n');
      expect(await readFile(join(fixtureSource, 'src/discount.js'), 'utf8')).toBe(original);
    } finally {
      await workspace.cleanup();
    }
    await expect(access(workspace.path)).rejects.toThrow();
    await workspace.cleanup();
  });

  it('creates distinct workspaces for separate repetitions', async () => {
    const first = await createEvalWorkspace('coder-discount');
    const second = await createEvalWorkspace('coder-discount');
    try {
      expect(first.path).not.toBe(second.path);
      await writeFile(join(first.path, 'run-marker.txt'), 'first');
      await expect(access(join(second.path, 'run-marker.txt'))).rejects.toThrow();
    } finally {
      await Promise.all([first.cleanup(), second.cleanup()]);
    }
  });

  it('rejects traversal and unknown fixture names', async () => {
    await expect(createEvalWorkspace('../coder-discount')).rejects.toThrow(/Invalid evaluation fixture name/);
    await expect(createEvalWorkspace('not-a-fixture')).rejects.toThrow();
  });
});
