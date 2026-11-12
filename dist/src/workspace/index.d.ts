export interface WorktreeInfo {
    jobId: string;
    sourceCwd: string;
    worktreePath: string;
    branch: string;
    sourceHead: string;
}
export declare function createWorktree(jobId: string, sourceCwd: string): WorktreeInfo;
export declare function worktreeDiff(info: WorktreeInfo): string;
export interface WorktreePreview {
    /** Base commit the job branched from. */
    base: string;
    /** Files the job added or changed, relative to the worktree root. */
    changedFiles: string[];
    /** `git diff --stat` output, or '' when there is nothing to show. */
    diffStat: string;
}
/**
 * Describe what `applyWorktree` would bring into the source branch without
 * changing anything. Tracked edits (staged or not) and untracked files are
 * listed; no commit, merge, or checkout is performed.
 */
export declare function previewWorktree(info: WorktreeInfo): WorktreePreview;
export declare function applyWorktree(info: WorktreeInfo): {
    ok: boolean;
    message: string;
};
export declare function removeWorktree(info: WorktreeInfo): void;
