// Checkpoint / dirty-tree snapshot (R2-02).
//
// Before every attempt, capture the git state so a failed run can be inspected
// and so we know whether the tree is dirty. AIR never auto-commits, pushes,
// stashes, checks out, cleans, or reverts anything — a checkpoint is a
// read-only snapshot/patch record in the MVP.

import { execFileSync } from 'node:child_process';

export interface GitSnapshot {
  branch: string | null;
  head: string | null;
  staged: string[];
  unstaged: string[];
  untracked: string[];
  dirty: boolean;
}

function git(cwd: string, args: string[]): string {
  try {
    return execFileSync('git', ['--no-pager', ...args], {
      cwd,
      stdio: ['ignore', 'pipe', 'ignore'],
      encoding: 'utf8',
    }).trim();
  } catch {
    return '';
  }
}

export function snapshotGit(cwd: string): GitSnapshot {
  const branch = git(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']);
  const head = git(cwd, ['rev-parse', 'HEAD']);
  const staged = git(cwd, ['diff', '--cached', '--name-only']).split('\n').filter(Boolean);
  const unstaged = git(cwd, ['diff', '--name-only']).split('\n').filter(Boolean);
  const untracked = git(cwd, ['ls-files', '--others', '--exclude-standard']).split('\n').filter(Boolean);
  return {
    branch: branch || null,
    head: head || null,
    staged,
    unstaged,
    untracked,
    dirty: staged.length > 0 || unstaged.length > 0 || untracked.length > 0,
  };
}

export function formatDirtyReport(snap: GitSnapshot): string {
  const lines: string[] = [];
  lines.push('Working tree is dirty:');
  if (snap.staged.length) lines.push(`  staged:   ${snap.staged.join(', ')}`);
  if (snap.unstaged.length) lines.push(`  modified: ${snap.unstaged.join(', ')}`);
  if (snap.untracked.length) lines.push(`  untracked: ${snap.untracked.join(', ')}`);
  lines.push('Refuse to start a write-capable task. Pass --allow-dirty to proceed (non-destructive).');
  return lines.join('\n');
}