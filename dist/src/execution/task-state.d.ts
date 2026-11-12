import type { ResultState } from '../types/result';
export interface TaskState {
    runId: string;
    task: string;
    cwd: string;
    adapter: string;
    provider: string;
    model: string;
    state: 'QUEUED' | 'RUNNING' | 'FAILURE_DETECTED' | 'AWAITING_APPROVAL' | 'SWITCHING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
    result?: ResultState;
    startedAt: string;
    endedAt?: string;
    hops: number;
    maxHops: number;
    proposedSwitch?: {
        adapter: string;
        provider: string;
        model: string;
        reason: string;
        action?: string;
        task?: string;
        hash?: string;
    };
    outputTail?: string;
    stdoutTruncated?: boolean;
    stderrTruncated?: boolean;
    error?: {
        category: string;
        message: string;
    };
    /** Real git worktree allocated for a write job (isolation, T-030). */
    worktreePath?: string;
    worktreeBranch?: string;
    /** Source repository the worktree was branched from. */
    sourceCwd?: string;
    /** Source HEAD the worktree branched from; used by `air merge` preview. */
    sourceHead?: string;
    delta?: {
        staged: string[];
        unstaged: string[];
        untracked: string[];
        deleted: string[];
    };
}
export declare function writeTaskState(state: TaskState): Promise<void>;
export declare function readTaskState(runId: string): Promise<TaskState | null>;
export declare function listTaskStates(): Promise<TaskState[]>;
/**
 * Append a run id to the task index under an inter-process lock so two
 * concurrent processes cannot lose task IDs (R5-09).
 */
export declare function appendTaskIndex(runId: string): Promise<void>;
export declare function makeRunId(): string;
