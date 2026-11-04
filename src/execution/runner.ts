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
      const buf = Buffer.from(text, 'utf8');
      if (stdoutBytes < maxBuffer) {
        const remaining = maxBuffer - stdoutBytes;
        let len = Math.min(buf.length, remaining);
        // Do not split a multi-byte UTF-8 sequence at the cap boundary.
        while (len > 0 && len < buf.length && (buf[len] & 0xc0) === 0x80) len--;
        const sliceBuf = buf.subarray(0, len);
        stdout += sliceBuf.toString('utf8');
        stdoutBytes += sliceBuf.length;
        if (buf.length > remaining) stdoutTruncated = true;
      } else {
        stdoutTruncated = true;
      }
      // Rolling tail (last N bytes), UTF-8 boundary safe.
      stdoutTail += text;
      const tailBuf = Buffer.from(stdoutTail, 'utf8');
      if (tailBuf.length > tailCap) {
        let start = tailBuf.length - tailCap;
        while (start < tailBuf.length && (tailBuf[start] & 0xc0) === 0x80) start++;
        stdoutTail = tailBuf.subarray(start).toString('utf8');
      }
      options.onStdout?.(text);
    };

    const pushStderr = (text: string) => {
      const buf = Buffer.from(text, 'utf8');
      if (stderrBytes < maxBuffer) {
        const remaining = maxBuffer - stderrBytes;
        let len = Math.min(buf.length, remaining);
        while (len > 0 && len < buf.length && (buf[len] & 0xc0) === 0x80) len--;
        const sliceBuf = buf.subarray(0, len);
        stderr += sliceBuf.toString('utf8');
        stderrBytes += sliceBuf.length;
        if (buf.length > remaining) stderrTruncated = true;
      } else {
        stderrTruncated = true;
      }
      stderrTail += text;
      const tailBuf = Buffer.from(stderrTail, 'utf8');
      if (tailBuf.length > tailCap) {
        let start = tailBuf.length - tailCap;
        while (start < tailBuf.length && (tailBuf[start] & 0xc0) === 0x80) start++;
        stderrTail = tailBuf.subarray(start).toString('utf8');
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