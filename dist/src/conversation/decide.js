// Front-agent decision function (T7-007).
// Given a user message and conversation, returns zero or more validated
// Actions. Deterministic heuristics; no model call in MVP.
export function decide(message, conv) {
    const trimmed = message.trim();
    const lower = trimmed.toLowerCase();
    // Control commands.
    if (trimmed.startsWith('/status'))
        return [{ type: 'status' }];
    if (trimmed.startsWith('/cancel ')) {
        const jobId = trimmed.slice(8).trim();
        return [{ type: 'cancel_job', jobId }];
    }
    if (trimmed === '/cancel') {
        const last = conv.activeWorkIds[conv.activeWorkIds.length - 1];
        if (last)
            return [{ type: 'cancel_job', jobId: last }];
        return [{ type: 'answer', text: '' }];
    }
    if (trimmed.startsWith('/run ')) {
        const goal = trimmed.slice(5).trim();
        return [{ type: 'spawn_job', goal, hints: { requiresWrite: true, requiresCode: true } }];
    }
    if (trimmed.startsWith('/plan ')) {
        const goal = trimmed.slice(6).trim();
        return [{ type: 'spawn_job', goal, hints: { requiresWrite: true, requiresCode: true } }];
    }
    // Natural-language status/cancel.
    if (/^(what is the status|status of (my|the) job|how is (my|the) job)/.test(lower)) {
        return [{ type: 'status' }];
    }
    if (/^cancel (that|it|this|the job|my job)$/.test(lower)) {
        const last = conv.activeWorkIds[conv.activeWorkIds.length - 1];
        if (last)
            return [{ type: 'cancel_job', jobId: last }];
        return [{ type: 'answer', text: '' }];
    }
    // Destructive requests require confirmation.
    const isDestructive = /\b(delete (all|everything)|remove all|drop (all|the)|wipe|erase all)\b/.test(lower);
    if (isDestructive) {
        return [{ type: 'clarify', question: 'This is destructive. Confirm by running /run ' + trimmed }];
    }
    const isQuestion = /\?\s*$/.test(trimmed) || /^(what|how|why|explain|describe|tell|should|would|can|could|i want|please)\b/.test(lower);
    const wantsCodeWork = /\b(fix|edit|modify|refactor|implement|add|create|change|write|bug|test|update|remove|delete)\b/.test(lower);
    const wantsRepo = /\b(repo|repository|codebase|files|project|directory|app)\b/.test(lower);
    const isBrainstorm = /\b(would you|should we|trade-?offs|options|ideas|brainstorm)\b/.test(lower) || /^how (would|could|should)\b/.test(lower);
    const writeIntent = /\b(i want|i'd like|please make|make it|can you (add|create|implement|fix|write))\b/.test(lower);
    const namesFile = /\b[\w-]+\.\w{1,4}\b/.test(trimmed);
    // Repo-file questions are grounded via a read-only job.
    if (isQuestion && namesFile) {
        return [{ type: 'spawn_job', goal: trimmed, hints: { requiresWrite: false, requiresCode: true } }];
    }
    if (isQuestion && wantsRepo && !wantsCodeWork && !isBrainstorm) {
        return [{ type: 'spawn_job', goal: trimmed, hints: { requiresWrite: false, requiresCode: true } }];
    }
    if (isQuestion && !writeIntent) {
        return [{ type: 'answer', text: '' }]; // placeholder; caller fills
    }
    if ((wantsCodeWork || writeIntent) && !isBrainstorm) {
        return [{ type: 'spawn_job', goal: trimmed, hints: { requiresWrite: true, requiresCode: true } }];
    }
    // Default: answer directly (front agent handles text).
    return [{ type: 'answer', text: '' }];
}
