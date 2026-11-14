import { afterEach, describe, expect, it, vi } from 'vitest';
import { ModelProviderError } from '../../src/models/types';
import { OllamaProvider, type OllamaFetch } from '../../src/models/providers/ollama';

type FetchMock = Parameters<OllamaFetch>;

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('OllamaProvider', () => {
  it('normalizes chat, tool calls, usage and timing', async () => {
    const fetchMock = vi.fn<FetchMock, ReturnType<OllamaFetch>>().mockResolvedValue(jsonResponse({
      model: 'qwen3.5:4b',
      message: {
        role: 'assistant',
        content: 'Done',
        thinking: 'brief reasoning',
        tool_calls: [{
          function: { name: 'read_file', arguments: { path: 'README.md' } },
        }],
      },
      done_reason: 'stop',
      prompt_eval_count: 12,
      eval_count: 4,
      total_duration: 100,
    }));
    const provider = new OllamaProvider({ fetch: fetchMock });
    const result = await provider.chat({
      model: 'qwen3.5:4b',
      messages: [{ role: 'user', content: 'Read the README' }],
      tools: [{
        type: 'function',
        function: { name: 'read_file', parameters: { type: 'object' } },
      }],
    });

    expect(result.provider).toBe('ollama');
    expect(result.message.content).toBe('Done');
    expect(result.message.toolCalls[0]?.function.name).toBe('read_file');
    expect(result.usage?.totalTokens).toBe(16);
    expect(result.timing?.totalDurationNs).toBe(100);
    const [, init] = fetchMock.mock.calls[0] ?? [];
    expect(JSON.parse(String(init?.body))).toMatchObject({ stream: false, model: 'qwen3.5:4b' });
  });

  it('serializes assistant tool-call history, tool results, sequencing, and multiple tool calls (P1-07)', async () => {
    const fetchMock = vi.fn<FetchMock, ReturnType<OllamaFetch>>().mockResolvedValue(jsonResponse({
      model: 'qwen3.5:4b',
      message: {
        role: 'assistant',
        content: '',
        tool_calls: [
          { id: 'call-1', function: { name: 'read_file', arguments: { path: 'a.ts' } } },
          { id: 'call-2', function: { name: 'git_status', arguments: '{}' } },
        ],
      },
      done_reason: 'tool_calls',
    }));
    const provider = new OllamaProvider({ fetch: fetchMock });
    const result = await provider.chat({
      model: 'qwen3.5:4b',
      messages: [
        { role: 'user', content: 'Inspect files' },
        {
          role: 'assistant',
          content: '',
          toolCalls: [
            { id: 'call-1', type: 'function', function: { name: 'read_file', arguments: { path: 'a.ts' } } },
          ],
        },
        { role: 'tool', content: 'export const a = 1;', toolCallId: 'call-1', name: 'read_file' },
        { role: 'user', content: 'Continue' },
      ],
      tools: [{ type: 'function', function: { name: 'read_file', parameters: { type: 'object' } } }],
    });

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body.messages[1]).toMatchObject({
      role: 'assistant',
      content: '',
      tool_calls: [{ id: 'call-1', type: 'function', function: { name: 'read_file', arguments: { path: 'a.ts' } } }],
    });
    expect(body.messages[2]).toMatchObject({
      role: 'tool',
      content: 'export const a = 1;',
      tool_call_id: 'call-1',
      name: 'read_file',
    });
    expect(result.finishReason).toBe('tool_calls');
    expect(result.message.toolCalls).toHaveLength(2);
    expect(result.message.toolCalls[0]).toMatchObject({ id: 'call-1', type: 'function', function: { name: 'read_file', arguments: { path: 'a.ts' } } });
    expect(result.message.toolCalls[1]).toMatchObject({ id: 'call-2', type: 'function', function: { name: 'git_status', arguments: {} } });
  });

  it('rejects malformed/incomplete assistant tool-call responses and invalid argument payloads (P1-07)', async () => {
    const base = { model: 'm', messages: [{ role: 'user' as const, content: 'hi' }] };

    const nonArray = new OllamaProvider({
      fetch: vi.fn<FetchMock, ReturnType<OllamaFetch>>().mockResolvedValue(jsonResponse({
        model: 'm', message: { role: 'assistant', content: '', tool_calls: { bad: true } }, done: true,
      })),
    });
    await expect(nonArray.chat(base)).rejects.toMatchObject({ code: 'INVALID_RESPONSE', provider: 'ollama' });

    const missingFunction = new OllamaProvider({
      fetch: vi.fn<FetchMock, ReturnType<OllamaFetch>>().mockResolvedValue(jsonResponse({
        model: 'm', message: { role: 'assistant', content: '', tool_calls: [{ type: 'function' }] }, done: true,
      })),
    });
    await expect(missingFunction.chat(base)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });

    const badArgsJson = new OllamaProvider({
      fetch: vi.fn<FetchMock, ReturnType<OllamaFetch>>().mockResolvedValue(jsonResponse({
        model: 'm', message: { role: 'assistant', content: '', tool_calls: [{ function: { name: 'x', arguments: '{' } }] }, done: true,
      })),
    });
    await expect(badArgsJson.chat(base)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });

    const badName = new OllamaProvider({
      fetch: vi.fn<FetchMock, ReturnType<OllamaFetch>>().mockResolvedValue(jsonResponse({
        model: 'm', message: { role: 'assistant', content: '', tool_calls: [{ function: { name: 1, arguments: {} } }] }, done: true,
      })),
    });
    await expect(badName.chat(base)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });

    const badArgsType = new OllamaProvider({
      fetch: vi.fn<FetchMock, ReturnType<OllamaFetch>>().mockResolvedValue(jsonResponse({
        model: 'm', message: { role: 'assistant', content: '', tool_calls: [{ function: { name: 'x', arguments: [] } }] }, done: true,
      })),
    });
    await expect(badArgsType.chat(base)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  it('returns embeddings for one or many inputs', async () => {
    const fetchMock = vi.fn<FetchMock, ReturnType<OllamaFetch>>().mockResolvedValue(jsonResponse({
      model: 'nomic-embed-text',
      embeddings: [[0.1, 0.2], [0.3, 0.4]],
    }));
    const provider = new OllamaProvider({ fetch: fetchMock });
    const result = await provider.embed({ model: 'nomic-embed-text', input: ['one', 'two'] });
    expect(result.embeddings).toHaveLength(2);
    expect(result.embeddings[0]).toEqual([0.1, 0.2]);
  });

  it('discovers installed and running models without guessing capabilities', async () => {
    const fetchMock = vi.fn<FetchMock, ReturnType<OllamaFetch>>()
      .mockResolvedValueOnce(jsonResponse({
        models: [{ name: 'qwen3.5:4b', digest: 'abc', size: 100, details: { family: 'qwen' } }],
      }))
      .mockResolvedValueOnce(jsonResponse({
        models: [{ name: 'qwen3.5:4b', size: 100, size_vram: 80 }],
      }));
    const provider = new OllamaProvider({ fetch: fetchMock });
    const installed = await provider.listModels();
    const running = await provider.listRunningModels();
    expect(installed[0]).toMatchObject({ name: 'qwen3.5:4b', digest: 'abc', family: 'qwen' });
    expect(installed[0]?.capabilities).toBeUndefined();
    expect(running[0]?.sizeVramBytes).toBe(80);
  });

  it('reports unsupported running-model diagnostics on older runtimes', async () => {
    const provider = new OllamaProvider({
      fetch: vi.fn<FetchMock, ReturnType<OllamaFetch>>().mockResolvedValue(jsonResponse({ error: 'not found' }, 404)),
    });
    await expect(provider.listRunningModels()).rejects.toMatchObject({
      code: 'UNSUPPORTED_CAPABILITY',
    });
  });

  it('reports provider health and handles offline runtime, timeout, and caller timeout (P2-01)', async () => {
    const fetchMock = vi.fn<FetchMock, ReturnType<OllamaFetch>>()
      .mockResolvedValueOnce(jsonResponse({ version: '0.5.0' }))
      .mockRejectedValueOnce(new TypeError('connection refused'));
    const provider = new OllamaProvider({ fetch: fetchMock });
    await expect(provider.health()).resolves.toMatchObject({ online: true, version: '0.5.0' });
    await expect(provider.health()).resolves.toMatchObject({ online: false });

    const timeoutFetch = vi.fn<FetchMock, ReturnType<OllamaFetch>>().mockImplementation((_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
      }),
    );
    const timedOutProvider = new OllamaProvider({ fetch: timeoutFetch });
    await expect(timedOutProvider.health({ timeoutMs: 1 })).resolves.toMatchObject({ online: false, provider: 'ollama' });
  });

  it('normalizes missing models and rate limits', async () => {
    const missing = new OllamaProvider({
      fetch: vi.fn<FetchMock, ReturnType<OllamaFetch>>().mockResolvedValue(jsonResponse({ error: 'model not found' }, 404)),
    });
    await expect(missing.showModel('missing:latest')).rejects.toMatchObject({
      code: 'MODEL_NOT_FOUND',
    });

    const limited = new OllamaProvider({
      fetch: vi.fn<FetchMock, ReturnType<OllamaFetch>>().mockResolvedValue(jsonResponse({ error: 'busy' }, 429)),
    });
    await expect(limited.chat({
      model: 'qwen3.5:4b',
      messages: [{ role: 'user', content: 'hello' }],
    })).rejects.toMatchObject({ code: 'RATE_LIMITED' });
  });

  it('distinguishes cancellation from timeout', async () => {
    const cancelled = new AbortController();
    cancelled.abort();
    const provider = new OllamaProvider({
      fetch: vi.fn<FetchMock, ReturnType<OllamaFetch>>().mockRejectedValue(new Error('aborted')),
    });
    await expect(provider.chat({
      model: 'qwen3.5:4b',
      messages: [],
      signal: cancelled.signal,
    })).rejects.toMatchObject({ code: 'CANCELLED' });

    const timedOut = new OllamaProvider({
      fetch: vi.fn<FetchMock, ReturnType<OllamaFetch>>().mockImplementation((_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
      ),
    });
    await expect(timedOut.chat({
      model: 'qwen3.5:4b',
      messages: [],
      timeoutMs: 1,
    })).rejects.toMatchObject({ code: 'TIMEOUT' });
  });

  it('rejects invalid endpoint configuration and malformed responses', async () => {
    expect(() => new OllamaProvider({ baseUrl: 'file:///tmp/ollama' })).toThrow(ModelProviderError);
    const invalid = new OllamaProvider({
      fetch: vi.fn<FetchMock, ReturnType<OllamaFetch>>().mockResolvedValue(new Response('not-json')),
    });
    await expect(invalid.listModels()).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });
});
