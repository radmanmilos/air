import { startMcp } from '../src/mcp/server';
import { resetHealth } from '../src/health/tracker';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// R5-16: end-to-end MCP stdio integration test.
//
// Drives the real air MCP server over a pair of linked in-memory transports
// (the same JSON-RPC framing a real stdio client would use), with the MockAdapter
// injected via the AIR_MOCK_ADAPTER seam. Exercises run_task -> get_task_status
// -> get_task_output -> cancel_task as a genuine round-trip, not an in-process
// helper call.

/** Extract the first text content block from a tool result, or stringify. */
function toolText(result: any): string {
  const content = result?.content;
  if (Array.isArray(content) && content[0]?.type === 'text' && typeof content[0].text === 'string') {
    return content[0].text as string;
  }
  return JSON.stringify(content);
}

describe('mcp stdio round-trip (R5-16)', () => {
  let dir: string;
  let originalMockMode: string | undefined;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'air-mcp-'));
    originalMockMode = process.env.MOCK_MODE;
    // The mock adapter shares (openrouter, mock-model) with every other test
    // in this worker, and a previous run's RATE_LIMIT/TIMEOUT cooldown is
    // persisted to the shared health file. Reset it deterministically under
    // the inter-process lock so routing is reproducible (R5-09).
    await resetHealth();
  });

  afterEach(() => {
    if (originalMockMode === undefined) delete process.env.MOCK_MODE;
    else process.env.MOCK_MODE = originalMockMode;
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // A background mock process may still hold the temp dir open on Windows;
      // the OS reclaims it at process exit.
    }
  });

  async function startPair() {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    process.env.AIR_MOCK_ADAPTER = '1';
    const { server } = await startMcp(serverTransport);
    const client = new Client({ name: 'air-test', version: '0.1.0' });
await client.connect(clientTransport);
    return { client, server, serverTransport, clientTransport };
  }

  it('run_task -> get_task_status -> get_task_output round-trip', async () => {
    process.env.MOCK_MODE = 'succeed';
    const { client, serverTransport, clientTransport } = await startPair();

    const run = await client.callTool({
      name: 'run_task',
      arguments: { task: 'do something', cwd: dir, readOnly: true },
    });
    const runText = toolText(run);
    const runId = runText.match(/Started task ([a-z0-9-]+)/)?.[1];
    expect(runId).toBeTruthy();

    // Poll until the job finishes.
    let state: any = null;
    for (let i = 0; i < 50; i++) {
      const st = await client.callTool({
        name: 'get_task_status',
        arguments: { runId: runId! },
      });
      const text = toolText(st);
      state = JSON.parse(text);
      if (state.state === 'COMPLETED' || state.state === 'FAILED' || state.state === 'CANCELLED') break;
      await new Promise((r) => setTimeout(r, 50));
    }
    if (state.state !== 'COMPLETED') {
      throw new Error(`expected COMPLETED, got ${JSON.stringify(state)}`);
    }
    expect(state.state).toBe('COMPLETED');
    expect(state.result).toBe('SUCCEEDED_READ_ONLY');

    const out = await client.callTool({
      name: 'get_task_output',
      arguments: { runId: runId! },
    });
    const outText = toolText(out);
    expect(outText).toContain('Mock tool: editing');

    await clientTransport.close();
    await serverTransport.close();
  });

  it('cancel_task transitions a running job to CANCELLED (R5-12)', async () => {
    process.env.MOCK_MODE = 'hang';
    const { client, serverTransport, clientTransport } = await startPair();

    const run = await client.callTool({
      name: 'run_task',
      arguments: { task: 'hang', cwd: dir, readOnly: true },
    });
    const runText = toolText(run);
    const runId = runText.match(/Started task ([a-z0-9-]+)/)?.[1];
    if (!runId) throw new Error(`run_task did not return a run id: ${runText}`);
    expect(runId).toBeTruthy();

    // Give the background job a moment to start.
    await new Promise((r) => setTimeout(r, 100));

    const cancel = await client.callTool({
      name: 'cancel_task',
      arguments: { runId: runId! },
    });
    const cancelText = toolText(cancel);
    expect(cancelText).toContain('Cancelled');

    let state: any = null;
    for (let i = 0; i < 50; i++) {
      const st = await client.callTool({
        name: 'get_task_status',
        arguments: { runId: runId! },
      });
      const text = toolText(st);
      state = JSON.parse(text);
      if (state.state === 'CANCELLED') break;
      await new Promise((r) => setTimeout(r, 50));
    }
    expect(state.state).toBe('CANCELLED');

    await clientTransport.close();
    await serverTransport.close();
  });

  it('listTools advertises the air tool set', async () => {
    const { client, serverTransport, clientTransport } = await startPair();
    const list = await client.listTools();
    const names = list.tools.map((t) => t.name).sort();
    expect(names).toEqual(
      ['approve_failover', 'cancel_task', 'get_status', 'get_task_output', 'get_task_status', 'run_task'].sort(),
    );
    await clientTransport.close();
    await serverTransport.close();
  });
});