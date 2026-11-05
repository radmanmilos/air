// Inter-process lock for shared state (R5-09).
//
// A lock file is written to `<lockDir>/locks/<name>.lock` containing the
// PID, process start time, and a unique ownership token of the holder. A
// stale lock is one whose PID is no longer alive. Empty/unparseable files
// are treated as stale only after a grace period so a partially-written
// lock is not reclaimed mid-write. Reclamation and release verify the
// ownership token before unlinking to avoid races with a new holder.
import { promises as fs, constants as fsConstants } from 'node:fs';
import { paths } from '../config/paths.js';
const GRACE_MS = 2000;
function processStartTime() {
    return Date.now() - process.uptime() * 1000;
}
const PROCESS_START = processStartTime();
export async function isPidAlive(pid) {
    try {
        process.kill(pid, 0);
        return true;
    }
    catch (err) {
        return err?.code !== 'ESRCH';
    }
}
async function readLock(path) {
    try {
        const raw = await fs.readFile(path, 'utf8');
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed.pid !== 'number')
            return null;
        return {
            pid: parsed.pid,
            start: parsed.start ?? 0,
            name: parsed.name ?? '',
            token: parsed.token ?? '',
            acquiredAt: parsed.acquiredAt ?? 0,
        };
    }
    catch {
        return null;
    }
}
function makeToken() {
    return `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
async function safeUnlinkIfToken(path, token) {
    try {
        const cur = await readLock(path);
        if (cur && cur.token === token) {
            await fs.unlink(path);
            return true;
        }
    }
    catch { /* noop */ }
    return false;
}
export async function acquireLock(name, options = {}) {
    const lockDir = options.lockDir ?? `${paths.cacheDir}/locks`;
    const path = `${lockDir}/${name}.lock`;
    const deadline = Date.now() + (options.timeoutMs ?? 5000);
    await fs.mkdir(lockDir, { recursive: true });
    while (true) {
        const existing = await readLock(path);
        let stale = false;
        let statMtime = 0;
        try {
            statMtime = (await fs.stat(path)).mtimeMs;
        }
        catch { /* file gone */ }
        if (existing) {
            if (!(await isPidAlive(existing.pid))) {
                stale = true;
            }
        }
        else {
            // Empty/unparseable: stale only after grace period.
            if (statMtime > 0 && Date.now() - statMtime >= GRACE_MS) {
                stale = true;
            }
        }
        if (!existing || stale) {
            // Reclaim stale lock only if token still matches (or file empty after grace).
            if (stale && existing) {
                await safeUnlinkIfToken(path, existing.token);
            }
            else if (stale && !existing) {
                try {
                    await fs.unlink(path);
                }
                catch { /* noop */ }
            }
            const token = makeToken();
            try {
                const fd = await fs.open(path, fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_WRONLY, 0o644);
                await fd.writeFile(JSON.stringify({ pid: process.pid, start: PROCESS_START, name, token, acquiredAt: Date.now() }), 'utf8');
                await fd.close();
                return {
                    release: async () => {
                        await safeUnlinkIfToken(path, token);
                    },
                };
            }
            catch (err) {
                if (err?.code !== 'EEXIST')
                    throw err;
            }
        }
        if (Date.now() >= deadline)
            return null;
        await new Promise((r) => setTimeout(r, 20));
    }
}
export async function withLock(name, fn, options = {}) {
    const handle = await acquireLock(name, options);
    if (!handle)
        return null;
    try {
        return await fn();
    }
    finally {
        await handle.release();
    }
}
export async function lockedReadModifyWrite(name, file, mutate, options = {}) {
    return withLock(name, async () => {
        const { readJsonFile, atomicWriteJson } = await import('./atomic.js');
        const current = await readJsonFile(file);
        const next = await mutate(current);
        await atomicWriteJson(file, next);
        return next;
    }, options);
}
