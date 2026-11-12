# Independent architecture and implementation review — AIR local-first L0

**Status:** Required independent review gate before L3 resource lifecycle and L4 coordinator implementation.  
**Target repository:** https://github.com/radmanmilos/air  
**Target branch/commit:** main at 6b71e6180ce5de18e912f7ecd542366c18fb4701  
**Merged implementation PRs:** [#1](https://github.com/radmanmilos/air/pull/1), [#2](https://github.com/radmanmilos/air/pull/2), [#3](https://github.com/radmanmilos/air/pull/3)

## Purpose

Perform an independent, adversarial review of the actual implementation and remaining architecture before AIR proceeds to resource-aware model lifecycle management or a local-first coordinator. The integration owner has recorded decisions and implemented the first provider/config/evaluation foundations; that is not independent approval.

Do not make source edits. Review the live code at the target commit, distinguish verified facts from inferences/recommendations, and challenge the decisions rather than endorsing the plan by default.

## Required reading

1. AGENTS.md and docs/reviews/tasks_air_13.md (active task ledger).
2. docs/architecture/local-first-ai-plan.md.
3. docs/architecture/local-first-l0-baseline.md.
4. docs/architecture/local-first-evaluation.md.
5. docs/adapters/model-providers.md and docs/configuration/model-roles.md.
6. docs/configuration/schema.md and relevant config migration documentation.
7. src/models/types.ts, src/models/providers/provider.ts, src/models/providers/ollama.ts, provider/model registry and role resolver implementation.
8. src/config/schema.ts, src/config/loader.ts and migration code.
9. src/evals/runner.ts, scripts/eval-models.ts, tests/evals/runner.test.ts and tests/evals/fixtures/**.
10. Relevant CLI/MCP conversation paths, contracts/job.schema.json, Python worker request/model selection and their tests.

Use GitHub history/diffs for PRs #1-#3 as needed. Verify the latest main SHA and CI runs rather than relying on this prompt's snapshot.

## Review questions

### A. Configuration and trust boundary
- Are model/provider assignments truly global-only? Can repo .airrc.yaml influence provider, model, egress, secrets or model lifecycle indirectly?
- Is v1-to-v2 migration atomic, idempotent, permission-preserving and safe on malformed/future configs?
- Are default roles/models appropriate, and are hosted provider IDs rejected until explicit user consent and support exist?

### B. Provider API and Ollama implementation
- Are request/response types genuinely provider-neutral?
- Are chat/tool-call/JSON/vision/thinking/embedding mappings correct for the Ollama API versions AIR claims to support?
- Are timeouts, cancellation, malformed responses, 404/429/5xx and offline health classified correctly?
- Are capabilities reported only when runtime-declared, with unknown kept unknown?
- Is /api/ps optional and is reported per-model VRAM correctly distinguished from free GPU memory?

### C. Registries, role resolution and lifecycle
- Is provider registry separation from execution adapters sound?
- Does model registry preserve digest, tag, size, capabilities and context without inventing metadata?
- Does role resolution fail closed when provider/model is unavailable or disabled?
- Is the one-active-generative-model policy actually enforced yet, or only documented? What exact provider lifecycle API is required to unload/switch models safely without unloading models owned by other applications?
- What resource telemetry is realistically available on Windows 11 with an RTX 3060 Laptop 6GB?

### D. Evaluation fixtures and runner
- Do the 20/12/12/8/8/10/8/10 scenario counts and concrete payloads cover their stated oracles?
- Are hidden scoring oracles excluded from generation prompts, including nested payload fields?
- Does the coder workspace copier prevent path/symlink escape and guarantee cleanup/isolation?
- Does the runner reliably refuse missing models without any pull/install call?
- Are warm-up/repetition semantics, JSONL output, model digest, prompt version, context, host/timing/RSS and best-effort /api/ps metrics sufficient and accurately labelled?
- Are embedding corpus/query labels correct, including the superseded role document, lexical distractor and no-match case?
- What additional tests are required before live model comparisons?
- The runner currently stores raw generation proposals and computes embedding Recall@5/MRR; it does not execute tools, apply coder patches or automatically score all generation suites. Is that limitation clear and safe?

### E. Coordinator, MCP/CLI and worker contract
- The current CLI/MCP chat path still uses heuristic action selection; the new model runtime is not wired into it. Is the proposed first coordinator vertical slice appropriately bounded?
- What exact versioned worker request is needed to pass a TypeScript-resolved role/provider/model while preserving strict v1 compatibility?
- Which state transitions, permissions, cancellation, worktree operations, schema validation and success decisions must remain deterministic?
- Are there MCP parity or stale conversation persistence/cancellation issues that must be fixed before coordinator integration?

### F. Evaluation thresholds and reference profile
- Are the proposed quality, safety, latency and retrieval thresholds defensible for the reference Windows 11 / Ryzen 7 5800H / 16GB RAM / RTX 3060 Laptop 6GB machine?
- Which thresholds should be hard gates, provisional targets or removed until a baseline exists?
- What minimum live repetitions, hardware state and model/prompt digest controls are required?
- What would invalidate a model recommendation?

## Required response format

1. **Verdict:** ACCEPT / ACCEPT WITH REQUIRED CHANGES / REJECT.
2. **Blocking findings:** P0/P1, each with exact file/line or symbol, impact, reproducible scenario and required fix.
3. **Non-blocking findings:** P2/P3, prioritized.
4. **Decision table:** accept / revise / reject each current architecture decision, with rationale.
5. **Missing tests:** concrete test names and expected assertions.
6. **Interface freeze:** proposed provider, model registry, role resolver, resource lifecycle and worker-v2 interfaces.
7. **Next bounded implementation package:** smallest safe scope after findings are reconciled.
8. **Evidence:** exact main SHA, PRs/commits inspected, CI run IDs/conclusions and commands actually run. Do not claim local tests were executed unless they were.

## Constraints

- Do not edit source or docs.
- Do not assume the current implementation is correct because it is already merged.
- Do not claim live model benchmark results; none have been executed yet.
- Do not recommend automatic model downloads or hosted fallback.
- Keep provider/runtime, execution adapters and deterministic AIR control plane separate.
- Be explicit about any source or CI evidence you could not access.
