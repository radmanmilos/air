import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('failover loop (R5-11)', () => {
  let dir: string;
  let originalMockMode: string | undefined;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'air-failover-'));
    originalMockMode = process.env.MOCK_MODE;
  });

  afterEach(() => {
    if (originalMockMode === undefined) delete process.env.MOCK_MODE;
    else process.env.MOCK_MODE = originalMockMode;
    rmSync(dir, { recursive: true, force: true });
  });

  it('exits with ALL_EXHAUSTED when every candidate fails and no alternative exists', () => {
    process.env.MOCK_MODE = 'rate_limit';
    writeFileSync(join(dir, 'a.txt'), 'hi');
    const tsx = join(process.cwd(), 'node_modules', '.bin', 'tsx');
    const { status } = execFileSync(process.execPath, [
      tsx,
      join(process.cwd(), 'bin/air.ts'),
      'run', 'fix', '--cwd', dir, '--auto', '--no-tty',
    ], { encoding: 'utf8', cwd: process.cwd() });
    expect(status).toBe(2); // ALL_EXHAUSTED
  });
});