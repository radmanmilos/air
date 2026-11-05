// Persistent conversation session store (T-021).
//
// A Conversation is the durable owner of a user-facing thread. Workers are
// disposable; the conversation persists across runs, restarts and adapter
// failovers. Neutral provider-agnostic message format.
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { resolvePaths } from '../config/paths';
import { redact } from '../security/redact';
function airPaths() {
    return resolvePaths({ env: process.env });
}
import { lockedReadModifyWrite } from '../utils/lock';
const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function assertId(id) {
    if (typeof id !== 'string' || !ID_RE.test(id)) {
        throw new Error(`Invalid conversation id: ${id}`);
    }
}
function dir() {
    const d = join(airPaths().cacheDir, 'conversations');
    mkdirSync(d, { recursive: true });
    return d;
}
function file(id) {
    assertId(id);
    return join(dir(), `${id}.json`);
}
export function createConversation(prefs) {
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
export function loadConversation(id) {
    try {
        if (!existsSync(file(id)))
            return null;
        const raw = JSON.parse(readFileSync(file(id), 'utf8'));
        return raw;
    }
    catch {
        return null;
    }
}
export function saveConversation(conv) {
    assertId(conv.id);
    conv.updatedAt = new Date().toISOString();
    const f = file(conv.id);
    const tmp = f + '.tmp';
    writeFileSync(tmp, JSON.stringify(conv, null, 2));
    renameSync(tmp, f);
}
export async function appendMessage(id, msg) {
    return lockedReadModifyWrite(`conversation-${id}`, file(id), async (current) => {
        if (!current)
            throw new Error(`Conversation ${id} not found`);
        const full = {
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
    });
}
export async function injectResult(convId, summary, workId) {
    const conv = loadConversation(convId);
    if (conv && workId && conv.messages.some((m) => m.role === 'tool' && m.workId === workId)) {
        return; // idempotent: already injected
    }
    await appendMessage(convId, { role: 'tool', content: summary, workId });
}
export function compactConversation(conv, maxMessages = 50) {
    if (conv.messages.length <= maxMessages)
        return conv;
    const keep = conv.messages.slice(-Math.floor(maxMessages / 2));
    const older = conv.messages.slice(0, conv.messages.length - keep.length);
    // Preserve tool messages referenced by activeWorkIds.
    const active = new Set(conv.activeWorkIds);
    const preserved = older.filter((m) => m.role === 'tool' && m.workId && active.has(m.workId));
    const summaryLines = older
        .filter((m) => !preserved.includes(m))
        .map((m) => `${m.role}: ${m.content.slice(0, 120)}`)
        .slice(0, 20);
    const summary = redact(summaryLines.join('\n'));
    conv.summary = conv.summary ? conv.summary + '\n' + summary : summary;
    conv.messages = [...preserved, { id: randomUUID(), role: 'system', content: `Compacted ${older.length - preserved.length} older turns.`, ts: new Date().toISOString() }, ...keep];
    conv.updatedAt = new Date().toISOString();
    return conv;
}
export function listConversations() {
    const d = dir();
    try {
        return readdirSync(d).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, ''));
    }
    catch {
        return [];
    }
}
