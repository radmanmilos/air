// Canonical error taxonomy for air.
// Single source of truth: adapters, run state, traces, CLI output, MCP
// results, and tests all import from here.
//
// ERROR_POLICY is the ONLY action authority. All other helpers are derived
// from it; do not maintain independent lists that could disagree.

export type ErrorCategory =
  | 'RATE_LIMIT'
  | 'QUOTA_EXCEEDED'
  | 'MODEL_UNAVAILABLE'
  | 'AUTH_ERROR'
  | 'NETWORK_ERROR'
  | 'PROCESS_CRASH'
  | 'TOOL_NOT_INSTALLED'
  | 'TIMEOUT'
  | 'USER_CANCELLED'
  | 'PERMISSION_DENIED'
  | 'CONTEXT_LENGTH'
  | 'TASK_FAILURE'
  | 'UNKNOWN';

/** Action air should take when a run ends in this category. */
export type ErrorAction =
  | 'retry_same' // retry the same candidate (e.g. transient network error)
  | 'wait_cooldown' // cooldown this (provider, model); if an eligible alternative exists, propose it; otherwise wait and retry same
  | 'propose_switch' // propose another candidate to the user/MCP client
  | 'stop_ask_user' // stop and ask the user; never auto-retry
  | 'abort'; // abort the task immediately

/** Policy table mapping each category to its canonical action. */
export const ERROR_POLICY: Record<ErrorCategory, ErrorAction> = {
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

export function getErrorAction(category: ErrorCategory): ErrorAction {
  return ERROR_POLICY[category];
}

/** Categories whose action is to stop/abort and must never trigger failover. */
export const NO_FAILOVER_ACTIONS: readonly ErrorAction[] = ['stop_ask_user', 'abort', 'retry_same'];

/** Derived from ERROR_POLICY: true when the action may propose a different candidate. */
export function triggersFailover(category: ErrorCategory): boolean {
  const action = ERROR_POLICY[category];
  return action === 'propose_switch' || action === 'wait_cooldown';
}

/** Derived from ERROR_POLICY: true when the action is to stop/abort with no retry. */
export function isAbortAction(category: ErrorCategory): boolean {
  return ERROR_POLICY[category] === 'abort';
}

/** Derived from ERROR_POLICY: true when the action asks the user before proceeding. */
export function requiresUserDecision(category: ErrorCategory): boolean {
  return ERROR_POLICY[category] === 'stop_ask_user';
}