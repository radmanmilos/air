import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('package scripts', () => {
  const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as any;
  it('defines eval:models', () => {
    expect(pkg.scripts['eval:models']).toBe('tsx scripts/eval-models.ts');
  });
  it('defines pilot:local', () => {
    expect(pkg.scripts['pilot:local']).toBe('vitest run tests/e2e/pilot/');
  });
});