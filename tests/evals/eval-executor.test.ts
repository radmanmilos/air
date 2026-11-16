import { describe, expect, it } from 'vitest';
import { executeCoderOracle } from '../../src/evals/sandbox/eval-executor';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('eval-executor fail-closed', () => {
  it('does not apply patch or execute on unsupported platforms', async () => {
    const ws = mkdtempSync(join(tmpdir(), 'air-exec-'));
    writeFileSync(join(ws, 'a.txt'), 'hello\n');
    const before = 'hello\n';
    const patch = '--- a/a.txt\n+++ b/a.txt\n@@ -1 +1 @@\n-hello\n+world\n';
    const result = await executeCoderOracle({ workspacePath: ws, patch, command: 'node -e "process.exit(0)"', timeoutMs: 5000 });
    expect(result.executed).toBe(false);
    expect(result.patchApplied).toBe(false);
    expect(result.sandboxAvailable).toBe(false);
    // file unchanged
    const { readFileSync } = await import('node:fs');
    expect(readFileSync(join(ws, 'a.txt'), 'utf8')).toBe(before);
    rmSync(ws, { recursive: true, force: true });
  });
});
