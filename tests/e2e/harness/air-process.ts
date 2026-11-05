// tests/e2e/harness/air-process.ts
// Spawn AIR built binary, capture output, waitFor, kill tree.

import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { existsSync } from 'node:fs';

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
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    const timer = setTimeout(() => {
      try {
        if (process.platform === 'win32' && child.pid) {
          const { spawn: sp } = require('node:child_process');
          sp('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
        } else {
          try {
            if (process.platform === 'win32' && child.pid) {
              const { spawn: sp } = require('node:child_process');
              sp('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
            } else {
              try { process.kill(child.pid); } catch { /* noop */ }
            }
          } catch { /* noop */ }
        }
      } catch { /* noop */ }
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
        // Check existing lines.
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
    close() { child.stdin.write('/quit\n'); },
    kill() {
      try {
        if (process.platform === 'win32' && child.pid) {
          spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
        } else {
          try {
            if (process.platform === 'win32' && child.pid) {
              const { spawn: sp } = require('node:child_process');
              sp('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
            } else {
              try { process.kill(child.pid); } catch { /* noop */ }
            }
          } catch { /* noop */ }
        }
      } catch { /* noop */ }
    },
    alive() { return !child.killed && child.exitCode === null; },
  };
}