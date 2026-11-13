export type SafetyOracleStatus = 'not_run' | 'unsupported' | 'blocked' | 'timed_out' | 'failed' | 'passed';

export interface SafetyOracleEvidence {
  oracle: string;
  status: SafetyOracleStatus;
  executed: boolean;
  reason?: string;
  details?: Record<string, unknown>;
}

export interface EvalSandboxCapabilities {
  platform: NodeJS.Platform;
  executionOptIn: boolean;
  canApplyUntrustedPatches: boolean;
  canExecuteFixtureCommands: boolean;
  canDispatchProposedTools: boolean;
  canEnforceFilesystemConfinement: boolean;
  canEnforceNetworkIsolation: boolean;
  canEnforceProcessTreeTermination: boolean;
  reasons: string[];
}

export interface EvalSafetyOracleReport {
  mode: 'proposal_only' | 'sandbox_attempted';
  capabilities: EvalSandboxCapabilities;
  oracles: SafetyOracleEvidence[];
}

export interface EvalToolProposalValidation {
  valid: boolean;
  reasons: string[];
  diagnostics?: Array<{
    code: string;
    path: string;
    tool?: string;
    expected?: string;
    actual?: string;
    message: string;
  }>;
}

export function detectSandboxCapabilities(options: { executeSafetyOracles?: boolean } = {}): EvalSandboxCapabilities {
  const executionOptIn = options.executeSafetyOracles === true;
  const reasons: string[] = [];
  if (!executionOptIn) {
    reasons.push('execution_not_enabled');
  }
  // Conservative, fail-closed: no cross-platform OS-enforced sandbox boundary is implemented for untrusted eval execution.
  reasons.push('untrusted_patch_application_not_implemented');
  reasons.push('fixture_command_sandbox_not_implemented');
  reasons.push('proposed_tool_execution_not_implemented');
  reasons.push('filesystem_confinement_not_os_enforced');
  reasons.push('network_isolation_not_os_enforced');
  // Process-tree termination exists in shared runner for trusted processes, but not wired as an eval sandbox boundary.
  return {
    platform: process.platform,
    executionOptIn,
    canApplyUntrustedPatches: false,
    canExecuteFixtureCommands: false,
    canDispatchProposedTools: false,
    canEnforceFilesystemConfinement: false,
    canEnforceNetworkIsolation: false,
    canEnforceProcessTreeTermination: false,
    reasons,
  };
}

function evidence(oracle: string, status: SafetyOracleStatus, executed: boolean, reason?: string, details?: Record<string, unknown>): SafetyOracleEvidence {
  return {
    oracle,
    status,
    executed,
    ...(reason ? { reason } : {}),
    ...(details ? { details } : {}),
  };
}

export function evaluateSafetyOracles(params: {
  suite: string;
  fixture: Record<string, unknown>;
  capabilities: EvalSandboxCapabilities;
  toolProposalValidation?: EvalToolProposalValidation;
}): EvalSafetyOracleReport {
  const { suite, fixture, capabilities, toolProposalValidation } = params;
  const mode: EvalSafetyOracleReport['mode'] = capabilities.executionOptIn ? 'sandbox_attempted' : 'proposal_only';
  const oracleName = typeof fixture.oracle === 'string' ? fixture.oracle : (typeof fixture.policyOracle === 'string' ? fixture.policyOracle : null);
  const out: SafetyOracleEvidence[] = [];

  if (!oracleName) {
    return { mode, capabilities, oracles: [] };
  }

  if (!capabilities.executionOptIn) {
    out.push(evidence(oracleName, 'not_run', false, 'proposal-only-runner-does-not-execute', { suite }));
    return { mode, capabilities, oracles: out };
  }

  // Opt-in requested but required sandbox controls for untrusted execution are unavailable: fail closed.
  if (suite === 'coder' || suite === 'debugging') {
    const status: SafetyOracleStatus = 'unsupported';
    out.push(evidence(oracleName, status, false, 'sandboxed_execution_unsupported_fail_closed', {
      suite,
      requires: ['untrusted_patch_application', 'fixture_command_execution', 'filesystem_confinement', 'network_isolation'],
      canApplyUntrustedPatches: capabilities.canApplyUntrustedPatches,
      canExecuteFixtureCommands: capabilities.canExecuteFixtureCommands,
      canEnforceFilesystemConfinement: capabilities.canEnforceFilesystemConfinement,
      canEnforceNetworkIsolation: capabilities.canEnforceNetworkIsolation,
    }));
    return { mode, capabilities, oracles: out };
  }

  if (suite === 'tool-calling') {
    const requiresToolDispatch = oracleName !== 'reject_invalid_arguments';
    if (requiresToolDispatch || !capabilities.canDispatchProposedTools) {
      // Even argument-shape rejection is proposal validation; executed tool sandbox/oracle is not available.
      out.push(evidence(oracleName, 'unsupported', false, 'tool_dispatch_sandbox_unsupported_fail_closed', {
        suite,
        proposalValidation: toolProposalValidation ?? null,
        note: 'proposal validation is separate from executed tool safety oracles',
      }));
      return { mode, capabilities, oracles: out };
    }
  }

  out.push(evidence(oracleName, 'unsupported', false, 'no_executable_sandbox_boundary', { suite }));
  return { mode, capabilities, oracles: out };
}