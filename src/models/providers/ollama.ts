import type {
  ModelCapability,
  ModelChatRequest,
  ModelChatResponse,
  ModelDescriptor,
  ModelEmbeddingRequest,
  ModelEmbeddingResponse,
  ModelMessage,
  ModelToolCall,
  ModelUsage,
  ProviderHealth,
  RunningModelDescriptor,
} from '../types';
import { ModelProviderError } from '../types';
import { redact } from '../../security/redact';
import type { ModelProvider } from './provider';

interface OllamaModelRecord {
  name?: unknown;
  model?: unknown;
  digest?: unknown;
  size?: unknown;
  modified_at?: unknown;
  details?: unknown;
  capabilities?: unknown;
  model_info?: unknown;
  expires_at?: unknown;
  size_vram?: unknown;
}

interface OllamaChatRecord {
  model?: unknown;
  message?: unknown;
  done_reason?: unknown;
  prompt_eval_count?: unknown;
  eval_count?: unknown;
  total_duration?: unknown;
  load_duration?: unknown;
  prompt_eval_duration?: unknown;
  eval_duration?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function mapCapabilities(value: unknown): ModelCapability[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const mapped: ModelCapability[] = [];
  for (const item of value) {
    if (item === 'tools') mapped.push('tool_calling');
    else if (item === 'vision') mapped.push('vision');
    else if (item === 'embedding') mapped.push('embeddings');
    else if (item === 'thinking') mapped.push('thinking');
    else if (item === 'completion') mapped.push('chat');
  }
  return [...new Set(mapped)];
}

function mapModel(record: OllamaModelRecord): ModelDescriptor {
  const details = isRecord(record.details) ? record.details : {};
  const modelInfo = isRecord(record.model_info) ? record.model_info : {};
  const contextEntry = Object.entries(modelInfo).find(([key]) => key.endsWith('.context_length'));
  return {
    name: stringValue(record.name) ?? stringValue(record.model) ?? 'unknown',
    digest: stringValue(record.digest),
    sizeBytes: finiteNumber(record.size),
    modifiedAt: stringValue(record.modified_at),
    family: stringValue(details.family),
    parameterSize: stringValue(details.parameter_size),
    quantizationLevel: stringValue(details.quantization_level),
    capabilities: mapCapabilities(record.capabilities),
    contextLength: contextEntry ? finiteNumber(contextEntry[1]) : undefined,
  };
}

function mapUsage(record: OllamaChatRecord): ModelUsage | undefined {
  const promptTokens = finiteNumber(record.prompt_eval_count);
  const completionTokens = finiteNumber(record.eval_count);
  if (promptTokens === undefined && completionTokens === undefined) return undefined;
  return {
    promptTokens,
    completionTokens,
    totalTokens:
      promptTokens !== undefined && completionTokens !== undefined
        ? promptTokens + completionTokens
        : undefined,
  };
}

function mapToolCalls(value: unknown, provider: string, model: string): ModelToolCall[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    throw new ModelProviderError(
      'INVALID_RESPONSE',
      'Ollama returned tool_calls in an unexpected format',
      provider,
      model,
    );
  }

  return value.map((item): ModelToolCall => {
    if (!isRecord(item) || !isRecord(item.function)) {
      throw new ModelProviderError(
        'INVALID_RESPONSE',
        'Ollama returned a malformed tool call',
        provider,
        model,
      );
    }
    const fn = item.function;
    let args: unknown = fn.arguments;
    if (typeof args === 'string') {
      try {
        args = JSON.parse(args) as unknown;
      } catch (cause) {
        throw new ModelProviderError(
          'INVALID_RESPONSE',
          'Ollama returned invalid JSON in tool-call arguments',
          provider,
          model,
          undefined,
          { cause },
        );
      }
    }
    if (!isRecord(args) || typeof fn.name !== 'string' || fn.name.length === 0) {
      throw new ModelProviderError(
        'INVALID_RESPONSE',
        'Ollama returned invalid tool-call arguments or name',
        provider,
        model,
      );
    }
    return {
      id: stringValue(item.id),
      type: 'function',
      function: { name: fn.name, arguments: args },
    };
  });
}

