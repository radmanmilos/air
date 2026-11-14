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
    frontAgentModel?: {
        provider: string;
        model: string;
    };
}
export declare function createConversation(prefs?: Partial<ConversationPreferences>): Conversation;
export declare function loadConversation(id: string): Conversation | null;
/**
 * Persist a full conversation object (initial creation or controlled replacement).
 * Not safe for concurrent in-place updates: use `mutateConversation`/`appendMessage`
 * after creation so mutations re-read latest state under the per-conversation lock.
 */
export declare function saveConversation(conv: Conversation): void;
/**
 * Atomically read-modify-write a persisted conversation under the
 * per-conversation lock. The mutator receives the latest stored state and
 * must return the next state to persist. Use for all in-place updates after
 * initial creation to avoid stale-object overwrites.
 */
export declare function mutateConversation(id: string, mutator: (current: Conversation) => Promise<Conversation | void> | Conversation | void): Promise<Conversation>;
export declare function appendMessage(id: string, msg: Omit<ConversationMessage, 'id' | 'ts'> & {
    id?: string;
    ts?: string;
}): Promise<Conversation>;
export declare function injectResult(convId: string, summary: string, workId?: string): Promise<void>;
export declare function compactConversation(conv: Conversation, maxMessages?: number): Conversation;
export declare function listConversations(): string[];
