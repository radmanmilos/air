#!/usr/bin/env node
// Fake goose executor (same behavior as fake-aider, controlled by FAKE_BEHAVIOR)
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
const behavior = process.env.FAKE_BEHAVIOR || 'edit';
const delayMs = parseInt(process.env.FAKE_DELAY_MS || '0', 10);
if (delayMs > 0) await new Promise(r => setTimeout(r, delayMs));
if (behavior === 'rate-limit') { process.stderr.write('429 rate limit\n'); process.exit(1); }
if (behavior === 'crash') { process.stderr.write('crash\n'); process.exit(1); }
if (behavior === 'hang') { await new Promise(() => {}); }
if (behavior === 'secret') { process.stdout.write('key sk-ant-api03-FAKESECRET\n'); process.exit(0); }
if (behavior === 'edit') {
  const { readdirSync, readFileSync, writeFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  const cwd = process.cwd();
  try {
    const files = readdirSync(cwd, { recursive: true });
    const target = files.find(f => f.endsWith('.cs') && !f.includes('test'));
    if (target) {
      const fullPath = join(cwd, target);
      const content = readFileSync(fullPath, 'utf8');
      writeFileSync(fullPath, content + '\n// edited by fake goose\n');
    }
  } catch { /* noop */ }
  process.stdout.write('Applied edit.\n');
}
process.exit(0);