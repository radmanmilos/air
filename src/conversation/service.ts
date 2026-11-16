// Shared conversation service used by both CLI and MCP entrypoints.
// Ensures CLI/MCP parity for conversation loading, coordinator invocation,
// action dispatch, job creation, status, and cancellation.

import { loadConversation, saveConversation, createConversation, appendMessage, mutateConversation, injectResult } from './index';
import { decide } from './decide';
import { brainAnswer, isBrainAvailable } from '../brain';

export interface ChatServiceResult {
  conversationId: string;
  replies: string[];
}

/**
 * Send a user message to a conversation and get replies.
 * Shared by CLI and MCP for parity.
 */
export async function sendMessage(
  conversationId: string | undefined,
  message: string,
  cwd: string,
  _freeOnly: boolean = true,
): Promise<ChatServiceResult> {
  let conv = conversationId ? loadConversation(conversationId) : null;
  if (!conv) { conv = createConversation(); saveConversation(conv); }

  await appendMessage(conv.id, { role: 'user', content: message });

  const actions = decide(message, conv);
  const replies: string[] = [];

  for (const a of actions) {
    if (a.type === 'spawn_job') {
      // Job spawning is handled by the caller (CLI/MCP) since it needs
      // orchestrator wiring. Return the goal for the caller to execute.
      replies.push(`SPAWN_JOB:${a.goal}:${JSON.stringify(a.hints ?? {})}`);
    } else if (a.type === 'answer') {
      if (await isBrainAvailable()) {
        const freshConv = loadConversation(conv.id) ?? conv;
        const r = await brainAnswer(message, { history: freshConv.messages, jobs: freshConv.activeWorkIds });
        await appendMessage(conv.id, { role: 'assistant', content: r.text });
        replies.push(r.text);
      } else {
        await appendMessage(conv.id, { role: 'assistant', content: 'Acknowledged.' });
        replies.push('Acknowledged.');
      }
    } else if (a.type === 'clarify') {
      await appendMessage(conv.id, { role: 'assistant', content: a.question });
      replies.push(a.question);
    } else if (a.type === 'status') {
      const fresh = loadConversation(conv.id);
      replies.push(`messages=${fresh?.messages.length ?? 0} active=${(fresh?.activeWorkIds ?? []).join(',')}`);
    } else if (a.type === 'cancel_job') {
      replies.push(`CANCEL_JOB:${a.jobId}`);
    }
  }

  if (replies.length === 0) replies.push('Acknowledged.');
  return { conversationId: conv.id, replies };
}

export { loadConversation, saveConversation, createConversation, appendMessage, mutateConversation, injectResult };
