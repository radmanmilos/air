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

interface SeatFile {
  pid: number;
  start: number;
  token: string;
  acquiredAt: number;
}

const GRACE_MS = 2000;

async function readSeat(path: string): Promise<SeatFile | null> {
  try {
    const raw = await fs.readFile(path, 'utf8');
    const parsed = JSON.parse(raw) as SeatFile;
    if (!parsed || typeof parsed.pid !== 'number' || typeof parsed.token !== 'string') return null;
    return parsed;
  } catch {
    return null;
  }
}

function makeToken(): string {
  return `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
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
  const deadline = Date.now() + (options.timeoutMs ?? 30_000);

  await fs.mkdir(seatDir, { recursive: true });

  const slots = Array.from({ length: Math.max(1, maxConcurrent) }, (_, i) => i);

  function slotPath(i: number): string {
    return `${seatDir}/${name}-${i}.seat`;
  }

  async function reclaimStale(): Promise<void> {
    for (const i of slots) {
      const p = slotPath(i);
      try {
        const stat = await fs.stat(p);
        const data = await readSeat(p);
        // Empty/unparseable: stale only after grace period.
        if (!data) {
          if (Date.now() - stat.mtimeMs >= GRACE_MS) {
            await fs.unlink(p).catch(() => {});
          }
          continue;
        }
        if (!(await isPidAlive(data.pid))) {
          // Re-check token before unlink to avoid clobbering a new seat.
          const recheck = await readSeat(p);
          if (recheck && recheck.token === data.token) {
            await fs.unlink(p).catch(() => {});
          }
        }
      } catch { /* noop */ }
    }
  }

  await reclaimStale();

  while (true) {
    for (const i of slots) {
      const p = slotPath(i);
      try {
        const token = makeToken();
        const fd = await fs.open(p, fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_WRONLY, 0o644);
        await fd.writeFile(JSON.stringify({ pid: process.pid, start: PROCESS_START, token, acquiredAt: Date.now() }), 'utf8');
        await fd.close();
        return {
          release: async () => {
            try {
              const cur = await readSeat(p);
              if (cur && cur.token === token) await fs.unlink(p);
            } catch { /* noop */ }
          },
        };
      } catch { /* slot taken or race; try next */ }
    }
    if (Date.now() >= deadline) return null;
    await reclaimStale();
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