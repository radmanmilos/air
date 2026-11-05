import { describe, it, expect } from 'vitest';
import { createSandbox } from '../harness/sandbox';
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

describe('B-02: Simple edit task', () => {
  it('air run with simple task completes', async () => {
    const fixture = join(process.cwd(), 'tests', 'e2e', 'fixtures', 'minimal');
    ensureFixture(fixture);
    const sandbox = createSandbox(fixture);
    try {
      const result = await airOnce(['run', 'add a comment to Program.cs'], sandbox.env, sandbox.dir, 30000);
      expect(result.exitCode === 0 || result.exitCode === null).toBe(true);
    } finally {
      sandbox.cleanup();
    }
  });
});

describe('C-01: Fix a bug', () => {
  it('air run with bug fix task', async () => {
    const fixture = join(process.cwd(), 'tests', 'e2e', 'fixtures', 'minimal');
    ensureFixture(fixture);
    const sandbox = createSandbox(fixture);
    try {
      const result = await airOnce(['run', 'fix the null reference in Program.cs'], sandbox.env, sandbox.dir, 30000);
      expect(result.exitCode === 0 || result.exitCode === null).toBe(true);
    } finally {
      sandbox.cleanup();
    }
  });
});

describe('F-02: Redaction in result', () => {
  it('secret not in output', async () => {
    const fixture = join(process.cwd(), 'tests', 'e2e', 'fixtures', 'minimal');
    ensureFixture(fixture);
    const sandbox = createSandbox(fixture);
    sandbox.env.FAKE_BEHAVIOR = 'secret';
    try {
      const result = await airOnce(['run', 'do something'], sandbox.env, sandbox.dir, 10000);
      expect(result.stdout).not.toContain('sk-ant-api03');
    } finally {
      sandbox.cleanup();
    }
  });
});

describe('G-01: Voice spec - no tool names in agent prose', () => {
  it('clean agent reply has no voice violations', () => {
    const clean = 'I updated the greeting in Program.cs to say Hello AIR.';
    const violations = oracles.voiceCheck(clean);
    expect(violations).toHaveLength(0);
  });
});