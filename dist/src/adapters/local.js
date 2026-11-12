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
import { CONTRACT_VERSION } from '../contracts/job.js';
import { paths } from '../config/paths.js';
import { workerCommand } from '../worker/provision.js';
/** Worker's configured default model (config.yaml `models.brain`). */
const DEFAULT_MODEL = 'qwen3.5:4b';
function safeRunId(runId) {
    const cleaned = runId
        .replace(/[^A-Za-z0-9._-]/g, '_')
        // A run id must never introduce `..` segments into the cache path.
        .replace(/\.{2,}/g, '_');
    return cleaned.length > 0 ? cleaned : 'run';
}
export class LocalAdapter {
    id = 'local';
    provider = 'ollama';
    model;
    executable;
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
    cacheDir;
    explicitModel;
    commandOverride;
    constructor(options = {}) {
        this.explicitModel = options.model ?? process.env.AIR_LOCAL_MODEL;
        this.model = this.explicitModel ?? DEFAULT_MODEL;
        this.cacheDir = options.cacheDir ?? paths.cacheDir;
        this.commandOverride = options.command;
        const command = this.worker();
        this.executable = command?.executable;
    }
    worker() {
        if (this.commandOverride !== undefined)
            return this.commandOverride;
        try {
            return workerCommand();
        }
        catch {
            return null;
        }
    }
    canHandle(_task) {
        // Synchronous on purpose: the router calls canHandle without awaiting.
        return this.worker() !== null;
    }
    buildCommand(task) {
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
        const request = {
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
        if (model)
            request.model = model;
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
    parseOutput(chunk) {
        return [{ type: 'stdout', data: String(chunk) }];
    }
    classifyError(exitCode, stderr, structured) {
        const facts = structured;
        if (facts?.timedOut)
            return 'TIMEOUT';
        if (facts?.cancelled)
            return 'USER_CANCELLED';
        if (facts?.spawnError)
            return 'TOOL_NOT_INSTALLED';
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
