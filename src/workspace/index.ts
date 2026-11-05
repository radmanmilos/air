// Workspace isolation manager (T-030).
// Allocates a real git worktree per write job. A boolean flag is not isolation.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { paths } from '../config/paths';

export interface WorktreeInfo {
  jobId: string;
  sourceCwd: string;
  worktreePath: string;
  branch: string;
  sourceHead: string;
}

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8' }).trim();
}

export function createWorktree(jobId: string, sourceCwd: string): WorktreeInfo {
  const sourceHead = git(sourceCwd, ['rev-parse', 'HEAD']);
  const branch = `air/${jobId}`;
  const worktreePath = join(paths.cacheDir, 'worktrees', jobId);
  mkdirSync(join(paths.cacheDir, 'worktrees'), { recursive: true });
  if (existsSync(worktreePath)) {
    // Reuse existing worktree.
  } else {
    git(sourceCwd, ['worktree', 'add', '-b', branch, worktreePath, sourceHead]);
  }
  return { jobId, sourceCwd, worktreePath, branch, sourceHead };
}

export function worktreeDiff(info: WorktreeInfo): string {
  try {
    return execFileSync('git', ['diff', '--stat', info.sourceHead, 'HEAD'], { cwd: info.worktreePath, stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

export function applyWorktree(info: WorktreeInfo): { ok: boolean; message: string } {
  try {
    // Commit any uncommitted changes in the worktree first.
    execFileSync('git', ['add', '-A'], { cwd: info.worktreePath, stdio: 'ignore' });
    try {
      execFileSync('git', ['commit', '-m', `air: ${info.jobId}`], { cwd: info.worktreePath, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch { /* nothing to commit */ }
    // Merge the worktree branch into the current branch of source repo.
    execFileSync('git', ['merge', '--no-ff', info.branch, '-m', `air: apply ${info.jobId}`], { cwd: info.sourceCwd, stdio: ['ignore', 'pipe', 'pipe'] });
    return { ok: true, message: `Applied ${info.branch} into ${info.sourceCwd}.` };
  } catch (err: any) {
    return { ok: false, message: `Apply failed: ${String(err?.message || err)}` };
  }
}
}
export function removeWorktree(info: WorktreeInfo): void {
  try {
    execFileSync('git', ['worktree', 'remove', '--force', info.worktreePath], { cwd: info.sourceCwd, stdio: 'ignore' });
  } catch { /* best-effort */ }
  try {
    execFileSync('git', ['branch', '-D', info.branch], { cwd: info.sourceCwd, stdio: 'ignore' });
  } catch { /* best-effort */ }
}
