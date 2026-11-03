// Goose adapter implementing AgentAdapter.
//
// Uses the shared process runner (src/execution/runner.ts), never spawn
// directly. Verified against goose 1.57.0 (see docs/adapters/goose.md).

import type { AgentAdapter } from '../adapters/adapter';
import type { ErrorCategory, CommandSpec, ParsedEvent, TaskInput } from '../types';
import { runProcess } from '../execution/runner';

const RATE_LIMIT_RE = /rate limit|429|too many requests|quota exceeded/i;
const AUTH_RE = /invalid api key|401|unauthorized|authentication failed|auth failed|api key incorrect/i;
const MODEL_UNAVAILABLE_RE = /model .* not found|model not available|unknown model|no such model/i;
const TIMEOUT_RE = /timeout|timed out/i;
const NOT_FOUND_RE = /not found|not installed|enoent/i;

export class GooseAdapter implements AgentAdapter {
  id = 'goose';
  provider = 'openai';
  model = 'gpt-4o';
  executable = 'goose';

  capabilities = {
    headlessExecution: true,
    structuredOutput: false,
    fileEditing: true,
    shellAccess: true,
    imageInput: false,
    supportsCancellation: true,
    supportsStreaming: true,
    contextWindow: 128_000,
  };

  canHandle(_task: TaskInput): boolean {
    return true;
  }

  buildCommand(task: TaskInput): CommandSpec {
    const args = ['run', '--text', task.prompt];
    return {
      executable: this.executable ?? 'goose',
      args,
      cwd: task.cwd,
    };
  }

  parseOutput(chunk: Buffer | string): ParsedEvent[] {
    const text = typeof chunk === 'string' ? chunk : chunk.toString();
    return [{ type: 'stdout', data: text }];
  }

  classifyError(exitCode: number | null, stderr: string, _structured?: unknown): ErrorCategory {
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

export async function runGoose(
  task: TaskInput,
  options: { timeoutMs?: number; signal?: AbortSignal; maxBufferBytes?: number } = {},
) {
  const adapter = new GooseAdapter();
  const spec = adapter.buildCommand(task);
  return runProcess(spec, {
    timeoutMs: options.timeoutMs,
    signal: options.signal,
    maxBufferBytes: options.maxBufferBytes,
  });
}