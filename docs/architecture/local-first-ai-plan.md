# AIR Local-First Intelligence — Architecture and Implementation Blueprint

**Status:** Proposed implementation blueprint; ready for cross-agent review  
**Prepared:** 2026-11-12  
**Repository baseline inspected:** main at 6fe3222cd6fcacbe8293b86a330a5e3138686006  
**Purpose:** Make AIR's own intelligence local-first and model-driven while preserving deterministic control, safety, portability, and optional external providers.

> This is the implementation contract for the next AIR architecture milestone. It is self-contained so an AI or human engineer can take an individual work package without relying on chat history. If implementation discovers that the live repository differs from a statement here, verify the live code, update this document, and record the discrepancy before changing behavior.

## 1. Executive decision

AIR should evolve from a deterministic TypeScript orchestrator that delegates most intelligence to external coding-agent CLIs into **one AIR-owned agent whose default intelligence runs on the user's own machine**.

The user continues to interact with AIR through CLI and MCP. AIR owns conversation, intent interpretation, planning, role selection, scheduling, permissions, execution lifecycle, evidence collection, verification, and final response. Local models provide reasoning and language intelligence for those stages. Coding-agent CLIs and hosted model APIs remain optional providers; they are not the architecture's centre of gravity.

The intended default is:

- **Local-first:** Ollama and locally installed models are preferred and used by default.
- **AIR-first:** AIR's own coordinator/planner/reviewer lifecycle is the product. Aider, Goose, OpenCode, KiloCode, Codex, and similar tools are optional adapters.
- **Role-based:** coordinator, planner, coder, reviewer, reasoner, summarizer, and embeddings are model roles. A role is not an adapter and is not tied permanently to one provider.
- **Hardware-aware:** AIR detects resources and chooses a usable profile; it must not assume every model can remain resident simultaneously.
- **Safe by construction:** model output is an untrusted proposal. Deterministic AIR code validates actions, enforces permissions, controls processes, and decides whether work is complete.
- **User-controlled cost:** external/paid providers are disabled unless configured; paid fallback requires explicit approval according to policy.
- **Portable:** Windows, macOS, and Linux remain supported. Detection must degrade gracefully when a platform does not expose a metric.
- **Incremental:** implement behind tested contracts and vertical slices. Do not replace the orchestration stack in one large rewrite.

### 1.1 What success looks like

A user installs AIR, runs guided local setup, selects or accepts a recommended local profile, and asks AIR to explain a concept, investigate a repository, plan a change, edit code, run approved verification, review the diff, and explain the result. AIR uses configured local models for the appropriate roles, switches models within the available resource budget, and preserves one coherent conversation.

A user can replace the model for any role, use a different local runtime, or explicitly configure a hosted provider for selected roles. These are configuration choices, not architectural forks.

## 2. Scope and non-goals

### In scope

1. Provider-neutral model runtime interface, initially implemented for Ollama.
2. Model registry with declared capabilities and observed runtime availability.
3. Independent role-to-provider/model assignments.
4. Local-first coordinator interpreting user messages and emitting typed AIR actions.
5. LLM-assisted planning producing a validated, bounded work graph.
6. Role-aware execution, including coder and reviewer roles.
7. Hardware/resource-aware model loading and concurrency.
8. Model discovery, testing, recommendation, pull/install, and setup UX.
9. Evaluation fixtures and repeatable benchmarks for the reference hardware profile.
10. Optional hosted model providers and specialized local utilities only after the local path is reliable.

### Explicitly out of scope for this milestone

- Reintroducing the decommissioned MakingGoodAIs orchestration/planner/critic/memory/plugin architecture as a second control plane.
- Making Aider/Goose/OpenCode/etc. mandatory or treating their internal agents as AIR's primary brain.
- Autonomous permission escalation, arbitrary shell commands, unrestricted network access, automatic commits/pushes, or silent paid-provider use.
- Assuming cloud access is available for core functionality.
- Requiring multiple large generative models to be loaded concurrently.
- Building a full-screen TUI or web UI as a prerequisite.
- Promising that a model is best based only on parameter count, vendor claims, or model-card context-window figures.

## 3. Verified baseline: what exists today

The following describes code inspected at the baseline commit, not the target design.

| Area | Current implementation | Gap relative to this blueprint |
|---|---|---|
| AIR control plane | TypeScript CLI/MCP, conversation store, orchestrator, router, adapter registry, execution runner | Front-agent decision and planning lifecycle is not yet driven end-to-end by AIR's local LLM roles |
| Conversation | src/conversation/index.ts stores neutral messages, summary, facts, active work IDs and preferences | Must become the durable context boundary for coordinator/planner/reviewer calls |
| Action contract | src/conversation/actions.ts defines answer, spawn_job, cancel_job, status, clarify | No complete model-backed coordinator loop owns all user turns |
| Planner | src/planner/index.ts has Zod schemas and regex/heuristic planFromRequest() | Replace heuristics as primary planner with LLM proposals plus deterministic validation; retain safe fallback |
| Model/provider config | src/config/schema.ts is version 1 and configures tools, failover, permissions, concurrency, etc. | No first-class model provider registry or role assignment schema |
| Local adapter | src/adapters/local.ts invokes bundled worker; default model is hardcoded as qwen3.5:4b | Adapter model identity/config is not role-aware and should not own model-role policy |
| Local worker config | packages/local-worker/config.yaml has Ollama settings and model slots brain, coder, reasoner, embed | Worker-local slots need to converge with AIR's canonical role/provider configuration |
| Local model selector | packages/local-worker/air_local/models.py maps capability strings to those four slots | Small worker-local selector, not AIR's cross-provider model registry |
| Local agent loop | packages/local-worker/air_local/loop.py runs a ReAct tool loop using Ollama and worker tools | Useful execution capability exists, but it does not replace AIR coordinator/planner/reviewer lifecycle |
| Ollama transport | packages/local-worker/air_local/ollama.py wraps chat, embeddings, tags, show, and server availability | Needs provider-neutral interface, richer health/capability probing, and resource-aware lifecycle |
| Model/adapter router | src/router selects execution adapters; adapters represent tools/processes | Do not overload this router with model-role selection; keep model registry/routing distinct |
| Safety | Permission config, worker policy, shell allowlist, path jail, worktree isolation, redaction, explicit merge | Preserve and strengthen; model decisions must not bypass these boundaries |
| Provisioning | air setup local, air doctor, worker venv provisioning | Extend to model readiness/profile setup with explicit download approval |

