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

function sleepSync(ms: number): void {
  // Synchronous backoff; Node permits Atomics.wait on the main thread.
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function branchExists(cwd: string, branch: string): boolean {
  try {
    git(cwd, ['rev-parse', '--verify', branch]);
    return true;
  } catch {
    return false;
  }
}

export function createWorktree(jobId: string, sourceCwd: string): WorktreeInfo {
  let sourceHead: string;
  try {
    sourceHead = git(sourceCwd, ['rev-parse', 'HEAD']);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(`failed to create worktree: ${sourceCwd} is not a usable git repository (${detail})`);
  }
  const branch = `air/${jobId}`;
  const worktreePath = join(paths.cacheDir, 'worktrees', jobId);
  mkdirSync(join(paths.cacheDir, 'worktrees'), { recursive: true });
  if (existsSync(worktreePath)) {
    return { jobId, sourceCwd, worktreePath, branch, sourceHead };
  }

  let lastError: unknown = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const args = branchExists(sourceCwd, branch)
        ? ['worktree', 'add', worktreePath, branch]
        : ['worktree', 'add', '-b', branch, worktreePath, sourceHead];
      git(sourceCwd, args);
      lastError = null;
      break;
    } catch (err) {
      lastError = err;
      // A stale worktree registration can block the next add; prune and retry.
      try { git(sourceCwd, ['worktree', 'prune']); } catch { /* best-effort */ }
      if (attempt < 3) sleepSync(100 * attempt);
    }
  }

  if (!existsSync(worktreePath)) {
    const detail = lastError instanceof Error ? lastError.message : String(lastError);
    throw new Error(`failed to create worktree ${worktreePath}: ${detail}`);
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

export function removeWorktree(info: WorktreeInfo): void {
  try {
    execFileSync('git', ['worktree', 'remove', '--force', info.worktreePath], { cwd: info.sourceCwd, stdio: 'ignore' });
  } catch { /* best-effort */ }
  try {
    execFileSync('git', ['branch', '-D', info.branch], { cwd: info.sourceCwd, stdio: 'ignore' });
  } catch { /* best-effort */ }
}
