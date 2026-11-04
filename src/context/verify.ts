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

import { spawn } from 'node:child_process';
import { execFileSync } from 'node:child_process';
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

export function runVerify(command: string[], cwd: string, timeoutMs = 60_000): Promise<VerifyResult> {
  return new Promise((resolve) => {
    const child = spawn(command[0], command.slice(1), {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: process.platform !== 'win32',
    });
    let stdout = '';
    let stderr = '';
    let timer: NodeJS.Timeout | null = null;
    let settled = false;
    const finish = (code: number | null) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve({
        ok: code === 0,
        code,
        stdout: redact(stdout),
        stderr: redact(stderr),
        command,
      });
    };
    child.stdout?.on('data', (b: Buffer) => { stdout += b.toString('utf8'); });
    child.stderr?.on('data', (b: Buffer) => { stderr += b.toString('utf8'); });
    child.on('error', () => finish(null));
    child.on('close', (code) => finish(code));
    if (timeoutMs > 0) {
      timer = setTimeout(() => {
        try {
          if (process.platform === 'win32' && child.pid) {
            execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
          } else if (child.pid) {
            try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); }
          } else {
            child.kill('SIGKILL');
          }
        } catch { /* noop */ }
        finish(null);
      }, timeoutMs);
    }
  });
}

export function formatVerifyReport(result: VerifyResult): string {
  const status = result.ok ? 'PASS' : 'FAIL';
  let out = `Verify ${status} (${result.code ?? 'signal'})`;
  if (result.stdout) out += `\n${result.stdout}`;
  if (result.stderr) out += `\n${result.stderr}`;
  return out;
}