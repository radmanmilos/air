// tests/e2e/scenarios/basic.test.ts
import { describe, it, expect } from 'vitest';
import { createSandbox, gitClean } from '../harness/sandbox';
import { airOnce } from '../harness/air-process';
import { oracles } from '../harness/oracles';
import { join } from 'node:path';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

function ensureFixture(dir: string) {
  if (existsSync(dir)) return;
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'README.md'), '# Test Project\n');
  writeFileSync(join(dir, 'Program.cs'), 'Console.WriteLine("Hello");\n');
  execSync('git init && git add -A && git commit -m baseline', { cwd: dir, stdio: 'ignore' });
}

describe('Basic E2E', () => {
  it('air status runs without error', async () => {
    const fixture = join(process.cwd(), 'tests', 'e2e', 'fixtures', 'minimal');
    ensureFixture(fixture);
    const sandbox = createSandbox(fixture);
    try {
      const result = await airOnce(['status'], sandbox.env, sandbox.repoDir);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Tools:');
    } finally {
      sandbox.cleanup();
    }
  });

  it('air models lists adapters', async () => {
    const fixture = join(process.cwd(), 'tests', 'e2e', 'fixtures', 'minimal');
    ensureFixture(fixture);
    const sandbox = createSandbox(fixture);
    try {
      const result = await airOnce(['models'], sandbox.env, sandbox.repoDir);
      expect(result.exitCode).toBe(0);
    } finally {
      sandbox.cleanup();
    }
  });

  it('git clean after sandbox cleanup', async () => {
    const fixture = join(process.cwd(), 'tests', 'e2e', 'fixtures', 'minimal');
    ensureFixture(fixture);
    const sandbox = createSandbox(fixture);
    sandbox.cleanup();
    expect(existsSync(sandbox.repoDir)).toBe(false);
  });
});
