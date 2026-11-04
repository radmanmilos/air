// Result states for a task run. Shared by CLI and MCP responses.
// Natural-language model output alone is never proof of success.
export function isTerminal(_state) {
    return true; // all result states are terminal
}
/** A write task with no diff is never success unless explicitly read-only. */
export function defaultStateForTask(isReadOnly, hasDiff) {
    if (hasDiff)
        return 'SUCCEEDED_WITH_CHANGES';
    if (isReadOnly)
        return 'SUCCEEDED_READ_ONLY';
    return 'NO_CHANGES';
}
