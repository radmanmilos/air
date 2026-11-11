import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createWorktree, removeWorktree } from '../src/workspace';

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
});
