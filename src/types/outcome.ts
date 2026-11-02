// Normalized process outcome owned by the shared process runner.
// Process facts (timedOut, cancelled, spawnError) take precedence over
// generic adapter stderr matching.

export interface CapturedOutput {
  content: string; // redacted, UTF-8 byte-capped capture
  bytes: number; // UTF-8 byte length of content
  truncated: boolean; // true when more bytes were emitted than retained
  fullTruncated: boolean; // true when the whole stream was truncated
}

export interface ProcessOutcome {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  spawnError?: { code?: string; message: string };
  timedOut: boolean;
  cancelled: boolean;
  stdout: string; // bounded/redacted capture
  stderr: string; // bounded/redacted capture
  stdoutBytes: number;
  stderrBytes: number;
  stdoutTruncated: boolean;
  stderrTruncated: boolean;
  stdoutTail?: string; // redacted rolling tail for handoff
  stderrTail?: string;
  startedAt: string;
  endedAt: string;
  durationMs: number;
}

export function classifyOutcome(outcome: ProcessOutcome): { category: 'TIMEOUT' | 'USER_CANCELLED' | 'PROCESS_CRASH' | 'TOOL_NOT_INSTALLED' | null } {
  if (outcome.cancelled) return { category: 'USER_CANCELLED' };
  if (outcome.timedOut) return { category: 'TIMEOUT' };
  if (outcome.spawnError) {
    const code = outcome.spawnError.code || '';
    if (code === 'ENOENT' || /not found|not installed/i.test(outcome.spawnError.message)) {
      return { category: 'TOOL_NOT_INSTALLED' };
    }
    return { category: 'PROCESS_CRASH' };
  }
  if (outcome.signal) return { category: 'PROCESS_CRASH' };
  return { category: null };
}

/** Count UTF-8 bytes of a string. */
export function utf8Bytes(s: string): number {
  return Buffer.byteLength(s, 'utf8');
}

/** Append a chunk to a rolling tail buffer, keeping only the last `cap` bytes. */
export function appendTail(buf: string, chunk: string, cap: number): { content: string; bytes: number; truncated: boolean; fullTruncated: boolean } {
  const next = buf + chunk;
  const bytes = utf8Bytes(next);
  if (bytes <= cap) {
    return { content: next, bytes, truncated: false, fullTruncated: false };
  }
  // Keep the tail: drop bytes from the front until we are under the cap.
  let out = next;
  while (utf8Bytes(out) > cap) {
    out = out.slice(1);
  }
  return { content: out, bytes: utf8Bytes(out), truncated: true, fullTruncated: true };
}