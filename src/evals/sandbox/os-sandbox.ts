// OS-enforced sandbox primitives for evaluation execution.
//
// This module wraps platform-native sandbox mechanisms. It is intentionally
// fail-closed: when the required mechanism is unavailable or setup fails, no
// untrusted command is executed and the caller receives a structured
// `unsupported`/`failed` result.
//
// Application-level allowlists, path checks, or environment filtering are NOT
// represented as OS sandboxing by this module.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export type OsSandboxPlatform = 'linux' | 'darwin' | 'win32' | 'unsupported';

export interface OsSandboxCapability {
  platform: OsSandboxPlatform;
  mechanism: string;
  available: boolean;
  details: string;
  enforced: {
    filesystem: boolean;
    network: boolean;
    process: boolean;
  };
}

export interface OsSandboxRunResult {
  ok: boolean;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  cancelled: boolean;
  capability: OsSandboxCapability;
  reason?: string;
}

export function detectPlatform(): OsSandboxPlatform {
  if (process.platform === 'linux') return 'linux';
  if (process.platform === 'darwin') return 'darwin';
  if (process.platform === 'win32') return 'win32';
  return 'unsupported';
}

async function probeCommand(command: string, args: string[]): Promise<boolean> {
  try {
    await execFileAsync(command, args, { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

export async function probeOsSandbox(): Promise<OsSandboxCapability> {
  const platform = detectPlatform();
  if (platform === 'linux') {
    const available = await probeCommand('unshare', ['--net', 'true']);
    return {
      platform,
      mechanism: 'unshare --net/--pid/--mount-proc (user namespace)',
      available,
      details: available
        ? 'unshare network namespace probe succeeded'
        : 'unshare --net probe failed (insufficient privileges or unsupported kernel)',
      enforced: { filesystem: false, network: available, process: available },
    };
  }
  if (platform === 'darwin') {
    const available = await probeCommand('sandbox-exec', ['-p', '(version 1)(allow default)', 'true']);
    return {
      platform,
      mechanism: 'sandbox-exec (Seatbelt profile)',
      available,
      details: available
        ? 'sandbox-exec probe succeeded'
        : 'sandbox-exec unavailable or unusable',
      enforced: { filesystem: true, network: true, process: true },
    };
  }
  if (platform === 'win32') {
    return {
      platform,
      mechanism: 'none (no built-in OS sandbox CLI; Job Objects require native addon)',
      available: false,
      details: 'Windows OS-level sandbox not implemented in this runtime; fail-closed',
      enforced: { filesystem: false, network: false, process: false },
    };
  }
  return {
    platform: 'unsupported',
    mechanism: 'none',
    available: false,
    details: 'Unsupported platform',
    enforced: { filesystem: false, network: false, process: false },
  };
}

export interface SandboxRunSpec {
  executable: string;
  args: string[];
  cwd: string;
  env?: Record<string, string>;
  timeoutMs?: number;
  network?: 'deny' | 'allow';
  allowWritePaths?: string[];
}

export async function runOsSandboxed(spec: SandboxRunSpec): Promise<OsSandboxRunResult> {
  const capability = await probeOsSandbox();
  if (!capability.available) {
    return {
      ok: false,
      exitCode: null,
      stdout: '',
      stderr: '',
      timedOut: false,
      cancelled: false,
      capability,
      reason: 'unsupported: ' + capability.details,
    };
  }
  const timeoutMs = spec.timeoutMs ?? 30000;
  const platform = capability.platform;

  let command = spec.executable;
  let args = [...spec.args];

  if (platform === 'linux') {
    command = 'unshare';
    args = ['--net', '--pid', '--fork', '--mount-proc', spec.executable, ...spec.args];
  } else if (platform === 'darwin') {
    const profile = buildSeatbeltProfile(spec.allowWritePaths ?? [spec.cwd], spec.network ?? 'deny');
    command = 'sandbox-exec';
    args = ['-p', profile, spec.executable, ...spec.args];
  }

  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      cwd: spec.cwd,
      env: spec.env ? { ...process.env, ...spec.env } : process.env,
      timeout: timeoutMs,
      maxBuffer: 1024 * 1024,
    });
    return {
      ok: true,
      exitCode: 0,
      stdout,
      stderr,
      timedOut: false,
      cancelled: false,
      capability,
    };
  } catch (err: any) {
    const timedOut = err?.killed === true || err?.signal === 'SIGTERM';
    return {
      ok: false,
      exitCode: typeof err?.code === 'number' ? err.code : null,
      stdout: err?.stdout ?? '',
      stderr: err?.stderr ?? String(err?.message ?? err),
      timedOut,
      cancelled: false,
      capability,
      reason: timedOut ? 'timeout' : 'execution_failed',
    };
  }
}

function buildSeatbeltProfile(writePaths: string[], network: 'deny' | 'allow'): string {
  const lines = ['(version 1)', '(deny default)'];
  lines.push('(allow process*)');
  lines.push('(allow sysctl-read)');
  lines.push('(allow mach-lookup)');
  lines.push('(allow file-read*)');
  for (const p of writePaths) {
    lines.push(`(allow file-write* (subpath "${p.replace(/"/g, '\\"')}"))`);
  }
  if (network === 'allow') {
    lines.push('(allow network*)');
  }
  lines.push('(allow file-write* (subpath "/tmp"))');
  lines.push('(allow file-write* (subpath "/private/tmp"))');
  return lines.join('\n');
}
