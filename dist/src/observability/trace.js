// Structured JSONL observability (G-02, G-11, G3-07).
//
// Every routing decision, tool launch, failure classification, and failover
// event is appended as one JSON object per line. Deterministic ordering of
// keys; no secrets (redact runs first).
//
// Size-based log rotation: when the log file exceeds `maxBytes`, it is
// rotated to `air.log.N` (N = 1..maxBackups). Redaction still applies after
// rotation — no secrets in any rotated file.
import { appendFileSync, renameSync, statSync, unlinkSync, mkdirSync } from 'node:fs';
import { paths } from '../config/paths';
import { redact } from '../security/redact';
import { DEFAULT_CONFIG } from '../config/schema';
let ensured = false;
let maxBytes = DEFAULT_CONFIG.logging.rotation.maxBytes;
let maxBackups = DEFAULT_CONFIG.logging.rotation.maxBackups;
function ensureDir() {
    if (ensured)
        return;
    const dir = paths.cacheDir;
    try {
        mkdirSync(dir, { recursive: true });
    }
    catch { /* noop */ }
    ensured = true;
}
/** Configure rotation limits. Idempotent. */
export function configureTrace(options = {}) {
    if (options.maxBytes !== undefined)
        maxBytes = options.maxBytes;
    if (options.maxBackups !== undefined)
        maxBackups = options.maxBackups;
}
function rotate() {
    try {
        // Shift backups: air.log.3 -> air.log.4, etc.
        for (let i = maxBackups - 1; i >= 1; i--) {
            const from = `${paths.logFile}.${i}`;
            const to = `${paths.logFile}.${i + 1}`;
            try {
                renameSync(from, to);
            }
            catch { /* source may not exist */ }
        }
        // Drop the oldest backup if we're over the cap.
        try {
            unlinkSync(`${paths.logFile}.${maxBackups}`);
        }
        catch { /* noop */ }
        // Rotate the current log to air.log.1.
        renameSync(paths.logFile, `${paths.logFile}.1`);
    }
    catch {
        // Rotation must never break the run.
    }
}
export function trace(event) {
    try {
        ensureDir();
        const line = JSON.stringify({ ts: new Date().toISOString(), ...event });
        const payload = redact(line) + '\n';
        // Rotate before appending if the file is already over the cap.
        try {
            const st = statSync(paths.logFile);
            if (st.size >= maxBytes)
                rotate();
        }
        catch {
            // File may not exist yet — that's fine.
        }
        appendFileSync(paths.logFile, payload, 'utf8');
    }
    catch {
        // Observability must never break the run.
    }
}
