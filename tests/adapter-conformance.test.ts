import { MockAdapter, runMock } from './mock-adapter';
import { classifyError } from '@/adapters/conformance';
import type { AgentAdapter } from '@/adapters/adapter';
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
    const r = await runMock('rate_limit');
    expect(adapter.classifyError(r.code, r.stderr)).toBe('RATE_LIMIT');
  });

  it('classifies auth from stderr + non-zero exit', async () => {
    const r = await runMock('auth');
    expect(adapter.classifyError(r.code, r.stderr)).toBe('AUTH_ERROR');
  });

  it('never classifies stdout prose as RATE_LIMIT (false_positive exits 0)', async () => {
    const r = await runMock('false_positive');
    expect(r.code).toBe(0);
    expect(adapter.classifyError(r.code, r.stderr)).not.toBe('RATE_LIMIT');
  });

  it('does not label success exits as failure categories', async () => {
    const r = await runMock('succeed');
    expect(r.code).toBe(0);
    expect(adapter.classifyError(r.code, r.stderr)).not.toBe('TASK_FAILURE');
    expect(adapter.classifyError(r.code, r.stderr)).not.toBe('RATE_LIMIT');
  });

  it('classifies crash', async () => {
    const r = await runMock('crash');
    expect(adapter.classifyError(r.code, r.stderr)).not.toBe('RATE_LIMIT');
  });

  it('classifyError helper rejects wrong categories', () => {
    const bad = { ...adapter, classifyError: () => 'RATE_LIMIT' as any } as unknown as AgentAdapter;
    expect(() => classifyError(bad, 1, 'auth failed')).toThrow();
  });
});