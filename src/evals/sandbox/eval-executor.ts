// Narrow evaluation sandbox executor.
//
// Applies a validated model proposal (unified diff) to a per-case workspace and
// runs an explicitly allowlisted fixture command under the OS sandbox. Returns
// structured, truthful execution evidence. Never executes outside the sandbox.

import { runOsSandboxed, probeOsSandbox } from './os-sandbox';
import { applyUnifiedDiff } from './patch-applier';

export interface CoderOracleExecutionResult {
  executed: boolean;
  passed: boolean;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  reason: string;
  patchApplied: boolean;
  patchError?: string;
  sandboxMechanism: string;
  sandboxAvailable: boolean;
}

const ALLOWED_EXECUTABLES = new Set(['node', 'npm', 'npx', 'python', 'python3', 'pytest', 'cargo', 'go', 'make', 'tsc']);

function splitCommand(command: string): string[] {
  return command.trim().split(/\s+/).filter(Boolean);
}

export async function executeCoderOracle(params: {
  workspacePath: string;
  patch: string;
  command: string;
  timeoutMs?: number;
}): Promise<CoderOracleExecutionResult> {
  const capability = await probeOsSandbox();
  if (!capability.available) {
    return {
      executed: false,
      passed: false,
      exitCode: null,
      stdout: '',
      stderr: '',
      timedOut: false,
      reason: 'unsupported: ' + capability.details,
      patchApplied: false,
      sandboxMechanism: capability.mechanism,
      sandboxAvailable: false,
    };
  }

  const patchResult = applyUnifiedDiff(params.workspacePath, params.patch);
  if (!patchResult.ok) {
    return {
      executed: false,
      passed: false,
      exitCode: null,
      stdout: '',
      stderr: patchResult.error ?? 'patch failed',
      timedOut: false,
      reason: 'patch_apply_failed',
      patchApplied: false,
      patchError: patchResult.error,
      sandboxMechanism: capability.mechanism,
      sandboxAvailable: true,
    };
  }

  const argv = splitCommand(params.command);
  if (argv.length === 0) {
    return {
      executed: false,
      passed: false,
      exitCode: null,
      stdout: '',
      stderr: 'empty command',
      timedOut: false,
      reason: 'invalid_command',
      patchApplied: true,
      sandboxMechanism: capability.mechanism,
      sandboxAvailable: true,
    };
  }
  const executable = argv[0].replace(/^.*[\\/]/, '');
  if (!ALLOWED_EXECUTABLES.has(executable)) {
    return {
      executed: false,
      passed: false,
      exitCode: null,
      stdout: '',
      stderr: 'disallowed executable: ' + executable,
      timedOut: false,
      reason: 'command_not_allowlisted',
      patchApplied: true,
      sandboxMechanism: capability.mechanism,
      sandboxAvailable: true,
    };
  }

  const result = await runOsSandboxed({
    executable: argv[0],
    args: argv.slice(1),
    cwd: params.workspacePath,
    timeoutMs: params.timeoutMs ?? 60000,
    network: 'deny',
    allowWritePaths: [params.workspacePath],
  });

  return {
    executed: true,
    passed: result.ok && result.exitCode === 0,
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
    timedOut: result.timedOut,
    reason: result.reason ?? (result.ok ? 'passed' : 'failed'),
    patchApplied: true,
    sandboxMechanism: capability.mechanism,
    sandboxAvailable: true,
  };
}
