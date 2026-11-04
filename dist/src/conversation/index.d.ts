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
export declare function saveConversation(conv: Conversation): void;
export declare function appendMessage(id: string, msg: Omit<ConversationMessage, 'id' | 'ts'> & {
    id?: string;
    ts?: string;
}): Promise<Conversation | null>;
export declare function injectResult(convId: string, summary: string, workId?: string): Promise<void>;
export declare function compactConversation(conv: Conversation, maxMessages?: number): Conversation;
export declare function listConversations(): string[];
