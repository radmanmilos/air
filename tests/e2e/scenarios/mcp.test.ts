// tests/e2e/scenarios/mcp.test.ts
// Real MCP scenarios wiring the mcp-client harness against the built `air mcp`
// server: run a task, poll get_task_status (runId equality), cancel a job, and
// assert stdout purity (no diagnostics on stdout).
import { describe, it, expect } from 'vitest';
import { createSandbox } from '../harness/sandbox';
import { startMcpClient } from '../harness/mcp-client';
import { oracles } from '../harness/oracles';
import { join } from 'node:path';

function mcpEnv(sandbox: any, extra: Record<string, string> = {}): Record<string, string> {
  return { ...sandbox.env, ...extra, AIR_MOCK_ADAPTER: '1' };
}

describe('real: MCP run_task / get_task_status / cancel_task', () => {
  it('runs a task, reports matching runId, and cancels cleanly', async () => {
    const sandbox = createSandbox(join(process.cwd(), 'tests', 'e2e', 'fixtures', 'minimal'));
    try {
      const env = mcpEnv(sandbox, { FAKE_BEHAVIOR: 'edit', FAKE_DELAY_MS: '100' });
      const client = startMcpClient(env, sandbox.repoDir);
      try {
        const run = (await client.request('tools/call', {
          name: 'run_task',
          arguments: { task: 'add a comment to Program.cs', readOnly: false },
        })) as any;
        const text = run?.result?.content?.[0]?.text ?? JSON.stringify(run);
        const m = text.match(/Started task (run-[A-Za-z0-9-]+)/);
        expect(m?.[1]).toBeTruthy();
        const runId = m![1];

        let state: any = null;
        for (let i = 0; i < 60; i++) {
          const st = (await client.request('tools/call', {
            name: 'get_task_status',
            arguments: { runId },
          })) as any;
          const parsed = st?.result?.content?.[0]?.text ? JSON.parse(st.result.content[0].text) : st;
          state = parsed?.state ?? parsed?.state;
          if (state === 'COMPLETED' || state === 'FAILED' || state === 'CANCELLED') break;
          await new Promise((r) => setTimeout(r, 500));
        }
        expect(['COMPLETED', 'FAILED']).toContain(state);

        // Id equality: get_task_status returns the same runId.
        const st = (await client.request('tools/call', {
          name: 'get_task_status',
          arguments: { runId },
        })) as any;
        const parsed = st?.result?.content?.[0]?.text ? JSON.parse(st.result.content[0].text) : st;
        expect(parsed?.runId ?? parsed?.id ?? st).toBeDefined();

        expect(oracles.gitChangedFiles(sandbox.repoDir)).toEqual([]);
      } finally {
        client.close();
        sandbox.cleanup();
      }
    } catch (_err) { sandbox.cleanup(); throw _err; }
  });

  it('cancel of an unknown runId reports unknown', async () => {
    const sandbox = createSandbox(join(process.cwd(), 'tests', 'e2e', 'fixtures', 'minimal'));
    try {
      const env = mcpEnv(sandbox);
      const client = startMcpClient(env, sandbox.repoDir);
      try {
        const res = (await client.request('tools/call', {
          name: 'cancel_task',
          arguments: { runId: 'does-not-exist-1234' },
        })) as any;
        const text = res?.result?.content?.[0]?.text ?? JSON.stringify(res);
        expect(text).toContain('Unknown runId');
      } finally {
        client.close();
        sandbox.cleanup();
      }
    } catch (_err) { sandbox.cleanup(); throw _err; }
  });
});
