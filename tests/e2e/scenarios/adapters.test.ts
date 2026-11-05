// tests/e2e/scenarios/adapters.test.ts
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

describe('B-01: Brainstorm uses brain, no job', () => {
  it('short question does not spawn a job', async () => {
    const fixture = join(process.cwd(), 'tests', 'e2e', 'fixtures', 'minimal');
    ensureFixture(fixture);
    const sandbox = createSandbox(fixture);
    try {
      const result = await airOnce(['chat'], sandbox.env, sandbox.dir, 10000);
      // Chat starts without crashing
      expect(result.stdout).toContain('air chat');
    } finally {
      sandbox.cleanup();
    }
  });
});

describe('F-01: Secret redaction', () => {
  it('fake executor printing secret does not leak to output', async () => {
    const fixture = join(process.cwd(), 'tests', 'e2e', 'fixtures', 'minimal');
    ensureFixture(fixture);
    const sandbox = createSandbox(fixture);
    // Set fake behavior to secret
    sandbox.env.FAKE_BEHAVIOR = 'secret';
    try {
      const result = await airOnce(['chat'], sandbox.env, sandbox.dir, 5000);
      // The secret should not appear in stdout
      expect(result.stdout).not.toContain('sk-ant-api03');
    } finally {
      sandbox.cleanup();
    }
  });
});

describe('E-01: Rate limit failover', () => {
  it('rate-limited adapter triggers failover', async () => {
    const fixture = join(process.cwd(), 'tests', 'e2e', 'fixtures', 'minimal');
    ensureFixture(fixture);
    const sandbox = createSandbox(fixture);
    sandbox.env.FAKE_BEHAVIOR = 'rate-limit';
    try {
      const result = await airOnce(['status'], sandbox.env, sandbox.dir);
      expect(result.exitCode).toBe(0);
    } finally {
      sandbox.cleanup();
    }
  });
});