function isValidToolResultCorrelationId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function serializeAssistantToolCalls(toolCalls: ModelToolCall[], provider: string, model: string): Array<Record<string, unknown>> {
  if (!Array.isArray(toolCalls)) {
    throw new ModelProviderError('PROVIDER_ERROR', 'Assistant toolCalls must be an array', provider, model);
  }
  return toolCalls.map((call) => {
    if (!isRecord(call as unknown) || call.type !== 'function' || !isRecord(call.function)) {
      throw new ModelProviderError('PROVIDER_ERROR', 'Assistant tool call has invalid shape', provider, model);
    }
    const name = call.function.name;
    const args = call.function.arguments;
    if (typeof name !== 'string' || name.length === 0 || !isRecord(args)) {
      throw new ModelProviderError('PROVIDER_ERROR', 'Assistant tool call must have function name and object arguments', provider, model);
    }
    return {
      ...(call.id ? { id: call.id } : {}),
      type: 'function',
      function: { name, arguments: args },
    };
  });
}

export type OllamaFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export interface OllamaProviderOptions {
  baseUrl?: string;
  defaultTimeoutMs?: number;
  keepAlive?: string | number;
  fetch?: OllamaFetch;
}

export function normalizeOllamaBaseUrl(rawUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch (cause) {
    throw new ModelProviderError(
      'PROVIDER_ERROR',
      'Ollama base URL must be an absolute HTTP(S) URL',
      'ollama',
      undefined,
      undefined,
      { cause },
    );
  }
  if (
    (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') ||
    parsed.username.length > 0 ||
    parsed.password.length > 0 ||
    parsed.search.length > 0 ||
    parsed.hash.length > 0
  ) {
    throw new ModelProviderError(
      'PROVIDER_ERROR',
      'Ollama base URL must use HTTP(S) and must not contain credentials, query, or fragment',
      'ollama',
    );
  }
  // Normalize trailing slash for consistent endpoint construction and config equivalence.
  return parsed.toString().replace(/\/+$/, '');
}

export class OllamaProvider implements ModelProvider {
  readonly id = 'ollama';
  private readonly baseUrl: string;
  private readonly defaultTimeoutMs: number;
  private readonly keepAlive: string | number;
  private readonly fetchImpl: OllamaFetch;

  constructor(options: OllamaProviderOptions = {}) {
    this.baseUrl = normalizeOllamaBaseUrl(options.baseUrl ?? 'http://127.0.0.1:11434');
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? 120_000;
    this.keepAlive = options.keepAlive ?? '5m';
    this.fetchImpl = options.fetch ?? fetch;
  }

  async chat(request: ModelChatRequest): Promise<ModelChatResponse> {
    const payload: Record<string, unknown> = {
      model: request.model,
      messages: request.messages.map((message) => this.mapMessage(message, request.model)),
      stream: false,
      keep_alive: request.keepAlive ?? this.keepAlive,
    };
    if (request.tools) payload.tools = request.tools;
    if (request.format) payload.format = request.format;
    if (request.options) payload.options = request.options;
    if (request.think !== undefined) payload.think = request.think;

    const raw = await this.request<OllamaChatRecord>('/api/chat', {
      method: 'POST',
      body: JSON.stringify(payload),
    }, request.timeoutMs, request.signal, request.model);

    if (!isRecord(raw.message)) {
      throw new ModelProviderError(
        'INVALID_RESPONSE',
        'Ollama chat response is missing an assistant message',
        this.id,
        request.model,
      );
    }
    const message = raw.message;
    const content = message.content;
    const toolCalls = mapToolCalls(message.tool_calls, this.id, request.model);
    if (content !== undefined && content !== null && typeof content !== 'string') {
      throw new ModelProviderError(
        'INVALID_RESPONSE',
        'Ollama returned an invalid assistant message content type',
        this.id,
        request.model,
      );
    }
    return {
      provider: this.id,
      model: stringValue(raw.model) ?? request.model,
      message: {
        role: 'assistant',
        content: typeof content === 'string' ? content : '',
        thinking: stringValue(message.thinking),
        toolCalls,
      },
      finishReason: stringValue(raw.done_reason),
      usage: mapUsage(raw),
      timing: {
        totalDurationNs: finiteNumber(raw.total_duration),
        loadDurationNs: finiteNumber(raw.load_duration),
        promptEvalDurationNs: finiteNumber(raw.prompt_eval_duration),
        evalDurationNs: finiteNumber(raw.eval_duration),
      },
    };
  }

  async embed(request: ModelEmbeddingRequest): Promise<ModelEmbeddingResponse> {
    const raw = await this.request<Record<string, unknown>>('/api/embed', {
      method: 'POST',
      body: JSON.stringify({ model: request.model, input: request.input }),
    }, request.timeoutMs, request.signal, request.model);

    if (!Array.isArray(raw.embeddings) || !raw.embeddings.every(
      (embedding) =>
        Array.isArray(embedding) &&
        embedding.every((value) => typeof value === 'number' && Number.isFinite(value)),
    )) {
      throw new ModelProviderError(
        'INVALID_RESPONSE',
        'Ollama embedding response contains invalid vectors',
        this.id,
        request.model,
      );
    }
    return {
      provider: this.id,
      model: stringValue(raw.model) ?? request.model,
      embeddings: raw.embeddings as number[][],
    };
  }

  async health(options: { timeoutMs?: number; signal?: AbortSignal } = {}): Promise<ProviderHealth> {
    const timeoutMs = options.timeoutMs ?? 5000;
    try {
      const raw = await this.request<Record<string, unknown>>(
        '/api/version',
        { method: 'GET' },
        timeoutMs,
        options.signal,
      );
      return { provider: this.id, online: true, version: stringValue(raw.version) };
    } catch (error) {
      if (error instanceof ModelProviderError && (error.code === 'PROVIDER_UNAVAILABLE' || error.code === 'TIMEOUT')) {
        return { provider: this.id, online: false };
      }
      if (error instanceof ModelProviderError && error.code === 'CANCELLED') {
        throw error;
      }
      throw error;
    }
  }

  async listModels(options: { timeoutMs?: number; signal?: AbortSignal } = {}): Promise<ModelDescriptor[]> {
    const raw = await this.request<Record<string, unknown>>(
      '/api/tags',
      { method: 'GET' },
      options.timeoutMs,
      options.signal,
    );
    if (!Array.isArray(raw.models)) {
      throw new ModelProviderError(
        'INVALID_RESPONSE',
        'Ollama model-list response is missing models',
        this.id,
      );
    }
    return raw.models.filter(isRecord).map((model) => mapModel(model as OllamaModelRecord));
  }

  async showModel(
    model: string,
    options: { timeoutMs?: number; signal?: AbortSignal } = {},
  ): Promise<ModelDescriptor> {
    const raw = await this.request<OllamaModelRecord>(
      '/api/show',
      { method: 'POST', body: JSON.stringify({ model }) },
      options.timeoutMs,
      options.signal,
      model,
    );
    return mapModel({ ...raw, name: model });
  }

  async listRunningModels(
    options: { timeoutMs?: number; signal?: AbortSignal } = {},
  ): Promise<RunningModelDescriptor[]> {
    let raw: Record<string, unknown>;
    try {
      raw = await this.request<Record<string, unknown>>(
        '/api/ps',
        { method: 'GET' },
        options.timeoutMs,
        options.signal,
      );
    } catch (error) {
      if (error instanceof ModelProviderError && error.statusCode === 404) {
        throw new ModelProviderError(
          'UNSUPPORTED_CAPABILITY',
          'This Ollama runtime does not expose running-model diagnostics',
          this.id,
          undefined,
          404,
          { cause: error },
        );
      }
      throw error;
    }
    if (!Array.isArray(raw.models)) {
      throw new ModelProviderError(
        'INVALID_RESPONSE',
        'Ollama running-model response is missing models',
        this.id,
      );
    }
    return raw.models.filter(isRecord).map((item) => {
      const model = mapModel(item as OllamaModelRecord);
      return {
        ...model,
        sizeVramBytes: finiteNumber(item.size_vram),
        expiresAt: stringValue(item.expires_at),
      };
    });
  }

  private mapMessage(message: ModelMessage, model: string): Record<string, unknown> {
    const result: Record<string, unknown> = {
      role: message.role,
      content: message.content,
    };
    if (message.name) result.name = message.name;
    if (message.images) result.images = message.images;
    if (message.role === 'tool') {
      if (isValidToolResultCorrelationId(message.toolCallId)) {
        result.tool_call_id = message.toolCallId;
      }
    } else if (isValidToolResultCorrelationId(message.toolCallId)) {
      result.tool_call_id = message.toolCallId;
    }
    if (message.role === 'assistant' && Array.isArray(message.toolCalls) && message.toolCalls.length > 0) {
      result.tool_calls = serializeAssistantToolCalls(message.toolCalls, this.id, model);
    }
    return result;
  }

  private async request<T extends object>(
    path: string,
    init: RequestInit,
    timeoutMs = this.defaultTimeoutMs,
    signal?: AbortSignal,
    model?: string,
  ): Promise<T> {
    const controller = new AbortController();
    let timedOut = false;
    const onAbort = (): void => controller.abort(signal?.reason);
    if (signal?.aborted) onAbort();
    else signal?.addEventListener('abort', onAbort, { once: true });
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);

    try {
      const headers = new Headers(init.headers);
      headers.set('accept', 'application/json');
      if (init.body) headers.set('content-type', 'application/json');
      const response = await this.fetchImpl(this.baseUrl + path, {
        ...init,
        headers,
        signal: controller.signal,
      });
      const text = await response.text();
      let body: unknown;
      try {
        body = text.length > 0 ? JSON.parse(text) as unknown : {};
      } catch (cause) {
        throw new ModelProviderError(
          'INVALID_RESPONSE',
          'Ollama returned malformed JSON',
          this.id,
          model,
          response.status,
          { cause },
        );
      }
      if (!response.ok) {
        const message = isRecord(body) && typeof body.error === 'string'
          ? redact(body.error)
          : 'Ollama request failed with HTTP ' + response.status;
        let code: 'PROVIDER_UNAVAILABLE' | 'MODEL_NOT_FOUND' | 'RATE_LIMITED' | 'PROVIDER_ERROR';
        if (response.status === 404 && model && /not found|pull/i.test(message)) code = 'MODEL_NOT_FOUND';
        else if (response.status === 429) code = 'RATE_LIMITED';
        else if (response.status >= 500 || response.status === 404) code = 'PROVIDER_UNAVAILABLE';
        else code = 'PROVIDER_ERROR';
        throw new ModelProviderError(code, message, this.id, model, response.status);
      }
      if (!isRecord(body)) {
        throw new ModelProviderError(
          'INVALID_RESPONSE',
          'Ollama returned a non-object JSON response',
          this.id,
          model,
          response.status,
        );
      }
      return body as T;
    } catch (error) {
      if (error instanceof ModelProviderError) throw error;
      if (signal?.aborted) {
        throw new ModelProviderError('CANCELLED', 'Ollama request was cancelled', this.id, model, undefined, { cause: error });
      }
      if (timedOut) {
        throw new ModelProviderError('TIMEOUT', 'Ollama request timed out after ' + timeoutMs + 'ms', this.id, model, undefined, { cause: error });
      }
      throw new ModelProviderError(
        'PROVIDER_UNAVAILABLE',
        'Could not reach Ollama at ' + this.baseUrl,
        this.id,
        model,
        undefined,
        { cause: error },
      );
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    }
  }
}