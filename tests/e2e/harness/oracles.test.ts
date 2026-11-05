import { describe, it, expect } from 'vitest';
import { oracles } from '../harness/oracles';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';

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
});