// tests/e2e/harness/sandbox.test.ts
// The sandbox is the isolation boundary for every E2E scenario. These tests
// pin two properties the scenarios depend on:
//   1. A fixture without its own git repo still yields a clean baseline.
//   2. Sandboxes never mutate the shared fixture or each other.
import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createSandbox } from './sandbox';
import { oracles } from './oracles';

function makeFixture(): string {
  const dir = mkdtempSync(join(tmpdir(), 'air-fixture-'));
  writeFileSync(join(dir, 'README.md'), '# Test Project\n');
  writeFileSync(join(dir, 'Program.cs'), 'Console.WriteLine("Hello");\n');
  return dir;
}

describe('createSandbox', () => {
  it('creates a clean git baseline when the fixture has no repo', () => {
    const fixture = makeFixture();
    const sandbox = createSandbox(fixture);
    try {
      expect(existsSync(join(sandbox.repoDir, '.git', 'HEAD'))).toBe(true);
      expect(oracles.gitChangedFiles(sandbox.repoDir)).toEqual([]);
    } finally {
      sandbox.cleanup();
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  it('does not write into the shared fixture directory', () => {
    const fixture = makeFixture();
    const before = readFileSync(join(fixture, 'Program.cs'), 'utf8');
    const sandbox = createSandbox(fixture);
    try {
      expect(readFileSync(join(fixture, 'Program.cs'), 'utf8')).toBe(before);
      expect(existsSync(join(fixture, '.git'))).toBe(false);
    } finally {
      sandbox.cleanup();
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  it('keeps two sandboxes from one fixture independent', () => {
    const fixture = makeFixture();
    const a = createSandbox(fixture);
    const b = createSandbox(fixture);
    try {
      writeFileSync(join(a.repoDir, 'Program.cs'), 'Console.WriteLine("Changed");\n');
      expect(oracles.gitChangedFiles(a.repoDir)).toEqual(['Program.cs']);
      expect(oracles.gitChangedFiles(b.repoDir)).toEqual([]);
    } finally {
      a.cleanup();
      b.cleanup();
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  it('reset restores a clean tree after an edit', () => {
    const fixture = makeFixture();
    const sandbox = createSandbox(fixture);
    try {
      writeFileSync(join(sandbox.repoDir, 'Program.cs'), 'dirty\n');
      mkdirSync(join(sandbox.repoDir, 'extra'), { recursive: true });
      writeFileSync(join(sandbox.repoDir, 'extra', 'x.txt'), 'x');
      expect(oracles.gitChangedFiles(sandbox.repoDir).length).toBeGreaterThan(0);
      sandbox.reset();
      expect(oracles.gitChangedFiles(sandbox.repoDir)).toEqual([]);
    } finally {
      sandbox.cleanup();
      rmSync(fixture, { recursive: true, force: true });
    }
  });
});
