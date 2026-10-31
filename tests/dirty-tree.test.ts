import { snapshotGit, formatDirtyReport } from '../src/context/checkpoint';
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('dirty-tree policy (R2-02)', () => {
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
});