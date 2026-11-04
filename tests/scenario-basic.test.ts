import { describe, it, expect } from 'vitest';
import { MockAdapter } from '../src/adapters/mock';

describe('scenario: mock adapter basic', () => {
  it('mock adapter available', () => {
    const a = new MockAdapter();
    expect(a.canHandle({ prompt: 'x', cwd: '.', mode: 'ask', readOnly: false } as any)).toBe(true);
  });
});