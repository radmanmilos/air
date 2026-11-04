export * from './errors';
export * from './result';
export * from './outcome';

export interface ToolCapabilities {
  headlessExecution: boolean;
  structuredOutput: boolean;
  fileEditing: boolean;
  shellAccess: boolean;
  imageInput: boolean;
  supportsCancellation: boolean;
  supportsStreaming: boolean;
  contextWindow?: number;
}

export interface CommandSpec {
  executable: string;
  args: string[];
  cwd: string;
  env?: Record<string, string>;
}

export type TaskType = 'code_edit' | 'code_review' | 'explain' | 'research' | 'summarize' | 'plan' | 'test' | 'other';

export interface TaskInput {
  id: string;
  prompt: string;
  cwd: string;
  files?: string[];
  preferredTool?: string;
  preferredProvider?: string;
  preferredModel?: string;
  mode: 'ask' | 'auto';
  readOnly?: boolean;
  taskType?: TaskType;
  requiresWrite?: boolean;
  requiresCode?: boolean;
  requiresLongContext?: boolean;
}

export interface ExecutionCandidate {
  id: string;
  tool: string;
  provider: string;
  model: string;
  capabilities: ToolCapabilities;
}

export interface SpawnOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
  maxBufferBytes?: number;
}

export interface ParsedEvent {
  type: 'stdout' | 'stderr' | 'structured';
  data: string;
  category?: string;
}