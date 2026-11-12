# AIR — Local-First Intelligence Implementation Ledger

**Blueprint:** [docs/architecture/local-first-ai-plan.md](../architecture/local-first-ai-plan.md)  
**Status:** L0 IN PROGRESS / L1 provider vertical slice in progress  
**Created:** 2026-11-12  
**Baseline inspected:** main at 35c7300569df2568dbd2cec97a4f6cc232533cc5  
**Rule:** This is the active task ledger for the local-first intelligence milestone. Update it in every implementation PR. The blueprint defines architecture and acceptance; this file tracks execution state and ownership.

## Operating rules for this ledger

- One work package has one accountable owner/integration agent at a time.
- Parallel agents must have disjoint file ownership or agree a shared contract before editing.
- Every status change includes agent, PR/commit, tests and handoff.
- Allowed statuses: TODO, READY, IN_PROGRESS, BLOCKED, DONE, DEFERRED.
- Do not mark DONE while required tests/CI are missing.
- Re-check current main HEAD, branches and CI before starting each task.
- Never force-push or rewrite shared history; preserve unrelated work.
- A package that changes a shared schema/config/contract must include migration and compatibility tests.
- The integration owner maintains the blueprint when design decisions change.

## Milestone overview

| Phase | Goal | Status | Depends on |
|---|---|---|---|
| L0 | Baseline and executable design gate | IN_PROGRESS | None |
| L1 | Provider-neutral runtime + Ollama | IN_PROGRESS | L0 (owner boundary review accepted; independent review open) |
| L2 | Model registry, capabilities, role config | IN_PROGRESS | L0, L1 |
| L3 | Resource-aware model manager | TODO | L1, L2 |
| L4 | Local LLM coordinator/front agent | TODO | L1, L2 |
| L5 | LLM planner + validated work graph | TODO | L1, L2, L4 |
| L6 | Role-aware local execution/coder | TODO | L1, L2, L3, L5 |
| L7 | Reviewer + evidence-based completion | TODO | L1, L2, L6 |
| L8 | Context, summarization, optional embeddings | TODO | L1, L2, L4 |
| L9 | Model setup and first-run UX | TODO | L2, L3 |
| L10 | Optional providers and specialized utilities | DEFERRED | L1-L9 as applicable |

## L0 — Baseline and executable design gate

**Phase status:** IN_PROGRESS  
**Exit gate:** architecture contracts and baseline evidence are recorded; no implementation begins beyond isolated spikes until L0 is accepted. See [L0 baseline investigation](../architecture/local-first-l0-baseline.md) and [evaluation plan](../architecture/local-first-evaluation.md).

### L0-01 — Refresh repository and CI baseline

