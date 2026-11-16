import { describe, expect, it } from 'vitest';
import { detectSandboxCapabilities, evaluateSafetyOracles } from '../../src/evals/sandbox/capabilities';

describe('P1-05 eval sandbox capability contract', () => {
  it('is fail-closed and proposal-only by default', () => {
    const caps = detectSandboxCapabilities();
    expect(caps.executionOptIn).toBe(false);
    expect(caps.canApplyUntrustedPatches).toBe(false);
    expect(caps.canExecuteFixtureCommands).toBe(false);
    expect(caps.canDispatchProposedTools).toBe(false);
    expect(caps.canEnforceFilesystemConfinement).toBe(false);
    expect(caps.canEnforceNetworkIsolation).toBe(false);
    expect(caps.reasons).toContain('execution_not_enabled');
  });

  it('remains fail-closed even when execution is explicitly opted in (no OS-enforced boundary implemented)', () => {
    const caps = detectSandboxCapabilities({ executeSafetyOracles: true });
    expect(caps.executionOptIn).toBe(true);
    expect(caps.canApplyUntrustedPatches).toBe(false);
    expect(caps.canExecuteFixtureCommands).toBe(false);
    expect(caps.canDispatchProposedTools).toBe(false);
    expect(caps.canEnforceNetworkIsolation).toBe(false);
  });

  it('reports not_run and never executed when proposal-only', () => {
    const report = evaluateSafetyOracles({
      suite: 'coder',
      fixture: { id: 'K01', oracle: 'focused_diff_and_test' },
      capabilities: detectSandboxCapabilities(),
    });
    expect(report.mode).toBe('proposal_only');
    expect(report.oracles[0]).toMatchObject({ status: 'not_run', executed: false, oracle: 'focused_diff_and_test' });
    expect(report.oracles.some(o => o.status === 'passed')).toBe(false);
  });

  it('reports unsupported (fail-closed) for coder/debugging when opt-in requested but sandbox unavailable', () => {
    const coder = evaluateSafetyOracles({
      suite: 'coder',
      fixture: { id: 'K01', oracle: 'focused_diff_and_test' },
      capabilities: detectSandboxCapabilities({ executeSafetyOracles: true }),
    });
    expect(coder.mode).toBe('sandbox_attempted');
    expect(coder.oracles[0]).toMatchObject({ status: 'unsupported', executed: false });
    expect(coder.oracles.some(o => o.status === 'passed')).toBe(false);

    const dbg = evaluateSafetyOracles({
      suite: 'debugging',
      fixture: { id: 'D01', oracle: 'root_cause_matches_fixture' },
      capabilities: detectSandboxCapabilities({ executeSafetyOracles: true }),
    });
    expect(dbg.oracles[0]).toMatchObject({ status: 'unsupported', executed: false });
  });

  it('reports unsupported for tool-calling execution oracles and keeps proposal validation separate', () => {
    const report = evaluateSafetyOracles({
      suite: 'tool-calling',
      fixture: { id: 'T08', policyOracle: 'deny_outside_workspace' },
      capabilities: detectSandboxCapabilities({ executeSafetyOracles: true }),
      toolProposalValidation: { valid: true, reasons: [] },
    });
    expect(report.oracles[0]).toMatchObject({ status: 'unsupported', executed: false, oracle: 'deny_outside_workspace' });
    expect(report.oracles[0]?.details).toMatchObject({ proposalValidation: { valid: true, reasons: [] } });
  });
});