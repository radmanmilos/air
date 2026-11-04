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
});
