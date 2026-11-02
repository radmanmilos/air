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

import { execFile } from 'node:child_process';
import { StreamingRedactor } from '../security/streaming-redact';
import type { CommandSpec, ProcessOutcome } from '../types';
import { utf8Bytes } from '../types/outcome';

// cross-spawn has no published @types package and ships as ESM-only.
// We import it lazily so the module graph stays compatible with both
// CommonJS and ESM consumers.
async function getSpawn(): Promise<(command: string, args?: readonly string[], options?: any) => any> {
  const mod = (await import('cross-spawn')) as any;
  const fn = typeof mod === 'function' ? mod : mod.spawn;
  if (!fn) throw new Error('cross-spawn did not export a spawn function');
  return fn;
}

export interface RunOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
  maxBufferBytes?: number;
  stdoutTailBytes?: number;
  stderrTailBytes?: number;
  onStdout?: (chunk: string) => void;
  onStderr?: (chunk: string) => void;
}

export interface RunResult {
  outcome: ProcessOutcome;
}

export async function runProcess(spec: CommandSpec, options: RunOptions = {}): Promise<RunResult> {
  const spawnFn = await getSpawn();
  const maxBuffer = options.maxBufferBytes ?? 1_000_000;
  const tailCap = options.stdoutTailBytes ?? 2048;

  return new Promise((resolve) => {
    const startedAt = new Date().toISOString();
    let stdout = '';
    let stderr = '';
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let stdoutTruncated = false;
    let stderrTruncated = false;
    let stdoutTail = '';
    let stderrTail = '';

    const child = spawnFn(spec.executable, spec.args, {
      cwd: spec.cwd,
      env: spec.env ? { ...process.env, ...spec.env } : process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      // On Unix, spawn detached so the child becomes a new process group
      // leader. This makes process.kill(-pid, ...) reliable for tree-kill.
      // On Windows, taskkill /T /F handles the tree regardless.
      detached: process.platform !== 'win32',
    });

    let settled = false;
    let timer: NodeJS.Timeout | null = null;
    let timedOut = false;
    let cancelled = false;

    const stdoutRedactor = new StreamingRedactor();
    const stderrRedactor = new StreamingRedactor();

    const finish = (outcome: ProcessOutcome) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve({ outcome });
    };

    const killTree = () => {
      if (process.platform === 'win32') {
        // Use execFile (async, non-blocking) instead of execSync so the
        // event loop is never stalled by taskkill.
        if (typeof child.pid === 'number') {
          execFile('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
            timeout: 5000,
          }, () => { /* best-effort; child.kill is the fallback */ });
        }
        try { child.kill('SIGKILL'); } catch { /* noop */ }
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

    const pushStdout = (text: string) => {
      // Keep a prefix-capped capture for full output, plus a rolling tail
      // for handoff/debugging (R5-10).
      if (stdoutBytes < maxBuffer) {
        const remaining = maxBuffer - stdoutBytes;
        stdout += text.slice(0, remaining);
        stdoutBytes += utf8Bytes(text.slice(0, remaining));
        if (utf8Bytes(text) > remaining) stdoutTruncated = true;
      } else {
        stdoutTruncated = true;
      }
      // Rolling tail (last N bytes).
      const nextTail = stdoutTail + text;
      if (utf8Bytes(nextTail) > tailCap) {
        let out = nextTail;
        while (utf8Bytes(out) > tailCap) out = out.slice(1);
        stdoutTail = out;
      } else {
        stdoutTail = nextTail;
      }
      options.onStdout?.(text);
    };

    const pushStderr = (text: string) => {
      if (stderrBytes < maxBuffer) {
        const remaining = maxBuffer - stderrBytes;
        stderr += text.slice(0, remaining);
        stderrBytes += utf8Bytes(text.slice(0, remaining));
        if (utf8Bytes(text) > remaining) stderrTruncated = true;
      } else {
        stderrTruncated = true;
      }
      const nextTail = stderrTail + text;
      if (utf8Bytes(nextTail) > tailCap) {
        let out = nextTail;
        while (utf8Bytes(out) > tailCap) out = out.slice(1);
        stderrTail = out;
      } else {
        stderrTail = nextTail;
      }
      options.onStderr?.(text);
    };

    child.stdout?.on('data', (buf: Buffer) => {
      pushStdout(stdoutRedactor.feed(buf));
    });

    child.stderr?.on('data', (buf: Buffer) => {
      pushStderr(stderrRedactor.feed(buf));
    });

    child.on('error', (err: NodeJS.ErrnoException) => {
      pushStdout(stdoutRedactor.flush());
      pushStderr(stderrRedactor.flush());
      finish({
        exitCode: null,
        signal: null,
        spawnError: { code: err.code, message: err.message },
        timedOut,
        cancelled,
        stdout,
        stderr,
        stdoutBytes,
        stderrBytes,
        stdoutTruncated,
        stderrTruncated,
        stdoutTail,
        stderrTail,
        startedAt,
        endedAt: new Date().toISOString(),
        durationMs: Date.now() - new Date(startedAt).getTime(),
      });
    });

    child.on('close', (code: number | null, signal: NodeJS.Signals | null) => {
      pushStdout(stdoutRedactor.flush());
      pushStderr(stderrRedactor.flush());
      finish({
        exitCode: code,
        signal,
        spawnError: undefined,
        timedOut,
        cancelled,
        stdout,
        stderr,
        stdoutBytes,
        stderrBytes,
        stdoutTruncated,
        stderrTruncated,
        stdoutTail,
        stderrTail,
        startedAt,
        endedAt: new Date().toISOString(),
        durationMs: Date.now() - new Date(startedAt).getTime(),
      });
    });
  });
}