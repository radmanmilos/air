export type ResultState = 'SUCCEEDED_WITH_CHANGES' | 'SUCCEEDED_READ_ONLY' | 'NO_CHANGES' | 'FAILED' | 'CANCELLED' | 'NEEDS_USER_REVIEW';
export declare function isTerminal(_state: ResultState): boolean;
/** A write task with no diff is never success unless explicitly read-only. */
export declare function defaultStateForTask(isReadOnly: boolean, hasDiff: boolean): ResultState;
