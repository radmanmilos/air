import type { ModelChatRequest, ModelChatResponse, ModelDescriptor, ModelEmbeddingRequest, ModelEmbeddingResponse, ProviderHealth, RunningModelDescriptor } from '../types';
import type { ModelProvider } from './provider';
export type OllamaFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
export interface OllamaProviderOptions {
    baseUrl?: string;
    defaultTimeoutMs?: number;
    keepAlive?: string | number;
    fetch?: OllamaFetch;
}
export declare function normalizeOllamaBaseUrl(rawUrl: string): string;
export declare class OllamaProvider implements ModelProvider {
    readonly id = "ollama";
    private readonly baseUrl;
    private readonly defaultTimeoutMs;
    private readonly keepAlive;
    private readonly fetchImpl;
    constructor(options?: OllamaProviderOptions);
    chat(request: ModelChatRequest): Promise<ModelChatResponse>;
    embed(request: ModelEmbeddingRequest): Promise<ModelEmbeddingResponse>;
    health(options?: {
        timeoutMs?: number;
        signal?: AbortSignal;
    }): Promise<ProviderHealth>;
    listModels(options?: {
        timeoutMs?: number;
        signal?: AbortSignal;
    }): Promise<ModelDescriptor[]>;
    showModel(model: string, options?: {
        timeoutMs?: number;
        signal?: AbortSignal;
    }): Promise<ModelDescriptor>;
    listRunningModels(options?: {
        timeoutMs?: number;
        signal?: AbortSignal;
    }): Promise<RunningModelDescriptor[]>;
    private mapMessage;
    private request;
}
