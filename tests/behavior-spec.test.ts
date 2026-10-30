import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, it, expect } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SPEC = join(__dirname, '..', 'docs', 'behavior-spec.md');

function specText(): string {
  return readFileSync(SPEC, 'utf8');
}

describe('behavior-spec conformance (G-05)', () => {
  it('documents every CLI command', () => {
    const spec = specText();
    for (const cmd of ['run', 'status', 'health', 'route-test', 'config', 'mcp']) {
      expect(spec).toContain(`\`air ${cmd}`);
    }
  });

  it('health is documented as a true alias of status', () => {
    const spec = specText();
    expect(spec).toMatch(/health[\s\S]{0,200}?alias/);
  });

  it('documents exit codes', () => {
    expect(specText()).toContain('Exit codes');
  });

  it('documents config migrate', () => {
    expect(specText()).toContain('air config migrate');
  });
});