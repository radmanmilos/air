// tests/worktree-failclosed.test.ts
// A write job must never fall back to the source tree when isolation fails.
// Before this guard, a failed `git worktree add` silently ran the tool in the
// user's checkout; a tool crash could then leave the source tree modified.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function gitRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'air-wtfail-'));
  const git = (args: string[]) => execFileSync('git', args, { cwd: dir, stdio: 'ignore' });
  git(['init']);
  git(['config', 'user.email', 't@t.com']);
  git(['config', 'user.name', 't']);
  writeFileSync(join(dir, 'a.txt'), 'hi');
  git(['add', '-A']);
  git(['commit', '-m', 'init']);
  return dir;
}

describe('write jobs fail closed when worktree creation fails', () => {
  const dirs: string[] = [];

  afterEach(() => {
    delete process.env.AIR_CACHE_DIR;
    delete process.env.AIR_CONFIG_DIR;
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
    vi.resetModules();
  });

  it('throws instead of running the tool in the source tree', async () => {
    const repo = gitRepo();
    const cacheDir = mkdtempSync(join(tmpdir(), 'air-cache-'));
    const configDir = mkdtempSync(join(tmpdir(), 'air-cfg-'));
    dirs.push(repo, cacheDir, configDir);

    // Occupy the worktrees directory path with a file so mkdir fails.
    writeFileSync(join(cacheDir, 'worktrees'), 'not a directory');
    process.env.AIR_CACHE_DIR = cacheDir;
    process.env.AIR_CONFIG_DIR = configDir;

    vi.resetModules();
    const { Orchestrator } = await import('../src/orchestrator/orchestrator');
    const { MockAdapter } = await import('../src/adapters/mock');
    const orch = new Orchestrator({
      adapters: [new MockAdapter()],
      config: { concurrency: { maxConcurrentAgents: 1 } } as any,
    });

    await expect(orch.start('write something', repo, {})).rejects.toThrow(
      /Workspace isolation failed/,
    );
    // The source tree is untouched.
    const status = execFileSync('git', ['status', '--porcelain'], { cwd: repo, encoding: 'utf8' });
    expect(status.trim()).toBe('');
  });

  it('read-only jobs do not need a worktree', async () => {
    const repo = gitRepo();
    const cacheDir = mkdtempSync(join(tmpdir(), 'air-cache-'));
    const configDir = mkdtempSync(join(tmpdir(), 'air-cfg-'));
    dirs.push(repo, cacheDir, configDir);
    writeFileSync(join(cacheDir, 'worktrees'), 'not a directory');
    process.env.AIR_CACHE_DIR = cacheDir;
    process.env.AIR_CONFIG_DIR = configDir;

    vi.resetModules();
    const { Orchestrator } = await import('../src/orchestrator/orchestrator');
    const { MockAdapter } = await import('../src/adapters/mock');
    const orch = new Orchestrator({
      adapters: [new MockAdapter()],
      config: { concurrency: { maxConcurrentAgents: 1 } } as any,
    });

    const session = await orch.start('just read', repo, { readOnly: true });
    expect(session.runId).toBeTruthy();
    await orch.waitForAll();
  });
});
