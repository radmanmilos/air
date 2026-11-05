// tests/e2e/harness/air-process.ts
// Spawn AIR built binary, capture output, waitFor, kill tree.

import { spawn } from 'node:child_process';
import { join } from 'node:path';

function killTree(pid: number | null): void {
  if (!pid) return;
  if (process.platform === 'win32') {
    try {
      const { spawn: sp } = require('node:child_process');
      sp('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
    } catch { /* noop */ }
    try { process.kill(pid, 'SIGKILL'); } catch { /* noop */ }
  } else {
    try { process.kill(-pid, 'SIGKILL'); } catch { /* noop */ }
    try { process.kill(pid, 'SIGKILL'); } catch { /* noop */ }
  }
}

export interface AirRunResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  durationMs: number;
}

export interface AirProcess {
  stdout: string;
  stderr: string;
  pid: number | null;
  say(line: string): void;
  waitFor(pattern: RegExp | ((line: string) => boolean), timeoutMs: number): Promise<string>;
  close(): void;
  kill(): void;
  alive(): boolean;
}

const AIR_BIN = join(process.cwd(), 'dist', 'bin', 'air.js');

export async function airOnce(
  args: string[],
  env: Record<string, string>,
  cwd: string,
  timeoutMs = 60000,
): Promise<AirRunResult> {
  const start = Date.now();
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [AIR_BIN, ...args], {
      cwd,
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: process.platform !== 'win32',
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    const timer = setTimeout(() => {
      killTree(child.pid ?? null);
      resolve({ stdout, stderr, exitCode: null, durationMs: Date.now() - start });
    }, timeoutMs);
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, exitCode: code, durationMs: Date.now() - start });
    });
  });
}

export function airSpawn(
  args: string[],
  env: Record<string, string>,
  cwd: string,
): AirProcess {
  const child = spawn(process.execPath, [AIR_BIN, ...args], {
    cwd,
    env: { ...process.env, ...env },
    stdio: ['pipe', 'pipe', 'pipe'],
    detached: process.platform !== 'win32',
  });
  const lines: string[] = [];
  let stdout = '';
  let stderr = '';
  const waiters: Array<{ pred: (line: string) => boolean; resolve: (line: string) => void; reject: (err: Error) => void; timer: NodeJS.Timeout }> = [];
  child.stdout.on('data', (d) => {
    const chunk = d.toString();
    stdout += chunk;
    for (const line of chunk.split('\n')) {
      if (!line) continue;
      lines.push(line);
      for (let i = waiters.length - 1; i >= 0; i--) {
        if (waiters[i].pred(line)) {
          clearTimeout(waiters[i].timer);
          waiters[i].resolve(line);
          waiters.splice(i, 1);
        }
      }
    }
  });
  child.stderr.on('data', (d) => { stderr += d.toString(); });
  return {
    get stdout() { return stdout; },
    get stderr() { return stderr; },
    pid: child.pid ?? null,
    say(line: string) { child.stdin.write(line + '\n'); },
    waitFor(pattern, timeoutMs) {
      const pred = typeof pattern === 'function' ? pattern : (line: string) => pattern.test(line);
      return new Promise((resolve, reject) => {
        for (const line of lines) {
          if (pred(line)) { resolve(line); return; }
        }
        const timer = setTimeout(() => {
          const idx = waiters.findIndex((w) => w.resolve === resolve);
          if (idx >= 0) waiters.splice(idx, 1);
          reject(new Error(`waitFor timeout after ${timeoutMs}ms. Last 10 lines:\n${lines.slice(-10).join('\n')}`));
        }, timeoutMs);
        waiters.push({ pred, resolve, reject, timer });
      });
    },
    close() { try { child.stdin.write('/quit\n'); } catch { /* noop */ } },
     kill() {
       killTree(child.pid ?? null);
       try { child.kill('SIGKILL'); } catch { /* noop */ }
     },
    alive() { return !child.killed && child.exitCode === null; },
  };
}