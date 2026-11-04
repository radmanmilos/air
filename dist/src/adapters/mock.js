// Mock adapter implementing AgentAdapter for tests.
//
// This file lives under src/adapters/ (not tests/) so it can be imported by
// test code without creating a production→test dependency. It is NEVER
// registered by the default production adapter list; tests inject it
// explicitly via dependency injection.
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const __dirname = dirname(fileURLToPath(import.meta.url));
const MOCK_TOOL = join(__dirname, '..', '..', 'tests', 'fixtures', 'mock-tool.js');
const RATE_LIMIT_RE = /rate limit|429|too many requests/i;
const AUTH_RE = /invalid api key|401|unauthorized|authentication failed|auth failed/i;
export class MockAdapter {
    id = 'mock';
    provider = 'openrouter';
    model = 'mock-model';
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
        const mode = process.env.MOCK_MODE || 'succeed';
        return {
            executable: process.execPath,
            args: [MOCK_TOOL],
            cwd: task.cwd,
            env: { ...process.env, MOCK_MODE: mode },
        };
    }
    parseOutput(chunk) {
        const text = typeof chunk === 'string' ? chunk : chunk.toString();
        return [{ type: 'stdout', data: text }];
    }
    classifyError(exitCode, stderr, structured) {
        // Process facts take precedence over stderr matching (R4-03).
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
        if (/timeout|timed out/i.test(stderr))
            return 'TIMEOUT';
        if (/not found|not installed|enoent/i.test(stderr))
            return 'TOOL_NOT_INSTALLED';
        return 'UNKNOWN';
    }
}
