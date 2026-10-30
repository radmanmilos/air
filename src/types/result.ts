// Result states for a task run. Shared by CLI and MCP responses.
// Natural-language model output alone is never proof of success.

export type ResultState =
  | 'SUCCEEDED_WITH_CHANGES' // exit 0 with non-empty diff
  | 'SUCCEEDED_READ_ONLY' // read-only task; empty diff is a valid outcome
  | 'NO_CHANGES' // write task; exit 0 with empty diff
  | 'FAILED' // task failure
  | 'CANCELLED' // user cancelled
  | 'NEEDS_USER_REVIEW'; // ambiguous state; requires human judgment

export function isTerminal(state: ResultState): boolean {
  return true; // all result states are terminal
}

/** A write task with no diff is never success unless explicitly read-only. */
export function defaultStateForTask(isReadOnly: boolean, hasDiff: boolean): ResultState {
  if (hasDiff) return 'SUCCEEDED_WITH_CHANGES';
  if (isReadOnly) return 'SUCCEEDED_READ_ONLY';
  return 'NO_CHANGES';
}