### 3.1 Baseline caveats

- The current local worker has model slots, but the TypeScript control plane still treats the bundled worker as one local adapter. This is not yet a complete AIR-owned role architecture.
- The current planner is heuristic. Its existence must not be described as LLM planning.
- The local adapter currently has a hardcoded default model constant. Canonical configuration should ultimately own this decision.
- AGENTS.md contains an inconsistency: its six rules refer to docs/reviews/tasks_air_6.md, while its source-of-truth section and README identify docs/reviews/tasks_air_12.md. The active implementation ledger created alongside this blueprint should resolve this by becoming the explicit next task ledger; do not silently edit historical task ledgers.
- At inspection time the latest commit's combined status endpoint returned no status entries, and the connector's commit-workflow wrapper returned no runs (it filters to pull-request-triggered runs). Therefore the latest commit's CI result was **not independently verified** in this task. Earlier task-ledger claims of green CI are historical claims, not proof for current HEAD.

## 4. Reference hardware and model starting point

### 4.1 Reference development profile

The initial tuning target is the user's Windows 11 machine:

- AMD Ryzen 7 5800H, 8 cores / 16 threads
- 16 GB system RAM
- NVIDIA RTX 3060 Laptop GPU, 6 GB VRAM
- Ollama installed locally

This is a reference profile, not a universal minimum. AIR must support CPU-only machines and machines with larger GPUs. Do not bake this machine's exact hardware into runtime assumptions or reject users with different hardware.

### 4.2 Currently installed model candidates

The current user-provided local set is:

| Proposed role | Model | Current status | Initial judgement |
|---|---|---|---|
| Coordinator / general brain | qwen3.5:4b | Installed | Primary first benchmark candidate; test action JSON, tool calling, instruction following and latency |
| Coder | qwen2.5-coder:7b | Installed | Primary code-edit candidate; benchmark quality and actual memory/latency on 6 GB VRAM |
| Lightweight reasoner | deepseek-r1:1.5b | Installed | Auxiliary/fast reasoning candidate; do not trust it with complex plans until evaluation proves it |
| Embeddings | nomic-embed-text | Installed | Initial local embedding candidate; embedding-only role |

Assignments are provisional. A model's disk download size is not its total runtime memory requirement. Runtime memory also includes KV cache/context, framework overhead, GPU offload, system RAM, and competing applications. A model advertising a very large context window does not mean that context is practical on this machine.

**Initial resource policy:** allow one generative model to be active at a time by default. Switch roles sequentially and configure a short/zero keep-alive when memory pressure requires unloading. Embedding work is separately scheduled and must not unexpectedly evict an active generation model. The scheduler may relax this limit only after measured resource headroom and explicit configuration.

### 4.3 Candidates to benchmark, not blindly install

- qwen3:4b: comparison candidate for coordinator/planner quality and tool calling.
- granite4:3b: candidate for structured instructions and tool-call reliability.
- embeddinggemma:300m: comparison candidate for embeddings.
- Other Ollama models may be added by users; AIR must not hardcode a closed model list.

Useful upstream references (tags and capabilities can change; re-check before implementation and release):

