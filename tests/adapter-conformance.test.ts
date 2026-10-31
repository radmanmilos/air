import { MockAdapter, runMockThroughRunner, classifyOutcomeMock } from './mock-adapter';
import { classifyError } from '../src/adapters/conformance';
import type { AgentAdapter } from '../src/adapters/adapter';
import { describe, it, expect } from 'vitest';

describe('AgentAdapter conformance (G-03)', () => {
  const adapter = new MockAdapter();

  it('implements the AgentAdapter interface', () => {
    expect(adapter.id).toBe('mock');
    expect(adapter.provider).toBe('openrouter');
    expect(adapter.model).toBe('mock-model');
    expect(adapter.canHandle({} as any)).toBe(true);
    expect(adapter.buildCommand({ cwd: '/tmp' } as any).executable).toBeTruthy();
    expect(Array.isArray(adapter.parseOutput('x'))).toBe(true);
    expect(typeof adapter.classifyError).toBe('function');
  });

  it('classifies rate_limit from stderr + non-zero exit', async () => {
    const outcome = await runMockThroughRunner('rate_limit');
    expect(classifyOutcomeMock(outcome)).toBe('RATE_LIMIT');
  });

  it('classifies auth from stderr + non-zero exit', async () => {
    const outcome = await runMockThroughRunner('auth');
    expect(classifyOutcomeMock(outcome)).toBe('AUTH_ERROR');
  });

  it('never classifies stdout prose as RATE_LIMIT (false_positive exits 0)', async () => {
    const outcome = await runMockThroughRunner('false_positive');
    expect(outcome.exitCode).toBe(0);
    expect(classifyOutcomeMock(outcome)).not.toBe('RATE_LIMIT');
  });

  it('does not label success exits as failure categories', async () => {
    const outcome = await runMockThroughRunner('succeed');
    expect(outcome.exitCode).toBe(0);
    expect(classifyOutcomeMock(outcome)).not.toBe('TASK_FAILURE');
    expect(classifyOutcomeMock(outcome)).not.toBe('RATE_LIMIT');
  });

  it('timeout maps to TIMEOUT via process facts', async () => {
    const outcome = await runMockThroughRunner('hang', { timeoutMs: 300 });
    expect(outcome.timedOut).toBe(true);
    expect(classifyOutcomeMock(outcome)).toBe('TIMEOUT');
  });

  it('cancellation maps to USER_CANCELLED via process facts', async () => {
    const controller = new AbortController();
    const promise = runMockThroughRunner('hang', { signal: controller.signal, timeoutMs: 30_000 });
    setTimeout(() => controller.abort(), 200);
    const outcome = await promise;
    expect(outcome.cancelled).toBe(true);
    expect(classifyOutcomeMock(outcome)).toBe('USER_CANCELLED');
  });

  it('classifyError helper rejects wrong categories', () => {
    const bad = { ...adapter, classifyError: () => 'RATE_LIMIT' as any } as unknown as AgentAdapter;
    expect(() => classifyError(bad, 1, 'auth failed')).toThrow();
  });
});