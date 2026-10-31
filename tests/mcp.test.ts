import { describe, it, expect } from 'vitest';
import { startMcp } from '../src/mcp/server';

describe('mcp server (R2-10)', () => {
  it('exports startMcp as a function', () => {
    expect(typeof startMcp).toBe('function');
  });
});