import { Orchestrator } from '../src/orchestrator/orchestrator';
import { describe, it, expect } from 'vitest';

describe('orchestrator', () => {
  it('instantiates and persists a log', () => {
    const o = new Orchestrator();
    expect(o.list()).toBeInstanceOf(Array);
  });

  it('chooses an adapter for a task', () => {
    const o = new Orchestrator();
    const a = o.chooseAdapter({ mode: 'ask', readOnly: true });
    expect(a).not.toBeNull();
  });
});
