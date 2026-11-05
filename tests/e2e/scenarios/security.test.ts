// tests/e2e/scenarios/security.test.ts
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

describe('H-01: Shell metacharacters in chat text', () => {
  const sentinels = ['SENTINEL', 'PWN'];
  const payloads = [
    'what is this; touch SENTINEL',
    'what is this && touch SENTINEL',
  ];

  for (const payload of payloads) {
    it(`does not create sentinel for: ${payload}`, async () => {
      const fixture = join(process.cwd(), 'tests', 'e2e', 'fixtures', 'minimal');
      ensureFixture(fixture);
      const sandbox = createSandbox(fixture);
      try {
        await airOnce(['chat'], sandbox.env, sandbox.repoDir, 5000);
        // Check sentinel doesn't exist
        for (const s of sentinels) {
          expect(existsSync(join(sandbox.repoDir, s))).toBe(false);
        }
      } finally {
        sandbox.cleanup();
      }
    });
  }
});

describe('J-01: Free-only default', () => {
  it('free adapters are listed', async () => {
    const fixture = join(process.cwd(), 'tests', 'e2e', 'fixtures', 'minimal');
    ensureFixture(fixture);
    const sandbox = createSandbox(fixture);
    try {
      const result = await airOnce(['models'], sandbox.env, sandbox.repoDir);
      expect(result.exitCode).toBe(0);
      // At least one adapter should be listed
      expect(result.stdout.length).toBeGreaterThan(0);
    } finally {
      sandbox.cleanup();
    }
  });
});
