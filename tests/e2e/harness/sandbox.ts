// tests/e2e/harness/sandbox.ts
// Isolated sandbox for E2E scenarios.

import { mkdtempSync, rmSync, cpSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';

export interface Sandbox {
  dir: string;
  cacheDir: string;
  configDir: string;
  eventLog: string;
  marker: string;
  env: Record<string, string>;
  reset(): void;
  cleanup(): void;
}

export function createSandbox(fixturePath: string, marker?: string): Sandbox {
  const runMarker = marker ?? `air-e2e-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const dir = mkdtempSync(join(tmpdir(), 'air-e2e-'));
  const cacheDir = join(dir, 'cache');
  const configDir = join(dir, 'config');
  const eventLog = join(dir, 'events.jsonl');
  // Copy fixture
  cpSync(fixturePath, dir, { recursive: true });
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
    cacheDir,
    configDir,
    eventLog,
    marker: runMarker,
    env,
    reset() {
      rmSync(dir, { recursive: true, force: true });
      cpSync(fixturePath, dir, { recursive: true });
    },
    cleanup() {
      rmSync(dir, { recursive: true, force: true });
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