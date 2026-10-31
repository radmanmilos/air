import { runVerify, formatVerifyReport } from '../src/context/verify';
import { describe, it, expect } from 'vitest';

describe('verify hook (G-05)', () => {
  it('runs a passing command with array args and no shell', () => {
    const result = runVerify(['node', '-e', "process.exit(0)"], process.cwd());
    expect(result.ok).toBe(true);
    expect(result.code).toBe(0);
    expect(result.command).toEqual(['node', '-e', "process.exit(0)"]);
  });

  it('runs a failing command and reports non-zero', () => {
    const result = runVerify(['node', '-e', "process.exit(2)"], process.cwd(), 5000);
    expect(result.ok).toBe(false);
    expect(result.code).toBe(2);
  });

  it('formats a PASS report', () => {
    const result = runVerify(['node', '-e', "process.stdout.write('ok');process.exit(0)"], process.cwd());
    const report = formatVerifyReport(result);
    expect(report).toContain('PASS');
    expect(report).toContain('ok');
  });

  it('redacts secrets in output', () => {
    const result = runVerify(
      ['node', '-e', "process.stdout.write('token sk-or-this-is-a-fake-test-key-1234567890abcdef');process.exit(0)"],
      process.cwd(),
    );
    expect(result.stdout).not.toContain('sk-or-this-is-a-fake-test-key-1234567890abcdef');
    expect(result.stdout).toContain('[REDACTED]');
  });
});