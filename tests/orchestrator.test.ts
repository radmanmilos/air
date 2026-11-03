import { Orchestrator } from '../src/orchestrator/orchestrator';
import { MockAdapter } from '../src/adapters/mock';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('orchestrator workflow', () => {
  let dir: string;
  let originalMockMode: string | undefined;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'air-orch-'));
    writeFileSync(join(dir, 'a.txt'), 'hi');
    originalMockMode = process.env.MOCK_MODE;
    process.env.MOCK_MODE = 'succeed';
  });

  afterEach(() => {
    if (originalMockMode === undefined) delete process.env.MOCK_MODE;
    else process.env.MOCK_MODE = originalMockMode;
    rmSync(dir, { recursive: true, force: true });
  });

  it('orchestrates multiple sessions and logs the full workflow', async () => {
    const adapter = new MockAdapter();
    const orch = new Orchestrator({ adapters: [adapter], config: { concurrency: { maxConcurrentAgents: 2 } }, cacheDir: dir });

    const s1 = await orch.start('task one', dir, { readOnly: true });
    const s2 = await orch.start('task two', dir, { readOnly: true });

    expect(s1.runId).toBeTruthy();
    expect(s2.runId).toBeTruthy();
    expect(orch.list()).toHaveLength(2);

    await orch.waitForAll();

    const sessions = orch.list();
    expect(sessions.every((s) => s.state === 'COMPLETED')).toBe(true);

    const events = orch.eventsLog.map((e) => e.type);
    expect(events).toContain('request_received');
    expect(events).toContain('model_selected');
    expect(events).toContain('session_started');
    expect(events).toContain('session_completed');

    // Compiled response for the user
    const response = sessions.map((s) => `${s.runId}: ${s.result}`).join('; ');
    expect(response).toContain('SUCCEEDED');
  });
});