- Status: DONE
- Owner: integration agent
- Evidence: baseline SHA `35c7300569df2568dbd2cec97a4f6cc232533cc5`; only `main` branch returned. CI run [43218386531](https://github.com/radmanmilos/air/actions/runs/43218386531) completed successfully: Node Ubuntu/Windows, Python 3.12/3.14 Ubuntu/Windows, and real-binary smoke tests all passed. No local clone/commands were run.
- Scope: verify repository access, default branch/head, all active branches, recent commits, workflow runs/checks for current head, clean/dirty local worktree when using a clone.
- Required output: exact baseline SHA; branch list; CI run/check links and conclusions; tests/commands run locally; any unavailable evidence explicitly marked.
- Acceptance: no statement that CI is green without a run/check tied to the exact SHA.

### L0-02 — Map the current end-to-end request lifecycle

- Status: DONE
- Owner: integration agent
- Evidence: [L0 baseline investigation](../architecture/local-first-l0-baseline.md), including CLI/MCP sequence diagrams, exact call sites, local worker path, current test coverage and discrepancies. Baseline commit: `35c7300569df2568dbd2cec97a4f6cc232533cc5`.
- Scope: trace CLI and MCP user turn through conversation persistence, action handling, planner, orchestrator, adapter, local worker, result compilation and result injection.
- Expected files to inspect: bin/air.ts; src/conversation/*; src/planner/*; src/orchestrator/*; src/adapters/*; src/execution/*; src/result-compiler/*; src/mcp/*; packages/local-worker/air_local/*; contracts/*.
- Required output: sequence diagram or call graph, actual call sites, gaps and tests proving each path.
- Acceptance: distinguish code that exists from code that is wired and exercised end-to-end.

### L0-03 — Freeze provider, role, config and contract boundaries

- Status: IN_PROGRESS
- Owner: integration agent; independent reviewer still required
- Integration-owner review completed 2026-11-12; disposition and explicit non-independent status recorded in [L0 baseline investigation](../architecture/local-first-l0-baseline.md). The global-only model-config boundary, seven logical roles, provider/adapter separation, typed provider API, canonical error taxonomy, and conservative one-generative-model default are accepted as the implementation direction. Exact config-v2 fields/migration and worker contract-v2 remain unfrozen until their compatibility tests are designed. No independent AI review has been supplied; the review assignment remains open.
- Scope: settle provider interface, model registry record, role names, role request/response contracts, config v2 shape, migration behavior, resource policy, error taxonomy, worker request contract and compatibility strategy.
- Files: blueprint; src/config/schema.ts; src/config/loader.ts; migration module; src/types/*; contracts/job.schema.json; Python contract.
- Acceptance: decisions and rejected alternatives recorded in blueprint; one source of truth for effective configuration; TS/Python contract compatibility test plan.

### L0-04 — Define benchmark fixtures and evaluation thresholds

- Status: IN_PROGRESS
- Owner: integration agent; evaluation agent/reviewer to validate
- Evidence: [local-first evaluation plan](../architecture/local-first-evaluation.md) defines suites, minimum fixture counts, repeat protocol, metrics and provisional acceptance gates. Eight version-controlled scenario catalogs are present and JSON-validated: 20 coordinator, 12 planner, 12 tool-calling, 8 coder, 8 debugging, 10 reviewer, 8 summarizer and 10 embeddings cases. Concrete payloads/corpora for several suites and an executable runner remain outstanding.
- Scope: create deterministic coordinator, planner, tool-call, coding, debugging, review, summarization and embedding fixtures; define repeat count and metrics before model comparison.
- Files: `tests/evals/fixtures/*.json`; `docs/architecture/local-first-evaluation.md`; future `scripts/eval*` / `tests/evals/**`.
- Subtasks:
  - L0-04a [DONE]: create eight scenario catalogs with stable IDs and expected oracle classes (20/12/12/8/8/10/8/10 cases); validate JSON and align tool names with the current worker registry.
  - L0-04b [TODO]: create executable payloads/corpora for coder, debugging, reviewer, summarizer and embeddings; create a temporary-workspace harness; do not modify shared fixtures.
  - L0-04c [TODO]: implement a repeatable eval runner after L1 provider interfaces are frozen; record provider/model digest, prompt version, context, timing and resource metrics; never auto-pull models.
  - L0-04d [TODO]: independent review of thresholds and scoring oracles before comparing models.
- Acceptance: fixtures contain no private repository/user data; expected outcomes are deterministic; thresholds are explicit and reviewed before claiming a model is recommended.

## L0 integration handoff (2026-11-12)

- Integration owner: ChatGPT (current session); no other agent has been assigned or has write ownership.
- Base commit: `35c7300569df2568dbd2cec97a4f6cc232533cc5`.
- Working branch: `work/local-first-l0-baseline`.
- Documentation/fixture catalog, provider runtime, version-2 global model config, migration and initial role resolver commits are present on this branch. The authoritative current branch head is the live `head.sha` on [PR #1](https://github.com/radmanmilos/air/pull/1); re-check it before taking over.
- Baseline CI: [43218386531](https://github.com/radmanmilos/air/actions/runs/43218386531) completed successfully; Node Ubuntu/Windows, Python 3.12/3.14 Ubuntu/Windows and real-binary smoke tests all passed.
- L0-01 baseline and CI verified; L0-02 call graph documented. L0-03 has an integration-owner disposition but still lacks independent review and exact config/worker migration tests. L0-04 has eight scenario catalogs (20/12/12/8/8/10/8/10 cases); executable payloads/corpora and the evaluation runner remain outstanding.
- L1 provider API/Ollama slice and L2 provider/model registries, global-only model config and role resolution are in progress on this same feature branch. Latest full CI run 282 is green for the current code/doc head 46233ecd. They are not wired into CLI/MCP or the Python worker. No local tests were run because no clone/worktree is available in this session. Re-check GitHub CI for the exact current PR head.
- Current implementation includes typed provider contracts, Ollama chat/tool calls/embeddings/metadata/health, provider and model registries, v2 model-role defaults, v1 migration and a no-fallback role resolver. L0-03 still needs independent review; L0-04b/c/d remain outstanding.
- Next: keep the provider/config foundation stable; complete concrete evaluation payloads and a temporary-workspace harness (L0-04b); add persistent inventory/eligibility explanations and resource scheduling; then integrate the coordinator only after the independent review and worker boundary tests.

## L1 — Provider-neutral model runtime and Ollama provider

**Phase status:** IN_PROGRESS. The initial provider slice is isolated from config, role resolution, worker contract and conversation dispatch.

### L1-01 — Define normalized model API
- Status: IN_PROGRESS
- Owner: integration agent
- Evidence: src/models/types.ts and src/models/providers/provider.ts define typed messages, tool calls, chat/embedding requests and responses, model metadata, health, usage/timing and normalized provider errors. Implementation commit(s) are on PR #1; exact-head CI validation is pending.
- Depends on: L0-03
- Scope: request/response/message/tool/usage/capability/error types; cancellation and timeout semantics.
- Likely files: src/models/types.ts; src/models/providers/provider.ts; tests.
- Acceptance: contract is provider-neutral and does not assume every provider supports every capability.

### L1-02 — Implement Ollama provider
- Status: IN_PROGRESS
- Owner: integration agent
- Evidence: `src/models/providers/ollama.ts` implements native fetch transport for chat/tool calls, embeddings, health, installed/model metadata and optional running-model diagnostics. It does not start Ollama or pull models. See [model provider runtime](../adapters/model-providers.md).
- Depends on: L1-01
- Scope: wrap/refactor existing Ollama transport behind provider API; support chat, tool calls, structured output where supported, embeddings, tags/model info and health.
- Likely files: src/models/providers/ollama.ts; packages/local-worker/air_local/ollama.py only if a shared worker concern requires it.
- Acceptance: fake-provider unit tests plus gated live Ollama integration; consistent error taxonomy.

### L1-03 — Provider conformance and failure tests
- Status: IN_PROGRESS
- Owner: integration agent
- Evidence: `tests/models/ollama.test.ts` covers chat/tool-call mapping, embeddings, discovery, health/offline behavior, missing model, rate limiting, cancellation, timeout and malformed responses. Tests have not been run locally; exact-head GitHub CI is required before marking DONE.
- Depends on: L1-01, L1-02
- Scope: provider conformance suite; timeout, cancellation, offline, unsupported capability, malformed response and rate-limit behavior.
- Acceptance: deterministic tests do not require a live Ollama service.

## L2 — Model registry, capabilities and role configuration

### L2-01 — Model registry and capability metadata
- Status: IN_PROGRESS
- Owner: integration agent
- Evidence: src/models/provider-registry.ts keeps model API providers separate from execution adapters and rejects duplicate/unknown provider IDs. src/models/model-registry.ts tracks discovered models with available/missing/unknown state, checked-at timestamps and provider-declared capabilities; missing metadata remains unknown and model names are never used to infer capability. Tests are in tests/models/registry.test.ts. Persistence, eligibility explanations and runtime integration remain open.
- Depends on: L1
- Scope: separate declared metadata from observed availability; provenance and verification timestamp; no capability inference solely from model name.
- Acceptance: resolver can explain why a model is eligible or rejected.

### L2-02 — Config v2 roles/providers and migration
- Status: IN_PROGRESS
- Owner: integration agent
- Evidence: version-2 Zod config adds global-only local model/provider settings and seven role assignments. Repo .airrc.yaml model settings are stripped; hosted provider IDs are rejected. The v1 migration validates before writing, preserves existing YAML/comments and file permission bits, is idempotent, refuses future versions, and never downloads models. See docs/configuration/model-roles.md. CI run 43249500871 (run 282) passed on commit 46233ecd279c5e125295698b55464d74b04e9fe5: Node 22 Ubuntu/Windows, Python 3.12/3.14 Ubuntu/Windows, package smoke tests and real-binary smoke tests all green. An intermediate registry run caught one unused exported type, now made internal. Re-check exact-head CI after any further commits.
- Depends on: L0-03, L1
- Scope: add providers, role assignments, local-first policy, resource policy and external fallback consent; migrate v1 safely.
- Likely files: src/config/schema.ts; src/config/loader.ts; current migration module; tests and config docs.
- Acceptance: v1 migration is idempotent, non-destructive and preserves existing settings; untrusted repo config cannot self-authorize providers or external egress.

### L2-03 — Role resolver
- Status: IN_PROGRESS
- Owner: integration agent
- Evidence: src/models/role-resolver.ts resolves logical role to the configured Ollama model/endpoint/resource intent and fails closed when the provider is disabled. It does not probe model availability or silently fall back; registry/capability checks remain future work.
- Depends on: L2-01, L2-02
- Scope: role → provider/model selection with capability, availability, resource and user-policy filters; explainable decisions.
- Acceptance: no silent paid fallback; role assignment is independent of execution adapter.

### L2-04 — Local adapter and worker contract alignment
- Status: TODO
- Owner: unassigned
- Depends on: L2-02, L2-03
- Scope: remove hardcoded model identity from LocalAdapter; propagate role/model in a versioned job request; converge worker config with canonical effective config.
- Likely files: src/adapters/local.ts; contracts/job.schema.json; TS/Python contract validators; packages/local-worker/air_local/run.py; models.py; tests.
- Acceptance: configured coder role reaches the Ollama request; no stale worker default overrides it.

## L3 — Resource-aware model manager

### L3-01 — Hardware/runtime probes
- Status: TODO
- Owner: unassigned
- Depends on: L1
- Scope: best-effort OS/RAM/GPU/VRAM/Ollama/model availability; conservative fallback profile.
- Acceptance: probe failures are bounded and do not block core CLI startup.

### L3-02 — Model lifecycle queue and resource policy
- Status: TODO
- Owner: unassigned
- Depends on: L2, L3-01
- Scope: serialize model loads/switches/unloads; default one resident generative model for reference profile; cancellation-aware priority.
- Acceptance: concurrent AIR jobs cannot race model lifecycle operations; model switching and unload behavior are tested.

### L3-03 — Resource diagnostics and stress tests
- Status: TODO
- Owner: unassigned
- Depends on: L3-02
- Scope: expose detected profile, active/queued role and provider state; test memory pressure, offline runtime, slow load and failed unload.
- Acceptance: never equate disk model size with exact VRAM usage.

## L4 — Local LLM coordinator/front agent

### L4-01 — Coordinator prompt and bounded context
- Status: TODO
- Owner: unassigned
- Depends on: L1, L2
- Scope: role prompt, context builder, provenance, redaction, message budget.
- Acceptance: context excludes secrets and untrusted content cannot override policy.

### L4-02 — Typed model-backed decision loop
- Status: TODO
- Owner: unassigned
- Depends on: L4-01
- Scope: call coordinator role; parse ActionSchema; dispatch answer/clarify/status/cancel/spawn through deterministic services.
- Acceptance: malformed/unknown actions are rejected; no raw model output invokes processes.

### L4-03 — CLI/MCP parity and responsive conversation
- Status: TODO
- Owner: unassigned
- Depends on: L4-02
- Scope: both interfaces call the same conversation decision service; background jobs do not block input.
- Acceptance: scripted CLI and MCP tests prove same action semantics and safe stdout framing.

### L4-04 — Coordinator evaluation and adversarial tests
- Status: TODO
- Owner: unassigned
- Depends on: L4-02
- Scope: golden set, ambiguity, prompt injection, malformed JSON, action limit and fallback behavior.
- Acceptance: acceptance metrics defined in L0 are met or gaps are documented.

## L5 — LLM planner and validated work graph

### L5-01 — Planner schema and prompt
- Status: TODO
- Owner: unassigned
- Depends on: L1, L2, L4
- Scope: work item role/capabilities/risk/context requirements, acceptance criteria and prompt.
- Acceptance: output schema and semantic constraints documented.

### L5-02 — Planner invocation and DAG validation
- Status: TODO
- Owner: unassigned
- Depends on: L5-01
- Scope: invoke planner; validate unique IDs, dependencies, acyclic graph, limits, permissions and resource budget.
- Acceptance: invalid/unsafe plan never reaches scheduler.

### L5-03 — Deterministic fallback and plan integration
- Status: TODO
- Owner: unassigned
- Depends on: L5-02
- Scope: retain heuristic fallback, trace fallback use, schedule dependency order, prevent unsafe parallel writers.
- Acceptance: one-item edits remain focused; review/edit dependency test passes.

## L6 — Role-aware local execution and coder integration

### L6-01 — Role propagation through task lifecycle
- Status: TODO
- Owner: unassigned
- Depends on: L2, L5
- Scope: TaskInput and job contract carry role/model/capability request without trusting caller-provided policy.
- Acceptance: role metadata survives request serialization and is validated on both TS and Python sides.

### L6-02 — Bundled worker coder role
- Status: TODO
- Owner: unassigned
- Depends on: L6-01, L3
- Scope: worker selects resolved role/model; tool registry remains policy-limited; model changes are resource-managed.
- Acceptance: live or gated Ollama test proves selected model used; worker security tests remain green.

### L6-03 — Optional adapter compatibility
- Status: TODO
- Owner: unassigned
- Depends on: L6-01
- Scope: optional coding CLIs receive same task, workspace, permissions and evidence contract.
- Acceptance: AIR remains fully usable with external adapters absent.

## L7 — Reviewer and evidence-based completion

### L7-01 — Reviewer role schema/prompt
- Status: TODO
- Owner: unassigned
- Depends on: L1, L2
- Scope: structured findings, severity, evidence references and criteria mapping.
- Acceptance: reviewer cannot emit state transitions or permission grants.

### L7-02 — Evidence context and deterministic completion gate
- Status: TODO
- Owner: unassigned
- Depends on: L6, L7-01
- Scope: diff/test/process evidence, reviewer findings and configurable reviewer-outage policy.
- Acceptance: model prose cannot override process/test/security failures.

### L7-03 — Seeded-defect reviewer evaluation
- Status: TODO
- Owner: unassigned
- Depends on: L7-02
- Scope: seeded bugs, false-positive tests, traceable findings and result compiler integration.
- Acceptance: benchmark thresholds from L0 are met or reviewer role remains advisory.

## L8 — Context, summarization and optional embeddings

### L8-01 — Role-specific context budgets
- Status: TODO
- Owner: unassigned
- Depends on: L4
- Scope: bounded context packer for coordinator/planner/coder/reviewer/summarizer.
- Acceptance: context is redacted, relevant and budgeted.

### L8-02 — Summarizer and safe compaction
- Status: TODO
- Owner: unassigned
- Depends on: L8-01
- Scope: preserve constraints, decisions, facts, identifiers, active work and open questions.
- Acceptance: compaction tests prove critical details survive.

### L8-03 — Optional embeddings/retrieval
- Status: DEFERRED
- Owner: unassigned
- Depends on: L1, L2, L8-01
- Scope: evaluate whether semantic retrieval materially improves repository/context recall; keep lexical retrieval fallback.
- Acceptance: privacy, invalidation, storage and retrieval quality are tested before enabling by default.

## L9 — Model setup and first-run UX

### L9-01 — Model doctor/status
- Status: TODO
- Owner: unassigned
- Depends on: L2, L3
- Scope: report provider, roles, installed models, capabilities, resource profile and missing prerequisites.
- Acceptance: diagnostics distinguish unavailable provider, missing model and unsupported capability.

### L9-02 — Model management commands
- Status: TODO
- Owner: unassigned
- Depends on: L9-01
- Scope: list/recommend/test/pull/assign/status commands; preserve existing air models behavior.
- Acceptance: CLI help, docs and tests match actual behavior.

### L9-03 — Consent-based install and profile recommendations
- Status: TODO
- Owner: unassigned
- Depends on: L9-02
- Scope: display model size/disk needs/role/capability; explicit approval; sequential and recoverable downloads.
- Acceptance: no silent multi-GB downloads; interrupted setup is recoverable.

## L10 — Optional providers and specialized local utilities

### L10-01 — Second provider spike
- Status: DEFERRED
- Owner: unassigned
- Depends on: L1-L9 as applicable
- Scope: evaluate one provider based on concrete need and conformance; no provider commitment in advance.
- Acceptance: local path remains default and works when external providers are disabled.

### L10-02 — Explicit hosted-provider fallback
- Status: DEFERRED
- Owner: unassigned
- Depends on: L2, security review
- Scope: per-role provider opt-in, secret handling, egress and paid-consent flow.
- Acceptance: no hosted call without explicit configured consent; audit record proves scope.

### L10-03 — Desert Ant utility spike
- Status: DEFERRED
- Owner: unassigned
- Depends on: concrete product requirement
- Scope: evaluate a single utility (PII redaction/classification/voice etc.) for Windows support, license, dependencies and measurable value.
- Acceptance: standalone spike report; no core dependency until approved.

## Standard handoff record

Copy this into the PR description or update the relevant package entry at the end of each agent session:

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

## Phase completion checklist

- [ ] All work packages in phase have an owner and final status.
- [ ] Contracts and architectural decisions are reflected in the blueprint.
- [ ] Targeted tests and full validation checklist pass.
- [ ] Windows and Ubuntu CI results are verified for the integrated commit.
- [ ] Docs, CLI help, status output and config examples match reality.
- [ ] Independent review completed for high-risk changes.
- [ ] Handoff records and next-phase dependencies are complete.
- [ ] Final commit/PR/head SHA recorded below.

## Phase records

| Phase | Integrated commit / PR | CI evidence | Reviewer | Completion date |
|---|---|---|---|---|
| L0 | — | — | — | — |
| L1 | — | — | — | — |
| L2 | — | — | — | — |
| L3 | — | — | — | — |
| L4 | — | — | — | — |
| L5 | — | — | — | — |
| L6 | — | — | — | — |
| L7 | — | — | — | — |
| L8 | — | — | — | — |
| L9 | — | — | — | — |
| L10 | — | — | — | — |
