# L0 Baseline — Current AIR Request Lifecycle and Architecture Decisions

**Inspection base:** \`35c7300569df2568dbd2cec97a4f6cc232533cc5\`  
**Branch at inspection:** \`main\` (only branch returned by GitHub)  
**Inspection date:** 2026-11-12  
**Purpose:** Give implementation agents a source-grounded map of what is wired today, distinguish it from the target design, and record recommended shared-contract decisions before parallel implementation.

> Re-check the live branch, files and CI before using this as an implementation base. This is an inspection snapshot, not a guarantee that later commits have not changed the code.

## 1. Baseline and CI evidence

- Repository: \`radmanmilos/air\`, default branch \`main\`, public, not archived; GitHub connection has push/admin permissions.
- Baseline SHA: \`35c7300569df2568dbd2cec97a4f6cc232533cc5\`.
- Active branches returned: \`main\`.
- CI run for this exact SHA: [CI #43218386531](https://github.com/radmanmilos/air/actions/runs/43218386531), push event.
- Final result: [CI #43218386531](https://github.com/radmanmilos/air/actions/runs/43218386531) completed successfully. Node 22 test jobs passed on Ubuntu 24.04 and Windows; Python 3.12 and 3.14 jobs passed on Ubuntu and Windows; the real-binary smoke-test job also passed.
- No local clone/worktree was available to this agent. No local commands are claimed as run. Use the GitHub Actions results for baseline validation and a real clone for implementation/test work where possible.
- CI workflow: \`.github/workflows/ci.yml\`; Node test job runs typecheck, test typecheck, \`npm test\`, build, dist-import check, lint, package dry-run/pack and package smoke. Python job runs Ruff, mypy and pytest on Windows/Ubuntu with Python 3.12/3.14. Smoke job runs after Node test success.

## 2. End-to-end request lifecycle as wired today

### 2.1 CLI \`air chat\`

~~~mermaid
flowchart TD
  U[User input] --> CMD[bin/air.ts readline handler]
  CMD -->|slash command| DIRECT[Direct command handler]
  CMD -->|natural language| STORE[appendMessage user]
  STORE --> DECIDE[conversation/decide.ts regex heuristics]
  DECIDE -->|answer| BRAIN[src/brain brainAnswer]
  DECIDE -->|spawn_job| RUNJOB[local runJob closure]
  DECIDE -->|clarify/status/cancel| CONTROL[deterministic action handling]
  RUNJOB --> PLAN[planner planFromRequest]
  PLAN --> FIRST[Only first work item selected]
  FIRST --> ORCH[Orchestrator.start]
  ORCH --> DIRTY[dirty-tree + permission gates]
  DIRTY --> WT[write task: isolated git worktree]
  WT --> ROUTER[adapter router / failover]
  ROUTER --> ADAPTER[AgentAdapter.buildCommand]
  ADAPTER --> PROC[shared process runner]
  PROC --> DELTA[git delta + process outcome]
  DELTA --> STATE[task state + orchestrator session]
  STATE --> WAIT[CLI background waiter]
  WAIT --> COMPILE[result-compiler compileJobResult]
  COMPILE --> INJECT[conversation injectResult]
  INJECT --> FACTS[activeWorkIds/facts update]
  BRAIN --> REPLY[assistant message]
  CONTROL --> REPLY
~~~

Observed call sites and behavior:

1. \`bin/air.ts\` registers \`air chat\`. It loads/creates a persistent conversation and listens for input using readline.
2. Slash commands such as \`/run\`, \`/plan\`, \`/status\`, \`/jobs\`, \`/cancel\`, \`/last\` are handled directly. \`/run\` and \`/plan\` bypass the natural-language decision function and call the job path.
3. Natural-language messages are appended to the conversation and passed to \`src/conversation/decide.ts::decide\`. This function uses regular expressions and returns action-like objects. It does not call a model.
4. The finite action vocabulary exists in \`src/conversation/actions.ts\` (\`answer\`, \`spawn_job\`, \`cancel_job\`, \`status\`, \`clarify\`), but the CLI decision path does not parse model output through \`ActionSchema\`; \`decide\` itself is typed as \`any[]\`.
5. \`answer\` calls \`src/brain/index.ts::brainAnswer\`. That legacy implementation tries KiloCode, then OpenCode, then Ollama. Ollama is considered only when \`AIR_BRAIN_MODEL_OLLAMA\` is set. If no tool is available, the result is the fixed text \`Acknowledged.\`. \`isBrainAvailable\` checks KiloCode/OpenCode first and treats the Ollama environment variable as availability; it does not resolve a configured AIR model role.
6. \`spawn_job\` builds context from conversation summary/facts, calls heuristic \`planFromRequest\`, and currently executes only \`plan.workItems[0]\`. It then calls \`Orchestrator.start\`.
7. The orchestrator is the deterministic execution/control boundary. It checks dirty-tree policy and permissions, creates a git worktree for write tasks, selects an execution adapter using the adapter router, runs it through the shared process runner, classifies process outcomes, records health/cooldowns, computes the actual workspace delta and writes task state. A model's final prose is not the source of success truth.
8. The CLI background waiter polls task state, compiles a result from facts, injects it into the conversation, removes the active work ID, updates conversation facts and prints completion.

### 2.2 MCP \`chat_send\`

~~~mermaid
flowchart TD
  U[MCP chat_send] --> LOAD[load/create conversation]
  LOAD --> APPEND[append user message]
  APPEND --> DECIDE[conversation/decide.ts regex heuristics]
  DECIDE -->|spawn_job| PLAN[planFromRequest]
  PLAN --> ORCH[Orchestrator.start]
  ORCH --> BG[background task-state poll]
  BG --> COMPILE[compileJobResult + injectResult]
  DECIDE -->|answer| ACK[fixed Acknowledged]
  DECIDE -->|cancel_job| TEXT[returns Cancel requested only]
  DECIDE -->|status/clarify| TEXT
  ACK --> RESP[assistant message + MCP response]
  TEXT --> RESP
~~~

Observed differences from CLI:

- \`src/mcp/server.ts::chat_send\` uses the same heuristic \`decide\` and planner, but the \`answer\` action appends/returns fixed \`Acknowledged.\`; it does not call \`brainAnswer\` or a \`ChatProvider\`.
- The MCP \`cancel_job\` branch currently only adds the text \`Cancel requested for <id>.\`; it does not call the job cancellation path.
- The MCP handler appends the user message with \`appendMessage\`, but retains the pre-append in-memory \`conv\`. In the spawn path it later calls \`saveConversation(conv)\`; that stale object can overwrite the just-appended message. Refactor conversation mutations through one shared service and test persistence/races before claiming CLI/MCP parity.
- MCP has separate \`run_task\` / status / output / cancel tools that delegate execution to the orchestrator. Those task tools are not the same thing as the conversation \`chat_send\` path.
- Background completion in \`chat_send\` compiles and injects a result, but the entrypoint/action behavior is not yet a single shared conversation service with CLI.

### 2.3 Execution and worker path

- \`src/orchestrator/orchestrator.ts::start\` selects **execution adapters**, not model roles. It enforces the deterministic policy and worktree boundary before executing.
- \`src/adapters/local.ts::LocalAdapter\` launches the bundled Python worker. It has a hardcoded \`DEFAULT_MODEL = 'qwen3.5:4b'\` and uses a task preferred model or \`AIR_LOCAL_MODEL\` override; if neither is supplied, it omits \`model\` from the request and the worker selects its own configured default.
- \`contracts/job.schema.json\` is contract version 1. Its request includes task, cwd, policy flags, optional model, maxSteps and configPath. Unknown fields are rejected. Both TypeScript and Python validate this canonical file.
- \`packages/local-worker/air_local/run.py\` validates the request, applies the worker policy, builds an \`Agent\`, runs it, writes an atomic result and uses stable worker exit codes.
- \`packages/local-worker/air_local/loop.py\` owns a ReAct tool loop over Ollama chat/tool calls. It does not own AIR's user-facing conversation or orchestration lifecycle.
- \`packages/local-worker/air_local/models.py\` maps capability strings to worker-local config slots; this is not a cross-provider model registry.
- \`packages/local-worker/air_local/ollama.py\` provides Ollama HTTP operations for version/availability, chat, embeddings, tags and model show. It does not yet provide the AIR TypeScript control plane with a provider-neutral API or a serialized cross-role model lifecycle manager.
- \`packages/local-worker/config.yaml\` separately stores Ollama base URL/keep-alive and model slots (\`brain\`, \`coder\`, \`reasoner\`, \`embed\`). This is a second model configuration source beside the intended AIR config and must be reconciled during L2.

## 3. What exists versus what is actually wired

| Component | Exists | Wired in user-facing lifecycle | Actual status |
|---|---:|---:|---|
| Conversation store | Yes | CLI and MCP | Persistent store; callers still have stale-object/race hazards |
| ActionSchema | Yes | Partially | Schema exists; current decision function is heuristic and does not validate model-generated action JSON |
| \`ChatProvider\` | Yes | No | Interface plus mock only; not the production front-agent provider |
| \`src/brain\` | Yes | CLI answers only | Free-form answer path; KiloCode/OpenCode first, Ollama opt-in by environment variable |
| Ollama Python client | Yes | Local worker | Drives worker ReAct loop, not AIR coordinator/planner/reviewer |
| Local adapter | Yes | Orchestrator | Runs bundled worker; model default is not role/config-resolved by TypeScript |
| Planner | Yes | CLI and MCP | Regex/heuristic; first work item only |
| Orchestrator | Yes | CLI/MCP task execution | Deterministic adapter routing, permissions, worktrees, process lifecycle and evidence |
| Result compiler | Yes | CLI/MCP background completion | Compiles facts; does not replace deterministic result classification |
| MCP conversation API | Yes | MCP | \`chat_send\` is not behaviorally equivalent to CLI chat |

## 4. Test coverage relevant to the first vertical slice

Existing evidence:

- \`tests/conversation.test.ts\`: conversation create/load/append/list persistence tests.
- \`tests/chat-provider.test.ts\`: proves only that \`MockChatProvider.complete\` returns a string. It does not test a production provider.
- \`tests/planner-compiler.test.ts\`: basic heuristic planner and result compiler tests.
- \`tests/e2e/scenarios/real-jobs.test.ts\`: built-binary CLI chat scenarios for brainstorming, injection resistance, responsiveness, cancellation, onboarding, persistence and result behavior.
- \`tests/e2e/scenarios/mcp.test.ts\`: MCP \`run_task\` status/cancellation scenarios; it does not exercise \`chat_send\` action parity.
- \`tests/e2e/live/smoke.live.test.ts\`: gated live-tool preflight checks; not a repeatable model-quality benchmark.
- No dedicated unit suite was found for the decision function/action schema contract or for a production Ollama-backed TypeScript coordinator.

Test implications:

1. Add deterministic provider fakes; no normal unit test should require Ollama.
2. Add contract tests proving coordinator output is parsed by \`ActionSchema\`, and malformed/unsafe output falls back without dispatch.
3. Add CLI/MCP parity tests against one shared conversation decision service.
4. Add tests for MCP cancellation actually cancelling a known active job and unknown IDs returning an explicit error.
5. Add regression coverage for stale conversation writes, concurrent append/result injection and restart/resume.
6. Keep live Ollama tests separately gated and report them as skipped when unavailable; do not conflate fake-provider conformance with live model quality.

## 5. Recommended L0 architecture decisions for independent review

These are the integration agent's proposed decisions, grounded in the existing repository structure. An independent reviewer should challenge them before L0 is closed.

| Decision | Recommendation | Rationale / constraints |
|---|---|---|
| Config location | Put \`models\` and provider/role assignments in the existing **global user config**; treat the entire section as global-only and strip it from repo \`.airrc.yaml\`. | One canonical config loader/path already exists. A repository must not choose a user's model/provider or enable external egress. Provider secrets belong in an OS credential store or environment, never committed YAML. |
| Role set | \`coordinator\`, \`planner\`, \`coder\`, \`reviewer\`, \`reasoner\`, \`summarizer\`, \`embeddings\`. Merge task analysis into \`planner\` initially. | Small explicit set covers the target lifecycle. Add a separate analyst role only if evaluations show materially different requirements. |
| Reviewer policy | Advisory for the first vertical slice; introduce risk-tiered required review only after seeded-defect evaluations and deterministic completion gates are in place. | A weak/small model must not block routine tasks or falsely certify success. Tests/process/workspace evidence remain authoritative. |
| Resource probe | Query Ollama for installed models and running model state where supported; add best-effort host RAM/GPU probes. Treat unavailable VRAM metrics as unknown, not zero. Default to one active generative model and serialized role switches. | Ollama model metadata is not an exact free-VRAM measurement. Never use model download size as runtime memory. |
| Embeddings | Keep optional/deferred until retrieval benchmarks show improvement over lexical search. | Avoid index invalidation, storage and privacy complexity without demonstrated value. |
| Hosted providers | Defer implementation until local Ollama path is stable; per-role external use must be explicit and consent-gated. | Local-first remains functional with hosted providers disabled. |
| Desert Ant utilities | Defer to a separate, single-utility spike with platform/license/runtime evaluation. | These are optional utility models, not AIR's coordinator/planner/coder foundation. |

### 5.1 Proposed provider contract

The existing \`ChatProvider.complete(messages) -> string\` seam is too narrow and is not wired. Do not extend it as the long-term abstraction. Introduce a provider-neutral model API with:

- Typed request: provider/model identity, messages, optional tools, optional JSON-schema/structured-output request, generation options, timeout and cancellation signal.
- Typed response: assistant content, structured tool calls, finish reason, usage/timing when available, provider/model identity and bounded diagnostic metadata.
- Explicit capability declarations: chat, tool calling, structured output, vision, embeddings, context limit and streaming. A provider/model must not be assumed to support a capability because of its name.
- Provider methods for chat, embeddings, health, installed-model listing and model metadata; runtime-loaded model listing is optional and capability-probed.
- Canonical errors: \`PROVIDER_UNAVAILABLE\`, \`MODEL_NOT_FOUND\`, \`UNSUPPORTED_CAPABILITY\`, \`TIMEOUT\`, \`RATE_LIMITED\`, \`INVALID_RESPONSE\`, \`CANCELLED\`, \`PROVIDER_ERROR\`. Map these to existing adapter/worker error categories at integration boundaries; do not conflate model API errors with execution adapter errors.
- Fake provider conformance tests for all normal CI. Live Ollama tests are opt-in.

### 5.2 Config v2 direction (proposal, not current schema)

Keep the current global config file as the only authoritative source for AIR-owned role assignments. Proposed shape:

~~~yaml
version: 2
models:
  localFirst: true
  maxConcurrentGenerative: 1
  keepAlive: 5m
  providers:
    ollama:
      enabled: true
      baseUrl: http://localhost:11434
  roles:
    coordinator: { provider: ollama, model: qwen3.5:4b }
    planner: { provider: ollama, model: qwen3.5:4b }
    coder: { provider: ollama, model: qwen2.5-coder:7b }
    reviewer: { provider: ollama, model: qwen3.5:4b }
    reasoner: { provider: ollama, model: deepseek-r1:1.5b }
    summarizer: { provider: ollama, model: qwen3.5:4b }
    embeddings: { provider: ollama, model: nomic-embed-text }
~~~

This is a design proposal only. It must be converted into strict Zod types and a safe v1→v2 migration before use. Migration must preserve all existing v1 settings, be idempotent and never download models. Repo-level \`.airrc.yaml\` must not enable providers, change role assignments, set secrets or relax permissions.

### 5.3 Worker contract direction

Keep the canonical shared contract. A future contract version should carry the resolved execution role, provider/model identity and the provider settings needed by the worker (at minimum Ollama base URL and keep-alive policy), while the TypeScript control plane remains the source of role/provider selection. The Python worker must not independently re-resolve AIR roles. Prefer passing resolved per-run provider settings in the versioned request (or a generated per-run worker config) over keeping a second authoritative model/provider configuration in `packages/local-worker/config.yaml`. The worker config should retain worker-only tool/agent settings; its model slots become compatibility defaults during migration and are removed only after the new contract is proven. Maintain v1 compatibility or provide a tested migration/version negotiation path; the current schema rejects unknown fields, so an unversioned additive change is not safe.

## 6. Handoff and implementation boundaries

Suggested first implementation order after independent L0 review:

1. **L1 runtime contract + Ollama provider** — owner: model-runtime agent; owns \`src/models/**\`, provider tests and provider docs. No config schema or worker contract edits without integration-owner approval.
2. **L2 config/registry/role resolver** — owner: integration agent; owns \`src/config/**\`, \`src/models/registry.ts\`, role resolver, migration and associated tests. Shared config contract is frozen before parallel work.
3. **L4 coordinator vertical slice** — owner: conversation agent; owns coordinator/context service and CLI/MCP integration after the provider API is merged. Keep action dispatch, permissions and job start deterministic.
4. **Independent reviewer** — checks model API/config trust boundaries, prompt injection, malformed action handling, provider consent and cross-platform tests before merge.

Do not parallelize changes to \`src/config/schema.ts\`, \`contracts/job.schema.json\`, \`src/conversation/actions.ts\` or CLI/MCP dispatch until their interfaces are agreed and recorded.

## 7. Open verification items

- Wait for CI #43218386531 real-binary smoke-test job to finish and record its final conclusion.
- Independent AI review of Sections 5.1–5.3 and proposed decisions.
- Confirm whether the Ollama version deployed by the user exposes \`/api/ps\` and which fields can be trusted for running-model diagnostics; do not infer GPU memory from it.
- Benchmark installed models on the reference machine before declaring any default role assignment recommended.
- Do not mark L0 complete until L0-01 through L0-04 have evidence and reviewer sign-off.
