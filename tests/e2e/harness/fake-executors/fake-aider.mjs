#!/usr/bin/env node
// Fake aider executor for deterministic E2E tests.
// Behavior controlled by env vars:
//   FAKE_BEHAVIOR=edit|rate-limit|crash|hang|long-run|secret|no-change
//   FAKE_DELAY_MS=number (delay before completing)
//   FAKE_EXIT_CODE=number (exit code, default 0 for edit, 1 for crash)

const behavior = process.env.FAKE_BEHAVIOR || 'edit';
const delayMs = parseInt(process.env.FAKE_DELAY_MS || '0', 10);
const exitCode = parseInt(process.env.FAKE_EXIT_CODE || (behavior === 'crash' ? '1' : '0'), 10);

const args = process.argv.slice(2);
const prompt = args.join(' ');

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  if (behavior === 'hang') {
    await new Promise(() => {}); // never resolve
    return;
  }
  if (delayMs > 0) await sleep(delayMs);

  if (behavior === 'rate-limit') {
    process.stderr.write('rate limit exceeded: 429 Too Many Requests\n');
    process.exit(1);
  }
  if (behavior === 'crash') {
    process.stderr.write('Segmentation fault\n');
    process.exit(exitCode || 1);
  }
  if (behavior === 'secret') {
    process.stdout.write('Using key sk-ant-api03-FAKESECRET1234567890\n');
    process.exit(0);
  }
  if (behavior === 'edit') {
    // Find a file to edit: look for Program.cs or first .cs file
    const fs = await import('node:fs');
    const path = await import('node:path');
    // Simple: append a comment to the first .cs file found
    const cwd = process.cwd();
    let target = null;
    try {
      const files = fs.readdirSync(cwd, { recursive: true });
      target = files.find(f => f.endsWith('.cs') && !f.includes('test'));
    } catch { /* noop */ }
    if (target) {
      const fullPath = path.join(cwd, target);
      const content = fs.readFileSync(fullPath, 'utf8');
      fs.writeFileSync(fullPath, content + '\n// edited by fake aider\n');
    }
    process.stdout.write('Applied edit.\n');
    process.exit(0);
  }
  if (behavior === 'no-change') {
    process.stdout.write('No changes needed.\n');
    process.exit(0);
  }
  process.exit(0);
}

main();