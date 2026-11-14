import { describe, expect, it } from 'vitest';
import { applyUnifiedDiff } from '../../src/evals/sandbox/patch-applier';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('patch-applier', () => {
  function makeWorkspace(): string {
    const dir = mkdtempSync(join(tmpdir(), 'air-ws-'));
    writeFileSync(join(dir, 'a.txt'), 'hello\nworld\n');
    return dir;
  }

  it('applies a valid unified diff inside the workspace', () => {
    const ws = makeWorkspace();
    const patch = `--- a/a.txt\n+++ b/a.txt\n@@ -1,2 +1,2 @@\n hello\n-world\n+earth\n`;
    const res = applyUnifiedDiff(ws, patch);
    expect(res.ok).toBe(true);
    expect(readFileSync(join(ws, 'a.txt'), 'utf8')).toContain('earth');
    rmSync(ws, { recursive: true, force: true });
  });

  it('rejects empty patch', () => {
    const ws = makeWorkspace();
    const res = applyUnifiedDiff(ws, '   ');
    expect(res.ok).toBe(false);
    rmSync(ws, { recursive: true, force: true });
  });

  it('rejects path traversal', () => {
    const ws = makeWorkspace();
    const patch = `--- a/../escape.txt\n+++ b/../escape.txt\n@@ -0,0 +1,1 @@\n+x\n`;
    const res = applyUnifiedDiff(ws, patch);
    expect(res.ok).toBe(false);
    rmSync(ws, { recursive: true, force: true });
  });

  it('rejects absolute paths', () => {
    const ws = makeWorkspace();
    const patch = `--- a//etc/passwd\n+++ b//etc/passwd\n@@ -0,0 +1,1 @@\n+x\n`;
    const res = applyUnifiedDiff(ws, patch);
    expect(res.ok).toBe(false);
    rmSync(ws, { recursive: true, force: true });
  });

  it('does not modify workspace on malformed patch', () => {
    const ws = makeWorkspace();
    const before = readFileSync(join(ws, 'a.txt'), 'utf8');
    const res = applyUnifiedDiff(ws, 'not a diff at all');
    expect(res.ok).toBe(false);
    expect(readFileSync(join(ws, 'a.txt'), 'utf8')).toBe(before);
    rmSync(ws, { recursive: true, force: true });
  });
});
