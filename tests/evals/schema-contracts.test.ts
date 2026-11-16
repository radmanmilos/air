import { describe, expect, it } from 'vitest';
import { validatePlanDetailed, PlanSchema } from '../../src/planner';
import { ActionSchema } from '../../src/conversation/actions';

describe('P1-03 planner deterministic validation', () => {
  const base = () => ({
    id: 'w1', objective: 'Do x', taskType: 'plan' as const, readOnly: true, requiresWrite: false, requiresCode: false, dependsOn: [] as string[], acceptanceCriteria: ['ok'],
  });

  it('accepts a valid bounded plan', () => {
    const r = validatePlanDetailed({ workItems: [base(), { ...base(), id: 'w2', dependsOn: ['w1'] }] });
    expect(r.valid).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it('rejects duplicate ids', () => {
    const r = validatePlanDetailed({ workItems: [base(), { ...base() }] });
    expect(r.valid).toBe(false);
    expect(r.errors.join(' ')).toMatch(/duplicate/i);
  });

  it('rejects unknown dependencies', () => {
    const r = validatePlanDetailed({ workItems: [{ ...base(), dependsOn: ['w9'] }] });
    expect(r.valid).toBe(false);
    expect(r.errors.join(' ')).toMatch(/unknown dependency/i);
  });

  it('rejects self-dependencies', () => {
    const r = validatePlanDetailed({ workItems: [{ ...base(), dependsOn: ['w1'] }] });
    expect(r.valid).toBe(false);
    expect(r.errors.join(' ')).toMatch(/self-dependency/i);
  });

  it('rejects dependency cycles', () => {
    const r = validatePlanDetailed({ workItems: [
      { ...base(), id: 'w1', dependsOn: ['w2'] },
      { ...base(), id: 'w2', dependsOn: ['w1'] },
    ] });
    expect(r.valid).toBe(false);
    expect(r.errors.join(' ')).toMatch(/cycle/i);
  });

  it('rejects oversized plans and missing criteria', () => {
    const many = Array.from({length:33},(_,i)=>({ ...base(), id: 'w'+(i+1) }));
    expect(validatePlanDetailed({ workItems: many }).valid).toBe(false);
    expect(validatePlanDetailed({ workItems: [{ ...base(), acceptanceCriteria: [] }] }).valid).toBe(false);
  });

  it('exports PlanSchema for structured eval requests', () => {
    expect(PlanSchema.safeParse({ workItems: [base()] }).success).toBe(true);
  });
});

describe('P1-03 coordinator schema', () => {
  it('ActionSchema rejects invalid actions safely', () => {
    expect(ActionSchema.safeParse({ type: 'answer', text: 'ok' }).success).toBe(true);
    expect(ActionSchema.safeParse({ type: 'unknown' }).success).toBe(false);
    expect(ActionSchema.safeParse({ type: 'spawn_job' }).success).toBe(false);
  });
});
