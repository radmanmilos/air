// scripts/mutation-check.mjs
// Verifies that AIR's test suite catches deliberate regressions in AIR code.
// Usage: node scripts/mutation-check.mjs
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const mutations = [
  { name: 'Re-enable shell in brain', file: 'src/brain/index.ts', apply: (c) => c.replace("stdio: ['ignore', 'pipe', 'pipe']", "stdio: ['ignore', 'pipe', 'pipe'], shell: true"), testCmd: ['npx', 'vitest', 'run', 'tests/e2e/scenarios/real-jobs.test.ts', '-t', 'P-01'], shouldFail: true },
  { name: 'Make cancel print only', file: 'bin/air.ts', apply: (c) => c.replace(/await entry\.orch\.cancel\(id\)/, '/* cancel disabled */'), testCmd: ['npx', 'vitest', 'run', 'tests/e2e/scenarios/real-jobs.test.ts', '-t', 'P-03'], shouldFail: true },
  { name: 'Sync brain', file: 'src/brain/index.ts', apply: (c) => c.replace(/export async function brainAnswer/, 'export function brainAnswer'), testCmd: ['npm', 'run', 'typecheck'], shouldFail: true },
];

let passed = 0, failed = 0;
for (const mut of mutations) {
  console.log(`\nMutation: ${mut.name}`);
  if (!existsSync(mut.file)) { console.log('  SKIP: file not found'); continue; }
  const original = readFileSync(mut.file, 'utf8');
  const mutated = mut.apply(original);
  if (mutated === original) { console.log('  SKIP: no change applied'); failed++; continue; }
  writeFileSync(mut.file, mutated);
  let testFailed = false;
  try { execFileSync(mut.testCmd[0], mut.testCmd.slice(1), { stdio: 'pipe', timeout: 180000 }); }
  catch { testFailed = true; }
  writeFileSync(mut.file, original);
  try { execFileSync('npm', ['run', 'build'], { stdio: 'pipe', timeout: 180000 }); } catch { /* noop */ }
  if (testFailed === mut.shouldFail) { console.log('  PASS: mutation correctly detected'); passed++; }
  else { console.log('  FAIL: mutation NOT detected'); failed++; }
}
console.log(`\nMutation check: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
EOF