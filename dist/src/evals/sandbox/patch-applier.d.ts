export interface PatchApplyResult {
    ok: boolean;
    appliedFiles: string[];
    error?: string;
}
export declare function applyUnifiedDiff(workspace: string, patch: string): PatchApplyResult;
