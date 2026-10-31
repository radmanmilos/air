// Mock adapter implementing AgentAdapter for tests. Wraps tests/fixtures/mock-tool.js.
//
// NOTE: This file lives under tests/ and is test-only. It must not be part of
// the published runtime package (see R3-08). Production adapters must use the
// shared process runner (src/execution/runner.ts), not spawn directly.

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { AgentAdapter } from '../src/adapters/adapter';
import type { ErrorCategory, CommandSpec, ParsedEvent, TaskInput, ProcessOutcome } from '../src/types';
import { runProcess } from '../src/execution/runner';
import { classifyOutcome } from '../src/types/outcome';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MOCK_TOOL = join(__dirname, 'fixtures', 'mock-tool.js');

const RATE_LIMIT_RE = /rate limit|429|too many requests/i;
const AUTH_RE = /invalid api key|401|unauthorized|authentication failed|auth failed/i;

export class MockAdapter implements AgentAdapter {
  id = 'mock';
  provider = 'openrouter';
  model = 'mock-model';
  capabilities = {
    headlessExecution: true,
    structuredOutput: false,
    fileEditing: true,
    shellAccess: false,
    imageInput: false,
    supportsCancellation: true,
  };

  canHandle(_task: TaskInput): boolean {
    return true;
  }

  buildCommand(task: TaskInput): CommandSpec {
    const mode = (process.env.MOCK_MODE as string) || 'succeed';
    return {
      executable: process.execPath,
      args: [MOCK_TOOL],
      cwd: task.cwd,
      env: { ...process.env, MOCK_MODE: mode },
    };
  }

  parseOutput(chunk: Buffer | string): ParsedEvent[] {
    const text = typeof chunk === 'string' ? chunk : chunk.toString();
    return [{ type: 'stdout', data: text }];
  }

  /**
   * Classify a failure from exit code + stderr + structured evidence.
   *
   * Success exits (exitCode === 0) are NOT classified as failures. This
   * method is only meaningful on non-zero / signal / timeout paths. The
   * runner checks ProcessOutcome first (timedOut, cancelled, spawnError);
   * only normal non-zero exits with provider evidence delegate here.
   */
  classifyError(exitCode: number | null, stderr: string, _structured?: unknown): ErrorCategory {
    if (exitCode === 0) return 'UNKNOWN';
    if (exitCode === null) return 'PROCESS_CRASH';
    if (AUTH_RE.test(stderr)) return 'AUTH_ERROR';
    if (RATE_LIMIT_RE.test(stderr)) return 'RATE_LIMIT';
    if (/timeout|timed out/i.test(stderr)) return 'TIMEOUT';
    if (/not found|not installed|enoent/i.test(stderr)) return 'TOOL_NOT_INSTALLED';
    return 'UNKNOWN';
  }
}

/** Run the mock adapter through the shared process runner. */
export async function runMockThroughRunner(
  mode: string,
  options: { timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<ProcessOutcome> {
  const adapter = new MockAdapter();
  const spec = adapter.buildCommand({
    id: 'test-task',
    prompt: 'mock',
    cwd: __dirname,
    mode: 'ask',
  });
  spec.env = { ...spec.env, MOCK_MODE: mode };
  const { outcome } = await runProcess(spec, {
    timeoutMs: options.timeoutMs,
    signal: options.signal,
  });
  return outcome;
}

/** Classify a ProcessOutcome: process facts take precedence over adapter matching. */
export function classifyOutcomeMock(outcome: ProcessOutcome): ErrorCategory {
  const fact = classifyOutcome(outcome);
  if (fact.category) return fact.category;
  const adapter = new MockAdapter();
  return adapter.classifyError(outcome.exitCode, outcome.stderr);
}