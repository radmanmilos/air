// Local adapter: contract request writing, worker invocation, and error mapping.
//
// These tests never need Ollama. A tiny Node shim stands in for
// `python -m air_local.run` so the process wiring is exercised end to end.

import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalAdapter } from '../src/adapters/local';
import { runProcess } from '../src/execution/runner';
import { classifyError as conformanceClassify } from '../src/adapters/conformance';
import { triggersFailover } from '../src/types/errors';
import type { TaskInput } from '../src/types';

const WORKER = { executable: 'python', args: ['-m', 'air_local.run'] };
const dirs: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'air-local-adapter-'));
  dirs.push(dir);
  return dir;
}

function task(overrides: Partial<TaskInput> = {}): TaskInput {
  return {
    id: 'run-test',
    prompt: 'say hello',
    cwd: process.cwd(),
    mode: 'ask',
    ...overrides,
  };
}

function argAfter(args: string[], flag: string): string {
  const index = args.indexOf(flag);
  expect(index).toBeGreaterThanOrEqual(0);
  return args[index + 1];
}

function writeShim(dir: string, body: string): string {
  const shim = join(dir, 'shim.mjs');
  writeFileSync(shim, body, 'utf8');
  return shim;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('local adapter', () => {
  it('canHandle reflects whether the worker is provisioned', async () => {
    expect(await new LocalAdapter({ command: null }).canHandle(task())).toBe(false);
    expect(await new LocalAdapter({ command: WORKER }).canHandle(task())).toBe(true);
  });

  it('buildCommand writes a contract request and passes the worker flags', () => {
    const cacheDir = tempDir();
    const adapter = new LocalAdapter({
      command: WORKER,
      cacheDir,
      model: 'qwen2.5-coder:7b',
    });

    const spec = adapter.buildCommand(
      task({ readOnly: false, allowShell: true, allowNetwork: false }),
    );

    expect(spec.executable).toBe('python');
    expect(spec.args.slice(0, 2)).toEqual(['-m', 'air_local.run']);
    expect(spec.args).toContain('--print-answer');

    const requestPath = argAfter(spec.args, '--request');
    const resultPath = argAfter(spec.args, '--result');
    const request = JSON.parse(readFileSync(requestPath, 'utf8'));

    expect(request).toEqual({
      contractVersion: 1,
      runId: 'run-test',
      task: 'say hello',
      cwd: process.cwd(),
      readOnly: false,
      allowShell: true,
      allowNetwork: false,
      model: 'qwen2.5-coder:7b',
    });
    expect(requestPath.endsWith('.json')).toBe(true);
    expect(resultPath.endsWith('.json')).toBe(true);
    expect(spec.env?.AIR_LOCAL_REQUEST).toBe(requestPath);
    expect(spec.env?.AIR_LOCAL_RESULT).toBe(resultPath);
  });

  it('omits the model unless one was explicitly chosen', () => {
    const cacheDir = tempDir();
    const adapter = new LocalAdapter({ command: WORKER, cacheDir });

    const spec = adapter.buildCommand(task());
    const request = JSON.parse(readFileSync(argAfter(spec.args, '--request'), 'utf8'));

    expect(request.model).toBeUndefined();
    expect(adapter.model).toBe('qwen3.5:4b');
  });

  it('prefers a task model over the adapter model', () => {
    const cacheDir = tempDir();
    const adapter = new LocalAdapter({ command: WORKER, cacheDir });

    const spec = adapter.buildCommand(task({ preferredModel: 'deepseek-r1:1.5b' }));
    const request = JSON.parse(readFileSync(argAfter(spec.args, '--request'), 'utf8'));

    expect(request.model).toBe('deepseek-r1:1.5b');
  });

  it('fails clearly when the worker is not provisioned', () => {
    const adapter = new LocalAdapter({ command: null, cacheDir: tempDir() });
    expect(() => adapter.buildCommand(task())).toThrow(/air setup local/);
  });

  it('sanitizes run ids before using them as file names', () => {
    const cacheDir = tempDir();
    const adapter = new LocalAdapter({ command: WORKER, cacheDir });

    const spec = adapter.buildCommand(task({ id: '../../escape' }));
    const requestPath = argAfter(spec.args, '--request');

    expect(requestPath).not.toContain('..');
    expect(requestPath).toContain('_escape.json');
  });

  it('maps worker exit codes to the AIR error taxonomy', () => {
    const adapter = new LocalAdapter({ command: WORKER });

    expect(adapter.classifyError(4, 'cancelled by signal')).toBe('USER_CANCELLED');
    expect(adapter.classifyError(5, 'PROVIDER_UNAVAILABLE: cannot reach Ollama')).toBe(
      'MODEL_UNAVAILABLE',
    );
    expect(adapter.classifyError(2, 'INVALID_REQUEST: missing task')).toBe('PROCESS_CRASH');
    expect(adapter.classifyError(3, 'WORKER_FAILED: tool exploded')).toBe('TASK_FAILURE');
    expect(adapter.classifyError(1, 'unexpected')).toBe('PROCESS_CRASH');
    expect(adapter.classifyError(0, '')).toBe('UNKNOWN');
  });

  it('lets process facts win over exit codes', () => {
    const adapter = new LocalAdapter({ command: WORKER });

    expect(adapter.classifyError(5, '', { timedOut: true })).toBe('TIMEOUT');
    expect(adapter.classifyError(5, '', { cancelled: true })).toBe('USER_CANCELLED');
    expect(adapter.classifyError(null, '', { spawnError: { code: 'ENOENT' } })).toBe(
      'TOOL_NOT_INSTALLED',
    );
  });

  it('treats PROVIDER_UNAVAILABLE as failover-worthy but cancellation as terminal', () => {
    const adapter = new LocalAdapter({ command: WORKER });

    expect(triggersFailover(adapter.classifyError(5, 'PROVIDER_UNAVAILABLE'))).toBe(true);
    expect(triggersFailover(adapter.classifyError(4, 'cancelled'))).toBe(false);
  });

  it('passes the shared conformance helper', () => {
    const adapter = new LocalAdapter({ command: WORKER });

    expect(conformanceClassify(adapter, 5, 'provider unavailable')).toBe('MODEL_UNAVAILABLE');
    expect(conformanceClassify(adapter, 4, 'cancelled')).toBe('USER_CANCELLED');
    expect(conformanceClassify(adapter, 3, 'tool exploded')).toBe('TASK_FAILURE');
  });

  it('runs a fake worker shim through the shared process runner', async () => {
    const dir = tempDir();
    const shim = writeShim(
      dir,
      `
import { readFileSync, writeFileSync } from 'node:fs';
const args = process.argv.slice(2);
const get = (name) => args[args.indexOf(name) + 1];
const request = JSON.parse(readFileSync(get('--request'), 'utf8'));
const result = {
  contractVersion: 1,
  runId: request.runId,
  state: 'COMPLETED',
  answer: 'shim answer',
  steps: 1,
  toolCalls: [],
  changedFiles: [],
};
writeFileSync(get('--result'), JSON.stringify(result));
if (args.includes('--print-answer')) process.stdout.write(result.answer + '\\n');
`,
    );
    const adapter = new LocalAdapter({
      command: { executable: process.execPath, args: [shim] },
      cacheDir: dir,
    });

    const spec = adapter.buildCommand(task({ cwd: dir }));
    const { outcome } = await runProcess(spec, { timeoutMs: 20_000 });

    expect(outcome.exitCode).toBe(0);
    expect(outcome.stdout).toContain('shim answer');
    expect(adapter.classifyError(outcome.exitCode, outcome.stderr)).toBe('UNKNOWN');

    const result = JSON.parse(readFileSync(argAfter(spec.args, '--result'), 'utf8'));
    expect(result.state).toBe('COMPLETED');
    expect(result.answer).toBe('shim answer');
  });

  it('surfaces a provider-unavailable shim as a failover category', async () => {
    const dir = tempDir();
    const shim = writeShim(
      dir,
      `process.stderr.write('PROVIDER_UNAVAILABLE: cannot reach Ollama\\n'); process.exit(5);\n`,
    );
    const adapter = new LocalAdapter({
      command: { executable: process.execPath, args: [shim] },
      cacheDir: dir,
    });

    const spec = adapter.buildCommand(task({ cwd: dir }));
    const { outcome } = await runProcess(spec, { timeoutMs: 20_000 });
    const category = adapter.classifyError(outcome.exitCode, outcome.stderr, {
      timedOut: outcome.timedOut,
      cancelled: outcome.cancelled,
      spawnError: outcome.spawnError,
    });

    expect(outcome.exitCode).toBe(5);
    expect(category).toBe('MODEL_UNAVAILABLE');
    expect(triggersFailover(category)).toBe(true);
  });
});
