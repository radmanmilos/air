// Aider adapter implementing AgentAdapter.
//
// Uses the shared process runner (src/execution/runner.ts), never spawn
// directly. Verified against aider 0.86.2 (see docs/adapters/aider.md).

import type { AgentAdapter } from '../adapters/adapter';
import type { ErrorCategory, CommandSpec, ParsedEvent, TaskInput } from '../types';
import { runProcess } from '../execution/runner';

const RATE_LIMIT_RE = /rate limit|429|too many requests|quota exceeded/i;
const AUTH_RE = /invalid api key|401|unauthorized|authentication failed|auth failed|api key incorrect/i;
const MODEL_UNAVAILABLE_RE = /model .* not found|model not available|unknown model|no such model/i;
const TIMEOUT_RE = /timeout|timed out/i;
const NOT_FOUND_RE = /not found|not installed|enoent/i;

export class AiderAdapter implements AgentAdapter {
  id = 'aider';
  provider = 'openrouter';
  model = 'gemma-4-31b-it:free';
  executable = 'aider';

  capabilities = {
    headlessExecution: true,
    structuredOutput: false,
    fileEditing: true,
    shellAccess: false,
    imageInput: false,
    supportsCancellation: true,
    supportsStreaming: true,
    contextWindow: 128_000,
  };

  canHandle(_task: TaskInput): boolean {
    return true;
  }

  buildCommand(task: TaskInput): CommandSpec {
    const args: string[] = [];
    const modelToUse = task.preferredModel ?? this.model ?? 'gemma-4-31b-it:free';
    const prefixed = modelToUse.includes('/') ? modelToUse : `openrouter/${modelToUse}`;
    args.push('--model', prefixed);
    if (task.files && task.files.length > 0) {
      for (const f of task.files) args.push(f);
    }
    args.push('--message', task.prompt);
    args.push('--yes-always');
    args.push('--no-auto-commits');
    args.push('--no-pretty');
    args.push('--no-stream');
    args.push('--exit');

    const env: Record<string, string> = {};
    if (process.env.OPENROUTER_API_KEY) {
      env.OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
    }

    return {
      executable: this.executable ?? 'aider',
      args,
      cwd: task.cwd,
      env: Object.keys(env).length > 0 ? env : undefined,
    };
  }

  parseOutput(chunk: Buffer | string): ParsedEvent[] {
    const text = typeof chunk === 'string' ? chunk : chunk.toString();
    return [{ type: 'stdout', data: text }];
  }

  /**
   * Classify a failure from exit code + stderr evidence.
   *
   * Aider exits 0 even when it made no changes — exit 0 is never proof of
   * success, but it is also never a failure category. This method is only
   * meaningful on non-zero / signal / timeout paths.
   */
  classifyError(exitCode: number | null, stderr: string, structured?: unknown): ErrorCategory {
    // Process facts take precedence over stderr matching (R4-03).
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

/** Run the aider adapter through the shared process runner. */
export async function runAider(
  task: TaskInput,
  options: { timeoutMs?: number; signal?: AbortSignal; maxBufferBytes?: number } = {},
) {
  const adapter = new AiderAdapter();
  const spec = adapter.buildCommand(task);
  return runProcess(spec, {
    timeoutMs: options.timeoutMs,
    signal: options.signal,
    maxBufferBytes: options.maxBufferBytes,
  });
}