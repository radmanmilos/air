import { EXIT_CODES, exitCodeFor, formatExitCode } from '../src/types/exit-codes';
import { describe, it, expect } from 'vitest';

describe('exit code table (G3-13)', () => {
  it('maps result states to codes', () => {
    expect(exitCodeFor('SUCCEEDED_WITH_CHANGES')).toBe(EXIT_CODES.SUCCESS);
    expect(exitCodeFor('SUCCEEDED_READ_ONLY')).toBe(EXIT_CODES.SUCCESS);
    expect(exitCodeFor('NO_CHANGES')).toBe(EXIT_CODES.NO_CHANGES);
    expect(exitCodeFor('CANCELLED')).toBe(EXIT_CODES.USER_CANCELLED);
    expect(exitCodeFor('FAILED', 'timeout')).toBe(EXIT_CODES.TIMEOUT);
    expect(exitCodeFor('FAILED')).toBe(EXIT_CODES.TASK_FAILURE);
  });

  it('formats codes for human output', () => {
    expect(formatExitCode(0)).toContain('SUCCESS');
    expect(formatExitCode(2)).toContain('ALL_EXHAUSTED');
    expect(formatExitCode(4)).toContain('CONFIG_OR_DIRTY');
    expect(formatExitCode(1)).toContain('NO_CHANGES');
    expect(formatExitCode(5)).toContain('TIMEOUT');
  });

  it('codes are distinct', () => {
    const codes = Object.values(EXIT_CODES);
    const set = new Set(codes);
    expect(set.size).toBe(codes.length);
  });
});