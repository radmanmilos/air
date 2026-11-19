import { loadConversation, saveConversation, createConversation, appendMessage, mutateConversation, injectResult } from './index';
import { type Action } from './actions';
import { Orchestrator } from '../orchestrator/orchestrator';
export interface ChatServiceResult {
    conversationId: string;
    replies: string[];
    actions: Action[];
    jobIds: string[];
    errors: string[];
}
export interface ConversationServiceOptions {
    cwd?: string;
    freeOnly?: boolean;
    onReply?: (reply: string) => void;
    onJobStarted?: (runId: string) => void;
    onJobFinished?: (runId: string, summary: string) => void;
}
export declare const chatJobOrchs: Map<string, Orchestrator>;
export declare const chatJobConversations: Map<string, string>;
export declare class ConversationService {
    private defaults;
    constructor(defaults?: {
        cwd?: string;
        freeOnly?: boolean;
    });
    sendMessage(input: string | {
        conversationId?: string;
        message: string;
        cwd?: string;
        freeOnly?: boolean;
        options?: ConversationServiceOptions;
    }, message?: string, cwd?: string, freeOnly?: boolean, options?: ConversationServiceOptions): Promise<ChatServiceResult>;
}
export declare function sendMessage(...args: any[]): Promise<ChatServiceResult>;
export { loadConversation, saveConversation, createConversation, appendMessage, mutateConversation, injectResult };
