import { describe, it, expect } from 'vitest';
import { createSandbox } from '../harness/sandbox';
import { airOnce } from '../harness/air-process';
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

describe('M-01: Soak - repeated status calls', () => {
  it('10 consecutive status calls succeed', async () => {
    const fixture = join(process.cwd(), 'tests', 'e2e', 'fixtures', 'minimal');
    ensureFixture(fixture);
    const sandbox = createSandbox(fixture);
    try {
      for (let i = 0; i < 10; i++) {
        const result = await airOnce(['status'], sandbox.env, sandbox.dir);
        expect(result.exitCode).toBe(0);
      }
    } finally {
      sandbox.cleanup();
    }
  });
});

describe('M-02: Soak - repeated models calls', () => {
  it('5 consecutive models calls succeed', async () => {
    const fixture = join(process.cwd(), 'tests', 'e2e', 'fixtures', 'minimal');
    ensureFixture(fixture);
    const sandbox = createSandbox(fixture);
    try {
      for (let i = 0; i < 5; i++) {
        const result = await airOnce(['models'], sandbox.env, sandbox.dir);
        expect(result.exitCode).toBe(0);
      }
    } finally {
      sandbox.cleanup();
    }
  });
});

describe('M-03: Soak - repeated dashboard calls', () => {
  it('5 consecutive dashboard calls succeed', async () => {
    const fixture = join(process.cwd(), 'tests', 'e2e', 'fixtures', 'minimal');
    ensureFixture(fixture);
    const sandbox = createSandbox(fixture);
    try {
      for (let i = 0; i < 5; i++) {
        const result = await airOnce(['dashboard'], sandbox.env, sandbox.dir);
        expect(result.exitCode).toBe(0);
      }
    } finally {
      sandbox.cleanup();
    }
  });
});