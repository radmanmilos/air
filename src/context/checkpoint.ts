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
  /** True when the directory is not a Git repository or Git failed. */
  isGitRepo: boolean;
  /** Error message when isGitRepo is false. */
  gitError?: string;
  /** Content fingerprints (blob hashes) for changed files. */
  fingerprints?: Record<string, string>;
}

function git(cwd: string, args: string[]): { ok: boolean; out: string } {
  try {
    const out = execFileSync('git', ['--no-pager', ...args], {
      cwd,
      stdio: ['ignore', 'pipe', 'ignore'],
      encoding: 'utf8',
    }).trim();
    return { ok: true, out };
  } catch (err: any) {
    return { ok: false, out: String(err?.message || err || '').slice(0, 200) };
  }
}

export function snapshotGit(cwd: string): GitSnapshot {
  const branchCheck = git(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']);
  if (!branchCheck.ok) {
    return {
      branch: null,
      head: null,
      staged: [],
      unstaged: [],
      untracked: [],
      dirty: false,
      isGitRepo: false,
      gitError: branchCheck.out,
    };
  }

  const head = git(cwd, ['rev-parse', 'HEAD']);
  const staged = git(cwd, ['diff', '--cached', '--name-only']).out.split('\n').filter(Boolean);
  const unstaged = git(cwd, ['diff', '--name-only']).out.split('\n').filter(Boolean);
  const untracked = git(cwd, ['ls-files', '--others', '--exclude-standard']).out.split('\n').filter(Boolean);
  const fingerprints: Record<string, string> = {};
  for (const f of [...staged, ...unstaged, ...untracked]) {
    const h = git(cwd, ['hash-object', '--', f]);
    if (h.ok) fingerprints[f] = h.out;
  }
  return {
    branch: branchCheck.out || null,
    head: head.out || null,
    staged,
    unstaged,
    untracked,
    dirty: staged.length > 0 || unstaged.length > 0 || untracked.length > 0,
    isGitRepo: true,
    fingerprints,
  };
}

/**
 * Compute the agent-produced delta between an initial snapshot and a final
 * snapshot (R5-07). Pre-existing staged/unstaged/untracked files that were
 * present before the run are NOT counted as agent changes.
 */
export function snapshotDelta(
  before: GitSnapshot,
  after: GitSnapshot,
): {
  staged: string[];
  unstaged: string[];
  untracked: string[];
  deleted: string[];
  dirty: boolean;
  preexisting: boolean;
} {
  if (!before.isGitRepo || !after.isGitRepo) {
    return { staged: [], unstaged: [], untracked: [], deleted: [], dirty: after.dirty, preexisting: false };
  }

  const set = (arr: string[]) => new Set(arr);
  const beforeStaged = set(before.staged);
  const beforeUnstaged = set(before.unstaged);
  const beforeUntracked = set(before.untracked);

  const beforeFp = before.fingerprints ?? {};
  const afterFp = after.fingerprints ?? {};

  const staged = after.staged.filter((f) => !beforeStaged.has(f) || beforeFp[f] !== afterFp[f]);
  const unstaged = after.unstaged.filter((f) => !beforeUnstaged.has(f) || beforeFp[f] !== afterFp[f]);
  const untracked = after.untracked.filter((f) => !beforeUntracked.has(f) || beforeFp[f] !== afterFp[f]);

  // Deleted: present before but absent after (tracked or untracked).
  const deleted: string[] = [];
  for (const f of beforeStaged) if (!after.staged.includes(f) && !after.unstaged.includes(f)) deleted.push(f);
  for (const f of beforeUnstaged) if (!after.staged.includes(f) && !after.unstaged.includes(f)) deleted.push(f);
  for (const f of beforeUntracked) if (!after.untracked.includes(f) && !after.staged.includes(f) && !after.unstaged.includes(f)) deleted.push(f);

  const dirty = staged.length > 0 || unstaged.length > 0 || untracked.length > 0 || deleted.length > 0;
  const preexisting = before.dirty && !dirty;
  return { staged, unstaged, untracked, deleted, dirty, preexisting };
}

export function formatDirtyReport(snap: GitSnapshot): string {
  if (!snap.isGitRepo) {
    return `Not a Git repository${snap.gitError ? ` (${snap.gitError})` : ''}. Refuse to start a write-capable task. Pass --allow-dirty to proceed (non-destructive).`;
  }
  const lines: string[] = [];
  lines.push('Working tree is dirty:');
  if (snap.staged.length) lines.push(`  staged:   ${snap.staged.join(', ')}`);
  if (snap.unstaged.length) lines.push(`  modified: ${snap.unstaged.join(', ')}`);
  if (snap.untracked.length) lines.push(`  untracked: ${snap.untracked.join(', ')}`);
  lines.push('Refuse to start a write-capable task. Pass --allow-dirty to proceed (non-destructive).');
  return lines.join('\n');
}

/** Format a delta report for --explain / handoff output. */
export function formatDeltaReport(delta: ReturnType<typeof snapshotDelta>): string {
  const lines: string[] = [];
  lines.push('Agent-produced changes (relative to initial snapshot):');
  if (delta.staged.length) lines.push(`  staged:   ${delta.staged.join(', ')}`);
  if (delta.unstaged.length) lines.push(`  modified: ${delta.unstaged.join(', ')}`);
  if (delta.untracked.length) lines.push(`  untracked: ${delta.untracked.join(', ')}`);
  if (delta.deleted.length) lines.push(`  deleted:  ${delta.deleted.join(', ')}`);
  if (!delta.dirty) lines.push('  (none)');
  if (delta.preexisting) lines.push('  pre-existing dirt: unchanged by AIR');
  return lines.join('\n');
}