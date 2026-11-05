// Front-agent decision function (T7-007).
// Given a user message and conversation, returns zero or more validated
// Actions. Deterministic heuristics; no model call in MVP.

import type { Conversation } from './index';

export interface DecideHints {
  requiresWrite?: boolean;
  requiresCode?: boolean;
}

export function decide(message: string, _conv: Conversation): any[] {
  const trimmed = message.trim();
  const lower = trimmed.toLowerCase();

  // Control commands.
  if (trimmed.startsWith('/status')) return [{ type: 'status' }];
  if (trimmed.startsWith('/cancel ')) {
    const jobId = trimmed.slice(8).trim();
    return [{ type: 'cancel_job', jobId }];
  }
  if (trimmed.startsWith('/run ')) {
    const goal = trimmed.slice(5).trim();
    return [{ type: 'spawn_job', goal, hints: { requiresWrite: true, requiresCode: true } }];
  }
  if (trimmed.startsWith('/plan ')) {
    const goal = trimmed.slice(6).trim();
    return [{ type: 'spawn_job', goal, hints: { requiresWrite: true, requiresCode: true } }];
  }

  // Pure Q&A / explain / research with no workspace need.
  const isQuestion = /\?\s*$/.test(trimmed) || /^(what|how|why|explain|describe|tell|should|would|can|could)\b/.test(lower);
  const wantsCodeWork = /\b(fix|edit|modify|refactor|implement|add|create|change|write|bug|test|update|remove|delete)\b/.test(lower);
  const wantsRepo = /\b(repo|repository|codebase|files|project|directory|app)\b/.test(lower);
  const isBrainstorm = /\b(would you|should we|trade-?offs|options|ideas)\b/.test(lower) || /^how (would|could|should)\b/.test(lower);
  if (isQuestion && wantsRepo && !wantsCodeWork && !isBrainstorm) {
    return [{ type: 'spawn_job', goal: trimmed, hints: { requiresWrite: false, requiresCode: true } }];
  }
  if (isQuestion) {
    return [{ type: 'answer', text: '' }]; // placeholder; caller fills
  }
  if (wantsCodeWork && !isBrainstorm) {
    return [{ type: 'spawn_job', goal: trimmed, hints: { requiresWrite: true, requiresCode: true } }];
  }
  // Default: answer directly (front agent handles text).
  return [{ type: 'answer', text: '' }];
}
