import { runSession, runSessions, SessionConfig } from '../src/execution/sessions';
import { MockAdapter } from '../src/adapters/mock';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('multi-session parallel execution (R5-25)', () => {
  let dir: string;
  let originalMockMode: string | undefined;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'air-sessions-'));
    originalMockMode = process.env.MOCK_MODE;
  });

  afterEach(() => {
    if (originalMockMode === undefined) delete process.env.MOCK_MODE;
    else process.env.MOCK_MODE = originalMockMode;
    rmSync(dir, { recursive: true, force: true });
  });

  it('runs a single session to completion', async () => {
    process.env.MOCK_MODE = 'succeed';
    writeFileSync(join(dir, 'a.txt'), 'hi');
    const config: SessionConfig = {
      id: 's1',
      task: 'fix',
      cwd: dir,
      adapter: new MockAdapter(),
      mode: 'ask',
      readOnly: true,
    };
    const handle = await runSession(config);
    expect(handle.id).toBe('s1');
    expect(handle.runId).toBeTruthy();
    await handle.promise;
  });

  it('runs multiple sessions concurrently', async () => {
    process.env.MOCK_MODE = 'succeed';
    writeFileSync(join(dir, 'a.txt'), 'hi');
    const configs: SessionConfig[] = [
      { id: 's1', task: 'fix', cwd: dir, adapter: new MockAdapter(), mode: 'ask', readOnly: true },
      { id: 's2', task: 'review', cwd: dir, adapter: new MockAdapter(), mode: 'ask', readOnly: true },
    ];
    const handles = await runSessions(configs);
    expect(handles).toHaveLength(2);
    expect(handles[0].id).toBe('s1');
    expect(handles[1].id).toBe('s2');
    await Promise.allSettled(handles.map((h) => h.promise));
  });

  it('cancels a session without aborting the others', async () => {
    process.env.MOCK_MODE = 'succeed';
    writeFileSync(join(dir, 'a.txt'), 'hi');
    const configs: SessionConfig[] = [
      { id: 's1', task: 'fix', cwd: dir, adapter: new MockAdapter(), mode: 'ask', readOnly: true },
      { id: 's2', task: 'review', cwd: dir, adapter: new MockAdapter(), mode: 'ask', readOnly: true },
    ];
    const handles = await runSessions(configs);
    handles[0].cancel();
    // s2 should still complete.
    await handles[1].promise;
  });
});