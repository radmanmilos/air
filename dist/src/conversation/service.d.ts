import { loadConversation, saveConversation, createConversation, appendMessage, mutateConversation, injectResult } from './index';
export interface ChatServiceResult {
    conversationId: string;
    replies: string[];
}
/**
 * Send a user message to a conversation and get replies.
 * Shared by CLI and MCP for parity.
 */
export declare function sendMessage(conversationId: string | undefined, message: string, cwd: string, _freeOnly?: boolean): Promise<ChatServiceResult>;
export { loadConversation, saveConversation, createConversation, appendMessage, mutateConversation, injectResult };
