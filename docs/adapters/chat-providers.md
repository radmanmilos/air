# Chat Providers — Legacy Seam and Replacement Plan

> **Current status:** The `ChatProvider` interface below is a legacy placeholder. It is not wired into `air chat` or MCP `chat_send`. The only implementation in the current source is `MockChatProvider`, used by `tests/chat-provider.test.ts`. Do not treat this interface as the production model-provider architecture.

The legacy interface is:

~~~ts
interface ChatProvider {
  name: string;
  complete(messages: { role: string; content: string }[]): Promise<string>;
}
~~~

It is insufficient for AIR's local-first model roles because it cannot represent:
- provider/model identity and declared capabilities;
- structured action output or JSON-schema constraints;
- tool calls and tool results;
- embeddings;
- usage, finish reason and timing metadata;
- timeout/cancellation;
- normalized provider errors.

## Replacement direction

The L1 model runtime will introduce a provider-neutral typed API under `src/models/`. The provider contract must support chat, tool calls, structured output, embeddings, health, model discovery/metadata, cancellation and explicit capability declarations. Ollama is the first implementation. A provider is a model-serving runtime, not an execution adapter.

The exact interfaces are defined by the accepted L0 contract in [the architecture blueprint](../architecture/local-first-ai-plan.md) and [L0 baseline investigation](../architecture/local-first-l0-baseline.md). Do not implement a second hosted provider until the local Ollama provider and conformance suite are stable.

## Current wired paths

- CLI `air chat` uses `src/conversation/decide.ts` for heuristic action selection and `src/brain/index.ts` for free-form answers. The legacy brain tries KiloCode and OpenCode before optional Ollama.
- MCP `chat_send` uses the heuristic decision function but currently returns a fixed acknowledgement for answer actions; it does not call the legacy brain.
- The bundled Python worker uses `packages/local-worker/air_local/ollama.py` for its ReAct execution loop. That client is not the TypeScript conversation provider.

These paths are intentionally documented separately because replacing the placeholder interface alone will not make the coordinator local-first.