- [Ollama Qwen3.5 4B](https://ollama.com/library/qwen3.5:4b)
- [Ollama Qwen2.5 Coder](https://ollama.com/library/qwen2.5-coder)
- [Ollama DeepSeek R1](https://ollama.com/library/deepseek-r1)
- [Ollama Nomic Embed Text](https://ollama.com/library/nomic-embed-text)
- [Ollama Qwen3](https://ollama.com/library/qwen3)
- [Ollama Granite 4](https://ollama.com/library/granite4)
- [Ollama EmbeddingGemma](https://ollama.com/library/embeddinggemma)

### 4.4 Desert Ant Labs assessment

[Desert Ant Core](https://github.com/Desert-Ant-Labs/desert-ant-core) and the [Desert Ant Labs Hugging Face organization](https://huggingface.co/desert-ant-labs) are candidates for a **specialized local utility layer**, not a replacement for AIR's coordinator, planner, coder, or reviewer LLMs.

Potential optional integrations include local PII detection/redaction, topic classification, language identification, speech recognition/audio utilities, and structured extraction where platform support and licensing permit. Each integration requires a focused spike for Windows support, runtime/dependency footprint, model size, license, API stability, and measured benefit. Do not make these dependencies for the core local-first milestone. Some components have platform restrictions or limited/closed availability; verify current project status before selecting one.

## 5. Target architecture

### 5.1 Separation of responsibilities

The architecture has five distinct layers. Keep the boundaries explicit.

1. **AIR product/control plane (TypeScript):** owns conversation, actions, planning lifecycle, job graph, scheduling, state, permissions, worktrees, process lifecycle, verification, evidence, result compilation, observability, CLI and MCP.
2. **Intelligence roles:** coordinator, planner, task analyst, coder, reviewer, summarizer, reasoner. Each role has a typed input/output contract and configurable provider/model assignment.
3. **Model provider runtimes:** Ollama first; later optional OpenAI-compatible or vendor-specific hosted/local providers. A provider executes model requests; it does not own AIR's workflow.
4. **Execution tools/adapters:** bundled Python local worker and optional external coding-agent CLIs. They perform bounded work in an AIR-controlled workspace.
5. **Resource and policy services:** model registry, capability probing, resource budget, model load/unload queue, cost policy, consent and security enforcement.

~~~mermaid
flowchart TD
  U[User] --> I[CLI / MCP]
  I --> C[Conversation service]
  C --> CO[Coordinator role]
  CO -->|typed Action| V[Zod validation + policy gate]
  V -->|answer / clarify / status| C
  V -->|delegate| P[Planner role]
  P --> PV[Plan validation + DAG checks]
  PV --> S[Deterministic scheduler]
  S --> R[Role resolver + model registry]
  R --> RM[Resource / model manager]
  RM --> MP[Model provider runtime: Ollama]
  S --> EX[Execution adapter]
  EX --> LW[Bundled local worker / optional external tool]
  LW --> EV[Workspace delta + process facts + tests]
  EV --> RV[Reviewer role]
  RV --> RG[Deterministic review gates]
  RG --> RC[Result compiler]
  RC --> C
  C --> U
  V --> SEC[Permissions / approvals / redaction]
  S --> SEC
  EX --> SEC
~~~

### 5.2 Non-negotiable control boundary

Models may propose:
- an action from a finite action schema;
- a work plan with bounded work items and dependencies;
- a role/capability requirement;
- code changes through an approved execution tool;
- a review finding or verification recommendation;
- a concise summary of observed facts.

Models may **not**:
- change their own permissions or user policy;
- authorize a paid provider or external data egress;
- directly select arbitrary executables or pass arbitrary shell strings to the process runner;
- change worktree boundaries, protected paths, or repository trust;
- mark a task successful based on their own prose;
- commit, push, merge, delete branches, or alter repository configuration unless a separate explicit user-authorized operation exists;
- bypass the shared job contract or call unregistered tools.

All model responses are untrusted input. Validate structured output, reject unknown actions/fields, enforce limits, and retain deterministic fallback behavior.

### 5.3 Keep model routing separate from adapter routing

Do not merge these concepts:

- **Model role resolver:** chooses a model/provider for a role (for example coder → Ollama → qwen2.5-coder:7b).
- **Model provider:** API/runtime that serves a model (for example Ollama).
- **Execution adapter:** mechanism that performs a workspace task (for example bundled local worker or Aider).
- **Task router/scheduler:** decides what work can run, in what order, and under what policy.

An adapter may internally use a model, but it does not become the model registry. A model provider does not become the task scheduler.

## 6. Model roles and contracts

Roles are logical responsibilities. They may share one model assignment initially. Do not require a different model for every role.

| Role | Responsibility | Input | Required output | Default assignment |
|---|---|---|---|---|
| coordinator | Interpret each user turn; choose answer, clarify, status, cancel, or delegate | bounded conversation context, current job summaries, user turn | exactly one or a bounded list of ActionSchema actions | ollama/qwen3.5:4b |
| planner | Decompose delegated goals into a small dependency graph and acceptance criteria | user goal, coordinator hints, repository/task context | PlanSchema JSON | ollama/qwen3.5:4b initially |
| coder | Implement a specific work item in its isolated workspace | objective, relevant files, acceptance criteria, allowed tools | workspace changes and factual completion summary | ollama/qwen2.5-coder:7b |
| reviewer | Independently inspect diff and test evidence; identify defects and missing criteria | diff, changed-file list, tests, acceptance criteria | structured findings with severity and evidence references | ollama/qwen3.5:4b initially |
| reasoner | Optional fast classification, decomposition hint, or second opinion | small bounded request | typed short result | ollama/deepseek-r1:1.5b |
| summarizer | Compact conversation/task context without losing constraints | selected messages and factual events | summary plus retained facts and open questions | share coordinator model initially |
| embeddings | Local semantic indexing/retrieval when enabled | text chunks | vectors | ollama/nomic-embed-text |

### 6.1 Role contract requirements

- Each role has a versioned request/response schema and dedicated prompt/instruction file or module.
- Structured roles use provider-supported structured output where available, but always validate with AIR's own Zod schema.
- Retry at most a small configured number of times for malformed output; then use deterministic fallback or fail safely.
- Bound input tokens/context by role. Never send the full conversation or entire repository by default.
- Preserve provenance: distinguish user-provided facts, repository evidence, tool output, and model inference.
- Role prompts state that the model cannot grant permission, claim unobserved results, or override system policy.
- Record role, provider, model, prompt/schema version, latency, token usage when available, and validation outcome in redacted traces. Never log secrets or hidden reasoning.
- Do not persist private chain-of-thought. Persist concise rationale/decision metadata and evidence references only.

### 6.2 Suggested configuration shape

This is a **target example**, not the current schema. Final field names and migration behavior must be settled in the config phase and documented before implementation.

~~~yaml
version: 2
models:
  localFirst: true
  resourcePolicy:
    maxConcurrentGenerativeModels: 1
    preferUnloadOnMemoryPressure: true
    keepAlive: 5m
  providers:
    ollama:
      enabled: true
      baseUrl: http://localhost:11434
    openai:
      enabled: false
      # Credentials resolved from environment/secret store, never committed here.
  roles:
    coordinator:
      provider: ollama
      model: qwen3.5:4b
    planner:
      provider: ollama
      model: qwen3.5:4b
    coder:
      provider: ollama
      model: qwen2.5-coder:7b
    reviewer:
      provider: ollama
      model: qwen3.5:4b
    reasoner:
      provider: ollama
      model: deepseek-r1:1.5b
    summarizer:
      provider: ollama
      model: qwen3.5:4b
    embeddings:
      provider: ollama
      model: nomic-embed-text
  externalFallback:
    enabled: false
    requireExplicitApproval: true
~~~

Configuration rules:

- Zod remains the TypeScript configuration source of truth; do not introduce a second competing schema.
- Preserve config version 1 and implement a deterministic migration to the new version. Migration must be idempotent, testable, and non-destructive.
- Keep repo-level config untrusted. Provider credentials, external fallback policy, trusted repositories, permission policy, and global resource controls remain global-only unless security review explicitly approves otherwise.
- Resolve precedence consistently with current policy: CLI > environment > trusted/global config > defaults; untrusted repo config must not override global-only model/provider settings.
- Do not put secrets in YAML, task requests, model traces, or handoff bundles.
- Keep a compatibility bridge for current packages/local-worker/config.yaml during migration. Avoid two independent editable sources of truth; define which side owns effective config and how the worker receives it.

## 7. Model registry, provider interface, and capability model

### 7.1 Provider interface

Define a provider-neutral TypeScript contract before adding a second provider. At minimum it should support:
- listModels() and/or getModelInfo(modelId);
- isAvailable() / health check;
- chat(request) with normalized messages and tool definitions;
- structured output mode when supported;
- embed(request) for embedding-capable providers;
- cancellation/timeout semantics;
- model load/keep-alive hints where provider supports them;
- normalized usage/latency/error metadata;
- capability discovery and provider-specific diagnostics.

Provider-specific options live in a typed provider-options field, not generic role/task contracts. Ollama is first. Do not make all providers pretend to support tools, vision, embeddings, or structured output if they do not.

### 7.2 Model registry record

A model record distinguishes **declared metadata** from **observed runtime facts**:
- stable model identifier and provider;
- display name and optional family/parameter/quantization metadata;
- capabilities: tool calling, structured output/JSON mode, vision, reasoning/thinking, embeddings, context window (if verified), streaming;
- installed/available status and provider-reported details;
- measured latency and benchmark results by task;
- estimated resource footprint and observed resource use where measurable;
- provenance of metadata (provider response, bundled profile, user override, benchmark);
- verification timestamp and compatibility notes.

Never infer a capability solely from a model name. Probe or benchmark it. User overrides must be marked as user-supplied and tested before enabling a critical role.

### 7.3 Role resolution

Resolve a role using this order:
1. Explicit per-request role/model override that is permitted by policy.
2. Explicit user role assignment in trusted config.
3. Hardware profile's recommended default for that role.
4. Safe built-in fallback if available.
5. Clear unavailable-role error; never silently route a paid/external model.

The resolver returns an explainable decision: chosen provider/model, role, required capabilities, availability, resource decision, and rejected candidates with reasons. It does not execute the task.

## 8. Resource management and hardware-aware execution

### 8.1 Resource profile detection

Detect where possible:
- OS and architecture;
- total/available system RAM;
- GPU vendor, device, and VRAM;
- Ollama availability and version;
- installed model tags;
- currently loaded models and provider-reported resource state, if supported.

Detection is best-effort, bounded by short timeouts, and must never block core CLI startup indefinitely. If GPU detection is unavailable, use a conservative CPU/RAM profile and tell the user what could not be detected. Allow manual overrides.

### 8.2 Scheduler policy

- Default maxConcurrentGenerativeModels = 1 on the reference profile.
- Distinguish concurrent AIR jobs from concurrently resident generation models. Multiple jobs may queue and share a model sequentially.
- Serialize model switches when necessary. Do not let two roles race to unload/load different models.
- Use role/task priority and cancellation-aware queueing. Interactive coordinator turns should not starve behind a long background coding task; define a safe preemption policy (initially finish the current model request, then yield).
- Reuse a resident model when it matches the requested role and budget.
- Unload or shorten keep-alive when memory pressure is detected; never assume provider unload is instantaneous.
- Embedding jobs are separately budgeted. If they require a different resident model, queue them or use a measured safe concurrency profile.
- Record model-load time separately from inference time.
- Resource estimates are advisory until calibrated. Do not claim exact VRAM usage from model file size.

### 8.3 Failure behavior

- If selected model cannot load, report a role-specific provider error and try another eligible local model only if policy allows.
- If memory pressure occurs, queue, unload, reduce context, or recommend a smaller model. Do not silently change the requested role to an unsuitable model.
- If Ollama is offline, use existing explicit setup/doctor semantics; do not spawn unmanaged background services without clear policy.
- External fallback is a separate policy decision and always requires the configured consent path.

## 9. AIR intelligence lifecycle

### 9.1 Coordinator loop

For every user turn:
1. Load conversation and append the user message through the existing safe persistence path.
2. Build a bounded, redacted context package: summary, relevant facts, recent messages, active jobs, user preferences, and relevant workspace/repository metadata.
3. Invoke configured coordinator role.
4. Parse exactly the allowed ActionSchema output. Reject unknown actions and malformed payloads.
5. Apply deterministic policy checks: permissions, provider/cost policy, job limits, current job state, and whether clarification is required.
6. Dispatch the action through existing AIR services.
7. Persist assistant response and relevant events.
8. If delegation starts work, return promptly; do not block the conversation input loop on the worker.

The coordinator decides what kind of action is appropriate, but cannot invoke raw processes or mutate task state directly.

### 9.2 Planner loop

For a delegated goal:
1. Pass goal, coordinator hints, bounded relevant context, repository summary, and permission envelope to planner role.
2. Validate against PlanSchema and stricter semantic checks.
3. Enforce hard limits: maximum work items, objective length, dependency count/depth, valid unique IDs, no cycles, no unknown dependencies, and no self-dependencies.
4. Require each work item to declare task type, read/write intent, required capabilities, acceptance criteria, and dependencies.
5. Reject plans that exceed permissions, available resources, or configured job budgets.
6. Prefer one focused work item for ordinary code changes. Parallelize only independent read-only work or isolated worktrees with proven conflict handling.
7. Use deterministic heuristic planning only as fallback when planner model is unavailable or invalid; record that fallback in trace metadata.

The planner must not invent successful test results or claim it inspected files. Repository facts must come from tools.

### 9.3 Execution and coding

- Scheduler chooses a ready work item and resolves coder (or other specialist) role.
- Selected adapter receives a narrowly scoped task, context pack, acceptance criteria, allowed tools, permission policy, and isolated worktree path.
- Prefer bundled local worker for default local-first path. It may use configured coder model and existing jailed tools.
- External coding-agent adapters are optional. They must pass adapter conformance and receive the same workspace/permission/evidence envelope.
- Preserve canonical contracts/job.schema.json request/result contract or version it deliberately if new role metadata is needed.
- Process exit status, workspace delta, test output, and cancellation facts are authoritative. Worker prose is not proof.

### 9.4 Reviewer and completion gate

The reviewer is an independent model role, not the source of truth. It receives task goal and acceptance criteria, diff and changed-file list, test/verification results, policy decisions, and known limitations. It returns structured findings with severity, file/line evidence where available, and criteria mapping. AIR then applies deterministic gates:

- Did the process finish successfully?
- Did expected workspace changes occur (or was a read-only result expected)?
- Were required tests/verification commands actually run and passed?
- Were protected paths and permission constraints respected?
- Did the reviewer identify unresolved blocking findings?
- Is the result safe to present or merge?

A model cannot override a failed test, missing diff, cancellation, denied operation, or failed security gate. Reviewer outage follows an explicit configurable policy (for example warn/continue for low-risk read-only work, block apply for high-risk code changes), never a hidden default.

### 9.5 Result compilation and conversation injection

Compile results from facts: task state and process outcome; changed files and diff statistics; verification output; reviewer findings; adapter/provider/model metadata for verbose diagnostics only.

Redact before persistence/injection. Ensure idempotent result injection and causal event ordering. Update active work IDs atomically. User-facing prose describes outcomes, not internal model/adapter plumbing unless asked.

## 10. Security, privacy, and trust requirements

These requirements apply to every role/provider and are release blockers:

1. **Typed actions only:** coordinator output is validated against Zod; no arbitrary tool names or shell commands from model output.
2. **Permission enforcement:** evaluate canonical permission policy before every tool/process invocation. Translate it to the narrowest adapter capabilities; refuse if an adapter cannot honor the policy.
3. **Workspace isolation:** write jobs run in dedicated worktrees; source tree remains untouched until explicit air merge <id> --apply.
4. **Path jail:** local worker tools remain confined to job root and protect sensitive/configuration files.
5. **Network and egress:** network access is disabled unless policy grants it. Sending repository/context data to hosted model requires explicit user-approved provider policy.
6. **Paid provider consent:** no automatic paid fallback; consent must bind to provider/model/cost scope being approved and be auditable.
7. **Secrets:** redact before logs, traces, conversation persistence, model handoffs, and external-provider requests. Never include credentials in model prompts.
8. **Model output is untrusted:** validate schemas, cap sizes, reject unexpected fields, guard against prompt injection in repository files/web pages, and keep system policy outside retrieved content.
9. **No hidden destructive actions:** no auto-commit/push/merge/delete or broad install operations.
10. **Auditability:** record decision IDs, role/provider/model, schema version, policy outcome, and evidence references without recording private chain-of-thought or secrets.

## 11. Model evaluation and benchmark programme

Do not promote a default model based on subjective impressions alone. Build a small deterministic benchmark suite before making model assignments release defaults.

### 11.1 Evaluation tasks

Include fixtures for:
- Coordinator intent classification: answer vs clarify vs delegate vs status/cancel.
- Strict structured action JSON: valid, malformed, extra fields, ambiguous intent.
- Planning: one-step edit, review-then-edit dependency, multi-file change, research-only task, unsafe/overbroad plan, cycle/unknown dependency rejection.
- Tool calling: correct tool selection, valid arguments, recovery from tool errors, no unauthorized tool invocation.
- Coding: small bug fix, test addition, refactor with constraints, cross-file change, Windows path handling.
- Debugging: infer root cause from supplied logs and code evidence, distinguish hypotheses from facts.
- Reviewing: detect seeded defects, avoid false positives, map findings to diff evidence.
- Summarization: preserve requirements, decisions, open questions, and exact identifiers under context reduction.
- Embeddings: retrieval precision/recall on a small repository/document corpus if semantic retrieval is enabled.

### 11.2 Metrics

Record per model and role:
- schema/action success rate;
- tool-call success rate and invalid-argument rate;
- task completion against deterministic tests;
- reviewer seeded-defect recall and false-positive rate;
- latency (cold start, load, first token, total);
- peak RAM/VRAM where reliably measurable;
- tokens/throughput where available;
- failure/retry rate;
- repeatability across at least three runs for high-impact tasks.

Do not compare models using one run. Keep raw prompts/fixtures versioned but do not commit private repository data or secrets. Report confidence/limitations and do not turn a benchmark score into a guarantee.

### 11.3 Benchmark execution policy

- Run first on reference Windows machine and record exact Ollama version, model tags, quantization, context, GPU offload settings, power mode, and other major runtime conditions.
- Compare current installed models before downloading candidates.
- Pull new candidates only after showing expected download size and receiving user approval.
- Benchmark candidates sequentially to avoid memory contention.
- Keep benchmark data separate from production user conversations.
- Establish acceptance thresholds before interpreting results; proposed starting thresholds belong in the benchmark task and must be reviewed rather than silently invented here.

## 12. Installation and first-run experience

The first-run path should be simple and transparent:

1. Detect Node/Python requirements, OS/architecture, RAM/GPU where possible, Ollama presence/version, and installed models.
2. Select a hardware profile (conservative CPU, entry GPU, reference 6 GB VRAM, larger GPU) with manual override.
3. Show recommended role assignments and explain that multiple roles may share a model.
4. Show model tags, capabilities, approximate download sizes, disk needs, and why each is recommended.
5. Ask before downloading any model. Never silently pull multi-gigabyte weights.
6. Download missing models sequentially and report progress/errors.
7. Run a small smoke test per assigned role: coordinator structured action, planner schema, coder tool call/edit in a disposable fixture, reviewer structured finding, embedding vector.
8. Save effective configuration only after validation or clearly mark incomplete roles.
9. Provide actionable commands for list, test, pull, assign, recommend, doctor, and profile inspection.

Candidate command surface (names are proposals; verify existing CLI structure and avoid collisions):
- air models list
- air models recommend
- air models test [role|model]
- air models pull <model>
- air models assign <role> <provider>/<model>
- air models status
- air doctor --models

Keep air models compatibility with its current meaning documented; migrate/extend rather than breaking existing users.

## 13. Phased implementation roadmap

Each phase is a separate reviewable milestone. A phase is not complete until acceptance criteria and tests pass, documentation is updated, and the active ledger is updated. Dependencies are explicit; parallel work is permitted only where file ownership and contracts do not conflict.

### Phase L0 — Baseline and executable design gate

**Goal:** Turn this blueprint into implementation-ready contracts and record a reproducible baseline.

Work packages:
- L0-01: verify current main HEAD, CI, active config/worker/adapter behavior and relevant tests.
- L0-02: map current request path from CLI/MCP through conversation, action dispatch, planner, orchestrator, adapter, worker, result compiler and injection.
- L0-03: settle role names, provider contract, config v2 shape, migration strategy, resource policy, and error taxonomy.
- L0-04: define benchmark fixtures and acceptance thresholds before comparisons.

Likely files: this blueprint, docs/behavior-spec.md, src/config/schema.ts, src/conversation/actions.ts, src/planner/index.ts, src/adapters/local.ts, packages/local-worker/air_local/ollama.py, tests.

Exit criteria: architecture decisions recorded; no unresolved ambiguity that would force parallel agents to invent incompatible interfaces; baseline tests/CI recorded with exact commit SHA.

### Phase L1 — Provider-neutral model runtime and Ollama provider

**Goal:** Introduce a model provider abstraction without changing user-facing behavior yet.

Work packages:
- L1-01: define normalized model request/response, message, tool, usage, capability and error types.
- L1-02: implement provider interface and Ollama provider by wrapping/refactoring existing Ollama transport.
- L1-03: add provider health, tags/model info, embeddings, timeout and cancellation tests.
- L1-04: add conformance tests for provider implementations and fake provider fixtures.

Likely files: new src/models/providers/, src/models/types.ts, tests; Python Ollama wrapper only where worker contract needs shared behavior.

Exit criteria: Ollama serves typed chat/structured-output/tool-call requests through new interface; no current local worker regression; provider errors map to canonical taxonomy; tests do not require live Ollama except gated integration tests.

### Phase L2 — Model registry, capabilities and role configuration

**Goal:** Make role assignments first-class and configurable.

Work packages:
- L2-01: define model registry metadata and observed availability records.
- L2-02: define role schema and provider config in Zod; add config migration v1 → v2.
- L2-03: implement role resolver with capability filtering, user overrides, safe defaults and explainable skip reasons.
- L2-04: remove hardcoded model identity from LocalAdapter; pass resolved role/model through versioned worker request.
- L2-05: converge TypeScript effective config and worker config; document one source of truth and compatibility path.

Likely files: src/config/schema.ts, src/config/loader.ts, current migration module, new src/models/registry.ts, src/models/roles.ts, src/adapters/local.ts, contracts/job.schema.json, packages/local-worker/config.yaml, Python contract/tests.

Exit criteria: existing v1 configs migrate without losing settings; role assignments can be changed independently; missing/unsupported models fail with clear reasons; no provider secrets are exposed; TS and Python agree on worker request contract.

### Phase L3 — Resource-aware model manager

**Goal:** Prevent unsafe model contention and make local model switching predictable.

Work packages:
- L3-01: implement best-effort hardware/runtime probes and normalized resource profile.
- L3-02: query Ollama model/runtime state where supported; record limitations.
- L3-03: implement serialized model-load/switch queue and configurable keep-alive/unload policy.
- L3-04: enforce reference-profile default of one active generative model; expose queue/load state in diagnostics.
- L3-05: test low-memory, unavailable GPU metrics, provider timeout, unload failure and cancellation.

Likely files: new src/models/resources.ts, src/models/manager.ts, Ollama provider, config schema, air doctor/status surfaces, tests.

Exit criteria: two concurrent AIR tasks cannot race model load/unload; switching is serialized; resource-probe failure degrades conservatively; no false claim of exact memory use; coordinator turns have defined queue priority.

### Phase L4 — Local LLM coordinator / front agent

**Goal:** AIR's local model drives the user-facing conversation through the existing typed action system.

Work packages:
- L4-01: define coordinator prompt and bounded context builder.
- L4-02: call configured coordinator role and parse ActionSchema output.
- L4-03: dispatch answer, clarify, status, cancel and spawn actions through deterministic AIR services.
- L4-04: retain deterministic command handling and heuristic fallback for model/provider failure.
- L4-05: integrate CLI and MCP through one shared conversation decision service.
- L4-06: add golden and adversarial tests for prompt injection, malformed actions, ambiguity and permission attempts.

Likely files: src/conversation/actions.ts, src/conversation/index.ts, new coordinator module, CLI/MCP entry points, tests.

Exit criteria: plain questions are answered by configured local coordinator; code requests become typed spawn actions; malformed or unsafe outputs are rejected; CLI and MCP behave consistently; no raw model output invokes a process; conversation remains responsive while jobs run.

### Phase L5 — LLM planner and validated work graph

**Goal:** Replace regex classification as primary plan generator with a role-driven planner.

Work packages:
- L5-01: define richer WorkItemSchema fields for required role/capabilities, risk, acceptance criteria and context requirements.
- L5-02: invoke planner role and validate graph semantics (unique IDs, DAG, limits, dependencies).
- L5-03: add deterministic fallback planner and explicit trace marker.
- L5-04: enforce worktree isolation and no unsafe parallel writers.
- L5-05: test compound tasks, malformed graphs, over-broad plans, cycles, unknown dependencies and resource limits.

Likely files: src/planner/index.ts, new planner prompt/adapter, scheduler/orchestrator integration, task contract if required, tests.

Exit criteria: multi-step plans are model-generated but AIR-validated; invalid plans cannot execute; ordinary edits remain focused; dependent tasks execute in order; parallel tasks require safe isolation.

### Phase L6 — Role-aware local execution and coder integration

**Goal:** Ensure work items invoke the selected specialist role rather than a single hardcoded local model.

Work packages:
- L6-01: propagate role/model assignment and required capabilities through TaskInput and shared job contract.
- L6-02: route bundled worker to resolved coder/generalist role and expose only allowed tools.
- L6-03: keep external coding-agent adapters optional and behind same permissions/evidence envelope.
- L6-04: add end-to-end tests proving role selection reaches Ollama request payload and does not leak across concurrent jobs.
- L6-05: update status/route explanation to show role resolution without confusing model roles with adapters.

Likely files: src/types/, src/adapters/local.ts, src/router/, contracts/job.schema.json, packages/local-worker/air_local/run.py, models.py, loop.py, tests.

Exit criteria: coder role assignment determines worker model; no stale/hardcoded model silently overrides config; worker policy and contract tests pass; optional adapter fallback is explicit and policy-compliant.

### Phase L7 — Reviewer role and evidence-based completion

**Goal:** Add independent model review without allowing model prose to decide success.

Work packages:
- L7-01: define reviewer input/output schemas and prompt.
- L7-02: build review context from diff, acceptance criteria, process facts and verification output.
- L7-03: implement deterministic completion gate and configurable reviewer failure policy.
- L7-04: add seeded-defect evaluation fixtures and reviewer false-positive tests.
- L7-05: ensure result compiler uses evidence and reviewer findings with clear provenance.

Likely files: new src/review/ or reviewer role module, src/result-compiler/, src/orchestrator/, tests, behavior spec.

Exit criteria: reviewer findings are structured and traceable; failed tests/process outcomes cannot be overridden; successful work includes evidence; explicit merge remains user-controlled.

### Phase L8 — Context management, summarization and optional embeddings

**Goal:** Keep long-running conversations useful without sending excessive context.

Work packages:
- L8-01: define context packer budgets by role.
- L8-02: use summarizer role for compaction while preserving facts, constraints, decisions, IDs and unresolved questions.
- L8-03: add semantic retrieval only where evaluation demonstrates value; keep exact/keyword retrieval available.
- L8-04: use embeddings role through provider abstraction; add index invalidation and privacy controls.
- L8-05: stress-test concurrent message/result injection and restart recovery.

Likely files: src/conversation/, src/context/, optional retrieval module, provider embeddings interface, tests.

Exit criteria: context is bounded and redacted; summaries preserve critical constraints; duplicate result injection is impossible; embeddings are optional and never required for core chat/task operation.

### Phase L9 — Model setup, CLI and first-run UX

**Goal:** Make local-first setup easy and transparent.

Work packages:
- L9-01: extend air doctor with model/runtime/resource readiness.
- L9-02: add list/recommend/test/pull/assign/status commands without breaking existing air models.
- L9-03: implement hardware-profile recommendations and explicit pull confirmation.
- L9-04: test partial setup, offline mode, interrupted download, missing disk space, unsupported capability and Windows paths.
- L9-05: update README, install docs, command help and status JSON.

Likely files: bin/air.ts, src/worker/provision.ts, new model installer/commands, src/config/, docs and tests.

Exit criteria: user can see what is installed, missing, what will be downloaded, why it is recommended, and what each role does; downloads require consent; setup is idempotent and recoverable.

### Phase L10 — Optional providers and specialized local utilities

**Goal:** Add alternatives only after local Ollama path is stable.

Work packages:
- L10-01: implement one additional provider behind provider conformance tests (choose based on user need; do not pre-commit to a vendor).
- L10-02: implement per-role external provider opt-in and auditable paid-consent flow.
- L10-03: spike selected Desert Ant utilities independently; record license/platform/dependency/performance findings.
- L10-04: keep optional integrations isolated and ensure AIR works without them.

Exit criteria: local defaults work with external providers disabled; paid use cannot happen without approval; optional utility integrations can be removed without affecting core roles.

## 14. Cross-agent execution protocol

This section is mandatory. The plan is expected to be implemented by multiple AIs, potentially in parallel, with different agents taking over at different times.

### 14.1 Shared source of truth

Every implementation agent reads, in this order:
1. AGENTS.md — repository rules and validation commands.
2. This blueprint — target architecture, contracts, phase order and safety invariants.
3. docs/reviews/tasks_air_13.md — active work-package status and ownership.
4. Exact work package(s) assigned to that agent.
5. Relevant live source files and tests at current branch HEAD.
6. Current PR/branch/CI state and any handoff note from previous agent.

If this document conflicts with live code, do not assume either is correct: inspect, record discrepancy in the ledger, and propose the smallest compatible update. If it conflicts with a later explicit maintainer decision, the maintainer decision wins and must be recorded here.

### 14.2 One integration owner, many bounded contributors

- Assign one integration owner for each phase. That owner maintains ledger, shared contracts, branch integration, CI and phase acceptance.
- Other agents receive bounded work packages with explicit file ownership and output expectations.
- Do not let two agents edit the same shared contract/schema/config file concurrently.
- Parallelize independent tasks only after interfaces are agreed and recorded.
- Use separate branches or worktrees per agent. Never have multiple agents push competing changes to main.
- Integrate through reviewed commits/PRs; do not force-push, rewrite shared history, or overwrite another agent's changes.
- The integration owner integrates only after inspecting ancestry and diffs. If branch moved unexpectedly, inspect before retrying.
- Every agent preserves unrelated user work and must not reset/clean files it did not create.

### 14.3 Work-package contract

Every assignment includes:
- Work-package ID and title;
- current base commit SHA and target branch;
- objective and explicit non-goals;
- prerequisite packages/contracts;
- allowed files/modules to own;
- files that must not be changed;
- expected public interfaces/schema changes;
- required tests and commands;
- acceptance criteria;
- expected documentation/ledger updates;
- known risks and handoff dependencies.

An agent asks for clarification rather than inventing a shared interface if the package is underspecified.

### 14.4 Required handoff note

At the end of every agent session, update the work-package entry or provide this exact handoff structure in the PR/task record:

~~~markdown
## Agent handoff
- Work package:
- Agent:
- Base commit:
- Result commit / PR:
- Status: DONE | PARTIAL | BLOCKED
- Files changed:
- Interfaces/contracts changed:
- Tests run (exact commands):
- Tests passed/failed/not run:
- CI run and result:
- Decisions made:
- Known defects / risks:
- Follow-up packages unblocked:
- Next recommended action:
- Working tree / branch notes:
~~~

Do not write done if code is only drafted, tests were not run, CI is pending, or integration remains. A partial implementation must be marked PARTIAL.

### 14.5 Review and integration rules

- A second AI should review each phase's high-risk changes where feasible; the author should not be sole reviewer for security, config migration, provider consent, or worker permission changes.
- Review against acceptance criteria and security invariants, not just style.
- Run targeted tests during development and full validation before phase integration.
- Keep commits small and scoped to one work package or coherent phase.
- Update docs/reviews/tasks_air_13.md immediately after status changes.
- If a phase discovers architectural changes, update this blueprint first (or in same PR) before dependent agents continue.
- Integration owner verifies final branch head, commit ancestry, CI checks and package contents before reporting phase completion.

## 15. Repository validation and definition of done

Use current repository validation checklist unless live AGENTS.md changes:

~~~bash
npm run typecheck
npm run typecheck:test
npm run lint
npm test
npm run build
npm run check:dist
npm pack --dry-run
cd packages/local-worker
python -m ruff check .
python -m mypy air_local
python -m pytest -q
~~~

Also run targeted tests for changed modules and gated integration tests when runtime is available. Do not claim a live Ollama/model integration test passed if it was skipped or run against a fake provider.

A work package is complete only when:
- implementation matches its contract and acceptance criteria;
- targeted and required regression tests pass;
- no existing safety invariant regressed;
- relevant docs/help/status/config examples are updated;
- task ledger and handoff are complete;
- branch/commit/PR state is verified;
- CI is green for integrated commit, or an explicit blocker is recorded with exact missing evidence.

## 16. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Small local models produce malformed actions/plans | Strict schemas, bounded retries, deterministic fallback, evaluation gate |
| Model quality varies by task | Role-specific benchmark; user-overridable role assignments |
| 6 GB VRAM is insufficient for simultaneous models | One active generative model by default; serialized switches; conservative context |
| Context window claims mislead resource planning | Benchmark practical context and measure memory/latency |
| Provider/model identity is confused with adapter identity | Separate registries and routing layers |
| Config split between TypeScript and Python drifts | One effective config source, versioned contract, cross-language tests |
| Model prompt injection from repository/web content | Treat retrieved content as untrusted; policy outside prompt; typed actions only |
| External providers leak private source | Explicit per-provider egress policy and approval |
| Reviewer model misses a defect | Deterministic tests/evidence remain authoritative; seeded reviewer evaluation |
| Multiple AIs conflict on shared files | Work-package ownership, separate branches, one integration owner |
| Setup downloads too much or fails midway | Show sizes, explicit consent, sequential resumable pulls, idempotent setup |
| Optional utility SDKs add platform/licensing risk | Separate spikes; no core dependency until verified |

## 17. Decisions still requiring explicit confirmation during L0

1. Whether role assignments live in existing global config under a new models section or in a dedicated model config file. Prefer one source of truth; decide based on current loader/migration ergonomics.
2. Exact role names and whether task_analyst is separate from planner or initially merged.
3. Whether reviewer is mandatory for all write tasks or only risk-tiered tasks in first release.
4. Whether Ollama APIs expose enough runtime/resource state for first resource manager or require conservative heuristics/manual profile overrides.
5. Whether embeddings/semantic retrieval deliver enough value to justify index lifecycle and privacy complexity in first release.
6. Which second provider, if any, is worth supporting after local Ollama is proven.
7. Which Desert Ant utility (if any) has a concrete user-facing requirement and acceptable Windows/runtime/license footprint.

Do not block L1/L2 on optional Desert Ant or hosted-provider choices.

## 18. Immediate next step

Start with **Phase L0** and create/maintain the active ledger in docs/reviews/tasks_air_13.md. Do not begin broad implementation until:
- current branch/CI baseline is freshly verified;
- end-to-end request path is mapped against live code;
- provider, role, config and job-contract boundaries are agreed;
- work packages are assigned with non-overlapping file ownership.

The first implementation vertical slice should be deliberately small: **a local Ollama-backed coordinator that can answer or emit one validated spawn_job action, with deterministic fallback and tests, while leaving existing execution and permission control intact.** Expand to LLM planning, role-aware coding and independent review only after that slice is stable.
