// scripts/mutation-check.mjs
// Verifies that AIR's test suite catches deliberate regressions.
// Usage: node scripts/mutation-check.mjs

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const mutations = [
  {
    name: 'Break voiceCheck (remove banned terms list)',
    file: 'tests/e2e/harness/oracles.ts',
    apply: (content) => content.replace(/const banned = \[.*\]/s, "const banned = []"),
    testCmd: ['npx', 'vitest', 'run', 'tests/e2e/harness/oracles.test.ts'],
    shouldFail: true,
  },
  {
    name: 'Break gitClean (always return true)',
    file: 'tests/e2e/harness/oracles.ts',
    apply: (content) => content.replace(/gitClean\(dir: string\): boolean \{[\s\S]*?return out\.trim\(\) === '';/, 'gitClean(dir: string): boolean { return true;'),
    testCmd: ['npx', 'vitest', 'run', 'tests/e2e/harness/oracles.test.ts'],
    shouldFail: true,
  },
];

let passed = 0;
let failed = 0;

for (const mut of mutations) {
  console.log(`\nMutation: ${mut.name}`);
  if (!existsSync(mut.file)) {
    console.log('  SKIP: file not found');
    continue;
  }
  const original = readFileSync(mut.file, 'utf8');
  const mutated = mut.apply(original);
  if (mutated === original) {
    console.log('  SKIP: no change applied');
    continue;
  }
  writeFileSync(mut.file, mutated);
  let testFailed = false;
  try {
    execFileSync(mut.testCmd[0], mut.testCmd.slice(1), { stdio: 'pipe', timeout: 120000 });
  } catch {
    testFailed = true;
  }
  // Restore
  writeFileSync(mut.file, original);
  // Rebuild to restore dist
  try { execFileSync('npm', ['run', 'build'], { stdio: 'pipe', timeout: 120000 }); } catch { /* noop */ }

  if (testFailed === mut.shouldFail) {
    console.log('  PASS: mutation correctly detected');
    passed++;
  } else {
    console.log('  FAIL: mutation NOT detected');
    failed++;
  }
}

console.log(`\nMutation check: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);