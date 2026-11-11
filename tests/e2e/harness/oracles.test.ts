import { describe, it, expect } from 'vitest';
import { oracles } from '../harness/oracles';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync, spawn } from 'node:child_process';

// ... (existing imports)

describe('oracles', () => {
  it('gitClean returns true for clean repo', () => {
    const dir = mkdtempSync(join(tmpdir(), 'oracle-'));
    execFileSync('git', ['init'], { cwd: dir, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: dir, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.name', 'test'], { cwd: dir, stdio: 'ignore' });
    writeFileSync(join(dir, 'a.txt'), 'hello');
    execFileSync('git', ['add', '-A'], { cwd: dir, stdio: 'ignore' });
    execFileSync('git', ['commit', '-m', 'init'], { cwd: dir, stdio: 'ignore' });
    expect(oracles.gitClean(dir)).toBe(true);
    rmSync(dir, { recursive: true, force: true });
  });

  it('gitClean returns false for dirty repo', () => {
    const dir = mkdtempSync(join(tmpdir(), 'oracle-'));
    execFileSync('git', ['init'], { cwd: dir, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: dir, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.name', 'test'], { cwd: dir, stdio: 'ignore' });
    writeFileSync(join(dir, 'a.txt'), 'hello');
    execFileSync('git', ['add', '-A'], { cwd: dir, stdio: 'ignore' });
    execFileSync('git', ['commit', '-m', 'init'], { cwd: dir, stdio: 'ignore' });
    writeFileSync(join(dir, 'b.txt'), 'dirty');
    expect(oracles.gitClean(dir)).toBe(false);
    rmSync(dir, { recursive: true, force: true });
  });

  it('fileExists works', () => {
    const dir = mkdtempSync(join(tmpdir(), 'oracle-'));
    writeFileSync(join(dir, 'test.txt'), 'hello');
    expect(oracles.fileExists(dir, 'test.txt')).toBe(true);
    expect(oracles.fileExists(dir, 'nope.txt')).toBe(false);
    rmSync(dir, { recursive: true, force: true });
  });

  it('fileContains works', () => {
    const dir = mkdtempSync(join(tmpdir(), 'oracle-'));
    writeFileSync(join(dir, 'test.txt'), 'hello world');
    expect(oracles.fileContains(dir, 'test.txt', 'world')).toBe(true);
    expect(oracles.fileContains(dir, 'test.txt', 'nope')).toBe(false);
    rmSync(dir, { recursive: true, force: true });
  });

  it('voiceCheck detects banned terms', () => {
    const violations = oracles.voiceCheck('I used aider to fix the bug, exit code 0');
    expect(violations).toContain('aider');
    expect(violations).toContain('exit code');
  });

  it('voiceCheck passes clean text', () => {
    const violations = oracles.voiceCheck('I updated the greeting in Program.cs');
    expect(violations).toHaveLength(0);
  });

  it('gitChangedFiles returns changed files', () => {
    const dir = mkdtempSync(join(tmpdir(), 'oracle-'));
    execFileSync('git', ['init'], { cwd: dir, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: dir, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.name', 'test'], { cwd: dir, stdio: 'ignore' });
    writeFileSync(join(dir, 'a.txt'), 'hello');
    execFileSync('git', ['add', '-A'], { cwd: dir, stdio: 'ignore' });
    execFileSync('git', ['commit', '-m', 'init'], { cwd: dir, stdio: 'ignore' });
    writeFileSync(join(dir, 'b.txt'), 'new');
    const changed = oracles.gitChangedFiles(dir);
    expect(changed).toContain('b.txt');
    rmSync(dir, { recursive: true, force: true });
  });

  it('gitChangedFiles keeps the full name of a modified tracked file', () => {
    // Regression: trimming the raw porcelain output dropped the first status
    // column of line one, so "Program.cs" was reported as "rogram.cs".
    const dir = mkdtempSync(join(tmpdir(), 'oracle-'));
    execFileSync('git', ['init'], { cwd: dir, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: dir, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.name', 'test'], { cwd: dir, stdio: 'ignore' });
    writeFileSync(join(dir, 'Program.cs'), 'Console.WriteLine("Hello");\n');
    writeFileSync(join(dir, 'README.md'), '# Test Project\n');
    execFileSync('git', ['add', '-A'], { cwd: dir, stdio: 'ignore' });
    execFileSync('git', ['commit', '-m', 'init'], { cwd: dir, stdio: 'ignore' });
    writeFileSync(join(dir, 'Program.cs'), 'Console.WriteLine("Bye");\n');
    writeFileSync(join(dir, 'README.md'), '# Changed\n');
    expect(oracles.gitChangedFiles(dir)).toEqual(['Program.cs', 'README.md']);
    rmSync(dir, { recursive: true, force: true });
  });

  it('gitChangedFiles reports the destination of a rename', () => {
    const dir = mkdtempSync(join(tmpdir(), 'oracle-'));
    execFileSync('git', ['init'], { cwd: dir, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: dir, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.name', 'test'], { cwd: dir, stdio: 'ignore' });
    writeFileSync(join(dir, 'old.txt'), 'hello');
    execFileSync('git', ['add', '-A'], { cwd: dir, stdio: 'ignore' });
    execFileSync('git', ['commit', '-m', 'init'], { cwd: dir, stdio: 'ignore' });
    execFileSync('git', ['mv', 'old.txt', 'new.txt'], { cwd: dir, stdio: 'ignore' });
    expect(oracles.gitChangedFiles(dir)).toEqual(['new.txt']);
    rmSync(dir, { recursive: true, force: true });
  });
});

describe('noOrphans', () => {
  it('returns false when a marked process is alive', async () => {
    if (process.platform === 'win32') return; // OS scan not available on Windows
    const marker = 'air-e2e-test-marker-' + Date.now();
    const child = spawn(process.execPath, [join(process.cwd(), 'tests', 'e2e', 'harness', 'fake-executors', 'fake-executor.mjs')], {
      env: { ...process.env, AIR_E2E_MARKER: marker, FAKE_BEHAVIOR: 'hang' },
      stdio: 'ignore',
    });
    await new Promise((r) => setTimeout(r, 1000));
    expect(oracles.noOrphans(marker)).toBe(false);
    child.kill();
    await new Promise((r) => setTimeout(r, 500));
  });

  it('returns true when no marked process remains', () => {
    const marker = 'air-e2e-test-marker-nonexistent-' + Date.now();
    expect(oracles.noOrphans(marker)).toBe(true);
  });
});