// Atomic file write: write to a temp file in the same directory, then rename.
// Safe under concurrent CLI + MCP processes.
//
// Windows can fail `rename` with EPERM/EACCES/EBUSY when another process (an
// antivirus scanner, the search indexer, or a concurrent reader) briefly holds
// the destination open. Those errors are transient, so the rename is retried a
// few times before the write is reported as failed. The temp file is removed
// on final failure so a crash does not leave debris behind.
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
const RETRYABLE_RENAME_CODES = new Set(['EPERM', 'EACCES', 'EBUSY']);
const RENAME_ATTEMPTS = 5;
const RENAME_BASE_DELAY_MS = 10;
function isRetryable(error) {
    const code = error?.code;
    return code !== undefined && RETRYABLE_RENAME_CODES.has(code);
}
function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
async function renameWithRetry(tmp, filePath, rename = fs.rename) {
    for (let attempt = 1;; attempt += 1) {
        try {
            await rename(tmp, filePath);
            return;
        }
        catch (error) {
            if (attempt >= RENAME_ATTEMPTS || !isRetryable(error))
                throw error;
            await delay(RENAME_BASE_DELAY_MS * attempt);
        }
    }
}
export async function atomicWriteFile(filePath, contents, options = {}) {
    const dir = join(filePath, '..');
    await fs.mkdir(dir, { recursive: true });
    const tmp = `${filePath}.tmp.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}`;
    await fs.writeFile(tmp, contents, 'utf8');
    try {
        await renameWithRetry(tmp, filePath, options.rename);
    }
    catch (error) {
        await fs.rm(tmp, { force: true }).catch(() => undefined);
        throw error;
    }
}
export async function atomicWriteJson(filePath, value, options = {}) {
    await atomicWriteFile(filePath, JSON.stringify(value, null, 2) + '\n', options);
}
export async function readJsonFile(filePath) {
    try {
        const raw = await fs.readFile(filePath, 'utf8');
        return JSON.parse(raw);
    }
    catch {
        return null;
    }
}
