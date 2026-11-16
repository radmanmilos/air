import { startMcp, jobs } from '../src/mcp/server';
import { resetHealth } from '../src/health/tracker';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readTaskState, writeTaskState } from '../src/execution/task-state';
import { loadConversation, saveConversation, mutateConversation, createConversation } from '../src/conversation';

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
  let cacheDir: string;
  let originalMockMode: string | undefined;
  let originalCacheDir: string | undefined;

  let originalBarrierFile: string | undefined;
  let originalReadyFile: string | undefined;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'air-mcp-'));
    cacheDir = mkdtempSync(join(tmpdir(), 'air-mcp-cache-'));
    originalMockMode = process.env.MOCK_MODE;
    originalCacheDir = process.env.AIR_CACHE_DIR;
    originalBarrierFile = process.env.MOCK_BARRIER_FILE;
    originalReadyFile = process.env.MOCK_READY_FILE;
    process.env.AIR_CACHE_DIR = cacheDir;
    // The mock adapter shares (openrouter, mock-model) with every other test
    // in this worker, and a previous run's RATE_LIMIT/TIMEOUT cooldown is
    // persisted to the shared health file. Reset it deterministically under
    // the inter-process lock so routing is reproducible (R5-09).
    await resetHealth();
  });

  afterEach(() => {
    if (originalMockMode === undefined) delete process.env.MOCK_MODE;
    else process.env.MOCK_MODE = originalMockMode;
    if (originalCacheDir === undefined) delete process.env.AIR_CACHE_DIR;
    else process.env.AIR_CACHE_DIR = originalCacheDir;
    if (originalBarrierFile === undefined) delete process.env.MOCK_BARRIER_FILE;
    else process.env.MOCK_BARRIER_FILE = originalBarrierFile;
    if (originalReadyFile === undefined) delete process.env.MOCK_READY_FILE;
    else process.env.MOCK_READY_FILE = originalReadyFile;
    jobs.clear();
    try {
      rmSync(dir, { recursive: true, force: true });
      rmSync(cacheDir, { recursive: true, force: true });
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
        ['approve_failover', 'cancel_task', 'chat_send', 'get_conversation', 'get_status', 'get_task_output',
          'get_task_status', 'install_adapter', 'list_adapters', 'list_conversations', 'list_jobs', 'resume_task', 'run_task', 'uninstall_adapter',
          'upgrade_adapter'].sort(),
      );
    await clientTransport.close();
    await serverTransport.close();
  });

  it('chat_send deterministic race: cancellation wins against barrier job', async () => {
    process.env.MOCK_MODE = 'barrier_succeed';
    const barrier = join(dir, 'barrier-go');
    const ready = join(dir, 'barrier-ready');
    process.env.MOCK_BARRIER_FILE = barrier;
    process.env.MOCK_READY_FILE = ready;
    const { client, serverTransport, clientTransport } = await startPair();

    const send = await client.callTool({
      name: 'chat_send',
      arguments: { message: 'what is in package.json?', cwd: dir },
    });
    const sendText = toolText(send);
    const convId = sendText.match(/conversation=([a-f0-9-]+)/)?.[1];
    const runId = sendText.match(/Started job ([a-z0-9-]+)/)?.[1];
    expect(convId).toBeTruthy(); expect(runId).toBeTruthy();

    for (let i = 0; i < 200; i++) {
      const st = await readTaskState(runId!);
      const conv = loadConversation(convId!);
      if (st?.state === 'RUNNING' && conv?.activeWorkIds.includes(runId!)) break;
      await new Promise((r) => setTimeout(r, 20));
    }
    expect((await readTaskState(runId!))?.state).toBe('RUNNING');

    const cancel = await client.callTool({
      name: 'chat_send',
      arguments: { conversationId: convId, message: `/cancel ${runId}`, cwd: dir },
    });
    expect(toolText(cancel)).toContain(`Cancelled ${runId}`);

    // release barrier if mock is waiting (safe if not)
    try { writeFileSync(barrier, 'go'); } catch {}
    const final = await readTaskState(runId!);
    expect(final?.state).toBe('CANCELLED');
    expect(final?.result).toBe('CANCELLED');
    expect(loadConversation(convId!)?.activeWorkIds).not.toContain(runId);

    await clientTransport.close();
    await serverTransport.close();
  });

  it('chat_send deterministic race: completion wins before cancellation', async () => {
    process.env.MOCK_MODE = 'succeed';
    const { client, serverTransport, clientTransport } = await startPair();

    const send = await client.callTool({
      name: 'chat_send',
      arguments: { message: 'what is in package.json?', cwd: dir },
    });
    const sendText = toolText(send);
    const convId = sendText.match(/conversation=([a-f0-9-]+)/)?.[1];
    const runId = sendText.match(/Started job ([a-z0-9-]+)/)?.[1];
    expect(convId).toBeTruthy(); expect(runId).toBeTruthy();

    for (let i = 0; i < 200; i++) {
      const st = await readTaskState(runId!);
      if (st && (st.state === 'COMPLETED' || st.state === 'FAILED')) break;
      await new Promise((r) => setTimeout(r, 20));
    }
    const before = await readTaskState(runId!);
    expect(['COMPLETED', 'FAILED']).toContain(before?.state);
    const snap = JSON.stringify({ state: before?.state, result: before?.result, endedAt: before?.endedAt });

    const cancel = await client.callTool({
      name: 'chat_send',
      arguments: { conversationId: convId, message: `/cancel ${runId}`, cwd: dir },
    });
    expect(toolText(cancel)).toContain(`not running (${before?.state})`);
    const after = await readTaskState(runId!);
    expect(JSON.stringify({ state: after?.state, result: after?.result, endedAt: after?.endedAt })).toBe(snap);
    expect(loadConversation(convId!)?.activeWorkIds).not.toContain(runId);

    await clientTransport.close();
    await serverTransport.close();
  });

  it('run_task cancel_task reports actual outcomes and preserves terminal states', async () => {
    // running -> cancelled
    process.env.MOCK_MODE = 'hang';
    const { client, serverTransport, clientTransport } = await startPair();
    const run = await client.callTool({ name: 'run_task', arguments: { task: 'hang', cwd: dir, readOnly: true } });
    const runId = toolText(run).match(/Started task ([a-z0-9-]+)/)?.[1];
    expect(runId).toBeTruthy();
    await new Promise((r) => setTimeout(r, 100));
    const cancel = await client.callTool({ name: 'cancel_task', arguments: { runId: runId! } });
    expect(toolText(cancel)).toContain(`Cancelled ${runId}`);
    for (let i = 0; i < 80; i++) {
      const st = await readTaskState(runId!);
      if (st?.state === 'CANCELLED') break;
      await new Promise((r) => setTimeout(r, 50));
    }
    expect((await readTaskState(runId!))?.state).toBe('CANCELLED');
    const again = await client.callTool({ name: 'cancel_task', arguments: { runId: runId! } });
    expect(toolText(again)).toContain('not running (CANCELLED)');

    // unknown
    const unknown = await client.callTool({ name: 'cancel_task', arguments: { runId: 'run-nope-nope' } });
    expect(toolText(unknown)).toContain('Unknown runId');

    // completed preserved
    process.env.MOCK_MODE = 'succeed';
    const done = await client.callTool({ name: 'run_task', arguments: { task: 'quick', cwd: dir, readOnly: true } });
    const doneId = toolText(done).match(/Started task ([a-z0-9-]+)/)?.[1];
    expect(doneId).toBeTruthy();
    for (let i = 0; i < 120; i++) {
      const st = await readTaskState(doneId!);
      if (st && (st.state === 'COMPLETED' || st.state === 'FAILED' || st.state === 'CANCELLED')) break;
      await new Promise((r) => setTimeout(r, 50));
    }
    const doneSt = await readTaskState(doneId!);
    expect(['COMPLETED', 'FAILED']).toContain(doneSt?.state);
    const doneSnap = JSON.stringify({ state: doneSt?.state, result: doneSt?.result });
    const cancelDone = await client.callTool({ name: 'cancel_task', arguments: { runId: doneId! } });
    expect(toolText(cancelDone)).toContain(`not running (${doneSt?.state})`);
    expect(JSON.stringify({ state: (await readTaskState(doneId!))?.state, result: (await readTaskState(doneId!))?.result })).toBe(doneSnap);

    await clientTransport.close();
    await serverTransport.close();
  });

  it('normal non-mock chat respects freeOnly and does not inject mock adapters', async () => {
    const originalMockAdapter = process.env.AIR_MOCK_ADAPTER;
    const originalMockMode = process.env.MOCK_MODE;
    const originalFoo = process.env.AIR_MOCK_ADAPTER_FOO;
    try {
      delete process.env.AIR_MOCK_ADAPTER;
      delete process.env.MOCK_MODE;
      process.env.AIR_MOCK_ADAPTER_FOO = '1'; // unrelated env must not enable bypass
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      await startMcp(serverTransport);
      const client = new Client({ name: 'air-test', version: '0.1.0' });
      await client.connect(clientTransport);

      // free-only conversation must not silently select a non-free/mock provider
      const freeConv = createConversation({ freeOnly: true });
      saveConversation(freeConv);
      const sendFree = await client.callTool({
        name: 'chat_send',
        arguments: { conversationId: freeConv.id, message: 'what is in package.json?', cwd: dir },
      });
      const sendFreeText = toolText(sendFree);
      const freeRunId = sendFreeText.match(/Started job ([a-z0-9-]+)/)?.[1];
      if (freeRunId) {
        const st = await readTaskState(freeRunId);
        expect(st?.adapter).not.toBe('mock');
        expect(st?.provider).not.toBe('openrouter');
        expect(st?.model).not.toBe('mock-model');
        // cleanup if running
        await client.callTool({ name: 'chat_send', arguments: { conversationId: freeConv.id, message: `/cancel ${freeRunId}`, cwd: dir } }).catch(() => {});
      } else {
        // no spawn is acceptable when no free-capable adapter is available
        expect(sendFreeText).not.toContain('mock');
        expect(loadConversation(freeConv.id)?.activeWorkIds ?? []).toEqual([]);
      }

      // conversation with freeOnly false preserves intended routing behavior (no mock injection, unrelated env ignored)
      const paidConv = createConversation({ freeOnly: false });
      saveConversation(paidConv);
      const sendPaid = await client.callTool({
        name: 'chat_send',
        arguments: { conversationId: paidConv.id, message: 'what is in package.json?', cwd: dir },
      });
      const sendPaidText = toolText(sendPaid);
      const paidRunId = sendPaidText.match(/Started job ([a-z0-9-]+)/)?.[1];
      if (paidRunId) {
        const st = await readTaskState(paidRunId);
        expect(st?.adapter).not.toBe('mock');
      } else {
        // may fail to start in environments with no adapters; must still not inject mock
        expect(sendPaidText).not.toContain('mock-model');
        expect(loadConversation(paidConv.id)?.activeWorkIds ?? []).toEqual([]);
      }
      // mock bypass must not activate from unrelated env
      expect(sendPaidText).not.toContain('mock-model');

      // cleanup any started jobs
      if (paidRunId) await client.callTool({ name: 'chat_send', arguments: { conversationId: paidConv.id, message: `/cancel ${paidRunId}`, cwd: dir } }).catch(() => {});

      await clientTransport.close();
      await serverTransport.close();
    } finally {
      if (originalMockAdapter === undefined) delete process.env.AIR_MOCK_ADAPTER;
      else process.env.AIR_MOCK_ADAPTER = originalMockAdapter;
      if (originalMockMode === undefined) delete process.env.MOCK_MODE;
      else process.env.MOCK_MODE = originalMockMode;
      if (originalFoo === undefined) delete process.env.AIR_MOCK_ADAPTER_FOO;
      else process.env.AIR_MOCK_ADAPTER_FOO = originalFoo;
    }
  });

  it('chat_send cancel_job with no task state is reported unknown', async () => {
    // existing unknown-id case in previous test covers this; keep explicit guard
    const { client, serverTransport, clientTransport } = await startPair();
    const unknown = await client.callTool({ name: 'chat_send', arguments: { message: '/cancel run-definitely-missing', cwd: dir } });
    expect(toolText(unknown)).toContain('Unknown job run-definitely-missing');
    await clientTransport.close();
    await serverTransport.close();
  });

  it('chat_send rejects cross-conversation cancellation and preserves running job', async () => {
    process.env.MOCK_MODE = 'hang';
    const { client, serverTransport, clientTransport } = await startPair();
    const sendA = await client.callTool({ name: 'chat_send', arguments: { message: 'what is in package.json for A?', cwd: dir } });
    const textA = toolText(sendA);
    const convA = textA.match(/conversation=([a-f0-9-]+)/)?.[1];
    const runA = textA.match(/Started job ([a-z0-9-]+)/)?.[1];
    expect(convA).toBeTruthy(); expect(runA).toBeTruthy();
    for (let i = 0; i < 120; i++) {
      const st = await readTaskState(runA!);
      if (st?.state === 'RUNNING') break;
      await new Promise((r) => setTimeout(r, 20));
    }
    expect((await readTaskState(runA!))?.state).toBe('RUNNING');

    const sendB = await client.callTool({ name: 'chat_send', arguments: { message: 'what is in package.json for B?', cwd: dir } });
    const convB = toolText(sendB).match(/conversation=([a-f0-9-]+)/)?.[1];
    expect(convB).toBeTruthy();
    expect(convB).not.toBe(convA);

    const cancelFromB = await client.callTool({ name: 'chat_send', arguments: { conversationId: convB, message: `/cancel ${runA}`, cwd: dir } });
    expect(toolText(cancelFromB)).toMatch(/does not belong to this conversation|Unknown job/);
    // job still running and still active in owner conversation
    expect((await readTaskState(runA!))?.state).toBe('RUNNING');
    expect(loadConversation(convA!)?.activeWorkIds).toContain(runA);

    // cleanup: cancel from owner
    const cancelOwner = await client.callTool({ name: 'chat_send', arguments: { conversationId: convA, message: `/cancel ${runA}`, cwd: dir } });
    expect(toolText(cancelOwner)).toContain(`Cancelled ${runA}`);
    const runB = toolText(sendB).match(/Started job ([a-z0-9-]+)/)?.[1];
    if (runB) await client.callTool({ name: 'chat_send', arguments: { conversationId: convB, message: `/cancel ${runB}`, cwd: dir } }).catch(() => {});
    await clientTransport.close();
    await serverTransport.close();
  });

  it('chat_send concurrent cancel requests are safe and outcome-confirmed', async () => {
    process.env.MOCK_MODE = 'hang';
    const { client, serverTransport, clientTransport } = await startPair();
    const send = await client.callTool({ name: 'chat_send', arguments: { message: 'what is in package.json?', cwd: dir } });
    const sendText = toolText(send);
    const convId = sendText.match(/conversation=([a-f0-9-]+)/)?.[1];
    const runId = sendText.match(/Started job ([a-z0-9-]+)/)?.[1];
    expect(convId).toBeTruthy(); expect(runId).toBeTruthy();
    for (let i = 0; i < 120; i++) {
      const st = await readTaskState(runId!);
      if (st?.state === 'RUNNING') break;
      await new Promise((r) => setTimeout(r, 20));
    }
    const [c1, c2] = await Promise.all([
      client.callTool({ name: 'chat_send', arguments: { conversationId: convId, message: `/cancel ${runId}`, cwd: dir } }),
      client.callTool({ name: 'chat_send', arguments: { conversationId: convId, message: `/cancel ${runId}`, cwd: dir } }),
    ]);
    const t1 = toolText(c1); const t2 = toolText(c2);
    // each must report based on actual/persisted reality, never fabricate success
    expect(t1).toMatch(/Cancelled|not running|Cancellation unconfirmed|Unknown job|Cannot cancel/);
    expect(t2).toMatch(/Cancelled|not running|Cancellation unconfirmed|Unknown job|Cannot cancel/);
    for (let i = 0; i < 120; i++) {
      const st = await readTaskState(runId!);
      if (st?.state === 'CANCELLED') break;
      await new Promise((r) => setTimeout(r, 20));
    }
    expect((await readTaskState(runId!))?.state).toBe('CANCELLED');
    expect(loadConversation(convId!)?.activeWorkIds).not.toContain(runId);
    await clientTransport.close();
    await serverTransport.close();
  });

  it('chat_send cancel preserves terminal FAILED state', async () => {
    process.env.MOCK_MODE = 'barrier_crash';
    const barrier = join(dir, 'barrier-go-fail');
    process.env.MOCK_BARRIER_FILE = barrier;
    delete process.env.MOCK_READY_FILE;
    const { client, serverTransport, clientTransport } = await startPair();
    const send = await client.callTool({ name: 'chat_send', arguments: { message: 'what is in package.json?', cwd: dir } });
    const sendText = toolText(send);
    const convId = sendText.match(/conversation=([a-f0-9-]+)/)?.[1];
    const runId = sendText.match(/Started job ([a-z0-9-]+)/)?.[1];
    expect(convId).toBeTruthy(); expect(runId).toBeTruthy();
    for (let i = 0; i < 120; i++) {
      const st = await readTaskState(runId!);
      if (st?.state === 'RUNNING') break;
      await new Promise((r) => setTimeout(r, 20));
    }
    writeFileSync(barrier, 'go');
    for (let i = 0; i < 200; i++) {
      const st = await readTaskState(runId!);
      if (st && (st.state === 'FAILED' || st.state === 'COMPLETED' || st.state === 'CANCELLED')) break;
      await new Promise((r) => setTimeout(r, 20));
    }
    const before = await readTaskState(runId!);
    expect(['FAILED', 'COMPLETED']).toContain(before?.state);
    const snap = JSON.stringify({ state: before?.state, result: before?.result, endedAt: before?.endedAt, error: before?.error });
    const cancel = await client.callTool({ name: 'chat_send', arguments: { conversationId: convId, message: `/cancel ${runId}`, cwd: dir } });
    expect(toolText(cancel)).toContain(`not running (${before?.state})`);
    const after = await readTaskState(runId!);
    expect(JSON.stringify({ state: after?.state, result: after?.result, endedAt: after?.endedAt, error: after?.error })).toBe(snap);
    expect(loadConversation(convId!)?.activeWorkIds).not.toContain(runId);
    await clientTransport.close();
    await serverTransport.close();
  });

  it('cancel_task reports unconfirmed when persisted state cannot be read after abort', async () => {
    process.env.MOCK_MODE = 'hang';
    const { client, serverTransport, clientTransport } = await startPair();
    const run = await client.callTool({ name: 'run_task', arguments: { task: 'hang', cwd: dir, readOnly: true } });
    const runId = toolText(run).match(/Started task ([a-z0-9-]+)/)?.[1];
    expect(runId).toBeTruthy();
    for (let i = 0; i < 120; i++) {
      const st = await readTaskState(runId!);
      if (st?.state === 'RUNNING') break;
      await new Promise((r) => setTimeout(r, 20));
    }
    // Force unconfirmable outcome by removing tracked job/state after abort path would settle? Instead simulate:
    // register a fake completed-promise job with no persisted state to exercise unconfirmed branch.
    const fakeId = `run-fake-unconfirmed-${Date.now()}`;
    jobs.set(fakeId, {
      runId: fakeId,
      promise: Promise.resolve(),
      state: { runId: fakeId, task: 'x', cwd: dir, adapter: 'mock', provider: 'p', model: 'm', state: 'RUNNING', startedAt: new Date().toISOString(), hops: 1, maxHops: 3 },
      startedAt: new Date().toISOString(),
      controller: new AbortController(),
      orch: undefined,
      cwd: dir,
      taskInput: { prompt: 'x', cwd: dir } as any,
      adapters: [] as any,
    } as any);
    const cancel = await client.callTool({ name: 'cancel_task', arguments: { runId: fakeId } });
    expect(toolText(cancel)).toContain(`Cancellation unconfirmed for ${fakeId}`);
    expect(toolText(cancel)).not.toContain(`Cancelled ${fakeId}.`);
    // cleanup real running job
    await client.callTool({ name: 'cancel_task', arguments: { runId: runId! } }).catch(() => {});
    jobs.delete(fakeId);
    await clientTransport.close();
    await serverTransport.close();
  });
});