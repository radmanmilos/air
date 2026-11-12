import type {
  ModelChatRequest,
  ModelChatResponse,
  ModelDescriptor,
  ModelEmbeddingRequest,
  ModelEmbeddingResponse,
  ProviderHealth,
  RunningModelDescriptor,
} from '../types';

export interface ModelProvider {
  readonly id: string;
  chat(request: ModelChatRequest): Promise<ModelChatResponse>;
  embed(request: ModelEmbeddingRequest): Promise<ModelEmbeddingResponse>;
  health(options?: { timeoutMs?: number; signal?: AbortSignal }): Promise<ProviderHealth>;
  listModels(options?: { timeoutMs?: number; signal?: AbortSignal }): Promise<ModelDescriptor[]>;
  showModel(
    model: string,
    options?: { timeoutMs?: number; signal?: AbortSignal },
  ): Promise<ModelDescriptor>;
  listRunningModels?(options?: {
    timeoutMs?: number;
    signal?: AbortSignal;
  }): Promise<RunningModelDescriptor[]>;
}
