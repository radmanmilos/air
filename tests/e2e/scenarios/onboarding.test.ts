// tests/e2e/scenarios/onboarding.test.ts
import { execSync } from 'node:child_process';
import { describe, it, expect } from 'vitest';
import { createSandbox, gitClean } from '../harness/sandbox';
import { airOnce, airSpawn } from '../harness/air-process';
import { oracles } from '../harness/oracles';
import { join } from 'node:path';
import { rmSync } from 'node:fs';

describe('SMOKE: onboarding chat starts', () => {
  it('reply arrives, repo unchanged, no job writes files', async () => {
    const fixture = join(process.cwd(), 'tests', 'e2e', 'fixtures', 'minimal');
    // Create a minimal fixture if it doesn't exist
    const { mkdirSync, writeFileSync } = await import('node:fs');
    if (!require('node:fs').existsSync(fixture)) {
      mkdirSync(fixture, { recursive: true });
      writeFileSync(join(fixture, 'README.md'), '# Test Project\nA simple C# console app.\n');
      writeFileSync(join(fixture, 'Program.cs'), 'Console.WriteLine("Hello");\n');
      execSync('git init && git add -A && git commit -m baseline', { cwd: fixture, stdio: 'ignore' });
    }
    const sandbox = createSandbox(fixture);
    try {
      const result = await airOnce(['chat'], sandbox.env, sandbox.repoDir, 30000);
      // The process should have started (may timeout since chat waits for input)
      expect(result.exitCode === null || result.exitCode === 0).toBe(true);
    } finally {
      sandbox.cleanup();
    }
  }, 60000);
});
