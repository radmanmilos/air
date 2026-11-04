import { describe, it, expect } from 'vitest';
import { planFromRequest } from '../src/planner';
import { compileJobResult } from '../src/result-compiler';

describe('planner (T-026)', () => {
  it('simple edit -> one code_edit item', () => {
    const p = planFromRequest('fix the bug in foo.ts', { requiresWrite: true });
    expect(p.workItems.length).toBeGreaterThanOrEqual(1);
    expect(p.workItems.some((w) => w.taskType === 'code_edit')).toBe(true);
  });
  it('review request -> code_review item', () => {
    const p = planFromRequest('review this change');
    expect(p.workItems.some((w) => w.taskType === 'code_review')).toBe(true);
  });
});

describe('result compiler (T-027)', () => {
  it('compiles success', () => {
    const out = compileJobResult({ runId: 'r1', result: 'SUCCEEDED_WITH_CHANGES', adapterId: 'aider', provider: 'openrouter', model: 'm', changedFiles: ['a.ts'], verifyOk: true });
    expect(out).toContain('Done.');
    expect(out).toContain('a.ts');
    expect(out).toContain('PASS');
  });
  it('compiles failure', () => {
    const out = compileJobResult({ runId: 'r2', result: 'FAILED', adapterId: 'aider', provider: 'p', model: 'm', error: { category: 'TIMEOUT', message: 'timed out' } });
    expect(out).toContain('Failed');
    expect(out).toContain('TIMEOUT');
  });
});
