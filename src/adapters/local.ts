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
import { readFileSync, existsSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';
import { resolveModelRole } from '../models/role-resolver';
import { DEFAULT_CONFIG } from '../config/schema';
import { paths } from '../config/paths';
import { workerCommand } from '../worker/provision';

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
  private resolvedRole?: { role: string; provider: string; model: string };

  constructor(options: LocalAdapterOptions = {}) {
    this.explicitModel = options.model ?? process.env.AIR_LOCAL_MODEL;
    this.cacheDir = options.cacheDir ?? paths.cacheDir;
    this.commandOverride = options.command;
    const command = this.worker();
    this.executable = command?.executable;
    // Resolve model from config if not explicitly provided.
    if (this.explicitModel) {
      this.model = this.explicitModel;
    } else {
      try {
        const resolved = this.resolveCoderRole();
        this.model = resolved.model;
        this.resolvedRole = resolved;
      } catch (err) {
        throw new Error(`local adapter: cannot resolve coder role: ${String(err)}`);
      }
    }
  }

  private resolveCoderRole(): { role: string; provider: string; model: string } {
    // Synchronous config resolution for the coder role. Uses global config
    // only (models is GLOBAL_ONLY). Falls back to DEFAULT_CONFIG defaults.
    let config: any = structuredClone(DEFAULT_CONFIG);
    try {
      if (existsSync(paths.globalConfigFile)) {
        const raw = readFileSync(paths.globalConfigFile, 'utf8');
        const parsed = (parseYaml as any)(raw);
        if (parsed && typeof parsed === 'object') {
          // Merge models section if present.
          if (parsed.models && typeof parsed.models === 'object') {
            if (parsed.models.roles && parsed.models.roles.coder) {
              config.models.roles.coder = parsed.models.roles.coder;
            }
            if (parsed.models.providers && parsed.models.providers.ollama) {
              config.models.providers.ollama = { ...config.models.providers.ollama, ...parsed.models.providers.ollama };
            }
            if (parsed.models.keepAlive) config.models.keepAlive = parsed.models.keepAlive;
          }
        }
      }
    } catch (err) {
      throw new Error(`local adapter: failed to read/parse global config: ${String(err)}`);
    }
    const resolved = resolveModelRole(config, 'coder');
    return { role: 'coder', provider: resolved.providerId, model: resolved.model };
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

    // Resolve the authoritative model selection. The configured coder role
    // (from AIR's config) takes precedence over explicit model overrides.
    // No hardcoded fallback: if resolution fails, the error propagates.
    let role = 'coder';
    let provider = 'ollama';
    let model = task.preferredModel ?? this.explicitModel;

    if (!model) {
      // Resolve from AIR's canonical config via the role resolver.
      if (this.resolvedRole) {
        role = this.resolvedRole.role;
        provider = this.resolvedRole.provider;
        model = this.resolvedRole.model;
      } else {
        // No resolved role (config failed at construction). Try again.
        const resolved = this.resolveCoderRole();
        role = resolved.role;
        provider = resolved.provider;
        model = resolved.model;
        this.resolvedRole = resolved;
        this.model = model;
      }
    }

    // Include role, provider, and model in the contract (v2).
    request.role = role;
    request.provider = provider;
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
