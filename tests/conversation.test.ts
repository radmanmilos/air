import { describe, it, expect, beforeEach } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import {
  createConversation,
  loadConversation,
  saveConversation,
  appendMessage,
  listConversations,
  mutateConversation,
  injectResult,
} from '../src/conversation';

// Use a fresh cache dir per file run to isolate from other tests.
let base: string;
beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), 'air-conv-'));
  process.env.AIR_CACHE_DIR = base;
});

describe('conversation store (T-021, L0-05 P0)', () => {
  it('creates and persists a conversation', () => {
    const c = createConversation({ freeOnly: true });
    saveConversation(c);
    const loaded = loadConversation(c.id);
    expect(loaded).not.toBeNull();
    expect(loaded!.id).toBe(c.id);
    expect(loaded!.userPreferences.freeOnly).toBe(true);
  });

  it('appends messages atomically', async () => {
    const c = createConversation();
    saveConversation(c);
    await appendMessage(c.id, { role: 'user', content: 'hello' });
    await appendMessage(c.id, { role: 'assistant', content: 'hi' });
    const loaded = loadConversation(c.id)!;
    expect(loaded.messages.length).toBe(2);
    expect(loaded.messages[0].role).toBe('user');
    expect(loaded.messages[1].role).toBe('assistant');
  });

  it('returns null for unknown conversation', () => {
    expect(loadConversation('does-not-exist')).toBeNull();
  });

  it('lists conversations', () => {
    const c = createConversation();
    saveConversation(c);
    const ids = listConversations();
    expect(ids).toContain(c.id);
  });

  it('concurrent message appends do not lose messages', async () => {
    const c = createConversation();
    saveConversation(c);
    await Promise.all(
      Array.from({ length: 20 }, (_, i) => appendMessage(c.id, { role: 'user', content: `msg-${i}` })),
    );
    const loaded = loadConversation(c.id)!;
    expect(loaded.messages.length).toBe(20);
    const contents = loaded.messages.map((m) => m.content).sort();
    expect(contents).toEqual(Array.from({ length: 20 }, (_, i) => `msg-${i}`).sort());
  });

  it('metadata mutation concurrent with append preserves both changes', async () => {
    const c = createConversation();
    saveConversation(c);
    await Promise.all([
      appendMessage(c.id, { role: 'user', content: 'hello' }),
      mutateConversation(c.id, (cur) => { cur.title = 't1'; }),
      mutateConversation(c.id, (cur) => { cur.facts.push('fact-a'); }),
    ]);
    const loaded = loadConversation(c.id)!;
    expect(loaded.messages.map((m) => m.content)).toContain('hello');
    expect(loaded.title).toBe('t1');
    expect(loaded.facts).toContain('fact-a');
  });

  it('concurrent mutations of different conversation fields preserve both changes', async () => {
    const c = createConversation();
    saveConversation(c);
    await Promise.all([
      mutateConversation(c.id, (cur) => { cur.activeWorkIds.push('job-1'); }),
      mutateConversation(c.id, (cur) => { cur.facts.push('f1'); }),
      mutateConversation(c.id, (cur) => { cur.summary = 'sum'; }),
    ]);
    const loaded = loadConversation(c.id)!;
    expect(loaded.activeWorkIds).toContain('job-1');
    expect(loaded.facts).toContain('f1');
    expect(loaded.summary).toBe('sum');
  });

  it('injectResult is idempotent and concurrent calls do not duplicate', async () => {
    const c = createConversation();
    saveConversation(c);
    await Promise.all([
      injectResult(c.id, 'done', 'w1'),
      injectResult(c.id, 'done', 'w1'),
      injectResult(c.id, 'done', 'w1'),
      injectResult(c.id, 'done', 'w1'),
    ]);
    const loaded = loadConversation(c.id)!;
    const toolMsgs = loaded.messages.filter((m) => m.role === 'tool' && m.workId === 'w1');
    expect(toolMsgs.length).toBe(1);
  });

  it('mutateConversation throws for missing conversations', async () => {
    await expect(mutateConversation('00000000-0000-0000-0000-000000000000', (c) => c)).rejects.toThrow(/not found/i);
  });

  it('appendMessage throws for missing conversations', async () => {
    await expect(appendMessage('00000000-0000-0000-0000-000000000000', { role: 'user', content: 'x' })).rejects.toThrow(/not found/i);
  });
});
