import { describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');
const BIN = join(ROOT, 'dist', 'bin', 'air.js');

interface Result {
  stdout: string;
  stderr: string;
  code: number | null;
  timedOut: boolean;
}

function run(args: string[], env: Record<string, string> = {}, timeoutMs = 30000): Promise<Result> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [BIN, ...args], {
      cwd: ROOT,
      env: { ...process.env, ...env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      try { child.kill('SIGKILL'); } catch { /* noop */ }
    }, timeoutMs);
    child.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
    child.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, code: code ?? null, timedOut });
    });
  });
}

function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
}

describe('air CLI presentation (UI-02)', () => {
  it('prints a short welcome instead of a usage block with no args', async () => {
    const { stdout } = await run([]);
    const clean = stripAnsi(stdout);
    expect(clean).toContain('AIR');
    expect(clean).toContain('local-first AI agent');
    expect(clean).toContain('air doctor');
    expect(clean).toContain('air chat');
    // No commander usage block.
    expect(clean).not.toContain('Usage: air [options]');
  });

  it('welcome never installs or starts anything', async () => {
    const { stdout } = await run([]);
    const clean = stripAnsi(stdout);
    expect(clean).not.toMatch(/install/i);
    expect(clean).not.toMatch(/starting/i);
    expect(clean).not.toMatch(/pull/i);
  });

  it('air run prints a one-line header, not an ASCII banner box', async () => {
    // route-test is deterministic and does not spawn a long-running process.
    const { stdout } = await run(['route-test', 'list files', '--explain']);
    const clean = stripAnsi(stdout);
    expect(clean).toContain('air route-test');
    expect(clean).not.toContain('╔');
    expect(clean).not.toContain('Adaptive Intelligence Router');
  });

  it('respects NO_COLOR by emitting no ANSI color escapes', async () => {
    const { stdout } = await run(['status'], { NO_COLOR: '1' });
    expect(stripAnsi(stdout)).toBe(stdout);
    expect(stdout).not.toMatch(/\x1b\[/);
  });

  it('emits clean text when output is piped (non-TTY)', async () => {
    // Spawning with piped stdio means stdout is not a TTY.
    const { stdout } = await run(['status']);
    expect(stdout).not.toMatch(/\x1b\[/);
    expect(stripAnsi(stdout)).toContain('air status');
  });

  it('status --json is machine-readable and contains no color escapes', async () => {
    const { stdout } = await run(['status', '--json']);
    expect(stdout).not.toMatch(/\x1b\[/);
    const data = JSON.parse(stdout);
    expect(data.command).toBe('status');
    expect(Array.isArray(data.tools)).toBe(true);
  });

  it('chat in a non-TTY environment refuses instead of entering the REPL', async () => {
    const { code, stderr } = await run(['chat']);
    expect(code).not.toBe(0);
    expect(stripAnsi(stderr)).toMatch(/interactive terminal|non-interactive|air run/i);
  });

  it('does not print a thinking... interstitial in non-TTY mode', async () => {
    const { stdout, stderr } = await run(['chat']);
    expect(stripAnsi(stdout)).not.toContain('thinking...');
    expect(stripAnsi(stderr)).not.toContain('thinking...');
  });
});