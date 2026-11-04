import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createConversation, saveConversation, injectResult, loadConversation } from '../src/conversation';

describe('injectResult idempotency', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'air-conv-'));
    process.env.AIR_CACHE_DIR = dir;
  });
  afterEach(() => {
    delete process.env.AIR_CACHE_DIR;
    rmSync(dir, { recursive: true, force: true });
  });

  it('does not duplicate on repeated inject', async () => {
    const conv = createConversation();
    saveConversation(conv);
    await injectResult(conv.id, 'summary', 'run-1');
    await injectResult(conv.id, 'summary', 'run-1');
    const reloaded = loadConversation(conv.id);
    const toolMsgs = reloaded!.messages.filter((m) => m.role === 'tool' && m.workId === 'run-1');
    expect(toolMsgs.length).toBe(1);
  });
});