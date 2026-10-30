// Canonical error taxonomy for air.
// Single source of truth: adapters, run state, traces, CLI output, MCP
// results, and tests all import from here.

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
  | 'wait_cooldown' // wait the provider/model cooldown, then retry same
  | 'propose_switch' // propose another candidate to the user/MCP client
  | 'stop_ask_user' // stop and ask the user; never auto-retry
  | 'abort'; // abort the task immediately

/** Policy table mapping each category to its allowed action. */
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

/** Categories that must never trigger failover to another candidate. */
export const NO_FAILOVER_CATEGORIES: readonly ErrorCategory[] = [
  'USER_CANCELLED',
  'AUTH_ERROR',
  'PERMISSION_DENIED',
  'TOOL_NOT_INSTALLED',
  'TASK_FAILURE',
];

export function triggersFailover(category: ErrorCategory): boolean {
  return !NO_FAILOVER_CATEGORIES.includes(category);
}