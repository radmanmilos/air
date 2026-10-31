import { startMcp } from '../src/mcp/server';
import { describe, it, expect } from 'vitest';

describe('mcp server (G3-12)', () => {
  it('exports startMcp as a function', () => {
    expect(typeof startMcp).toBe('function');
  });
});