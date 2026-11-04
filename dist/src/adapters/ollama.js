export class OllamaAdapter {
    id = 'ollama';
    provider = 'ollama';
    model;
    executable = 'ollama';
    capabilities = {
        headlessExecution: true,
        structuredOutput: false,
        fileEditing: false,
        shellAccess: false,
        imageInput: false,
        supportsCancellation: true,
        supportsStreaming: true,
        contextWindow: 8192,
    };
    constructor(model) {
        this.model = model ?? process.env.OLLAMA_MODEL ?? 'qwen2.5-coder:7b';
    }
    async canHandle(_task) {
        return true;
    }
    buildCommand(task) {
        const model = task.preferredModel ?? this.model;
        return {
            executable: this.executable,
            args: ['run', model, task.prompt],
            cwd: task.cwd,
            env: {},
        };
    }
    parseOutput(chunk) {
        return [{ type: 'stdout', text: String(chunk) }];
    }
    classifyError(exitCode, stderr) {
        if (exitCode === 0)
            return 'NETWORK_ERROR'; // success not a category; use NETWORK_ERROR placeholder
        if (/not found/i.test(stderr))
            return 'MODEL_UNAVAILABLE';
        return 'PROCESS_CRASH';
    }
}
