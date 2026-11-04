export interface GitSnapshot {
    branch: string | null;
    head: string | null;
    staged: string[];
    unstaged: string[];
    untracked: string[];
    dirty: boolean;
    /** True when the directory is not a Git repository or Git failed. */
    isGitRepo: boolean;
    /** Error message when isGitRepo is false. */
    gitError?: string;
    /** Content fingerprints (blob hashes) for changed files. */
    fingerprints?: Record<string, string>;
}
export declare function snapshotGit(cwd: string): GitSnapshot;
/**
 * Compute the agent-produced delta between an initial snapshot and a final
 * snapshot (R5-07). Pre-existing staged/unstaged/untracked files that were
 * present before the run are NOT counted as agent changes.
 */
export declare function snapshotDelta(before: GitSnapshot, after: GitSnapshot): {
    staged: string[];
    unstaged: string[];
    untracked: string[];
    deleted: string[];
    dirty: boolean;
    preexisting: boolean;
};
export declare function formatDirtyReport(snap: GitSnapshot): string;
/** Format a delta report for --explain / handoff output. */
export declare function formatDeltaReport(delta: ReturnType<typeof snapshotDelta>): string;
