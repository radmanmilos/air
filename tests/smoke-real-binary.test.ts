// Real-binary smoke tests for verified adapters.
//
// Gated by AIR_SMOKE_TEST=1. Default `npm test` skips these entirely so
// no real adapter binaries are required for the standard test run.
// When AIR_SMOKE_TEST=1, each test checks whether its target binary is on
// PATH; if not, the test is skipped.

import { execFileSync } from 'node:child_process';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function binaryOnPath(name: string): boolean {
  try {
    execFileSync(name, ['--version'], { stdio: 'pipe', timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

const SMOKE = process.env.AIR_SMOKE_TEST === '1';

describe.skipIf(!SMOKE)('real-binary smoke tests', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'air-smoke-'));
    writeFileSync(join(dir, 'hello.txt'), 'hello world');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it.skipIf(!binaryOnPath('aider'))('aider smoke test', () => {
    const out = execFileSync('npx', ['aider', '--read', '--message', 'read hello.txt'], {
      cwd: dir,
      stdio: 'pipe',
      timeout: 60_000,
      encoding: 'utf8',
    });
    expect(out).toBeTruthy();
  });

  it.skipIf(!binaryOnPath('goose'))('goose smoke test', () => {
    const out = execFileSync('goose', ['--version'], {
      stdio: 'pipe',
      timeout: 30_000,
      encoding: 'utf8',
    });
    expect(out).toBeTruthy();
  });

  it.skipIf(!binaryOnPath('opencode'))('opencode smoke test', () => {
    const out = execFileSync('opencode', ['--version'], {
      stdio: 'pipe',
      timeout: 30_000,
      encoding: 'utf8',
    });
    expect(out).toBeTruthy();
  });

  it.skipIf(!binaryOnPath('kilocode'))('kilocode smoke test', () => {
    const out = execFileSync('kilocode', ['--version'], {
      stdio: 'pipe',
      timeout: 30_000,
      encoding: 'utf8',
    });
    expect(out).toBeTruthy();
  });

  it.skipIf(!binaryOnPath('codex'))('codex smoke test', () => {
    const out = execFileSync('codex', ['--version'], {
      stdio: 'pipe',
      timeout: 30_000,
      encoding: 'utf8',
    });
    expect(out).toBeTruthy();
  });
});
