# AIR — Local-First Intelligence Implementation Ledger

**Blueprint:** [docs/architecture/local-first-ai-plan.md](../architecture/local-first-ai-plan.md)
**Status:** L0-04a/b/c implementation DONE; L0-03 independent architecture review and L0-04d scoring review OPEN; L0-05 reconciliation IN_PROGRESS on `fix/l0-05-p0-conversation-atomic` (P0-01, P1-01, P1-02, P1-03 and P1-05 fail-closed increment CI-verified for exact SHAs; P1-05 execution/oracles remain PARTIAL, P1-04/P1-06 residuals, P1-07, P2 open) / L1-L2 integration remains IN_PROGRESS
**Created:** 2026-11-12
**Historical baseline inspected:** main at 35c7300569df2568dbd2cec97a4f6cc232533cc5
**Current main baseline:** f5e45a345f430b96d66933838944469886879689 (independent review merged; CI run 43278214645 passed)
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
- Evidence: [local-first evaluation plan](../architecture/local-first-evaluation.md) defines suites, minimum fixture counts, repeat protocol, metrics and provisional acceptance gates. Eight scenario catalogs, concrete synthetic payloads/corpora, fixture-integrity tests, isolated coder workspace harness and the first repeatable Ollama runner are merged. PR #3 exact-head CI run 301 passed. No live model benchmark has been executed.
- Scope: create deterministic coordinator, planner, tool-call, coding, debugging, review, summarization and embedding fixtures; define repeat count and metrics before model comparison.
- Files: `tests/evals/fixtures/*.json`; `docs/architecture/local-first-evaluation.md`; future `scripts/eval*` / `tests/evals/**`.
- Subtasks:
  - L0-04a [DONE]: create eight scenario catalogs with stable IDs and expected oracle classes (20/12/12/8/8/10/8/10 cases); validate JSON and align tool names with the current worker registry.
  - L0-04b [DONE]: concrete synthetic payloads/corpora and temporary-workspace harness merged in PR #2; exact-head CI runs 297 and 298 passed. Shared fixtures are copied, never edited in place.
  - L0-04c [DONE]: repeatable Ollama runner merged in PR #3. It checks installed models without pulling, records JSONL model/prompt/context/host/timing/runtime metadata and raw outputs for all eight suites, and computes embeddings Recall@5/MRR. Exact-head CI run 301 passed. No live model benchmark has been executed.
  - L0-04d [TODO]: independent review of thresholds and scoring oracles before comparing models.
- Acceptance: fixtures contain no private repository/user data; expected outcomes are deterministic; thresholds are explicit and reviewed before claiming a model is recommended.

## L0-L2 integration handoff (2026-11-12)

