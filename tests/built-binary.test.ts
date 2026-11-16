import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

describe('built binary smoke', () => {
  it('prints help', () => {
    const out = execFileSync(process.execPath, [join(process.cwd(), 'dist/bin/air.js'), '--help'], { encoding: 'utf8' });
    expect(out).toContain('Unified AI tool orchestrator');
  });
  it('chat starts without crashing', () => {
    // The chat REPL refuses non-TTY stdin by design (UI-02). This smoke test
    // drives it with piped input, so it opts in explicitly.
    const out = execFileSync(process.execPath, [join(process.cwd(), 'dist/bin/air.js'), 'chat'], {
      input: '/quit\n',
      encoding: 'utf8',
      timeout: 10000,
      env: { ...process.env, AIR_E2E_TTY: '1' },
    });
    expect(out).toContain('air chat');
  });
});