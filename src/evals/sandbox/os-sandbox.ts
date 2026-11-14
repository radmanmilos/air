// OS-enforced sandbox primitives for evaluation execution.
//
// This module wraps platform-native sandbox mechanisms. It is intentionally
// fail-closed: when the required mechanism is unavailable or setup fails, no
// untrusted command is executed and the caller receives a structured
// `unsupported`/`failed` result.
//
// Application-level allowlists, path checks, or environment filtering are NOT
// represented as OS sandboxing by this module.

import { execFile, spawn } from 'node:child_process';
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
    return {
      platform,
      mechanism: 'none (Linux sandbox deferred; fail-closed)',
      available: false,
      details: 'Linux untrusted execution disabled in this release; deferred to later phase',
      enforced: { filesystem: false, network: false, process: false },
    };
  }
  if (platform === 'darwin') {
    return {
      platform,
      mechanism: 'none (macOS sandbox deferred; fail-closed)',
      available: false,
      details: 'macOS untrusted execution disabled in this release; deferred to later phase',
      enforced: { filesystem: false, network: false, process: false },
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
  signal?: AbortSignal;
  network?: 'deny' | 'allow';
  allowWritePaths?: string[];
}

function minimalEnv(override?: Record<string, string>): Record<string, string> {
  const base: Record<string, string> = {
    PATH: process.env.PATH ?? '/usr/local/bin:/usr/bin:/bin',
    TMPDIR: process.env.TMPDIR ?? '/tmp',
    TEMP: process.env.TEMP ?? '/tmp',
    TMP: process.env.TMP ?? '/tmp',
  };
  if (override) Object.assign(base, override);
  // Never inherit secret-like env vars from the host.
  for (const key of Object.keys(base)) {
    if (/(KEY|TOKEN|SECRET|PASSWORD)/i.test(key) && !(override && Object.prototype.hasOwnProperty.call(override, key))) {
      delete base[key];
    }
  }
  return base;
}

function killTree(pid: number | undefined): void {
  if (!pid) return;
  try {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
    } else {
      try { process.kill(-pid, 'SIGKILL'); } catch { process.kill(pid, 'SIGKILL'); }
    }
  } catch {
    // best-effort
  }
}

export async function runOsSandboxed(spec: SandboxRunSpec): Promise<OsSandboxRunResult> {
  const capability = await probeOsSandbox();
  if (!capability.available || !capability.enforced.filesystem || !capability.enforced.network || !capability.enforced.process) {
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

  const env = minimalEnv(spec.env);

  return new Promise<OsSandboxRunResult>((resolve) => {
    const child = spawn(command, args, {
      cwd: spec.cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: process.platform !== 'win32',
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let cancelled = false;
    let settled = false;

    const timer = setTimeout(() => {
      timedOut = true;
      killTree(child.pid);
    }, timeoutMs);

    const onAbort = () => {
      cancelled = true;
      killTree(child.pid);
    };
    if (spec.signal) {
      if (spec.signal.aborted) onAbort();
      else spec.signal.addEventListener('abort', onAbort, { once: true });
    }

    child.stdout?.on('data', (d: Buffer) => { stdout += d.toString(); });
    child.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });

    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      spec.signal?.removeEventListener('abort', onAbort);
      resolve({
        ok: false,
        exitCode: null,
        stdout,
        stderr: stderr + String(err?.message ?? err),
        timedOut,
        cancelled,
        capability,
        reason: 'spawn_error',
      });
    });

    child.on('close', (code, _signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      spec.signal?.removeEventListener('abort', onAbort);
      const ok = code === 0 && !timedOut && !cancelled;
      resolve({
        ok,
        exitCode: code,
        stdout,
        stderr,
        timedOut,
        cancelled,
        capability,
        reason: timedOut ? 'timeout' : cancelled ? 'cancelled' : (code === 0 ? 'passed' : 'failed'),
      });
    });
  });
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
