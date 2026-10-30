// Mock adapter implementing AgentAdapter for tests. Wraps tests/fixtures/mock-tool.js.
// Behavior is controlled by env vars set on the CommandSpec.

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { AgentAdapter } from './adapter';
import type { ErrorCategory, CommandSpec, ParsedEvent, TaskInput } from '../types';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MOCK_TOOL = join(__dirname, '..', '..', 'tests', 'fixtures', 'mock-tool.js');

const RATE_LIMIT_RE = /rate limit|429|too many requests/i;
const AUTH_RE = /invalid api key|401|unauthorized|authentication failed/i;

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

  classifyError(exitCode: number | null, stderr: string, _structured?: unknown): ErrorCategory {
    if (exitCode === null) return 'PROCESS_CRASH';
    if (exitCode === 0) return 'TASK_FAILURE';
    if (AUTH_RE.test(stderr)) return 'AUTH_ERROR';
    if (RATE_LIMIT_RE.test(stderr)) return 'RATE_LIMIT';
    if (/timeout/i.test(stderr)) return 'TIMEOUT';
    if (/not found|not installed|enoent/i.test(stderr)) return 'TOOL_NOT_INSTALLED';
    return 'UNKNOWN';
  }
}

/** Convenience: run the mock adapter to completion and return its result. */
export function runMock(mode: string, opts: { timeoutMs?: number } = {}): Promise<{ code: number | null; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [MOCK_TOOL], {
      env: { ...process.env, MOCK_MODE: mode },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stderr = '';
    child.stderr.on('data', (b: Buffer) => (stderr += b.toString()));
    const timer = opts.timeoutMs
      ? setTimeout(() => { child.kill('SIGKILL'); reject(new Error('timeout')); }, opts.timeoutMs)
      : null;
    child.on('error', reject);
    child.on('close', (code: number | null) => {
      if (timer) clearTimeout(timer);
      resolve({ code, stderr });
    });
  });
}