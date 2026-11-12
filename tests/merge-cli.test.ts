// CLI `air merge` behavior: preview by default, merge only with --apply.
//
// Runs the built binary against a real temp git repo so the whole path
// (task state -> preview/apply -> git) is exercised.

import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { airOnce } from './e2e/harness/air-process';

function initRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'air-merge-'));
  execFileSync('git', ['init'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 't@t.com'], { cwd: dir });
  execFileSync('git', ['config', 'user.name', 't'], { cwd: dir });
  writeFileSync(join(dir, 'a.txt'), 'one\n');
  execFileSync('git', ['add', '-A'], { cwd: dir });
  execFileSync('git', ['commit', '-m', 'init'], { cwd: dir });
  return dir;
}

describe('air merge CLI', () => {
  it('previews without applying, and applies only with --apply', async () => {
    const source = initRepo();
    const cacheDir = mkdtempSync(join(tmpdir(), 'air-merge-cache-'));
    const configDir = mkdtempSync(join(tmpdir(), 'air-merge-config-'));
    const worktreePath = join(mkdtempSync(join(tmpdir(), 'air-merge-wt-')), 'wt');
    const jobId = 'run-merge-test';
    const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: source, encoding: 'utf8' }).trim();

    execFileSync('git', ['worktree', 'add', '-b', `air/${jobId}`, worktreePath, head], {
      cwd: source,
    });
    writeFileSync(join(worktreePath, 'a.txt'), 'one\ntwo\n');
    writeFileSync(join(worktreePath, 'new.txt'), 'fresh\n');

    mkdirSync(join(cacheDir, 'tasks'), { recursive: true });
    writeFileSync(
      join(cacheDir, 'tasks', `${jobId}.json`),
      JSON.stringify({
        runId: jobId,
        task: 'edit a.txt',
        cwd: worktreePath,
        adapter: 'local',
        provider: 'ollama',
        model: 'qwen3.5:4b',
        state: 'COMPLETED',
        result: 'SUCCEEDED_WITH_CHANGES',
        startedAt: new Date().toISOString(),
        hops: 1,
        maxHops: 3,
        worktreePath,
        worktreeBranch: `air/${jobId}`,
        sourceCwd: source,
        sourceHead: head,
      }),
    );

    const env = { AIR_CACHE_DIR: cacheDir, AIR_CONFIG_DIR: configDir };

    // Preview: reports the changes, mutates nothing.
    const preview = await airOnce(['merge', jobId], env, source);
    expect(preview.exitCode).toBe(0);
    expect(preview.stdout).toContain('preview');
    expect(preview.stdout).toContain('Nothing was changed');
    expect(preview.stdout).toContain('a.txt');
    expect(readFileSync(join(source, 'a.txt'), 'utf8').replace(/\r\n/g, '\n')).toBe('one\n');

    // Apply: merges the worktree into the source branch.
    const applied = await airOnce(['merge', jobId, '--apply'], env, source);
    expect(applied.exitCode).toBe(0);
    expect(applied.stdout).toContain('Applied');
    expect(readFileSync(join(source, 'a.txt'), 'utf8').replace(/\r\n/g, '\n')).toBe('one\ntwo\n');
  }, 120_000);

  it('refuses a job without worktree state', async () => {
    const cacheDir = mkdtempSync(join(tmpdir(), 'air-merge-cache-'));
    const configDir = mkdtempSync(join(tmpdir(), 'air-merge-config-'));
    mkdirSync(join(cacheDir, 'tasks'), { recursive: true });
    writeFileSync(
      join(cacheDir, 'tasks', 'run-none.json'),
      JSON.stringify({
        runId: 'run-none',
        task: 'x',
        cwd: process.cwd(),
        adapter: 'local',
        provider: 'ollama',
        model: 'qwen3.5:4b',
        state: 'COMPLETED',
        startedAt: new Date().toISOString(),
        hops: 0,
        maxHops: 1,
      }),
    );

    const res = await airOnce(
      ['merge', 'run-none'],
      { AIR_CACHE_DIR: cacheDir, AIR_CONFIG_DIR: configDir },
      process.cwd(),
    );
    expect(res.exitCode).toBe(1);
    expect(res.stdout).toContain('No worktree info');
  }, 60_000);
});
