// Persistent conversation session store (T-021).
//
// A Conversation is the durable owner of a user-facing thread. Workers are
// disposable; the conversation persists across runs, restarts and adapter
// failovers. Neutral provider-agnostic message format.

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { resolvePaths } from '../config/paths';

function airPaths() {
  return resolvePaths({ env: process.env });
}
import { lockedReadModifyWrite } from '../utils/lock';

export interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool' | 'job';
  content: string;
  ts: string;
  workId?: string;
  meta?: Record<string, unknown>;
}

export interface ConversationPreferences {
  freeOnly: boolean;
  paidFallbackRequiresApproval: boolean;
}

export interface Conversation {
  id: string;
  createdAt: string;
  updatedAt: string;
  title?: string;
  messages: ConversationMessage[];
  summary?: string;
  facts: string[];
  activeWorkIds: string[];
  userPreferences: ConversationPreferences;
  frontAgentModel?: { provider: string; model: string };
}

function dir(): string {
  const d = join(airPaths().cacheDir, 'conversations');
  mkdirSync(d, { recursive: true });
  return d;
}

function file(id: string): string {
  return join(dir(), `${id}.json`);
}

export function createConversation(prefs?: Partial<ConversationPreferences>): Conversation {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    createdAt: now,
    updatedAt: now,
    messages: [],
    facts: [],
    activeWorkIds: [],
    userPreferences: {
      freeOnly: prefs?.freeOnly ?? true,
      paidFallbackRequiresApproval: prefs?.paidFallbackRequiresApproval ?? true,
    },
  };
}

export function loadConversation(id: string): Conversation | null {
  try {
    if (!existsSync(file(id))) return null;
    const raw = JSON.parse(readFileSync(file(id), 'utf8'));
    return raw as Conversation;
  } catch {
    return null;
  }
}

export function saveConversation(conv: Conversation): void {
  conv.updatedAt = new Date().toISOString();
  writeFileSync(file(conv.id), JSON.stringify(conv, null, 2));
}

export async function appendMessage(id: string, msg: Omit<ConversationMessage, 'id' | 'ts'> & { id?: string; ts?: string }): Promise<Conversation | null> {
  return lockedReadModifyWrite<Conversation>(
    `conversation-${id}`,
    file(id),
    async (current) => {
      if (!current) throw new Error(`Conversation ${id} not found`);
      const full: ConversationMessage = {
        id: msg.id ?? randomUUID(),
        role: msg.role,
        content: msg.content,
        ts: msg.ts ?? new Date().toISOString(),
        workId: msg.workId,
        meta: msg.meta,
      };
      current.messages.push(full);
      current.updatedAt = new Date().toISOString();
      return current;
    },
  );
}

export async function injectResult(convId: string, summary: string, workId?: string): Promise<void> {
  await appendMessage(convId, { role: 'tool', content: summary, workId });
}

export function listConversations(): string[] {
  const d = dir();
  try {
    return readdirSync(d).filter((f: string) => f.endsWith('.json')).map((f: string) => f.replace(/\.json$/, ''));
  } catch {
    return [];
  }
}
