import { trace, configureTrace } from '../src/observability/trace';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { paths } from '../src/config/paths';

// Redirects the trace log to a temp dir so the test never touches the real
// cache directory.

let originalCacheDir: string;
let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'air-trace-'));
  originalCacheDir = (paths as any).cacheDir;
  (paths as any).cacheDir = dir;
  (paths as any).logFile = join(dir, 'air.log');
  configureTrace({ maxBytes: 100, maxBackups: 2 });
});

afterEach(() => {
  (paths as any).cacheDir = originalCacheDir;
  rmSync(dir, { recursive: true, force: true });
});

describe('trace rotation (G3-07)', () => {
  it('writes trace events as JSONL', () => {
    trace({ event: 'test', runId: 'r1' });
    const content = readFileSync(join(dir, 'air.log'), 'utf8');
    const parsed = JSON.parse(content.trim());
    expect(parsed.event).toBe('test');
    expect(parsed.runId).toBe('r1');
    expect(parsed.ts).toBeTruthy();
  });

  it('rotates when the log exceeds maxBytes', () => {
    // Write enough events to exceed the 100-byte cap.
    for (let i = 0; i < 20; i++) {
      trace({ event: 'rotate_test', runId: `r${i}`, index: i });
    }
    // Rotation produces a backup file with the old entries.
    expect(existsSync(join(dir, 'air.log.1'))).toBe(true);
    const rotated = readFileSync(join(dir, 'air.log.1'), 'utf8');
    expect(rotated).toContain('rotate_test');
    // The current log exists and is non-empty.
    expect(existsSync(join(dir, 'air.log'))).toBe(true);
    expect(readFileSync(join(dir, 'air.log'), 'utf8').length).toBeGreaterThan(0);
  });

  it('redacts secrets in rotated files', () => {
    trace({ event: 'secret', token: 'sk-or-this-is-a-fake-test-key-1234567890abcdef' });
    for (let i = 0; i < 20; i++) trace({ event: 'filler', index: i });
    const rotated = readFileSync(join(dir, 'air.log.1'), 'utf8');
    expect(rotated).not.toContain('sk-or-this-is-a-fake-test-key-1234567890abcdef');
  });
});