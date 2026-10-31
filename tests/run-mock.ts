// Test helper: run the mock adapter through the shared process runner.

import { MockAdapter } from '../src/adapters/mock';
import { runProcess } from '../src/execution/runner';
import type { ProcessOutcome, TaskInput } from '../src/types';

export async function runMockThroughRunner(
  mode: string,
  options: { timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<ProcessOutcome> {
  const adapter = new MockAdapter();
  const spec = adapter.buildCommand({
    id: 'test-task',
    prompt: 'mock',
    cwd: process.cwd(),
    mode: 'ask',
  } as TaskInput);
  spec.env = { ...spec.env, MOCK_MODE: mode };
  const { outcome } = await runProcess(spec, {
    timeoutMs: options.timeoutMs,
    signal: options.signal,
  });
  return outcome;
}