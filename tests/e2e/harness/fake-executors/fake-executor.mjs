// Shared fake executor for deterministic E2E tests.
// Controlled by env vars:
//   FAKE_BEHAVIOR=edit|rate-limit|crash|hang|long-run|secret|no-change
//   FAKE_DELAY_MS=number
//   FAKE_EXIT_CODE=number
//   FAKE_TOOL=name (aider, goose, opencode, kilo, ollama)

const behavior = process.env.FAKE_BEHAVIOR || 'edit';
const delayMs = parseInt(process.env.FAKE_DELAY_MS || '0', 10);
const tool = process.env.FAKE_TOOL || 'aider';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  if (behavior === 'hang') { await new Promise(() => {}); return; }
  if (delayMs > 0) await sleep(delayMs);

  if (behavior === 'rate-limit') { process.stderr.write('rate limit exceeded: 429\n'); process.exit(1); }
  if (behavior === 'crash') { process.stderr.write('crash\n'); process.exit(parseInt(process.env.FAKE_EXIT_CODE || '1', 10)); }
  if (behavior === 'secret') { process.stdout.write('Using key sk-ant-api03-FAKESECRET1234567890\n'); process.exit(0); }
  if (behavior === 'edit') {
    const { readdirSync, readFileSync, writeFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const cwd = process.cwd();
    try {
      const files = readdirSync(cwd, { recursive: true });
      const target = files.find(f => typeof f === 'string' && f.endsWith('.cs') && !f.includes('test'));
      if (target) {
        const fullPath = join(cwd, target);
        const content = readFileSync(fullPath, 'utf8');
        writeFileSync(fullPath, content + `\n// edited by fake ${tool}\n`);
      }
    } catch { /* noop */ }
    process.stdout.write(`Applied edit via ${tool}.\n`);
    process.exit(0);
  }
  if (behavior === 'no-change') { process.stdout.write('No changes needed.\n'); process.exit(0); }
  process.exit(0);
}

main();