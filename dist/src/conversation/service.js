// Shared conversation application service used by both CLI and MCP entrypoints.
// Owns conversation loading/creation, message persistence, coordinator action
// validation/dispatch, answer/clarify handling, task creation/status/cancellation,
// completion/result injection, and conversation ownership checks.
import { loadConversation, saveConversation, createConversation, appendMessage, mutateConversation, injectResult } from './index.js';
import { decide } from './decide.js';
import { parseActions } from './actions.js';
import { brainAnswer, isBrainAvailable, checkBrainReadiness } from '../brain/index.js';
import { loadConfig } from '../config/loader.js';
import { Orchestrator } from '../orchestrator/orchestrator.js';
import { planFromRequest } from '../planner/index.js';
import { compileJobResult } from '../result-compiler/index.js';
import { readTaskState } from '../execution/task-state.js';
// Shared job handle registry for conversation-spawned jobs. Both CLI and MCP
// use this to cancel jobs by id without duplicating ownership state.
export const chatJobOrchs = new Map();
export const chatJobConversations = new Map();
export class ConversationService {
    defaults;
    constructor(defaults = {}) {
        this.defaults = defaults;
    }
    async sendMessage(input, message, cwd, freeOnly, options) {
        return sendConversationMessage(typeof input === 'object' && input !== null && typeof input.message === 'string'
            ? input
            : { conversationId: input, message: message, cwd, freeOnly, options });
    }
}
export async function sendMessage(...args) {
    let conversationId;
    let message;
    let cwd = process.cwd();
    let freeOnly;
    let options = {};
    if (typeof args[0] === 'object' && args[0] !== null && typeof args[0].message === 'string') {
        const input = args[0];
        conversationId = input.conversationId;
        message = input.message;
        cwd = input.cwd ?? cwd;
        freeOnly = input.freeOnly;
        options = input.options ?? {};
    }
    else {
        conversationId = args[0];
        message = args[1];
        cwd = args[2] ?? cwd;
        freeOnly = args[3];
        options = args[4] ?? {};
    }
    return sendConversationMessage({ conversationId, message, cwd, freeOnly, options });
}
async function sendConversationMessage(params) {
    const cwd = params.cwd ?? process.cwd();
    const options = params.options ?? {};
    let conv = params.conversationId ? loadConversation(params.conversationId) : null;
    if (!conv) {
        conv = createConversation({ freeOnly: params.freeOnly !== false && params.freeOnly !== undefined ? params.freeOnly : true });
        if (params.freeOnly !== undefined)
            conv.userPreferences.freeOnly = params.freeOnly;
        saveConversation(conv);
    }
    await appendMessage(conv.id, { role: 'user', content: params.message });
    const effectiveFreeOnly = params.freeOnly ?? conv.userPreferences.freeOnly;
    const rawActions = decide(params.message, conv);
    const actions = parseActions(rawActions);
    const replies = [];
    const jobIds = [];
    const errors = [];
    for (const a of actions) {
        if (a.type === 'spawn_job') {
            try {
                const runId = await startChatJob(conv, a.goal, a.hints, cwd, effectiveFreeOnly, options);
                jobIds.push(runId);
                const reply = `Started job ${runId}.`;
                replies.push(reply);
                options.onReply?.(reply);
                options.onJobStarted?.(runId);
            }
            catch (err) {
                const msg = `Failed to start job: ${String(err?.message || err)}`;
                replies.push(msg);
                errors.push(msg);
                options.onReply?.(msg);
            }
        }
        else if (a.type === 'answer') {
            if (await isBrainAvailable()) {
                const freshConv = loadConversation(conv.id) ?? conv;
                const r = await brainAnswer(params.message, { history: freshConv.messages, jobs: freshConv.activeWorkIds });
                await appendMessage(conv.id, { role: 'assistant', content: r.text });
                replies.push(r.text);
                options.onReply?.(r.text);
            }
            else {
                const readiness = await checkBrainReadiness();
                const detail = readiness.detail ? `: ${readiness.detail}` : '';
                const text = `AI unavailable (${readiness.reason})${detail}`;
                await appendMessage(conv.id, { role: 'assistant', content: text });
                replies.push(text);
                errors.push(text);
                options.onReply?.(text);
            }
        }
        else if (a.type === 'clarify') {
            await appendMessage(conv.id, { role: 'assistant', content: a.question });
            replies.push(a.question);
            options.onReply?.(a.question);
        }
        else if (a.type === 'status') {
            const fresh = loadConversation(conv.id);
            const reply = `messages=${fresh?.messages.length ?? 0} active=${(fresh?.activeWorkIds ?? []).join(',')}`;
            replies.push(reply);
            options.onReply?.(reply);
        }
        else if (a.type === 'cancel_job') {
            const reply = await cancelChatJob(conv, a.jobId);
            replies.push(reply);
            options.onReply?.(reply);
        }
    }
    if (replies.length === 0) {
        const reply = 'Acknowledged.';
        await appendMessage(conv.id, { role: 'assistant', content: reply });
        replies.push(reply);
        options.onReply?.(reply);
    }
    const freshConv = loadConversation(conv.id);
    if (freshConv)
        conv = freshConv;
    return { conversationId: conv.id, replies, actions, jobIds, errors };
}
async function startChatJob(conv, goal, hints, cwd, freeOnly, options) {
    const { config } = await loadConfig({ cwd });
    const mockAdapterMode = process.env.AIR_MOCK_ADAPTER === '1';
    let mcpAdapters;
    if (mockAdapterMode) {
        const { MockAdapter } = await import('../adapters/mock.js');
        mcpAdapters = [new MockAdapter()];
    }
    const orch = new Orchestrator({ adapters: mcpAdapters, config, mcpMode: true });
    const contextParts = [goal];
    if (conv.summary)
        contextParts.push(`Context summary: ${conv.summary}`);
    if (conv.facts && conv.facts.length > 0)
        contextParts.push(`Facts: ${conv.facts.join('; ')}`);
    const enriched = contextParts.join('\n');
    const plan = planFromRequest(enriched, hints ?? {});
    const item = plan.workItems[0];
    const session = await orch.start(item.objective, cwd, {
        mode: 'auto',
        freeOnly: mockAdapterMode ? false : freeOnly,
        readOnly: hints?.requiresWrite === false,
    });
    chatJobOrchs.set(session.runId, orch);
    chatJobConversations.set(session.runId, conv.id);
    await mutateConversation(conv.id, (c) => { c.activeWorkIds.push(session.runId); });
    (async () => {
        try {
            try {
                await orch.waitFor(session.runId);
            }
            catch { /* noop */ }
            let state = await readTaskState(session.runId);
            const facts = {
                runId: session.runId,
                result: state?.result ?? state?.state ?? 'FAILED',
                adapterId: state?.adapter ?? session.adapterId,
                provider: state?.provider ?? session.provider,
                model: state?.model ?? session.model,
                changedFiles: state?.delta ? [...(state.delta.staged || []), ...(state.delta.unstaged || []), ...(state.delta.untracked || [])] : [],
                outputTail: state?.outputTail,
                error: state?.error,
            };
            const summary = compileJobResult(facts);
            await injectResult(conv.id, summary, session.runId);
            await mutateConversation(conv.id, (c) => { c.activeWorkIds = c.activeWorkIds.filter((x) => x !== session.runId); });
            options.onJobFinished?.(session.runId, summary);
        }
        catch {
            /* noop */
        }
        finally {
            chatJobOrchs.delete(session.runId);
            chatJobConversations.delete(session.runId);
        }
    })();
    return session.runId;
}
async function cancelChatJob(conv, jobId) {
    const ownerConvId = chatJobConversations.get(jobId);
    if (ownerConvId && ownerConvId !== conv.id) {
        return `Job ${jobId} does not belong to this conversation.`;
    }
    if (!ownerConvId && chatJobOrchs.has(jobId)) {
        return `Job ${jobId} does not belong to this conversation.`;
    }
    const orch = chatJobOrchs.get(jobId);
    const { readTaskState } = await import('../execution/task-state.js');
    let st = await readTaskState(jobId);
    if (st && (st.state === 'COMPLETED' || st.state === 'FAILED')) {
        chatJobOrchs.delete(jobId);
        chatJobConversations.delete(jobId);
        await mutateConversation(conv.id, (c) => { c.activeWorkIds = c.activeWorkIds.filter((x) => x !== jobId); });
        return `Job ${jobId} is not running (${st.state}).`;
    }
    if (st && st.state === 'CANCELLED') {
        chatJobOrchs.delete(jobId);
        chatJobConversations.delete(jobId);
        await mutateConversation(conv.id, (c) => { c.activeWorkIds = c.activeWorkIds.filter((x) => x !== jobId); });
        return `Job ${jobId} is not running (CANCELLED).`;
    }
    if (orch) {
        let cancelErr = null;
        try {
            await orch.cancel(jobId);
        }
        catch (err) {
            cancelErr = err;
        }
        try {
            await orch.waitFor(jobId);
        }
        catch {
            /* ignore */
        }
        chatJobOrchs.delete(jobId);
        chatJobConversations.delete(jobId);
        const fresh = await readTaskState(jobId);
        if (fresh) {
            if (fresh.state === 'COMPLETED' || fresh.state === 'FAILED') {
                await mutateConversation(conv.id, (c) => { c.activeWorkIds = c.activeWorkIds.filter((x) => x !== jobId); });
                return `Job ${jobId} is not running (${fresh.state}).`;
            }
            if (fresh.state === 'CANCELLED') {
                await mutateConversation(conv.id, (c) => { c.activeWorkIds = c.activeWorkIds.filter((x) => x !== jobId); });
                return `Cancelled ${jobId}.`;
            }
            if (cancelErr) {
                await mutateConversation(conv.id, (c) => { c.activeWorkIds = c.activeWorkIds.filter((x) => x !== jobId); });
                return `Cancellation failed for ${jobId}: ${String(cancelErr?.message || cancelErr)}`;
            }
            await mutateConversation(conv.id, (c) => { c.activeWorkIds = c.activeWorkIds.filter((x) => x !== jobId); });
            return `Cancellation unconfirmed for ${jobId} (state=${fresh.state}).`;
        }
        if (cancelErr) {
            await mutateConversation(conv.id, (c) => { c.activeWorkIds = c.activeWorkIds.filter((x) => x !== jobId); });
            return `Cancellation failed for ${jobId}: ${String(cancelErr?.message || cancelErr)}`;
        }
        await mutateConversation(conv.id, (c) => { c.activeWorkIds = c.activeWorkIds.filter((x) => x !== jobId); });
        return `Cancellation unconfirmed for ${jobId}.`;
    }
    if (!st) {
        return `Unknown job ${jobId}.`;
    }
    await mutateConversation(conv.id, (c) => { c.activeWorkIds = c.activeWorkIds.filter((x) => x !== jobId); });
    return `Cannot cancel job ${jobId}: no active handle (state=${st.state}).`;
}
export { loadConversation, saveConversation, createConversation, appendMessage, mutateConversation, injectResult };
