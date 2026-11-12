# Model provider runtime

**Status:** L1 implementation in progress. The provider contract and first Ollama transport are implemented on the local-first feature branch; they are not yet wired into CLI/MCP conversation handling or role configuration.

## Boundaries

- A model provider executes model requests. It is not an execution adapter, task scheduler, permission system or conversation coordinator.
- Provider responses are untrusted data. Callers must validate structured content and tool calls against AIR-owned schemas before dispatch.
- Provider errors describe transport/model API failures. They must not be conflated with worker exit codes or task outcomes.
- The Ollama provider does not start the Ollama daemon, pull models, switch roles, or silently fall back to a hosted provider.
- The initial API is non-streaming. Streaming is deferred until a concrete coordinator UX requires it and cancellation/backpressure behavior can be tested.
- Model capability metadata is reported only when the runtime explicitly supplies it. AIR must not infer tool, vision or context support from a model name.

## TypeScript API

- \`src/models/types.ts\`: neutral messages, tools, chat/embedding requests and responses, model descriptors, health and canonical errors.
- \`src/models/providers/provider.ts\`: provider interface shared by future runtimes.
- \`src/models/providers/ollama.ts\`: native Ollama HTTP implementation using Node's built-in fetch.

The provider currently exposes:

| Method | Ollama endpoint | Behavior |
|---|---|---|
| \`chat\` | \`POST /api/chat\` | Non-streaming chat, tool definitions/calls, JSON format, images, optional thinking and generation options |
| \`embed\` | \`POST /api/embed\` | Single or batched embeddings; rejects malformed/non-finite vectors |
| \`health\` | \`GET /api/version\` | Reports online/version; network unavailability returns \`online: false\` |
| \`listModels\` | \`GET /api/tags\` | Installed model names/digests/sizes/details |
| \`showModel\` | \`POST /api/show\` | Model metadata and runtime-declared capabilities |
| \`listRunningModels\` | \`GET /api/ps\` | Best-effort running model and reported VRAM size; no inference about free VRAM |

## Error contract

\`ModelProviderError.code\` is one of:

- \`PROVIDER_UNAVAILABLE\`
- \`MODEL_NOT_FOUND\`
- \`UNSUPPORTED_CAPABILITY\`
- \`TIMEOUT\`
- \`RATE_LIMITED\`
- \`CANCELLED\`
- \`INVALID_RESPONSE\`
- \`PROVIDER_ERROR\`

External abort signals map to \`CANCELLED\`; the provider's own deadline maps to \`TIMEOUT\`. A 429 maps to \`RATE_LIMITED\`; an Ollama model-specific 404 whose response says the model is missing maps to \`MODEL_NOT_FOUND\`. Other HTTP failures remain provider errors or provider-unavailable failures as appropriate.

## Current limitations / next work

- No config/role resolver or provider registry yet; callers construct \`OllamaProvider\` explicitly.
- No streaming API, structured-output capability negotiation, provider conformance abstraction, or live-Ollama CI.
- The provider does not own model provisioning or daemon lifecycle.
- The legacy \`src/conversation/chat-provider.ts\` mock seam remains in place until the coordinator migration replaces it.
- Add cross-provider conformance tests before a second provider is introduced.
- Verify \`/api/ps\` behavior against the user's installed Ollama version before relying on its diagnostics.
