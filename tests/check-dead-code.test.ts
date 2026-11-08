import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SCRIPT = join(process.cwd(), 'scripts/check-dead-code.mjs');
const TARGET = join(process.cwd(), 'src/config/catalog.ts');
const PROBE = '\nexport const probeUnusedDeadCode = "x";\n';

function runCheck(): number {
  try {
    execFileSync(process.execPath, [SCRIPT], { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
    return 0;
  } catch {
    return 1;
  }
}

describe('scripts/check-dead-code.mjs', () => {
  it('passes on the current codebase (baseline unused exports only)', () => {
    expect(runCheck()).toBe(0);
  });

  it('fails when a new unused export is introduced', () => {
    const original = readFileSync(TARGET, 'utf8');
    try {
      writeFileSync(TARGET, original + PROBE);
      expect(runCheck()).toBe(1);
    } finally {
      writeFileSync(TARGET, original);
    }
  });
});
