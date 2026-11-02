// Inter-process lock for shared state (R5-09).
//
// A lock file is written to `<lockDir>/locks/<name>.lock` containing the
// PID and process start time of the holder. A stale lock is one whose PID
// is no longer alive or whose start time does not match the current
// process. Stale locks are reclaimed automatically.
//
// This is NOT a semaphore: callers must still check `maxConcurrentAgents`
// themselves. The lock only makes read-modify-write sequences atomic.

import { promises as fs, constants as fsConstants } from 'node:fs';
import { join } from 'node:path';
import { paths } from '../config/paths';

export interface LockHandle {
  release: () => Promise<void>;
}

interface LockFile {
  pid: number;
  start: number; // process start time (ms since epoch)
  name: string;
  acquiredAt: number;
}

function processStartTime(): number {
  return Date.now() - process.uptime() * 1000;
}

/** Cached process start time so stale-lock detection is stable across calls. */
const PROCESS_START = processStartTime();

export async function isPidAlive(pid: number): Promise<boolean> {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err: any) {
    // ESRCH = no such process; EPERM = alive but not ours.
    return err?.code !== 'ESRCH';
  }
}

async function readLock(path: string): Promise<LockFile | null> {
  try {
    const raw = await fs.readFile(path, 'utf8');
    return JSON.parse(raw) as LockFile;
  } catch {
    return null;
  }
}

async function writeLock(path: string, data: LockFile): Promise<void> {
  // Open the final lock path with O_CREAT|O_EXCL so the create is atomic:
  // a second process cannot grab the same lock, and an existing lock is
  // never silently overwritten (unlike tmp+rename on POSIX).
  await fs.mkdir(join(path, '..'), { recursive: true });
  try {
    const fd = await fs.open(path, fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_WRONLY, 0o644);
    await fd.writeFile(JSON.stringify(data), 'utf8');
    await fd.close();
  } catch (err: any) {
    if (err?.code === 'EEXIST') {
      const e = new Error(`EEXIST: lock already held`);
      (e as any).code = 'EEXIST';
      throw e;
    }
    throw err;
  }
}

/**
 * Acquire an inter-process lock with a bounded timeout.
 *
 * Returns a handle with a `release()` method, or null if the lock could not
 * be acquired within `timeoutMs`. Stale locks (dead PID or mismatched start
 * time) are reclaimed automatically.
 */
export async function acquireLock(
  name: string,
  options: { lockDir?: string; timeoutMs?: number } = {},
): Promise<LockHandle | null> {
  const lockDir = options.lockDir ?? `${paths.cacheDir}/locks`;
  const path = `${lockDir}/${name}.lock`;
  const deadline = Date.now() + (options.timeoutMs ?? 5000);

  while (true) {
    const existing = await readLock(path);
    let stale = false;
    if (existing) {
      if (existing.start !== PROCESS_START || !(await isPidAlive(existing.pid))) {
        stale = true;
      }
    }

    if (!existing || stale) {
      // Reclaim the stale lock before re-creating so O_CREAT|O_EXCL can
      // succeed. If another process grabbed it in the meantime, retry.
      if (stale) {
        try { await fs.unlink(path); } catch { /* noop */ }
      }
      try {
        await writeLock(path, { pid: process.pid, start: PROCESS_START, name, acquiredAt: Date.now() });
        return {
          release: async () => {
            try {
              const cur = await readLock(path);
              if (cur && cur.pid === process.pid && cur.start === PROCESS_START) {
                await fs.unlink(path);
              }
            } catch { /* noop */ }
          },
        };
      } catch (err: any) {
        if (err?.code !== 'EEXIST') throw err;
      }
    }

    if (Date.now() >= deadline) return null;
    await new Promise((r) => setTimeout(r, 20));
  }
}

/** Run a function while holding an inter-process lock. */
export async function withLock<T>(
  name: string,
  fn: () => Promise<T>,
  options: { lockDir?: string; timeoutMs?: number } = {},
): Promise<T | null> {
  const handle = await acquireLock(name, options);
  if (!handle) return null;
  try {
    return await fn();
  } finally {
    await handle.release();
  }
}

/** Read-modify-write a JSON file under an inter-process lock. */
export async function lockedReadModifyWrite<T>(
  name: string,
  file: string,
  mutate: (current: T | null) => Promise<T>,
  options: { lockDir?: string; timeoutMs?: number } = {},
): Promise<T | null> {
  return withLock(
    name,
    async () => {
      const { readJsonFile, atomicWriteJson } = await import('./atomic');
      const current = await readJsonFile<T>(file);
      const next = await mutate(current);
      await atomicWriteJson(file, next);
      return next;
    },
    options,
  );
}