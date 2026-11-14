// Narrow evaluation sandbox executor.
//
// Applies a validated model proposal (unified diff) to a per-case workspace and
// runs an explicitly allowlisted fixture command under the OS sandbox. Returns
// structured, truthful execution evidence. Never executes outside the sandbox.

import { existsSync } from 'node:fs';
import { isAbsolute, join, sep } from 'node:path';
import { runOsSandboxed, probeOsSandbox } from './os-sandbox';
import { applyUnifiedDiff } from './patch-applier';

const TRUSTED_DIRS = [
  '/usr/local/bin', '/usr/bin', '/bin', '/opt/homebrew/bin',
  'C:\\Windows\\System32', 'C:\\Program Files\\nodejs',
];

const ALLOWED_BASENAMES = new Set(['node', 'npm', 'npx', 'python', 'python3', 'pytest', 'cargo', 'go', 'make', 'tsc']);

function resolveExecutable(name: string): string | null {
  const base = name.replace(/^.*[\\/]/, '');
  if (!ALLOWED_BASENAMES.has(base)) return null;
  if (isAbsolute(name)) {
    if (!existsSync(name)) return null;
    if (!TRUSTED_DIRS.some((d) => name.startsWith(d + sep) || name === d)) return null;
    return name;
  }
  const pathEnv = process.env.PATH ?? '';
  for (const dir of pathEnv.split(process.platform === 'win32' ? ';' : ':')) {
    const candidate = join(dir, base);
    try {
      if (existsSync(candidate) && TRUSTED_DIRS.some((d) => candidate.startsWith(d + sep) || candidate === d)) {
        return candidate;
      }
    } catch { /* ignore */ }
  }
  if (base === 'node' && existsSync(process.execPath)) return process.execPath;
  return null;
}

export interface CoderOracleExecutionResult {
  executed: boolean;
  passed: boolean;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  cancelled: boolean;
  reason: string;
  patchApplied: boolean;
  patchError?: string;
  sandboxMechanism: string;
  sandboxAvailable: boolean;
}

function splitCommand(command: string): string[] {
  return command.trim().split(/\s+/).filter(Boolean);
}

export async function executeCoderOracle(params: {
  workspacePath: string;
  patch: string;
  command: string;
  timeoutMs?: number;
  signal?: AbortSignal;
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
      cancelled: false,
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
      cancelled: false,
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
      cancelled: false,
      reason: 'invalid_command',
      patchApplied: true,
      sandboxMechanism: capability.mechanism,
      sandboxAvailable: true,
    };
  }
  const resolved = resolveExecutable(argv[0]);
  if (!resolved) {
    return {
      executed: false,
      passed: false,
      exitCode: null,
      stdout: '',
      stderr: 'disallowed or untrusted executable: ' + argv[0],
      timedOut: false,
      cancelled: false,
      reason: 'command_not_allowlisted',
      patchApplied: true,
      sandboxMechanism: capability.mechanism,
      sandboxAvailable: true,
    };
  }

  const result = await runOsSandboxed({
    executable: resolved,
    args: argv.slice(1),
    cwd: params.workspacePath,
    timeoutMs: params.timeoutMs ?? 60000,
    signal: params.signal,
    network: 'deny',
    allowWritePaths: [params.workspacePath],
    env: { NODE_ENV: 'test' },
  });

    const passed = result.ok && result.exitCode === 0 && !result.timedOut && !result.cancelled;
  return {
    executed: true,
    passed,
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
    timedOut: result.timedOut,
    cancelled: result.cancelled,
    reason: result.reason ?? (result.ok ? 'passed' : 'failed'),
    patchApplied: true,
    sandboxMechanism: capability.mechanism,
    sandboxAvailable: true,
  };
}
