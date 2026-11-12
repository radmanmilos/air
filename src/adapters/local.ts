// Local adapter: AIR's own worker running an Ollama model with tools.
//
// The worker is not a user-facing tool. It is bundled in
// `packages/local-worker`, provisioned by `air setup local`, and invoked as
// `python -m air_local.run --request <file> --result <file> --print-answer`.
//
// The request/result files follow `contracts/job.schema.json`. `--print-answer`
// makes the final answer visible on stdout so the orchestrator can forward it;
// without that flag stdout stays empty and callers read the result file.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AgentAdapter } from './adapter';
import type { CommandSpec, ParsedEvent, TaskInput } from '../types';
import type { ErrorCategory } from '../types/errors';
import { CONTRACT_VERSION, type JobRequest } from '../contracts/job';
import { paths } from '../config/paths';
import { workerCommand } from '../worker/provision';

/** Worker's configured default model (config.yaml `models.brain`). */
const DEFAULT_MODEL = 'qwen3.5:4b';

export interface LocalAdapterOptions {
  /** Model override; falls back to `AIR_LOCAL_MODEL`, then the worker default. */
  model?: string;
  /** Cache root for request/result files. Defaults to `paths.cacheDir`. */
  cacheDir?: string;
  /**
   * Explicit worker command. Tests use this to point at a fake shim; production
   * leaves it undefined so the provisioned worker is resolved lazily.
   */
  command?: { executable: string; args: string[] } | null;
}

function safeRunId(runId: string): string {
  const cleaned = runId
    .replace(/[^A-Za-z0-9._-]/g, '_')
    // A run id must never introduce `..` segments into the cache path.
    .replace(/\.{2,}/g, '_');
  return cleaned.length > 0 ? cleaned : 'run';
}

export class LocalAdapter implements AgentAdapter {
  id = 'local';
  provider = 'ollama';
  model: string;
  executable?: string;

  capabilities = {
    headlessExecution: true,
    structuredOutput: true,
    fileEditing: true,
    shellAccess: true,
    imageInput: false,
    supportsCancellation: true,
    supportsStreaming: false,
    contextWindow: 32768,
  };

  private readonly cacheDir: string;
  private readonly explicitModel?: string;
  private readonly commandOverride?: { executable: string; args: string[] } | null;

  constructor(options: LocalAdapterOptions = {}) {
    this.explicitModel = options.model ?? process.env.AIR_LOCAL_MODEL;
    this.model = this.explicitModel ?? DEFAULT_MODEL;
    this.cacheDir = options.cacheDir ?? paths.cacheDir;
    this.commandOverride = options.command;
    const command = this.worker();
    this.executable = command?.executable;
  }

  private worker(): { executable: string; args: string[] } | null {
    if (this.commandOverride !== undefined) return this.commandOverride;
    try {
      return workerCommand();
    } catch {
      return null;
    }
  }

  canHandle(_task: TaskInput): boolean {
    // Synchronous on purpose: the router calls canHandle without awaiting.
    return this.worker() !== null;
  }

  buildCommand(task: TaskInput): CommandSpec {
    const worker = this.worker();
    if (!worker) {
      throw new Error('local worker is not provisioned; run `air setup local`');
    }

    const runId = safeRunId(task.id);
    const requestDir = join(this.cacheDir, 'worker', 'requests');
    const resultDir = join(this.cacheDir, 'worker', 'results');
    mkdirSync(requestDir, { recursive: true });
    mkdirSync(resultDir, { recursive: true });

    const requestPath = join(requestDir, `${runId}.json`);
    const resultPath = join(resultDir, `${runId}.json`);

    const request: JobRequest = {
      contractVersion: CONTRACT_VERSION,
      runId: task.id,
      task: task.prompt,
      cwd: task.cwd,
      readOnly: !!task.readOnly,
      allowShell: !!task.allowShell,
      allowNetwork: !!task.allowNetwork,
    };
    // Send a model only when one was explicitly chosen. Otherwise the worker
    // uses its own configured default, which may differ from AIR's display name.
    const model = task.preferredModel ?? this.explicitModel;
    if (model) request.model = model;

    writeFileSync(requestPath, JSON.stringify(request, null, 2), 'utf8');

    return {
      executable: worker.executable,
      args: [
        ...worker.args,
        '--request',
        requestPath,
        '--result',
        resultPath,
        '--print-answer',
      ],
      cwd: task.cwd,
      env: {
        AIR_LOCAL_REQUEST: requestPath,
        AIR_LOCAL_RESULT: resultPath,
      },
    };
  }

  parseOutput(chunk: Buffer | string): ParsedEvent[] {
    return [{ type: 'stdout', data: String(chunk) }];
  }

  classifyError(
    exitCode: number | null,
    stderr: string,
    structured?: unknown,
  ): ErrorCategory {
    const facts = structured as
      | { timedOut?: boolean; cancelled?: boolean; spawnError?: unknown }
      | undefined;
    if (facts?.timedOut) return 'TIMEOUT';
    if (facts?.cancelled) return 'USER_CANCELLED';
    if (facts?.spawnError) return 'TOOL_NOT_INSTALLED';

    switch (exitCode) {
      case 0:
        // Success is not a failure category. Keep this neutral so callers that
        // classify optimistically never see a false failure.
        return 'UNKNOWN';
      case 4:
        return 'USER_CANCELLED';
      case 5:
        // Provider unavailable is a switch-worthy failure: another adapter may
        // be able to serve the task.
        return 'MODEL_UNAVAILABLE';
      case 2:
        // AIR built a request the worker rejected: treat as a control-plane bug.
        return 'PROCESS_CRASH';
      case 3:
        return 'TASK_FAILURE';
      default:
        if (/PROVIDER_UNAVAILABLE|ollama is unavailable|connection refused/i.test(stderr)) {
          return 'MODEL_UNAVAILABLE';
        }
        return 'PROCESS_CRASH';
    }
  }
}
