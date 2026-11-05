// tests/e2e/harness/sandbox.ts
// Isolated sandbox for E2E scenarios.

import { mkdtempSync, rmSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

export interface Sandbox {
  dir: string;
  repoDir: string;
  stateDir: string;
  cacheDir: string;
  configDir: string;
  eventLog: string;
  marker: string;
  env: Record<string, string>;
  reset(): void;
  cleanup(): void;
}

const FIXTURE_LOCK = join(process.cwd(), 'tests', 'e2e', 'fixtures', 'fixture.lock');

function hashDirectory(dir: string): string {
  const h = createHash('sha256');
  const scan = (d: string) => {
    if (!existsSync(d)) return;
    for (const e of readdirSync(d)) {
      if (e === 'obj' || e === 'bin' || e.startsWith('.')) continue;
      const p = join(d, e);
      try {
        const st = statSync(p);
        if (st.isDirectory()) scan(p);
        else if (!e.endsWith('.dll') && !e.endsWith('.exe') && !e.endsWith('.pdb')) {
          h.update(p);
          h.update(readFileSync(p));
        }
      } catch { /* noop */ }
    }
  };
  scan(dir);
  return h.digest('hex');
}

function verifyFixtureLock(fixturePath: string): void {
  if (!fixturePath.includes('taskboard')) return;
  if (!existsSync(FIXTURE_LOCK)) return;
  const lock = readFileSync(FIXTURE_LOCK, 'utf8');
  const m = lock.match(/fixture_sha256:\s*([0-9a-f]+)/);
  if (!m) return;
  const expected = m[1];
  const actual = hashDirectory(fixturePath);
  if (actual !== expected) {
    throw new Error(`Fixture hash mismatch for ${fixturePath}: expected ${expected}, got ${actual}. Refusing to run.`);
  }
}

export function createSandbox(fixturePath: string, marker?: string): Sandbox {
  verifyFixtureLock(fixturePath);
  const runMarker = marker ?? `air-e2e-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const dir = mkdtempSync(join(tmpdir(), 'air-e2e-'));
  const repoDir = join(dir, 'repo');
  const stateDir = join(dir, 'state');
  const cacheDir = join(stateDir, 'cache');
  const configDir = join(stateDir, 'config');
  const eventLog = join(stateDir, 'events.jsonl');
  mkdirSync(repoDir, { recursive: true });
  mkdirSync(stateDir, { recursive: true });
  // Copy fixture into repo/
  cpSync(fixturePath, repoDir, { recursive: true });
  const fakeExecDir = join(process.cwd(), 'tests', 'e2e', 'harness', 'fake-executors');
  const env: Record<string, string> = {
    AIR_CACHE_DIR: cacheDir,
    AIR_CONFIG_DIR: configDir,
    AIR_EVENT_LOG: eventLog,
    AIR_E2E_MARKER: runMarker,
    NO_COLOR: '1',
    PATH: `${fakeExecDir}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH}`,
  };
  const sandbox: Sandbox = {
    dir,
    repoDir,
    stateDir,
    cacheDir,
    configDir,
    eventLog,
    marker: runMarker,
    env,
    reset() {
      for (let i = 0; i < 5; i++) {
        try {
          rmSync(repoDir, { recursive: true, force: true });
          mkdirSync(repoDir, { recursive: true });
          cpSync(fixturePath, repoDir, { recursive: true });
          return;
        } catch {
          const start = Date.now();
          while (Date.now() - start < 500) { /* busy wait */ }
        }
      }
    },
    cleanup() {
      for (let i = 0; i < 5; i++) {
        try {
          rmSync(dir, { recursive: true, force: true });
          return;
        } catch {
          const start = Date.now();
          while (Date.now() - start < 500) { /* busy wait */ }
        }
      }
    },
  };
  return sandbox;
}

export function gitClean(dir: string): boolean {
  try {
    const out = execFileSync('git', ['status', '--porcelain'], { cwd: dir, encoding: 'utf8' });
    return out.trim() === '';
  } catch {
    return false;
  }
}