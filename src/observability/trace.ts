// Structured JSONL observability (G-02, G-11).
//
// Every routing decision, tool launch, failure classification, and failover
// event is appended as one JSON object per line. Deterministic ordering of
// keys; no secrets (redact runs first).

import { appendFileSync, mkdirSync } from 'node:fs';
import { paths } from '../config/paths';
import { redact } from '../security/redact';

let ensured = false;

function ensureDir() {
  if (ensured) return;
  const dir = paths.cacheDir;
  try { mkdirSync(dir, { recursive: true }); } catch { /* noop */ }
  ensured = true;
}

export interface TraceEvent {
  event: string;
  runId?: string;
  ts?: string;
  [key: string]: unknown;
}

export function trace(event: TraceEvent): void {
  try {
    ensureDir();
    const line = JSON.stringify({ ts: new Date().toISOString(), ...event });
    appendFileSync(paths.logFile, redact(line) + '\n', 'utf8');
  } catch {
    // Observability must never break the run.
  }
}