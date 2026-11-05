// tests/e2e/harness/chat-driver.ts
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';

const AIR_BIN = join(process.cwd(), 'dist', 'bin', 'air.js');

function killTree(pid: number | null): void {
  if (!pid) return;
  if (process.platform === 'win32') {
    try {
      const { spawn: sp } = require('node:child_process');
      sp('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
    } catch { /* noop */ }
  } else {
    try { process.kill(-pid, 'SIGKILL'); } catch { /* noop */ }
  }
  try { process.kill(pid, 'SIGKILL'); } catch { /* noop */ }
}

export interface ChatSession {
  say(line: string): number;
  waitForLine(re: RegExp, afterMs: number, timeoutMs: number): Promise<{ t: number; line: string }>;
  latency(sentAt: number, re: RegExp, timeoutMs: number): Promise<number>;
  lines(): { t: number; line: string }[];
  events(): any[];
  quit(): Promise<void>;
}

export function startChat(env: Record<string, string>, cwd: string, args: string[] = ['chat']): ChatSession {
  const start = Date.now();
  const child = spawn(process.execPath, [AIR_BIN, ...args], {
    cwd,
    env: { ...process.env, ...env },
    stdio: ['pipe', 'pipe', 'pipe'],
    detached: process.platform !== 'win32',
  });
  const lines: { t: number; line: string }[] = [];
  const waiters: Array<{ re: RegExp; afterMs: number; resolve: (v: { t: number; line: string }) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }> = [];

  const handleChunk = (chunk: Buffer | string) => {
    const text = chunk.toString();
    for (const line of text.split(/\r?\n/)) {
      if (!line) continue;
      const entry = { t: Date.now() - start, line };
      lines.push(entry);
      for (let i = waiters.length - 1; i >= 0; i--) {
        const w = waiters[i];
        if (entry.t >= w.afterMs && w.re.test(line)) {
          clearTimeout(w.timer);
          w.resolve(entry);
          waiters.splice(i, 1);
        }
      }
    }
  };
  child.stdout.on('data', handleChunk);
  child.stderr.on('data', handleChunk);

  const session: ChatSession = {
    say(line: string): number {
      const t = Date.now() - start;
      try { child.stdin.write(line + '\n'); } catch { /* noop */ }
      return t;
    },
    waitForLine(re: RegExp, afterMs: number, timeoutMs: number): Promise<{ t: number; line: string }> {
      for (const e of lines) {
        if (e.t >= afterMs && re.test(e.line)) return Promise.resolve(e);
      }
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          const idx = waiters.findIndex((w) => w.resolve === resolve);
          if (idx >= 0) waiters.splice(idx, 1);
          reject(new Error(`waitForLine timeout after ${timeoutMs}ms`));
        }, timeoutMs);
        waiters.push({ re, afterMs, resolve, reject, timer });
      });
    },
    async latency(sentAt: number, re: RegExp, timeoutMs: number): Promise<number> {
      const e = await this.waitForLine(re, sentAt, timeoutMs);
      return e.t - sentAt;
    },
    lines(): { t: number; line: string }[] { return [...lines]; },
    events(): any[] {
      const eventLog = env.AIR_EVENT_LOG;
      if (!eventLog) return [];
      try {
        return readFileSync(eventLog, 'utf8').trim().split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
      } catch { return []; }
    },
    async quit(): Promise<void> {
      try { child.stdin.write('/quit\n'); } catch { /* noop */ }
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => { killTree(child.pid ?? null); resolve(); }, 5000);
        child.on('close', () => { clearTimeout(timer); resolve(); });
      });
    },
  };
  // env captured in closure via parameter; store for events()
  (session as any)._env = env;
  return session;
}