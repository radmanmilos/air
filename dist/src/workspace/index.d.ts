export interface WorktreeInfo {
    jobId: string;
    sourceCwd: string;
    worktreePath: string;
    branch: string;
    sourceHead: string;
}
export declare function createWorktree(jobId: string, sourceCwd: string): WorktreeInfo;
export declare function worktreeDiff(info: WorktreeInfo): string;
export declare function applyWorktree(info: WorktreeInfo): {
    ok: boolean;
    message: string;
};
export declare function removeWorktree(info: WorktreeInfo): void;
