// Cross-process concurrency cap (R5-09).
//
// Enforces `maxConcurrentAgents` across CLI and MCP processes by counting
// active "seat" files under `<cacheDir>/concurrency/<name>.seat`. A seat
// file is created when a run starts and removed when it finishes. A process
// that cannot acquire a seat within `timeoutMs` returns null.
//
// Stale seats (dead PID or mismatched start time) are reclaimed
// automatically, so a crashed AIR does not leave an unrecoverable lock.

import { promises as fs, constants as fsConstants } from 'node:fs';
import { paths } from '../config/paths';
import { isPidAlive } from './lock';

export interface SeatHandle {
  release: () => Promise<void>;
}

function processStartTime(): number {
  return Date.now() - process.uptime() * 1000;
}

/** Cached process start time so stale-seat detection is stable across calls. */
const PROCESS_START = processStartTime();

async function listSeats(dir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dir);
    return entries.filter((e) => e.endsWith('.seat'));
  } catch {
    return [];
  }
}

async function readSeat(path: string): Promise<{ pid: number; start: number } | null> {
  try {
    const raw = await fs.readFile(path, 'utf8');
    return JSON.parse(raw) as { pid: number; start: number };
  } catch {
    return null;
  }
}

async function isSeatStale(path: string): Promise<boolean> {
  const data = await readSeat(path);
  if (!data) return true;
  if (!(await isPidAlive(data.pid))) return true;
  return false;
}

/**
 * Acquire a concurrency seat, enforcing `maxConcurrentAgents` across
 * processes. Returns a handle with `release()`, or null if the cap is
 * reached and the wait timed out.
 */
export async function acquireSeat(
  name: string,
  maxConcurrent: number,
  options: { seatDir?: string; timeoutMs?: number } = {},
): Promise<SeatHandle | null> {
  const seatDir = options.seatDir ?? `${paths.cacheDir}/concurrency`;
  const path = `${seatDir}/${name}.seat`;
  const start = PROCESS_START;
  const deadline = Date.now() + (options.timeoutMs ?? 30_000);

  await fs.mkdir(seatDir, { recursive: true });

  // Reclaim stale seats before counting.
  const seats = await listSeats(seatDir);
  for (const s of seats) {
    if (await isSeatStale(`${seatDir}/${s}`)) {
      try { await fs.unlink(`${seatDir}/${s}`); } catch { /* noop */ }
    }
  }

while (true) {
    const current = (await listSeats(seatDir)).length;
    if (current < maxConcurrent) {
      try {
        // O_CREAT|O_EXCL so the create is atomic: a second process cannot
        // grab the same seat, and an existing seat is never silently
        // overwritten (unlike tmp+rename on POSIX).
        const fd = await fs.open(path, fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_WRONLY, 0o644);
        await fd.writeFile(JSON.stringify({ pid: process.pid, start }), 'utf8');
        await fd.close();
        return {
          release: async () => {
            try { await fs.unlink(path); } catch { /* noop */ }
          },
        };
      } catch { /* retry */ }
    }
    if (Date.now() >= deadline) return null;
    await new Promise((r) => setTimeout(r, 50));
  }
}

/** Run a function while holding a concurrency seat. */
export async function withSeat<T>(
  name: string,
  maxConcurrent: number,
  fn: () => Promise<T>,
  options: { seatDir?: string; timeoutMs?: number } = {},
): Promise<T | null> {
  const handle = await acquireSeat(name, maxConcurrent, options);
  if (!handle) return null;
  try {
    return await fn();
  } finally {
    await handle.release();
  }
}