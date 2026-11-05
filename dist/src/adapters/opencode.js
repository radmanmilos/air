// OpenCode adapter implementing AgentAdapter.
//
// Uses the shared process runner (src/execution/runner.ts), never spawn
// directly. Verified against opencode 2.2.5 (see docs/adapters/opencode.md).
import { runProcess } from '../execution/runner';
const RATE_LIMIT_RE = /rate limit|429|too many requests|quota exceeded/i;
const AUTH_RE = /invalid api key|401|unauthorized|authentication failed|auth failed|api key incorrect/i;
const MODEL_UNAVAILABLE_RE = /model .* not found|model not available|unknown model|no such model/i;
const TIMEOUT_RE = /timeout|timed out/i;
const NOT_FOUND_RE = /not found|not installed|enoent/i;
export class OpenCodeAdapter {
    id = 'opencode';
    provider = 'openrouter';
    model = 'gemma-4-31b-it:free';
    executable = 'opencode';
    capabilities = {
        headlessExecution: true,
        structuredOutput: false,
        fileEditing: true,
        shellAccess: false,
        imageInput: false,
        supportsCancellation: true,
        supportsStreaming: true,
        contextWindow: 128_000,
    };
    canHandle(_task) {
        return true;
    }
    buildCommand(task) {
        const args = ['run'];
        if (task.files && task.files.length > 0) {
            for (const f of task.files)
                args.push('--file', f);
        }
        args.push(task.prompt);
        args.push('--auto');
        if (task.preferredModel) {
            args.push('--model', task.preferredModel);
        }
        return {
            executable: this.executable ?? 'opencode',
            args,
            cwd: task.cwd,
        };
    }
    parseOutput(chunk) {
        const text = typeof chunk === 'string' ? chunk : chunk.toString();
        return [{ type: 'stdout', data: text }];
    }
    classifyError(exitCode, stderr, structured) {
        const s = structured;
        if (s?.timedOut)
            return 'TIMEOUT';
        if (s?.cancelled)
            return 'USER_CANCELLED';
        if (s?.spawnError)
            return 'TOOL_NOT_INSTALLED';
        if (exitCode === 0)
            return 'UNKNOWN';
        if (exitCode === null)
            return 'PROCESS_CRASH';
        if (AUTH_RE.test(stderr))
            return 'AUTH_ERROR';
        if (RATE_LIMIT_RE.test(stderr))
            return 'RATE_LIMIT';
        if (MODEL_UNAVAILABLE_RE.test(stderr))
            return 'MODEL_UNAVAILABLE';
        if (TIMEOUT_RE.test(stderr))
            return 'TIMEOUT';
        if (NOT_FOUND_RE.test(stderr))
            return 'TOOL_NOT_INSTALLED';
        return 'TASK_FAILURE';
    }
}
export async function runOpenCode(task, options = {}) {
    const adapter = new OpenCodeAdapter();
    const spec = adapter.buildCommand(task);
    return runProcess(spec, {
        timeoutMs: options.timeoutMs,
        signal: options.signal,
        maxBufferBytes: options.maxBufferBytes,
    });
}
