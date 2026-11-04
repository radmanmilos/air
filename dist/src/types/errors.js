// Canonical error taxonomy for air.
// Single source of truth: adapters, run state, traces, CLI output, MCP
// results, and tests all import from here.
//
// ERROR_POLICY is the ONLY action authority. All other helpers are derived
// from it; do not maintain independent lists that could disagree.
/** Policy table mapping each category to its canonical action. */
export const ERROR_POLICY = {
    RATE_LIMIT: 'wait_cooldown',
    QUOTA_EXCEEDED: 'wait_cooldown',
    MODEL_UNAVAILABLE: 'propose_switch',
    AUTH_ERROR: 'stop_ask_user',
    NETWORK_ERROR: 'retry_same',
    PROCESS_CRASH: 'propose_switch',
    TOOL_NOT_INSTALLED: 'stop_ask_user',
    TIMEOUT: 'propose_switch',
    USER_CANCELLED: 'abort',
    PERMISSION_DENIED: 'stop_ask_user',
    CONTEXT_LENGTH: 'propose_switch',
    TASK_FAILURE: 'stop_ask_user',
    UNKNOWN: 'stop_ask_user',
};
export function getErrorAction(category) {
    return ERROR_POLICY[category];
}
/** Categories whose action is to stop/abort and must never trigger failover. */
export const NO_FAILOVER_ACTIONS = ['stop_ask_user', 'abort', 'retry_same'];
/** Derived from ERROR_POLICY: true when the action may propose a different candidate. */
export function triggersFailover(category) {
    const action = ERROR_POLICY[category];
    return action === 'propose_switch' || action === 'wait_cooldown';
}
/** Derived from ERROR_POLICY: true when the action is to stop/abort with no retry. */
export function isAbortAction(category) {
    return ERROR_POLICY[category] === 'abort';
}
/** Derived from ERROR_POLICY: true when the action asks the user before proceeding. */
export function requiresUserDecision(category) {
    return ERROR_POLICY[category] === 'stop_ask_user';
}
