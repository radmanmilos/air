// OpenCode adapter implementing AgentAdapter.
//
// Uses the shared process runner (src/execution/runner.ts), never spawn
// directly. UNVERIFIED — needs a real `opencode` install to confirm flags.
// See docs/adapters/opencode.md.

import type { AgentAdapter } from '../adapters/adapter';
import type { ErrorCategory, CommandSpec, ParsedEvent, TaskInput } from '../types';
import { runProcess } from '../execution/runner';

const RATE_LIMIT_RE = /rate limit|429|too many requests|quota exceeded/i;
const AUTH_RE = /invalid api key|401|unauthorized|authentication failed|auth failed|api key incorrect/i;
const MODEL_UNAVAILABLE_RE = /model .* not found|model not available|unknown model|no such model/i;
const TIMEOUT_RE = /timeout|timed out/i;
const NOT_FOUND_RE = /not found|not installed|enoent/i;

export class OpenCodeAdapter implements AgentAdapter {
  id = 'opencode';
  provider = 'openrouter';
  model = 'openrouter/gemma-4-31b-it:free';

  capabilities = {
    headlessExecution: true,
    structuredOutput: false,
    fileEditing: true,
    shellAccess: true,
    imageInput: false,
    supportsCancellation: true,
  };

  canHandle(_task: TaskInput): boolean {
    return true;
  }

  buildCommand(task: TaskInput): CommandSpec {
    const args = ['run', '--prompt', task.prompt, '--yes'];
    if (task.preferredModel) {
      args.push('--model', task.preferredModel);
    }
    return {
      executable: 'opencode',
      args,
      cwd: task.cwd,
    };
  }

  parseOutput(chunk: Buffer | string): ParsedEvent[] {
    const text = typeof chunk === 'string' ? chunk : chunk.toString();
    return [{ type: 'stdout', data: text }];
  }

  classifyError(exitCode: number | null, stderr: string, structured?: unknown): ErrorCategory {
    const s = structured as { timedOut?: boolean; cancelled?: boolean; spawnError?: { code?: string } } | undefined;
    if (s?.timedOut) return 'TIMEOUT';
    if (s?.cancelled) return 'USER_CANCELLED';
    if (s?.spawnError) return 'TOOL_NOT_INSTALLED';
    if (exitCode === 0) return 'UNKNOWN';
    if (exitCode === null) return 'PROCESS_CRASH';
    if (AUTH_RE.test(stderr)) return 'AUTH_ERROR';
    if (RATE_LIMIT_RE.test(stderr)) return 'RATE_LIMIT';
    if (MODEL_UNAVAILABLE_RE.test(stderr)) return 'MODEL_UNAVAILABLE';
    if (TIMEOUT_RE.test(stderr)) return 'TIMEOUT';
    if (NOT_FOUND_RE.test(stderr)) return 'TOOL_NOT_INSTALLED';
    return 'TASK_FAILURE';
  }
}

export async function runOpenCode(
  task: TaskInput,
  options: { timeoutMs?: number; signal?: AbortSignal; maxBufferBytes?: number } = {},
) {
  const adapter = new OpenCodeAdapter();
  const spec = adapter.buildCommand(task);
  return runProcess(spec, {
    timeoutMs: options.timeoutMs,
    signal: options.signal,
    maxBufferBytes: options.maxBufferBytes,
  });
}