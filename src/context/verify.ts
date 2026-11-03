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

import { spawnSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
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
  source: 'cli' | 'repo',
): VerifyTrust {
  if (source === 'cli') {
    return { trusted: true, source: 'cli' };
  }
  const cwdReal = canonical(cwd);
  for (const trusted of trustedRepos) {
    const tReal = canonical(trusted);
    const rel = relative(tReal, cwdReal);
    if (rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))) {
      return { trusted: true, source: 'global' };
    }
  }
  return {
    trusted: false,
    source: 'none',
    reason: `verify.command from repo config is refused; add ${cwd} to the global trusted-repos list`,
  };
}

function canonical(p: string): string {
  try {
    return realpathSync(p);
  } catch {
    return resolve(p);
  }
}

export function runVerify(command: string[], cwd: string, timeoutMs = 60_000): VerifyResult {
  const res = spawnSync(command[0], command.slice(1), {
    cwd,
    encoding: 'utf8',
    timeout: timeoutMs,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const ok = res.status === 0;
  return {
    ok,
    code: res.status ?? null,
    stdout: redact(res.stdout ?? ''),
    stderr: redact(res.stderr ?? ''),
    command,
  };
}

export function formatVerifyReport(result: VerifyResult): string {
  const status = result.ok ? 'PASS' : 'FAIL';
  let out = `Verify ${status} (${result.code ?? 'signal'})`;
  if (result.stdout) out += `\n${result.stdout}`;
  if (result.stderr) out += `\n${result.stderr}`;
  return out;
}