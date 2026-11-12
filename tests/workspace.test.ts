import { describe, it, expect } from 'vitest';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createWorktree, previewWorktree, removeWorktree } from '../src/workspace';

function initRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'air-wt-'));
  execFileSync('git', ['init'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 't@t.com'], { cwd: dir });
  execFileSync('git', ['config', 'user.name', 't'], { cwd: dir });
  return dir;
}

describe('workspace isolation (T-030)', () => {
  it('creates a real worktree on a new branch', () => {
    const dir = mkdtempSync(join(tmpdir(), 'air-wt-'));
    execFileSync('git', ['init'], { cwd: dir });
    execFileSync('git', ['config', 'user.email', 't@t.com'], { cwd: dir });
    execFileSync('git', ['config', 'user.name', 't'], { cwd: dir });
    execFileSync('git', ['commit', '--allow-empty', '-m', 'init'], { cwd: dir });
    const info = createWorktree('job1', dir);
    expect(info.worktreePath).toBeTruthy();
    expect(info.branch).toBe('air/job1');
    removeWorktree(info);
  });

  it('reuses an existing job branch instead of failing on -b', () => {
    const dir = mkdtempSync(join(tmpdir(), 'air-wt-'));
    execFileSync('git', ['init'], { cwd: dir });
    execFileSync('git', ['config', 'user.email', 't@t.com'], { cwd: dir });
    execFileSync('git', ['config', 'user.name', 't'], { cwd: dir });
    execFileSync('git', ['commit', '--allow-empty', '-m', 'init'], { cwd: dir });
    execFileSync('git', ['branch', 'air/job2'], { cwd: dir });
    const info = createWorktree('job2', dir);
    expect(info.branch).toBe('air/job2');
    removeWorktree(info);
  });

  it('throws when the source is not a git repository', () => {
    const dir = mkdtempSync(join(tmpdir(), 'air-wt-'));
    expect(() => createWorktree('job3', dir)).toThrow(/failed to create worktree/);
  });

  describe('previewWorktree', () => {
    it('lists tracked edits and untracked files without touching the source', () => {
      const dir = initRepo();
      writeFileSync(join(dir, 'a.txt'), 'one\n');
      execFileSync('git', ['add', '-A'], { cwd: dir });
      execFileSync('git', ['commit', '-m', 'init'], { cwd: dir });

      const info = createWorktree('job-preview', dir);
      writeFileSync(join(info.worktreePath, 'a.txt'), 'one\ntwo\n');
      writeFileSync(join(info.worktreePath, 'new.txt'), 'fresh\n');

      const preview = previewWorktree(info);
      expect(preview.changedFiles).toContain('a.txt');
      expect(preview.changedFiles).toContain('new.txt');
      expect(preview.diffStat).toContain('a.txt');

      // The source tree is untouched: no merge, no commit happened.
      expect(existsSync(join(dir, 'new.txt'))).toBe(false);
      removeWorktree(info);
    });

    it('reports nothing to change for a clean worktree', () => {
      const dir = initRepo();
      execFileSync('git', ['commit', '--allow-empty', '-m', 'init'], { cwd: dir });
      const info = createWorktree('job-clean', dir);
      const preview = previewWorktree(info);
      expect(preview.changedFiles).toEqual([]);
      removeWorktree(info);
    });
  });
});
