export type ModelCapability =
  | 'chat'
  | 'tool_calling'
  | 'structured_output'
  | 'vision'
  | 'embeddings'
  | 'thinking';

export type ModelMessageRole = 'system' | 'user' | 'assistant' | 'tool';

export interface ModelMessage {
  role: ModelMessageRole;
  content: string;
  name?: string;
  toolCallId?: string;
  images?: string[];
}

export interface ModelToolDefinition {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters: Record<string, unknown>;
  };
}

export interface ModelToolCall {
  id?: string;
  type: 'function';
  function: {
    name: string;
    arguments: Record<string, unknown>;
  };
}

export interface ModelChatRequest {
  model: string;
  messages: ModelMessage[];
  tools?: ModelToolDefinition[];
  format?: 'json' | Record<string, unknown>;
  options?: Record<string, unknown>;
  keepAlive?: string | number;
  think?: boolean;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface ModelUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

export interface ModelChatResponse {
  provider: string;
  model: string;
  message: {
    role: 'assistant';
    content: string;
    thinking?: string;
    toolCalls: ModelToolCall[];
  };
  finishReason?: string;
  usage?: ModelUsage;
  timing?: {
    totalDurationNs?: number;
    loadDurationNs?: number;
    promptEvalDurationNs?: number;
    evalDurationNs?: number;
  };
}

export interface ModelEmbeddingRequest {
  model: string;
  input: string | string[];
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface ModelEmbeddingResponse {
  provider: string;
  model: string;
  embeddings: number[][];
}

export interface ModelDescriptor {
  name: string;
  digest?: string;
  sizeBytes?: number;
  modifiedAt?: string;
  family?: string;
  parameterSize?: string;
  quantizationLevel?: string;
  capabilities?: ModelCapability[];
  contextLength?: number;
}

export interface RunningModelDescriptor extends ModelDescriptor {
  sizeBytes?: number;
  sizeVramBytes?: number;
  expiresAt?: string;
}

export interface ProviderHealth {
  provider: string;
  online: boolean;
  version?: string;
}

export type ModelProviderErrorCode =
  | 'PROVIDER_UNAVAILABLE'
  | 'MODEL_NOT_FOUND'
  | 'UNSUPPORTED_CAPABILITY'
  | 'TIMEOUT'
  | 'RATE_LIMITED'
  | 'CANCELLED'
  | 'INVALID_RESPONSE'
  | 'PROVIDER_ERROR';

export class ModelProviderError extends Error {
  readonly name = 'ModelProviderError';

  constructor(
    readonly code: ModelProviderErrorCode,
    message: string,
    readonly provider: string,
    readonly model?: string,
    readonly statusCode?: number,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}
