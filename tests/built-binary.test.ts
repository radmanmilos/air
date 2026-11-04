import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

describe('built binary smoke', () => {
  it('prints help', () => {
    const out = execFileSync(process.execPath, [join(process.cwd(), 'dist/bin/air.js'), '--help'], { encoding: 'utf8' });
    expect(out).toContain('Unified AI tool orchestrator');
  });
  it('chat starts without crashing', () => {
    const out = execFileSync(process.execPath, [join(process.cwd(), 'dist/bin/air.js'), 'chat'], { input: '/quit\n', encoding: 'utf8', timeout: 10000 });
    expect(out).toContain('air chat');
  });
});