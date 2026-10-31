// Shared process runner used by every adapter.
//
// - cross-spawn with argument arrays; never shell: true
// - stdio: ['ignore', 'pipe', 'pipe']; child stdin closed so non-interactive
//   tools cannot hang waiting for input
// - streams stdout/stderr to the caller in real time while keeping a bounded
//   rolling buffer with truncation metadata
// - per-tool timeout + AbortSignal; tree-kill on timeout/cancel
//   (taskkill /T /F on Windows, process group on Unix)
// - all captured output is redacted before it reaches logs/handoff/status
// - returns a ProcessOutcome; process facts (timedOut, cancelled, spawnError)
//   take precedence over adapter stderr matching

import { execSync } from 'node:child_process';
import { redact } from '../security/redact';
import type { CommandSpec, ProcessOutcome } from '../types';

// cross-spawn has no published @types package, so we import it via a typed
// require. It returns the same ChildProcess shape as node:child_process.spawn.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const spawn: (command: string, args?: readonly string[], options?: any) => any = require('cross-spawn').spawn;

export interface RunOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
  maxBufferBytes?: number;
  onStdout?: (chunk: string) => void;
  onStderr?: (chunk: string) => void;
}

export interface RunResult {
  outcome: ProcessOutcome;
}

export async function runProcess(spec: CommandSpec, options: RunOptions = {}): Promise<RunResult> {
  const maxBuffer = options.maxBufferBytes ?? 1_000_000;

  return new Promise((resolve) => {
    const startedAt = new Date().toISOString();
    let stdout = '';
    let stderr = '';
    let stdoutTruncated = false;
    let stderrTruncated = false;

    const child = spawn(spec.executable, spec.args, {
      cwd: spec.cwd,
      env: spec.env ? { ...process.env, ...spec.env } : process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let settled = false;
    let timer: NodeJS.Timeout | null = null;
    let timedOut = false;
    let cancelled = false;

    const finish = (outcome: ProcessOutcome) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve({ outcome });
    };

    const killTree = () => {
      if (process.platform === 'win32') {
        try {
          execSync(`taskkill /PID ${child.pid} /T /F`, { stdio: 'ignore' });
        } catch {
          try { child.kill('SIGKILL'); } catch { /* noop */ }
        }
      } else {
        const pid = child.pid;
        if (typeof pid === 'number') {
          try { process.kill(-pid, 'SIGKILL'); } catch { /* not a group leader */ }
          try { child.kill('SIGKILL'); } catch { /* noop */ }
        }
      }
    };

    if (options.timeoutMs && options.timeoutMs > 0) {
      timer = setTimeout(() => {
        timedOut = true;
        killTree();
      }, options.timeoutMs);
    }

    if (options.signal) {
      if (options.signal.aborted) {
        cancelled = true;
        killTree();
      } else {
        options.signal.addEventListener('abort', () => {
          cancelled = true;
          killTree();
        }, { once: true });
      }
    }

    child.stdout?.on('data', (buf: Buffer) => {
      const text = redact(buf.toString());
      if (stdout.length < maxBuffer) {
        const remaining = maxBuffer - stdout.length;
        stdout += text.slice(0, remaining);
        if (text.length > remaining) stdoutTruncated = true;
      } else {
        stdoutTruncated = true;
      }
      options.onStdout?.(text);
    });

    child.stderr?.on('data', (buf: Buffer) => {
      const text = redact(buf.toString());
      if (stderr.length < maxBuffer) {
        const remaining = maxBuffer - stderr.length;
        stderr += text.slice(0, remaining);
        if (text.length > remaining) stderrTruncated = true;
      } else {
        stderrTruncated = true;
      }
      options.onStderr?.(text);
    });

    child.on('error', (err: NodeJS.ErrnoException) => {
      finish({
        exitCode: null,
        signal: null,
        spawnError: { code: err.code, message: err.message },
        timedOut,
        cancelled,
        stdout,
        stderr,
        startedAt,
        endedAt: new Date().toISOString(),
        durationMs: Date.now() - new Date(startedAt).getTime(),
      });
    });

    child.on('close', (code: number | null, signal: NodeJS.Signals | null) => {
      finish({
        exitCode: code,
        signal,
        spawnError: undefined,
        timedOut,
        cancelled,
        stdout,
        stderr,
        startedAt,
        endedAt: new Date().toISOString(),
        durationMs: Date.now() - new Date(startedAt).getTime(),
      });
    });
  });
}