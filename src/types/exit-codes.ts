// Exit code table (G3-13).
//
// Single source of truth for every air exit code. Adapters, CLI, MCP,
// and tests all import from here.

export const EXIT_CODES = {
  SUCCESS: 0, // SUCCEEDED_WITH_CHANGES, SUCCEEDED_READ_ONLY
  NO_CHANGES: 1, // write task exited 0 with empty diff
  ALL_EXHAUSTED: 2, // hop cap reached, no eligible candidate, or allow-list blocked
  USER_CANCELLED: 3, // CANCELLED
  CONFIG_OR_DIRTY: 4, // config invalid, dirty-tree refused, verify failed
  TIMEOUT: 5, // timed out
  FAILOVER_PROPOSED: 6, // failover proposed but not approved (R5-04)
  TASK_FAILURE: 7, // FAILED, tool exited non-zero with no failover category
} as const;

export type ExitCode = (typeof EXIT_CODES)[keyof typeof EXIT_CODES];

export function exitCodeFor(resultState: string, reason?: string): ExitCode {
  switch (resultState) {
    case 'SUCCEEDED_WITH_CHANGES':
    case 'SUCCEEDED_READ_ONLY':
    case 'NO_CHANGES':
      return EXIT_CODES.SUCCESS;
    case 'CANCELLED':
      return EXIT_CODES.USER_CANCELLED;
    case 'FAILED':
      if (reason === 'timeout') return EXIT_CODES.TIMEOUT;
      return EXIT_CODES.TASK_FAILURE;
    default:
      return EXIT_CODES.ALL_EXHAUSTED;
  }
}

export function formatExitCode(code: ExitCode): string {
  for (const [name, value] of Object.entries(EXIT_CODES)) {
    if (value === code) return `${name} (${code})`;
  }
  return `UNKNOWN (${code})`;
}