- Integration owner: ChatGPT; independent architecture review has not been supplied.
- Historical baseline: 35c7300569df2568dbd2cec97a4f6cc232533cc5.
- PR #1 merged to main at a2dc1e95f3f26a5497e35c19c0af4c70976b1a96; exact-head CI run 286 and main push run 287 passed.
- PR #2 merged to main at 5f82d98cae74b0d2be4360c9b451b708b5a436dc; exact-head CI runs 297 and 298 passed on 4d877676a4865cbb2f402f4d040917f08ae65bfe. Main push CI run 299 passed.
- Merged implementation: provider-neutral TypeScript model API, Ollama chat/tool/embedding transport, health/model discovery, provider registry, in-memory model inventory, global-only config v2, v1 migration, no-fallback role resolver, concrete synthetic eval payloads, coder workspace fixture and isolated workspace helper.
- Important boundary: the model runtime/role resolver is not wired into CLI/MCP chat or the Python worker. The worker still uses worker-local model slots. No job-contract v1 changes were included.
- L0-03 remains IN_PROGRESS: integration-owner decisions are recorded, but independent review and exact worker-v2 compatibility design remain open.
- L0-04a, L0-04b and L0-04c are DONE as implementation packages. L0-04d independent scoring/threshold review remains TODO. No live model results exist.
- PR #3 merged to main at 6b71e6180ce5de18e912f7ecd542366c18fb4701. Exact-head CI run 301 passed on b8b0afa0d449d9add7b1f9c0ccb45b051ee3ae31; main push CI run 303 was in progress at this ledger update.
- No local tests were run because no clone/worktree is available. All reported CI results are tied to the exact PR or merge commit.
- Next gate: obtain an independent review of the merged provider/config/role/runtime/evaluation implementation and scoring thresholds. Reconcile all required P0/P1 findings (P1-03–P1-07 still open) and disposition required P2 items before starting L3 resource lifecycle or L4 coordinator work.
- L0-05 reconciliation started 2026-11-12 on `fix/l0-05-p0-conversation-atomic` (base `f5e45a345f430b96d66933838944469886879689`, CI run 43278214645 success). P0-01 (`fc3d231`, `fda9506`) fixed stale conversation writes; CI [43293203530](https://github.com/radmanmilos/air/actions/runs/43293203530) success for `fda9506`. P1-01 MCP cancellation reconciliation (`c1e474205a6e986cc2f19ff2d01aa03b2977cb05`): linearized on persisted/actual terminal outcomes, preserved COMPLETED/FAILED over cancel, confirmed CANCELLED only when persisted, enforced chat cross-conversation isolation, hardened handle/poller cleanup and `AIR_MOCK_ADAPTER==="1"` seam, fixed orchestrator cancelled terminal persistence, and avoided unhandled spawn-failure rejections in no-adapter environments. CI [43313608385](https://github.com/radmanmilos/air/actions/runs/43313608385) success for `c1e4742` (all jobs green). P1-02 local-only chat answers/no external CLI egress (`cb0880c361e38333687796adbbfc4e9aeeda52bc`, `fix(brain): enforce local-only chat answers without external CLI egress (P1-02)`); CI [43329891518](https://github.com/radmanmilos/air/actions/runs/43329891518) **success** for `cb0880c` (7/7 jobs green). P1-03–P1-07 and applicable P2 remain open; L3/L4 remain BLOCKED.

### L0-05 — Reconcile independent review findings (P0/P1/P2)

- Status: IN_PROGRESS
- Owner: integration agent
- **P1-05 implementation commit:** `02cbaadf9b03aeec0009315f71d0b69ef44fabcb` (`fix(evals): add fail-closed P1-05 safety oracle boundary contract`) — CI [43391210944](https://github.com/radmanmilos/air/actions/runs/43391210944) **completed success, 7/7 jobs**.
- **Latest documentation/branch/PR head before this correction:** `4bd48db041a3b01c7251ceab7055264ffff5a8bf` (`docs(review): record P1-05 fail-closed CI evidence`) on `fix/l0-05-p0-conversation-atomic` (local == origin == PR [#5](https://github.com/radmanmilos/air/pull/5) head at that point). CI [43398692962](https://github.com/radmanmilos/air/actions/runs/43398692962) **completed success, 7/7 jobs** for exact SHA `4bd48db`.
- **Current branch/PR head after this correction:** recorded by the correction commit/CI for this task (see handoff). Historical heads preserved below with exact-SHA evidence.
- P1-03 implementation commit: `42ee626809446d4cd17c44633db890401b2d9688`. Documentation follow-up commit: `1d83ed0d23aa9e2533b5abb208a49dbbf7808916`. Ledger/PR housekeeping: `f16ee789df11775daa86ce1df87e42077c63f705` (CI [43383888852](https://github.com/radmanmilos/air/actions/runs/43383888852) success, 7/7). P1-05 fail-closed sandbox-boundary implementation commit: `02cbaadf9b03aeec0009315f71d0b69ef44fabcb` (CI [43391210944](https://github.com/radmanmilos/air/actions/runs/43391210944) **completed success, 7/7 jobs**). P1-05 evidence-recording documentation commit: `4bd48db041a3b01c7251ceab7055264ffff5a8bf` (CI [43398692962](https://github.com/radmanmilos/air/actions/runs/43398692962) **completed success, 7/7 jobs** for exact SHA). This reconciliation commit is documentation-only and does not add further runtime implementation.
- Baseline CI: main `f5e45a345f430b96d66933838944469886879689` run [43278214645](https://github.com/radmanmilos/air/actions/runs/43278214645) success (all jobs).
- Branch CI (exact SHAs): `fda9506` run [43293203530](https://github.com/radmanmilos/air/actions/runs/43293203530) success (P0-01). `c1e4742` run [43313608385](https://github.com/radmanmilos/air/actions/runs/43313608385) success (P1-01). `cb0880c` run [43329891518](https://github.com/radmanmilos/air/actions/runs/43329891518) **completed success** (P1-02, 7/7 jobs). `42ee626` run [43339234872](https://github.com/radmanmilos/air/actions/runs/43339234872) **completed success** (P1-03 implementation, 7/7 jobs). `1d83ed0` run [43382851018](https://github.com/radmanmilos/air/actions/runs/43382851018) **completed success** (P1-03 follow-up documentation, 7/7 jobs). `f16ee78` run [43383888852](https://github.com/radmanmilos/air/actions/runs/43383888852) **completed success** (ledger/PR housekeeping, 7/7 jobs). `02cbaad` run [43391210944](https://github.com/radmanmilos/air/actions/runs/43391210944) **completed success** (P1-05 fail-closed boundary implementation, 7/7 jobs). `4bd48db` run [43398692962](https://github.com/radmanmilos/air/actions/runs/43398692962) **completed success** (documentation-only evidence record for exact SHA `4bd48db041a3b01c7251ceab7055264ffff5a8bf`, 7/7 jobs). Any subsequent correction commit requires its own exact-SHA CI verification before being claimed CI-verified.
- Scope: reconcile `docs/reviews/independent-review_local-first-l0.md` required changes before L3/L4.

#### P0-01 — Conversation data-loss from stale whole-object writes
- Status: DONE (for `fc3d231`/`fda9506` lineage) — fix committed/pushed, full local tests passed, PR #5 CI run 43293203530 success for head `fda9506`.
- Files: `src/conversation/index.ts`, `bin/air.ts`, `src/mcp/server.ts`, `tests/conversation.test.ts`
- Root cause: `appendMessage` persisted under `lockedReadModifyWrite`, but `saveConversation` wrote the supplied object wholesale without lock/re-read. CLI/MCP held long-lived `conv` snapshots, mutated them (activeWorkIds/facts/status paths), and called `saveConversation(conv)` after appends/injection/background completion, overwriting newer locked appends. `injectResult` performed its idempotency check outside the lock.
- Change: added atomic `mutateConversation(id, mutator)` on `lockedReadModifyWrite` (re-reads latest, mutates, stamps `updatedAt`, persists). Refactored `appendMessage`/`injectResult` to use it; moved `injectResult` idempotency check+insert inside the same locked mutation. CLI/MCP now use `mutateConversation` for `activeWorkIds`/facts updates and reload fresh state for MCP status reply; `saveConversation` retained for initial whole-object creation only (documented in code). MCP spawn path no longer saves a pre-append stale snapshot after creation.
- Tests (local, 2026-11-12): `npx vitest run tests/conversation.test.ts` — 10 passed. `npx vitest run tests/mcp-async.test.ts tests/mcp.test.ts tests/mcp-job-lifecycle.test.ts` — 8 passed. `npm test` (full suite) — **exit 0**, `Test Files 65 passed | 2 skipped (67)`, `Tests 395 passed | 16 skipped (411)`, duration 42.54s (log `.kilo/tmp/npm-test-l0-05.log`). CI for head `fda9506`: PR #5 run [43293203530](https://github.com/radmanmilos/air/actions/runs/43293203530) success.
- Risks: `saveConversation` remains callable for full replacement; any future stale-object caller outside audited paths could regress. Deterministic lock-contention tests added; no timing-based sleeps.

#### P1/P2 — Remaining required findings
- P1-01 MCP cancellation semantics (`chat_send cancel_job` path appears to ack without cancelling underlying work): **DONE for fix SHA `c1e474205a6e986cc2f19ff2d01aa03b2977cb05`** — IMPLEMENTED / LOCALLY TESTED / INDEPENDENTLY REVIEWED / COMMITTED / PUSHED / CI-VERIFIED.
  - Files: `src/mcp/server.ts`, `src/orchestrator/orchestrator.ts`, `tests/mcp-async.test.ts`, `tests/fixtures/mock-tool.js`.
  - Behavior: `chat_send` tracks MCP chat orchestrators/owners (`chatJobOrchs`, `chatJobConversations`) and enforces cross-conversation isolation. `cancel_job` reads persisted state first, preserves COMPLETED/FAILED/CANCELLED, cancels tracked active jobs via `orch.cancel`+`waitFor` and reports `Cancelled` only when confirmed `CANCELLED`, reports `not running`, `Unknown job`, `does not belong`, `no active handle`, `Cancellation failed`, or `Cancellation unconfirmed` without fabricating state, and cleans `activeWorkIds` via atomic `mutateConversation`. Spawn path registers handle before activeWorkId mutation and rolls back handle/job on mutation failure; spawn/start failures are reported as `Failed to start job...` without leaking active work/handles. Poller/handle cleanup runs in `finally`. Global `jobs` map is not treated as chat-owned for cancellation. `run_task`/`cancel_task` checks terminal state before abort/await and reports actual/unconfirmed outcomes without forced overwrite. `AIR_MOCK_ADAPTER` activation narrowed to explicit `=== '1'` (chat spawn, run_task, resume). `src/orchestrator/orchestrator.ts` persists/reports `state: 'CANCELLED'` (not `FAILED`) for cancelled outcomes in start/resume-after-approval terminal handling; orchestrator run promise is handled for waiters while MCP confirms only persisted outcomes.
  - Tests added/strengthened (`tests/mcp-async.test.ts`): deterministic cancel-vs-barrier cancellation-wins, completion-wins-before-cancel, already-terminal/cancelled handling, failed-terminal preservation, unknown IDs, cross-conversation isolation (job remains RUNNING/active in owner), concurrent cancel requests (no fabricated success), run_task cancel outcomes/unconfirmed branch (tracked job with no persisted terminal state), non-mock chat/mock-adapter isolation and freeOnly/no-adapter-safe assertions without unintended env leakage. `tests/fixtures/mock-tool.js` converted to ESM and extended with `barrier_succeed`/`barrier_crash` + ready/barrier files.
  - Adversarial findings: (P1 fixed) cross-conversation chat cancellation — owner tracking/refusal added. (P1 fixed) mock-adapter seam accepted any truthy `AIR_MOCK_ADAPTER` in resume/run — narrowed to `=== '1'`. (P1 fixed, CI) no-adapter spawn rejection leaked as unhandled background rejection in CI — caught and reported, no activeWorkId leak. (P2 accepted/scope) `Orchestrator.cancel()` sets session state optimistically but MCP reports confirmed persisted outcomes only. (P2 out-of-scope) task-state writes remain whole-file atomic writes without CAS/lock; no new stale-write pattern introduced, MCP linearizes on persisted terminal reads/checks.
  - Validation (2026-11-12, exact fix tree for `c1e4742`): `npx vitest run tests/mcp-async.test.ts` — **12 passed**. `npx vitest run tests/mcp-async.test.ts tests/mcp.test.ts tests/mcp-job-lifecycle.test.ts` — **17 passed**. `npm run typecheck` — pass. `npm run typecheck:test` — pass. `npm run lint` — pass. `npm test` — **exit 0**, `Test Files 65 passed | 2 skipped (67)`, `Tests 404 passed | 16 skipped (420)`, 43.27s (`.kilo/tmp/npm-test-p1-01-rerun.log`). `npm run build` — pass. `npm pack --dry-run` — pass.
  - CI (exact SHA `c1e474205a6e986cc2f19ff2d01aa03b2977cb05`): PR [#5](https://github.com/radmanmilos/air/pull/5) head `c1e4742`, branch `fix/l0-05-p0-conversation-atomic`, remote matches local. Run [43313608385](https://github.com/radmanmilos/air/actions/runs/43313608385) **completed success** — Python worker ubuntu/windows 3.12/3.14, test ubuntu/windows Node 22, Real-binary smoke tests all green. (Earlier amended SHAs `9c5431d`, `fee75a3` had failed runs; superseded by green `c1e4742`.) Prior run 43293203530 covers `fda9506` (P0) only.
- P1-02 External coding CLI consent on default/fallback answer paths: **DONE for fix SHA `cb0880c361e38333687796adbbfc4e9aeeda52bc`** — IMPLEMENTED / LOCALLY TESTED / ADVERSARIALLY REVIEWED / COMMITTED / PUSHED / CI-VERIFIED.
  - Files: `src/brain/index.ts`, `tests/brain.test.ts`, `tests/e2e/scenarios/real-jobs.test.ts`, `tests/e2e/live/smoke.live.test.ts`, `README.md`, `docs/reviews/tasks_air_13.md`.
  - Root cause: CLI `brainAnswer`/`isBrainAvailable` (`src/brain/index.ts`) preferred external `kilo` then `opencode` CLIs before local Ollama and probed external CLI availability, bypassing `config.models.localFirst`/configured coordinator role and any external-egress consent; `bin/air.ts` answer path invoked it. MCP `chat_send` answer path was already fixed-acknowledgement (no external egress).
  - Enforcement/behavior: default/fallback chat answer path is local-only. `brainAnswer` resolves local target via explicit local override `AIR_BRAIN_MODEL_OLLAMA` (ollama CLI/provider only) or configured global coordinator role (`loadConfig` + `resolveModelRole`, `localFirst` required, config errors fail closed) and answers via `OllamaProvider`/local ollama CLI; no `kilo`/`opencode`/`kilocode` spawn, no external fallback on local failure/unavailable/config error (returns `Acknowledged.`). `isBrainAvailable` reports local config/override availability only (no external CLI probes). CLI and MCP remain consistent (MCP answer = fixed acknowledgement). No external-consent model invented/expanded; unauthorized external egress removed from answer paths.
  - Tests: added `tests/brain.test.ts` (no external CLI spawn, configured local provider used, local failure/config-error fail closed, env override local-only). Updated deterministic e2e coverage to exercise local-only brain via fake `ollama` PATH (`tests/e2e/scenarios/real-jobs.test.ts` P-04/P-06) and live smoke wording (`tests/e2e/live/smoke.live.test.ts`).
  - Validation (local, 2026-11-12): `npx vitest run tests/brain.test.ts tests/chat-provider.test.ts tests/e2e/live/smoke.live.test.ts` — 7 passed, 4 skipped. Targeted regression `tests/brain.test.ts tests/conversation.test.ts tests/mcp-async.test.ts tests/mcp.test.ts tests/mcp-job-lifecycle.test.ts` — 32 passed. `npm run typecheck` pass; `npm run typecheck:test` pass; `npm run lint` pass; `npm run build` pass; `npm test` **exit 0** (66 files passed/2 skipped, 409 tests passed/16 skipped; `.kilo/tmp/npm-test-p1-02-rerun.log`; one transient groups cancellation run failed then passed on rerun/full suite). `npm pack --dry-run` pass. Python worker unchanged (not rerun).
  - Adversarial review: confirmed no src/bin/mcp callers spawn `kilo`/`opencode` for answers; local failure/retry paths cannot reach external CLIs; env override constrained to local ollama; config warnings-only tolerated, hard config errors fail closed; MCP answer path unchanged/no egress; P0/P1-01 suites included in full pass. Residual risk (accepted, out-of-scope): `isBrainAvailable` may be true from config while Ollama runtime unavailable (safe fail-closed `Acknowledged.`); full coordinator/model-runtime wiring remains L4.
  - CI (exact SHA `cb0880c361e38333687796adbbfc4e9aeeda52bc`): PR [#5](https://github.com/radmanmilos/air/pull/5) head `cb0880c`, branch `fix/l0-05-p0-conversation-atomic`, remote matches local. Run [43329891518](https://github.com/radmanmilos/air/actions/runs/43329891518) **completed success** — 7/7 jobs green: `test (ubuntu-24.04, 22)`, `test (windows-latest, 22)`, `Python worker (ubuntu-24.04, 3.12)`, `Python worker (ubuntu-24.04, 3.14)`, `Python worker (windows-latest, 3.12)`, `Python worker (windows-latest, 3.14)`, `Real-binary smoke tests`.
- P1-03 Evaluation schema/tool-context integrity (subset of L0-05 required P1 findings): **DONE** — implementation CI-verified for `42ee626809446d4cd17c44633db890401b2d9688`; follow-up documentation CI-verified for `1d83ed0d23aa9e2533b5abb208a49dbbf7808916`. IMPLEMENTED / LOCALLY TESTED / COMMITTED / PUSHED / CI-VERIFIED.
  - Files: `src/evals/runner.ts`, `src/evals/contracts/coordinator.ts`, `src/evals/contracts/planner.ts`, `src/evals/contracts/tools.ts`, `src/planner/index.ts`, `src/models/types.ts`, `tests/evals/runner.test.ts`, `tests/evals/fixtures.test.ts`, `tests/evals/fixtures/reviewer.json`, `tests/evals/fixtures/planner.json`, `tests/evals/fixtures/embeddings.json`, `tests/evals/schema-contracts.test.ts`, `tests/evals/tool-contracts.test.ts`, `scripts/check-dead-code.mjs`, `docs/reviews/tasks_air_13.md`.
  - Behavior: coordinator evaluation requests now supply authoritative `ActionSchema` as structured `format` (no oracle/proposal execution). Planner evaluation requests supply authoritative `PlanSchema`; planner fixture cases are separated into generation vs deterministic validator cases (`mode: "validate"`) with `validatePlanDetailed` enforcing schema/semantic bounds (unique IDs, no unknown/self deps, cycle/dependency/item limits, required acceptance criteria) and validator-only cases recorded without model calls. Tool-calling evaluation requests supply authoritative worker tool definitions (mirrored from internal `air_local/tools` registry) in request `tools` and model-visible prompt context; runner validates proposed tool calls against allowed registry names/required args deterministically and records proposal validation (no tool execution). Reviewer fixture prompts scrubbed of seeded severity/oracle labels (hidden fields remain stripped). E07 embedding query no longer names its lexical distractor. Run/case records include request-contract identity hashes (`schemaHash`/`toolSetHash`, format/tools provided); coder/tool-calling safety oracles remain explicitly `executed:false` (proposal-only runner) and P1-05 executor work remains open.
  - Tests: `tests/evals/runner.test.ts` (request format/tools, hidden oracle fields, real reviewer-fixture leak guard), `tests/evals/schema-contracts.test.ts` (Action/Plan schema parse safety, planner validator accepts valid bounded plans and rejects duplicate/unknown/self/cycle/oversized/missing-criteria), `tests/evals/tool-contracts.test.ts` (unknown tool/missing args rejected, registered calls accepted), existing `tests/evals/fixtures.test.ts`/`workspace.test.ts` updated-compatible. Focused: `npx vitest run tests/evals tests/planner-compiler.test.ts tests/models` — **55 passed**. `npx vitest run tests/check-dead-code.test.ts` — **2 passed**. `npm run typecheck`/`typecheck:test`/`lint`/`build` — pass. `npm pack --dry-run` — pass. `npm test` — **exit 0**, `Test Files 68 passed | 2 skipped (70)`, `Tests 425 passed | 16 skipped (441)`.
  - CI (exact SHA `42ee626809446d4cd17c44633db890401b2d9688`, P1-03 implementation): PR [#5](https://github.com/radmanmilos/air/pull/5), branch `fix/l0-05-p0-conversation-atomic`. Run [43339234872](https://github.com/radmanmilos/air/actions/runs/43339234872) **completed success** — 7/7 jobs green: `test (ubuntu-24.04, 22)`, `test (windows-latest, 22)`, `Python worker (ubuntu-24.04, 3.12)`, `Python worker (ubuntu-24.04, 3.14)`, `Python worker (windows-latest, 3.12)`, `Python worker (windows-latest, 3.14)`, `Real-binary smoke tests`.
  - Documentation follow-up CI (exact SHA `1d83ed0d23aa9e2533b5abb208a49dbbf7808916`): `docs/reviews/tasks_air_13.md` + `docs/reviews/p1-evaluation-followup-review.md` (`docs(review): record P1-03 CI and evaluation follow-up findings`). Run [43382851018](https://github.com/radmanmilos/air/actions/runs/43382851018) **completed success** — 7/7 jobs green.
   - Adversarial/scope notes: oracle labels/expected tool choices remain hidden from model-visible payloads; invalid coordinator/planner proposals are safely rejectable via schema/validator (no dispatch); tool proposals not in allowed registry or with missing required args are rejected by deterministic validation; no destructive/real workspace tool execution added. **Registry parity/drift (P1-03 follow-up):** now guarded by automated CI-runnable semantic parity + negative drift-detection tests comparing authoritative Python `build_registry()` export (`packages/local-worker/air_local/tools/export_registry.py`) to TS eval mirror (`src/evals/contracts/tools.ts`) for covered schema fields (names/uniqueness, descriptions, parameters/properties/types/required, nested objects/arrays/enums/defaults/additionalProperties where represented); hash remains mirror identity, not sole proof. **Not execution-safety complete:** proposal validation checks name/type/object shape/required args but does not fully validate argument value types and records (does not reject) extra keys; runner is proposal-only and must not be treated as a complete execution boundary. P1-04 reviewer-leakage aspect addressed for audited fixture/prompt paths; **P1-05 coder/tool safety execution remains open** (runner still proposal-only with explicit `safetyOracles.executed:false`); P1-06 planner validator/generation split addressed for audited cases and runner-level "no model call on validate case" criterion now evidenced by focused runner test; P1-07 and P2 remain open. Python worker unchanged. Follow-up investigation: `docs/reviews/p1-evaluation-followup-review.md`.

- P1-05 Sandboxed evaluation execution and executed safety/acceptance oracles (coder/tool-calling/debugging): **PARTIAL (fail-closed boundary contract only) — NOT DONE**.
  - **Implemented (commit `02cbaadf9b03aeec0009315f71d0b69ef44fabcb`, CI [43391210944](https://github.com/radmanmilos/air/actions/runs/43391210944) **completed success, 7/7 jobs**):** `src/evals/sandbox/capabilities.ts` (typed statuses `not_run|unsupported|blocked|timed_out|failed|passed`, oracle evidence, platform capability detection, fail-closed evaluation), `src/evals/runner.ts` (`--execute-safety-oracles` opt-in, default proposal-only; run records `executeSafetyOracles`/`sandboxCapabilities`; coder/tool-calling/debugging case `safetyOracles` include `mode`/`capabilities`/per-oracle status+`executed` evidence; proposal validation remains separate), `scripts/check-dead-code.mjs` baseline, `tests/evals/sandbox-capabilities.test.ts`, `docs/architecture/local-first-evaluation.md`, `docs/reviews/p1-evaluation-followup-review.md`.
  - **Behavior:** default = `not_run`/`executed:false` (`proposal_only`), no untrusted patch apply/command execution/tool dispatch. Opt-in = capability-detected **fail-closed** on all platforms in current implementation (no demonstrable OS-enforced untrusted patch/command/tool/filesystem/network sandbox) => `unsupported`/`executed:false` (`sandbox_attempted`) with reasons; never marked `passed` without executed evidence. No eval execution wired into normal CLI/MCP workflows.
  - **Threat model/architecture/enforceability:** documented in `docs/reviews/p1-evaluation-followup-review.md` §7 (untrusted patches/proposals, path/symlink/reparse/traversal/TOCTOU, shell/PATH/env/credential/egress, timeout/process-tree/cleanup, cross-case contamination, oracle-truth risks; per-property mechanism/OS/tests/limitations; application-level validation/workspace copy explicitly not an OS sandbox).
  - **Tests (local validation for `02cbaad`, reported):** focused `npx vitest run tests/evals/sandbox-capabilities.test.ts tests/evals/runner.test.ts tests/evals/fixtures.test.ts tests/evals/schema-contracts.test.ts tests/evals/tool-contracts.test.ts tests/evals/workspace.test.ts` — **39 passed**. Full suite rerun — **69 files passed, 2 skipped; 430 tests passed, 16 skipped** (prior run had 1 unrelated e2e timing failure, rerun green). `npm run typecheck`, `npm run typecheck:test`, `npm run lint`, `npm run build`, `npm pack --dry-run`, `python -m ruff check .`, `python -m mypy air_local`, `python -m pytest -q` (102 passed), `git diff --check` — passed per local validation report. CI for this exact SHA: [43391210944](https://github.com/radmanmilos/air/actions/runs/43391210944) success, 7/7 jobs.
  - **Not complete / limitations (P1-05 remains PARTIAL, NOT DONE):** no OS-enforced sandboxed execution, no untrusted diff/patch application, no fixture command execution, no proposed tool dispatch, no enforced filesystem/network/process isolation proven; executed coder/tool-calling/debugging safety oracles remain open. P1-03 residuals unchanged (manual worker-registry mirror, proposal arg validation not execution boundary). Windows/Linux/macOS all fail-closed for execution in this increment.
- P1-04/P1-05/P1-06 Evaluation correctness/safety oracles (remaining: P1-05 sandboxed coder/tool/debugging **execution** and executed safety/acceptance oracles with demonstrable OS-enforced boundaries; fail-closed capability contract/opt-in reporting implemented but no untrusted execution enabled. Residual acceptance-gap hardening per follow-up review, e.g. proposal-validator scope limits; **P1-06 runner-level no-model-call criterion now PASS via focused runner test**; **P1-03 registry parity/drift now guarded by automated Python-vs-TS semantic parity + drift-detection tests**, but broader P1-03 proposal-validator limitations remain open): **TODO / PARTIAL** (audited P1-04 reviewer fixture/prompt leakage and P1-06 planner split/validation addressed; runner remains proposal-only/fail-closed for execution — see `docs/reviews/p1-evaluation-followup-review.md`).


- P1-07 Ollama assistant tool-call request/response contract: TODO
- P2-01/P2-02/P2-03 Provider/config hardening (health timeout, base URL/credentials): TODO

- Gate: L3/L4 remain BLOCKED until all required P0/P1 and dispositioned P2 findings are reconciled with tests/docs/ledger and passing CI on final pushed changes. P0-01 CI verified for `fda9506` (run [43293203530](https://github.com/radmanmilos/air/actions/runs/43293203530)). P1-01 CI verified for `c1e4742` (run [43313608385](https://github.com/radmanmilos/air/actions/runs/43313608385)). P1-02 CI verified for `cb0880c` (run [43329891518](https://github.com/radmanmilos/air/actions/runs/43329891518), 7/7 jobs). P1-03 implementation CI verified for `42ee626` (run [43339234872](https://github.com/radmanmilos/air/actions/runs/43339234872), 7/7 jobs); P1-03 follow-up documentation CI verified for `1d83ed0` (run [43382851018](https://github.com/radmanmilos/air/actions/runs/43382851018), 7/7 jobs). Head `f16ee78` CI [43383888852](https://github.com/radmanmilos/air/actions/runs/43383888852) success. **P1-05 fail-closed boundary implementation CI verified for `02cbaad` (run [43391210944](https://github.com/radmanmilos/air/actions/runs/43391210944), 7/7 jobs) — P1-05 remains PARTIAL/NOT DONE (execution/oracles still open).** Documentation head `4bd48db` CI [43398692962](https://github.com/radmanmilos/air/actions/runs/43398692962) **completed success, 7/7 jobs** for exact SHA `4bd48db041a3b01c7251ceab7055264ffff5a8bf` (documentation-only). P1-04/P1-05/P1-06 residuals, P1-07, and applicable P2 remain open; L3/L4 stay blocked. **L0-05 reconciliation is not complete.**

## L1 — Provider-neutral model runtime and Ollama provider

**Phase status:** IN_PROGRESS. Provider API/Ollama transport are merged and CI-validated; live Ollama verification and coordinator/worker integration remain open.

### L1-01 — Define normalized model API
- Status: IN_PROGRESS
- Owner: integration agent
- Evidence: src/models/types.ts and src/models/providers/provider.ts define typed messages, tool calls, chat/embedding requests and responses, model metadata, health, usage/timing and normalized provider errors. Merged in PR #1; exact-head CI run 286 passed. Live Ollama verification remains outstanding.
- Depends on: L0-03
- Scope: request/response/message/tool/usage/capability/error types; cancellation and timeout semantics.
- Likely files: src/models/types.ts; src/models/providers/provider.ts; tests.
- Acceptance: contract is provider-neutral and does not assume every provider supports every capability.

### L1-02 — Implement Ollama provider
- Status: IN_PROGRESS
- Owner: integration agent
- Evidence: `src/models/providers/ollama.ts` implements native fetch transport for chat/tool calls, embeddings, health, installed/model metadata and optional running-model diagnostics. It does not start Ollama or pull models. Merged in PR #1; CI run 286 passed. See [model provider runtime](../adapters/model-providers.md).
- Depends on: L1-01
- Scope: wrap/refactor existing Ollama transport behind provider API; support chat, tool calls, structured output where supported, embeddings, tags/model info and health.
- Likely files: src/models/providers/ollama.ts; packages/local-worker/air_local/ollama.py only if a shared worker concern requires it.
- Acceptance: fake-provider unit tests plus gated live Ollama integration; consistent error taxonomy.

### L1-03 — Provider conformance and failure tests
- Status: IN_PROGRESS
- Owner: integration agent
- Evidence: `tests/models/ollama.test.ts` covers chat/tool-call mapping, embeddings, discovery, health/offline behavior, missing model, rate limiting, cancellation, timeout and malformed responses. Exact-head GitHub CI run 286 passed; no local tests were run. Live Ollama integration and cross-provider conformance remain future work.
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
- Status: DONE
- Owner: integration agent
- Evidence: version-2 Zod config adds global-only local model/provider settings and seven role assignments. Repo .airrc.yaml model settings are stripped; hosted provider IDs are rejected. The v1 migration validates before writing, preserves existing YAML/comments and file permission bits, is idempotent, refuses future versions, and never downloads models. See docs/configuration/model-roles.md. Merged in PR #1; exact-head CI run 286 passed on the PR head.
- Depends on: L0-03, L1
- Scope: add providers, role assignments, local-first policy, resource policy and external fallback consent; migrate v1 safely.
- Likely files: src/config/schema.ts; src/config/loader.ts; current migration module; tests and config docs.
- Acceptance: v1 migration is idempotent, non-destructive and preserves existing settings; untrusted repo config cannot self-authorize providers or external egress.

### L2-03 — Role resolver
- Status: IN_PROGRESS
- Owner: integration agent
- Evidence: src/models/role-resolver.ts resolves logical role to the configured Ollama model/endpoint/resource intent and fails closed when the provider is disabled. It does not probe model availability or silently fall back; registry/capability checks remain future work.
- Depends on: L2-01, L2-02
- Scope: role â†’ provider/model selection with capability, availability, resource and user-policy filters; explainable decisions.
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
| L0 | PR #1, #2 and #3 merged | PR runs 286, 297, 298 and 301 passed; main push runs 287 and 299 passed; run 303 pending | Integration owner; independent review open | 2026-11-12 |
| L1 | PR #1 foundation merged at a2dc1e95 | CI run 286 passed | Integration owner; independent review open | 2026-11-12 |
| L2 | PR #1 config/registry foundation merged at a2dc1e95 | CI run 286 passed | Integration owner; independent review open | 2026-11-12 |
| L3 | — | — | — | — |
| L4 | — | — | — | — |
| L5 | — | — | — | — |
| L6 | — | — | — | — |
| L7 | — | — | — | — |
| L8 | — | — | — | — |
| L9 | — | — | — | — |
| L10 | — | — | — | — |

