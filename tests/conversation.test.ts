import { describe, it, expect } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';
import { createConversation, loadConversation, saveConversation, appendMessage, listConversations } from '../src/conversation';

// Override cache dir via env before import? paths resolved at import. Use AIR_CACHE_DIR.
process.env.AIR_CACHE_DIR = join(tmpdir(), `air-conv-${process.pid}`);
const base = process.env.AIR_CACHE_DIR;

describe('conversation store (T-021)', () => {
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
});
