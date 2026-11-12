# Independent AI Review Assignment — AIR Local-First L0

**Review target:** [PR #1](https://github.com/radmanmilos/air/pull/1)  
**Base:** `main` at `35c7300569df2568dbd2cec97a4f6cc232533cc5`  
**Review branch:** `work/local-first-l0-baseline`  
**Purpose:** Independent challenge of L0 architecture decisions before model runtime/config/worker-contract implementation begins.

## Role and boundaries

Act as an independent senior architect and application-security reviewer. Review the design and evidence; do not implement code or push commits. Your task is to find incorrect assumptions, unsafe boundaries, missing compatibility requirements, or choices that would make multiple implementation agents diverge.

Do not approve a decision merely because it is already written in the blueprint. Compare it with live source at the stated base and the PR diff. If the source differs, cite the exact path and symbol. Clearly label verified facts, inference and recommendations.

## Read in this order

1. `AGENTS.md`
2. `docs/architecture/local-first-ai-plan.md`
3. `docs/reviews/tasks_air_13.md`
4. `docs/architecture/local-first-l0-baseline.md`
5. `docs/architecture/local-first-evaluation.md`
6. `docs/adapters/chat-providers.md`
7. The PR diff and the live source paths cited by the baseline investigation.

Relevant current source includes `src/config/schema.ts`, `src/config/loader.ts`, `src/config/paths.ts`, `src/conversation/actions.ts`, `src/conversation/decide.ts`, `src/conversation/chat-provider.ts`, `src/brain/index.ts`, `src/adapters/local.ts`, `src/orchestrator/orchestrator.ts`, `contracts/job.schema.json`, `src/contracts/job.ts`, `packages/local-worker/air_local/run.py`, `loop.py`, `models.py`, `ollama.py` and `config.yaml`.

## Questions that must be answered

### A. Configuration and trust
- Is global user config the correct single source for role/provider assignments?
- Is the proposed `models` section correctly excluded from untrusted repository `.airrc.yaml`?
- Are provider secrets, external egress, local model URLs and user overrides protected?
- Is the migration v1→v2 plan non-destructive, idempotent and compatible with existing settings?

### B. Role model
- Are `coordinator`, `planner`, `coder`, `reviewer`, `reasoner`, `summarizer`, `embeddings` the right initial roles?
- Should task analysis be a separate role or remain part of planner?
- Are role selection and execution adapter selection cleanly separated?

### C. Provider API and model registry
- Is the proposed typed API sufficient for chat, tool calls, structured output, embeddings, health, model discovery, cancellation and diagnostics?
- Are capabilities declared/observed rather than guessed from model names?
- Is the proposed error taxonomy complete and distinct from process/adapter errors?
- What minimum Ollama endpoints and compatibility behavior should L1 support?

### D. Worker contract and configuration source of truth
- Does the proposed versioned request carry enough information for role/model/provider settings without allowing the Python worker to re-resolve roles?
- Should Ollama base URL/keep-alive be passed in the request or generated per-run config?
- Is v1 compatibility/version negotiation safe given `additionalProperties: false` and separate TypeScript/Python validators?
- Can worker-only settings remain in `packages/local-worker/config.yaml` without duplicating model/provider authority?

### E. Resource policy and safety
- Is one active generative model the correct conservative default for the 16 GB RAM / 6 GB VRAM reference machine?
- What should happen when resource probes fail or Ollama reports incomplete runtime data?
- Are queue priority, cancellation, model switching and unload failure behavior sufficiently specified?
- Are the boundaries clear that model output cannot grant permissions, invoke arbitrary processes, authorize paid providers, or decide task success?

### F. Evaluation design
- Are the suite sizes, repeat protocol, metrics and proposed thresholds meaningful?
- Which fixtures are not sufficiently executable/deterministic?
- Are any quality thresholds too strict, too weak, or misleading for the reference hardware?
- What should block a model recommendation versus merely mark it experimental?

### G. Lifecycle and test coverage
- Does the CLI/MCP call graph match the actual code?
- Are the documented `chat_send` acknowledgement/cancel/stale-object issues accurate?
- What tests must exist before the first coordinator vertical slice can be accepted?

## Required review output

Return a concise but evidence-heavy report in this structure:

1. **Verdict:** ACCEPT / ACCEPT WITH REQUIRED CHANGES / REJECT.
2. **Blocking findings:** numbered, severity P0–P2, exact file/symbol or line, evidence, consequence, minimal correction.
3. **Non-blocking findings:** severity P3, rationale and suggested follow-up.
4. **Decision table:** each proposed L0 decision marked ACCEPT / CHANGE / DEFER, with reason.
5. **Missing acceptance tests:** exact test scenarios and expected oracle.
6. **Recommended interface freeze:** concrete TypeScript types/config fields/worker contract fields that should be frozen before parallel agents start.
7. **Handoff:** which L0 items can close, which remain open, and which bounded package should start next.

Do not make source edits. Do not claim CI is green unless you verify the run for the exact PR head SHA. Do not treat model-generated prose as evidence. The goal is to make the next implementation agent able to start without guessing.
