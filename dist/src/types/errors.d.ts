export type ErrorCategory = 'RATE_LIMIT' | 'QUOTA_EXCEEDED' | 'MODEL_UNAVAILABLE' | 'AUTH_ERROR' | 'NETWORK_ERROR' | 'PROCESS_CRASH' | 'TOOL_NOT_INSTALLED' | 'TIMEOUT' | 'USER_CANCELLED' | 'PERMISSION_DENIED' | 'CONTEXT_LENGTH' | 'TASK_FAILURE' | 'UNKNOWN';
/** Action air should take when a run ends in this category. */
export type ErrorAction = 'retry_same' | 'wait_cooldown' | 'propose_switch' | 'stop_ask_user' | 'abort';
/** Policy table mapping each category to its canonical action. */
export declare const ERROR_POLICY: Record<ErrorCategory, ErrorAction>;
export declare function getErrorAction(category: ErrorCategory): ErrorAction;
/** Categories whose action is to stop/abort and must never trigger failover. */
export declare const NO_FAILOVER_ACTIONS: readonly ErrorAction[];
/** Derived from ERROR_POLICY: true when the action may propose a different candidate. */
export declare function triggersFailover(category: ErrorCategory): boolean;
/** Derived from ERROR_POLICY: true when the action is to stop/abort with no retry. */
export declare function isAbortAction(category: ErrorCategory): boolean;
/** Derived from ERROR_POLICY: true when the action asks the user before proceeding. */
export declare function requiresUserDecision(category: ErrorCategory): boolean;
