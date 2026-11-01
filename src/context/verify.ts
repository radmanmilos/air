// Verify hook (G-05).
//
// Runs an approved verification command with argument arrays and
// `shell: false`. Never concatenates user-controlled strings into shell
// commands. Repo config's verify.command is never executed by default;
// this hook only runs when explicitly opted in via CLI or global config.
//
// Trust gate (G3-11): verify commands from repo config are refused unless
// the repo path is listed in the global trusted-repos list. CLI-supplied
// commands are always trusted.

import { execFileSync } from 'node:child_process';
import { redact } from '../security/redact';

export interface VerifyResult {
  ok: boolean;
  code: number | null;
  stdout: string;
  stderr: string;
  command: string[];
}

export interface VerifyTrust {
  trusted: boolean;
  source: 'cli' | 'global' | 'repo' | 'none';
  reason?: string;
}

/**
 * Trust gate for verify commands (G3-11).
 *
 * - CLI-supplied commands are always trusted (the user typed them).
 * - Repo-config commands are refused unless the cwd is in the global
 *   trusted-repos list. The caller passes the source explicitly so the
 *   decision is deterministic and testable.
 */
export function checkVerifyTrust(
  command: string[],
  trustedRepos: string[],
  cwd: string,
  source: 'cli' | 'repo' = 'cli',
): VerifyTrust {
  if (source === 'cli') {
    return { trusted: true, source: 'cli' };
  }
  for (const trusted of trustedRepos) {
    if (cwd === trusted || cwd.startsWith(trusted + '/') || cwd.startsWith(trusted + '\\')) {
      return { trusted: true, source: 'global' };
    }
  }
  return {
    trusted: false,
    source: 'none',
    reason: `verify.command from repo config is refused; add ${cwd} to the global trusted-repos list`,
  };
}

export function runVerify(command: string[], cwd: string, timeoutMs = 60_000): VerifyResult {
  try {
    const stdout = execFileSync(command[0], command.slice(1), {
      cwd,
      stdio: ['ignore', 'pipe', 'ignore'],
      encoding: 'utf8',
      timeout: timeoutMs,
    });
    return { ok: true, code: 0, stdout: redact(stdout), stderr: '', command };
  } catch (err: any) {
    const code = err?.status ?? err?.code ?? null;
    const stdout = redact(err?.stdout?.toString?.() ?? '');
    const stderr = redact(err?.stderr?.toString?.() ?? '');
    return { ok: false, code, stdout, stderr, command };
  }
}

export function formatVerifyReport(result: VerifyResult): string {
  const status = result.ok ? 'PASS' : 'FAIL';
  let out = `Verify ${status} (${result.code ?? 'signal'})`;
  if (result.stdout) out += `\n${result.stdout}`;
  if (result.stderr) out += `\n${result.stderr}`;
  return out;
}