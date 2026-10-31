// Normalized process outcome owned by the shared process runner.
// Process facts (timedOut, cancelled, spawnError) take precedence over
// generic adapter stderr matching.

export interface ProcessOutcome {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  spawnError?: { code?: string; message: string };
  timedOut: boolean;
  cancelled: boolean;
  stdout: string; // bounded/redacted capture or structured event reference
  stderr: string; // bounded/redacted capture
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