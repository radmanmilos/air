import type { AgentAdapter } from './adapter';
import type { CommandSpec, TaskInput } from '../types';
import type { ErrorCategory } from '../types/errors';

export class OllamaAdapter implements AgentAdapter {
  id = 'ollama';
  provider = 'ollama';
  model: string;
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

  constructor(model?: string) {
    this.model = model ?? process.env.OLLAMA_MODEL ?? 'qwen2.5-coder:7b';
  }

  async canHandle(_task: TaskInput): Promise<boolean> {
    return true;
  }

  buildCommand(task: TaskInput): CommandSpec {
    const model = task.preferredModel ?? this.model;
    return {
      executable: this.executable,
      args: ['run', model, task.prompt],
      cwd: task.cwd,
      env: {},
    };
  }

  parseOutput(chunk: Buffer | string): any[] {
    return [{ type: 'stdout', text: String(chunk) }];
  }

  classifyError(exitCode: number | null, stderr: string): ErrorCategory {
    if (exitCode === 0) return 'NETWORK_ERROR'; // success not a category; use NETWORK_ERROR placeholder
    if (/not found/i.test(stderr)) return 'MODEL_UNAVAILABLE';
    return 'PROCESS_CRASH';
  }
}