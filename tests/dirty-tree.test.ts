import { snapshotGit, snapshotDelta, formatDirtyReport, formatDeltaReport } from '../src/context/checkpoint';
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('dirty-tree policy (R2-02, R5-07)', () => {
  let dir: string;

  function git(args: string[]): string {
    return execFileSync('git', args, { cwd: dir, stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8' }).trim();
  }

  it('refuses to start a write task on a dirty tree', () => {
    dir = mkdtempSync(join(tmpdir(), 'air-dirty-'));
    try {
      git(['init', '-q']);
      git(['config', 'user.email', 't@t']);
      git(['config', 'user.name', 't']);
      execFileSync('node', ['-e', "require('fs').writeFileSync('a.txt','hi')"], { cwd: dir });
      git(['add', 'a.txt']);
      git(['commit', '-q', '-m', 'init']);
      execFileSync('node', ['-e', "require('fs').writeFileSync('a.txt','changed')"], { cwd: dir });
      const snap = snapshotGit(dir);
      expect(snap.dirty).toBe(true);
      const report = formatDirtyReport(snap);
      expect(report).toContain('Working tree is dirty');
      expect(report).toContain('modified');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('allows a clean tree for write tasks', () => {
    dir = mkdtempSync(join(tmpdir(), 'air-clean-'));
    try {
      git(['init', '-q']);
      git(['config', 'user.email', 't@t']);
      git(['config', 'user.name', 't']);
      execFileSync('node', ['-e', "require('fs').writeFileSync('a.txt','hi')"], { cwd: dir });
      git(['add', 'a.txt']);
      git(['commit', '-q', '-m', 'init']);
      const snap = snapshotGit(dir);
      expect(snap.dirty).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reports a non-Git directory deliberately', () => {
    dir = mkdtempSync(join(tmpdir(), 'air-nogit-'));
    try {
      const snap = snapshotGit(dir);
      expect(snap.isGitRepo).toBe(false);
      expect(snap.dirty).toBe(false);
      const report = formatDirtyReport(snap);
      expect(report).toContain('Not a Git repository');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('computes the agent-produced delta relative to the initial snapshot (R5-07)', () => {
    dir = mkdtempSync(join(tmpdir(), 'air-delta-'));
    try {
      git(['init', '-q']);
      git(['config', 'user.email', 't@t']);
      git(['config', 'user.name', 't']);
      writeFileSync(join(dir, 'a.txt'), 'hi');
      git(['add', 'a.txt']);
      git(['commit', '-q', '-m', 'init']);

      // Pre-existing dirt: a file the user modified before the run.
      writeFileSync(join(dir, 'a.txt'), 'pre-existing change');
      const before = snapshotGit(dir);
      expect(before.dirty).toBe(true);

      // Agent-produced change: a brand-new file.
      writeFileSync(join(dir, 'new.txt'), 'agent work');
      const after = snapshotGit(dir);

      const delta = snapshotDelta(before, after);
      expect(delta.dirty).toBe(true);
      expect(delta.untracked).toEqual(['new.txt']);
      expect(delta.staged).toEqual([]);
      expect(delta.unstaged).toEqual([]);
      const report = formatDeltaReport(delta);
      expect(report).toContain('new.txt');
      expect(report).not.toContain('a.txt');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('does not count pre-existing untracked files as agent work (R5-07)', () => {
    dir = mkdtempSync(join(tmpdir(), 'air-preexisting-'));
    try {
      git(['init', '-q']);
      git(['config', 'user.email', 't@t']);
      git(['config', 'user.name', 't']);
      writeFileSync(join(dir, 'a.txt'), 'hi');
      git(['add', 'a.txt']);
      git(['commit', '-q', '-m', 'init']);

      // Pre-existing untracked file present before the run.
      writeFileSync(join(dir, 'pre.txt'), 'pre-existing');
      const before = snapshotGit(dir);
      expect(before.untracked).toEqual(['pre.txt']);

      // Agent creates a new file.
      writeFileSync(join(dir, 'agent.txt'), 'agent work');
      const after = snapshotGit(dir);

      const delta = snapshotDelta(before, after);
      expect(delta.untracked).toEqual(['agent.txt']);
      expect(delta.dirty).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});