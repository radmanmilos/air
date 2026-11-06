import { appendFileSync } from 'node:fs';

const behavior = process.env.FAKE_BEHAVIOR || 'edit';
const delayMs = Number(process.env.FAKE_DELAY_MS || 0);
const recordFile = process.env.FAKE_BRAIN_RECORD || '';

const args = process.argv.slice(2);

async function main() {
  if (args.includes('--version')) {
    process.stdout.write('kilo 1.0.0-fake\n');
    process.exit(0);
  }

  const promptIdx = args.findIndex((a) => !a.startsWith('--') && a !== 'run');
  const prompt = promptIdx >= 0 ? args[promptIdx] : args[args.length - 1] || '';
  if (recordFile) {
    try { appendFileSync(recordFile, prompt + '\n---\n'); } catch { /* noop */ }
  }

  if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));

  if (behavior === 'hang') {
    await new Promise(() => { setInterval(() => {}, 1000); });
    return;
  }

  const text = process.env.FAKE_BRAIN_TEXT || 'Acknowledged.';
  process.stdout.write(JSON.stringify({ type: 'text', part: { text } }) + '\n');
  process.exit(0);
}

main();
EOF