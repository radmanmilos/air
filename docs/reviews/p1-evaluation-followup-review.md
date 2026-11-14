# P1 Evaluation Follow-up Review (P1-03 CI, P1-04/P1-05/P1-06 Investigation)

**Scope:** Verification and investigation record (documentation-only reconciliation). Clearly distinguished below: the **P1-05 implementation SHA reviewed** (`02cbaad`), the **latest documentation/branch SHA before this correction** (`4bd48db`, with exact-SHA CI), and historical snapshots with their corresponding CI evidence. P1-05 remains PARTIAL/NOT DONE (fail-closed boundary contract only; no sandboxed untrusted execution implemented).

## 1. Exact repository / commit reviewed

- **Repository:** `https://github.com/radmanmilos/air`
- **Local checkout:** `E:\GitHub\air`
- **Branch:** `fix/l0-05-p0-conversation-atomic` (tracks `origin/fix/l0-05-p0-conversation-atomic`), PR [#5](https://github.com/radmanmilos/air/pull/5) (OPEN, draft, base `main`, unmerged). *Verified by GitHub/git preflight.*
- **P1-05 implementation SHA reviewed (runtime increment):** `02cbaadf9b03aeec0009315f71d0b69ef44fabcb` (`fix(evals): add fail-closed P1-05 safety oracle boundary contract`). CI [43391210944](https://github.com/radmanmilos/air/actions/runs/43391210944) **completed success, 7/7 jobs**. *Verified by GitHub CI.*
- **Latest documentation/branch SHA before this correction:** `4bd48db041a3b01c7251ceab7055264ffff5a8bf` (`docs(review): record P1-05 fail-closed CI evidence`) — local == origin == PR #5 head before this reconciliation commit. CI [43398692962](https://github.com/radmanmilos/air/actions/runs/43398692962) **completed success, 7/7 jobs** for exact SHA `4bd48db`. *Verified by git/GitHub CI.*
- **Historical snapshots (preserved):** P1-03 implementation `42ee626809446d4cd17c44633db890401b2d9688`, CI [43339234872](https://github.com/radmanmilos/air/actions/runs/43339234872) success (7/7) — baseline for sections 3–6/8 as recorded; follow-up docs/housekeeping heads `1d83ed0` CI [43382851018](https://github.com/radmanmilos/air/actions/runs/43382851018), `f16ee78` CI [43383888852](https://github.com/radmanmilos/air/actions/runs/43383888852).
- **`main` HEAD:** `f5e45a345f430b96d66933838944469886879689`.
- **Worktree state:** `.kilo/tmp/` and untracked build artifacts may exist locally; unrelated worktrees preserved. *Verified by preflight.*

## 2. Exact-SHA CI evidence

### P1-03 implementation — historical snapshot (`42ee626809446d4cd17c44633db890401b2d9688`)
- Run [43339234872](https://github.com/radmanmilos/air/actions/runs/43339234872) — **completed, success, 7/7 jobs**. *Verified by GitHub CI.*

| Job | Conclusion | URL |
|---|---|---|
| test (ubuntu-24.04, 22) | success | [131603085194](https://github.com/radmanmilos/air/actions/runs/43339234872/job/131603085194) |
| test (windows-latest, 22) | success | [131603085160](https://github.com/radmanmilos/air/actions/runs/43339234872/job/131603085160) |
| Python worker (ubuntu-24.04, 3.12) | success | [131603084775](https://github.com/radmanmilos/air/actions/runs/43339234872/job/131603084775) |
| Python worker (ubuntu-24.04, 3.14) | success | [131603085065](https://github.com/radmanmilos/air/actions/runs/43339234872/job/131603085065) |
| Python worker (windows-latest, 3.12) | success | [131603085223](https://github.com/radmanmilos/air/actions/runs/43339234872/job/131603085223) |
| Python worker (windows-latest, 3.14) | success | [131603085381](https://github.com/radmanmilos/air/actions/runs/43339234872/job/131603085381) |
| Real-binary smoke tests | success | [131604525364](https://github.com/radmanmilos/air/actions/runs/43339234872/job/131604525364) |

### P1-05 implementation SHA reviewed (`02cbaadf9b03aeec0009315f71d0b69ef44fabcb`)
- Run [43391210944](https://github.com/radmanmilos/air/actions/runs/43391210944) — **completed, success, 7/7 jobs**. *Verified by GitHub CI (`gh run view`).*

| Job | Conclusion |
|---|---|
| test (ubuntu-24.04, 22) | success |
| test (windows-latest, 22) | success |
| Python worker (ubuntu-24.04, 3.12) | success |
| Python worker (ubuntu-24.04, 3.14) | success |
| Python worker (windows-latest, 3.12) | success |
| Python worker (windows-latest, 3.14) | success |
| Real-binary smoke tests | success |

**Local validation reported for `02cbaad`:** focused eval tests 39 passed; full suite rerun 69 files passed/2 skipped, 430 tests passed/16 skipped (initial run had 1 unrelated e2e timing failure, rerun green); `npm run typecheck`, `npm run typecheck:test`, `npm run lint`, `npm run build`, `npm pack --dry-run`, `python -m ruff check .`, `python -m mypy air_local`, `python -m pytest -q` (102 passed), `git diff --check` passed.

### Latest documentation/branch SHA before this correction (`4bd48db041a3b01c7251ceab7055264ffff5a8bf`)
- Run [43398692962](https://github.com/radmanmilos/air/actions/runs/43398692962) — **completed, success, 7/7 jobs** (exact SHA `4bd48db`, documentation-only commit). *Verified by GitHub CI (`gh run view`).*

| Job | Conclusion |
|---|---|
| test (ubuntu-24.04, 22) | success |
| test (windows-latest, 22) | success |
| Python worker (ubuntu-24.04, 3.12) | success |
| Python worker (ubuntu-24.04, 3.14) | success |
| Python worker (windows-latest, 3.12) | success |
| Python worker (windows-latest, 3.14) | success |
| Real-binary smoke tests | success |

## 3. P1-03 ledger correction

- `docs/reviews/tasks_air_13.md` updated (doc-only): P1-03 recorded as **IMPLEMENTED / LOCALLY TESTED / COMMITTED / CI-VERIFIED** for `42ee626` with run [43339234872](https://github.com/radmanmilos/air/actions/runs/43339234872) (7/7 green). Branch/CI lines updated; phase/gate summary no longer describes P1-03 as open/CI-pending.
- **Preserved distinctions:** P0-01, P1-01, P1-02 remain CI-verified for their exact SHAs; P1-03 does **not** claim P1-05 sandboxed execution is complete (runner remains proposal-only, `safetyOracles.executed:false`); P1-04/P1-05/P1-06 residuals, P1-07, P2-01–P2-03 remain open; L3/L4 remain **BLOCKED**; L0-05 reconciliation is **not** marked complete. *Verified by source inspection of ledger diff*.

## 4. Tool registry parity findings (`src/evals/contracts/tools.ts`)

**Source of truth (Verified by source):**
- **Authoritative worker contract:** `packages/local-worker/air_local/tools/builtin.py` (`build_registry()` / `Registry.schemas()`), composed from `air_local/tools/{files,shell,web,git,ollama_tools,code_analysis}.py` and `air_local/scaffold/{test_generator,templates,doc_generator}.py`. Registration order and schema definitions in Python define the built-in worker tool set exposed to the local worker.
- **Evaluation mirror (TS):** `src/evals/contracts/tools.ts` exports `EVAL_TOOL_DEFINITIONS` (and `EVAL_TOOL_REGISTRY` map, baselined in `scripts/check-dead-code.mjs`) for model-visible tool-calling context and deterministic proposal validation in `src/evals/runner.ts` (proposal-only; no tool execution). This remains a maintained mirror but is now verified against the authoritative Python registry by automated parity checks.

**Automated parity mechanism (Implemented, Verified by tests):**
- Deterministic authoritative export: `packages/local-worker/air_local/tools/export_registry.py` (`python -m air_local.tools.export_registry`, run with `cwd=packages/local-worker`) loads `build_registry()` and emits normalized JSON (sorted object keys, sorted `required`, sorted `properties`, recursive normalization of nested schema fields including `items`/`enum`) in registration order. No manually copied expected snapshot.
- TypeScript normalizer/comparator: `src/evals/contracts/tool-registry-parity.ts` normalizes `EVAL_TOOL_DEFINITIONS` equivalently and compares registries with actionable diffs (`tool`, `path`, `expected`, `actual`).
- CI-runnable tests: `tests/evals/tool-registry-parity.test.ts` (1) asserts semantic parity with the Python-exported authoritative registry for covered fields and (2) proves drift detection via representative negative cases: missing tool, changed required field, changed nested property type, changed enum value. `tests/evals/tool-contracts.test.ts` retains proposal-validation/name-presence checks.
- Integration: included in normal `npm test`/Vitest runs (TS test jobs) and relevant eval/contract suites; uses local Python + repo source only (no network/runtime dependencies added).

**Compared schema properties (where represented in current registries):** tool names and uniqueness (including registration/name-set equivalence), tool descriptions, top-level parameter `type` (object), `required` property names, `properties` names and types, nested object `properties`/`required`, array `items` schemas, `enum` values, `default` values, nullability/type representations as present, and `additionalProperties` behavior. Comparison is recursive over represented schema fields; ordering is treated as non-semantic for `required`/`properties` and normalized for deterministic comparison.

**Documented exceptions/limitations:** none required for current built-in registries (all compared fields present align). Not compared/proven: runtime tool behavior, Python function signatures beyond declared schema, non-schema metadata, or semantics not expressible in the exported schema; `stableHash(EVAL_TOOL_DEFINITIONS)` remains **eval-mirror identity metadata**, not sole parity proof (semantic parity test is the evidence). Proposal argument validation is now strict/deterministic/fail-closed for the supported/evaluable schema features actually used or representable by the current authoritative registry and synthetic edge-case tests (see §5), but remains **proposal-only** (not an execution/dispatch security boundary) and fails closed for unsupported/unevaluable schema constructs. Any future intentional representation difference must be normalized/documented explicitly rather than silently ignored.

**Parity criterion status:** **PASS (for covered automated semantic/schema parity + drift detection)** — Python authoritative export vs TS eval mirror compared in CI-runnable tests with negative drift evidence. Broader P1-03 remains **PARTIAL/OPEN** outside covered parity scope due proposal-only boundary and any unevaluable schema features (which must fail closed) until full ledger acceptance criteria are satisfied.

## 5. Tool proposal argument validation (`src/evals/runner.ts`)

**Implemented behavior (Verified by source/tests):** `validateToolCallProposal()` (`src/evals/runner.ts`) performs strict, deterministic, fail-closed validation of proposed tool calls against the authoritative eval tool registry (Python-exported/TS-mirror, parity-checked). It validates:
- **Tool-call structure:** absent proposal (`valid:true`, no reasons/diagnostics); malformed/non-object call, missing/invalid `type`/`function`, missing/non-string tool name, and `arguments` not a JSON object are rejected with stable reason/diagnostic codes and `tool`/`path`/`expected`/`actual` metadata.
- **Registry:** unknown tool names rejected.
- **Object/schema semantics:** required properties (including nested), property value validation, nested object/array validation, `enum`, `items`, and `additionalProperties` (`false` rejects undeclared properties; `true` or schema-valued `additionalProperties` accepts/validates permitted extras; omitted optional properties remain valid). Defaults are not injected into proposals.
- **JSON types:** `string`, `boolean`, `integer` (finite integers only; fractional numbers rejected), `number` (finite), `object`, `array`, `null`, and supported type unions (e.g. `["string","null"]`). Booleans are not accepted as numbers.
- **Safety/contract behavior:** no coercion, no mutation of input arguments/proposals, no dispatch/execution, deterministic results/diagnostics for identical inputs, and diagnostics avoid leaking argument values/secrets (codes/paths/expected/actual types only).

**Supported/evaluable schema features (current implementation):** `type` (string or array of supported JSON types), `properties`, `required`, `additionalProperties` (`boolean` or schema), `items` (single schema), `enum`, and descriptive/metadata fields `description`/`default`/`title` (not enforced as constraints). Root tool parameter schemas are treated as object schemas (explicit or implicit).

**Unsupported/unevaluable schema features (fail closed):** any unrecognized schema keyword or unsupported construct (e.g. `pattern`, `minimum`/`maximum`, `minLength`/`maxLength`, `format`, `anyOf`/`oneOf`/`allOf`, `$ref`, tuple `items`, unsupported `additionalProperties` forms/types, invalid schema shapes) causes validation to fail with `unsupported_schema`/`invalid_schema` diagnostics rather than passing silently.

**Scope and boundary (Verified/Inference):**
- **Intentional for proposal-only evaluation:** runner stores proposals and deterministic validation metadata; generation suites do not execute tool calls/apply patches/run commands (`runGenerationSuite` records `toolProposalValidation` and `safetyOracles: { executed:false, reason:"proposal-only-runner-does-not-execute" }` for coder/tool-calling). *Verified by runner/tests/help text.*
- **Execution safety boundary:** this validator must **not** be treated as sandboxing or a complete runtime/execution-authorization boundary. P1-05 sandboxed/untrusted execution remains separate/open; proposal validation does not enable tool dispatch, patch application, command execution, or CLI/MCP behavior changes. Current eval path does not execute proposed tools.

## 6. P1-04 findings — Reviewer oracle leakage

**Status: PASS (for audited fixture/prompt leakage paths). Residual confidence/coverage risk remains.**

| Evidence | Finding |
|---|---|
| `tests/evals/fixtures/reviewer.json` (R01–R10) | Inputs are neutral review tasks (e.g. "Review this diff for workspace-boundary and path-validation defects."); no "Seeded critical/high/medium" or "Clean control" labels in `input`. Severity/defect labels live in `expectedFinding`/`oracle`/`falsePositiveControl` fields, not model-visible text. *Verified by source inspection.* |
| `src/evals/runner.ts` `HIDDEN_ORACLE_FIELDS` + `sanitizeFixtureCase` | Strips `oracle`, `expectedFinding`, `falsePositiveControl`, `expectedAction`, `expectedTool`, etc. from model-visible payload before prompt construction. *Verified by source.* |
| `tests/evals/runner.test.ts` "does not leak reviewer oracle labels in real fixture prompts" | Loads real reviewer fixture and asserts prompts contain no seeded/clean-control labels and no `expectedFinding`/`falsePositiveControl`/`"oracle"`. Also asserts hidden fields removed for synthetic cases. *Verified by tests.* |
| Prompt construction | `buildEvalMessages('reviewer', ...)` includes sanitized `payload` (diff/context/input fields as provided) plus contract metadata only; no tool schemas/expected findings injected. *Verified by source inspection.* |

**Conclusion:** audited leakage paths (fixture `input` labels, oracle/expected fields, prompt construction) are closed by fixture content + sanitizer + tests. No evidence of leakage via expected severity/findings/seed labels in model-visible reviewer prompts. Broader confidence (sample size/false-positive calibration) remains an evaluation-quality concern, not a demonstrated leakage path.

## 7. P1-05 findings — Coder/tool/debugging safety oracles and sandboxed execution

**Status: PARTIAL (fail-closed contract/capability boundary implemented). Sandboxed execution & executed safety/acceptance oracles remain NOT COMPLETE.**

### 7.1 Implemented (this increment, fail-closed)
- **Typed boundary contract:** `src/evals/sandbox/capabilities.ts` defines explicit oracle statuses (`not_run|unsupported|blocked|timed_out|failed|passed`), per-oracle evidence, platform capability detection, and `evaluateSafetyOracles()` reporting. Exported API baselined in `scripts/check-dead-code.mjs`.
- **Runner integration:** `src/evals/runner.ts` adds opt-in `--execute-safety-oracles` (default off). Run records include `executeSafetyOracles` and `sandboxCapabilities`; coder/tool-calling/debugging case records include structured `safetyOracles { executed, mode, capabilities, oracles[] }`. Proposal/schema validation remains separate from executed safety/acceptance.
- **Fail-closed behavior:** by default oracles are `not_run`/`executed:false` (`proposal_only`). When opt-in is requested, capability detection reports required controls unavailable (untrusted patch application, fixture-command sandbox, proposed tool dispatch, filesystem confinement, network isolation) on **Windows/Linux/macOS in this implementation**, so oracles are reported `unsupported`/`executed:false` (`sandbox_attempted`) with reasons/details. No untrusted patches are applied, no fixture commands run, and no proposed tools are dispatched.
- **Tests/evidence:** focused `tests/evals/sandbox-capabilities.test.ts` (5) plus existing eval suites updated-compatible (39 passed locally). Local full rerun reported: 69 files passed/2 skipped, 430 tests passed/16 skipped (initial run had 1 unrelated e2e timing failure, rerun green); checklist commands passed per report. Exact-SHA CI for `02cbaad`: [43391210944](https://github.com/radmanmilos/air/actions/runs/43391210944) **completed success, 7/7 jobs**. No real OS-enforced execution path is claimed or exercised.

### 7.2 Threat model (concise)

| Threat | Concern |
|---|---|
| Untrusted model artifacts | Malicious/accidental patches and tool proposals; prompt/tool output treated as untrusted data, not authorization. |
| Filesystem escape | Absolute/`..` traversal, symlink/junction/reparse-point escapes, TOCTOU/races, writes outside per-case workspace or to protected/host paths. |
| Command/process abuse | Shell injection/metacharacters, PATH/executable substitution, arg injection, unexpected child processes, process-tree survival after timeout/cancel. |
| Environment/host leakage | Inherited secrets/credentials/tokens, sensitive env vars, host paths, open handles/sockets. |
| Network/egress | Outbound HTTP/DNS, localhost/service access, data exfiltration during fixture execution. |
| Execution control | Hangs, unbounded CPU/memory/output, cleanup failures, cross-case/shared-temp contamination, concurrent interference. |
| Oracle integrity | Reporting `executed`/`passed` without an actually run, auditable check; confusing proposal validity with execution safety. |
| Platform differences | Windows junctions/reparse/`taskkill` semantics, Unix symlinks/process groups/namespaces; CI environment variability (no container/namespace/sandbox-exec guarantees assumed). |

### 7.3 Architecture decision and per-OS enforceability

**Selected (implemented now):** explicit capability-detected, opt-in, fail-closed oracle boundary with truthful status evidence; **proposal-only execution remains default**. Application-level validation/workspace copying is treated as organization only, never as a security sandbox.

**Rejected for now (not claimed/silently downgraded):** executing untrusted patches/commands in temp dirs without OS-enforced confinement/network denial; host-shell or interpolated command execution; inheriting full host environment; enabling network by default; wiring eval execution into normal CLI/MCP workflows.

| Security property | Enforcement mechanism (if implemented) | OS genuinely enforced today | Tests demonstrating | Residual/bypass/limitation |
|---|---|---|---|---|
| No untrusted execution by default | Opt-in flag off, capability gate, fail-closed statuses | All (application control) | `sandbox-capabilities.test.ts`, runner behavior (`not_run`) | Cannot prevent misuse outside runner; CLI flag exposed to devs only. |
| Truthful oracle reporting (no false pass) | Status enum + `executed` evidence; unsupported/not_run cannot be passed | All (application control) | `sandbox-capabilities.test.ts` | Depends on future executors to emit correct evidence. |
| Untrusted patch application confinement | **Not implemented** (requires deterministic applier + canonical/symlink-safe confinement checks) | **None** | None (unsupported by design) | Patches not applied; future impl must fail closed on ambiguity/escape/TOCTOU. |
| Fixture command allowlist/no-shell argv | **Not implemented** as eval executor boundary | **None** (not wired) | None | `src/execution/runner.ts` provides no-shell argv/tree-kill primitives for trusted contexts but not an untrusted sandbox. |
| Filesystem confinement (OS) | **Not implemented** (needs platform jail/container/namespace/mandatory policy) | **None proven** | None | Temp workspace isolation is not confinement. |
| Network isolation/egress denial | **Not implemented** (needs OS firewall/namespace/seccomp/sandbox policy) | **None proven** | None | Default is no execution, so no egress path introduced. |
| Process-tree timeout/cancellation/cleanup | **Not implemented** for eval sandbox executions | **None proven** for untrusted eval exec | None | Shared trusted runner has tree-kill behavior but not evaluated as sandbox boundary. |
| Environment/credential isolation | **Not implemented** for eval sandbox executions | **None proven** | None | No execution path; future must use minimal sanitized env. |
| Cross-case isolation/cleanup | Workspace-per-run copy helper exists (staging) | Partial (filesystem separation only) | Existing `workspace.test.ts` (copy/cleanup), not adversarial sandbox proof | Not a security boundary against escapes/malicious processes. |

**Conclusion:** full cross-platform OS-enforced sandboxing for untrusted eval execution cannot be demonstrated with available in-repo mechanisms/dependencies/CI guarantees; therefore execution remains disabled/fail-closed. Any future execution path must be platform-capability-gated, deny-by-default, and separately tested per-OS with real enforcement evidence.

### 7.4 Remaining gaps / follow-up
- Implement and prove (per-OS) deterministic patch applier + path/symlink/reparse confinement, fixture-declared command allowlist executor, env sanitization, timeout/output bounds, process-tree cleanup, and network/filesystem denial where enforceable.
- Execute coder/tool-calling/debugging safety/acceptance oracles only under proven boundaries; record auditable evidence per oracle.
- Revisit T11/T12-like tool-calling cases to distinguish proposal-validation outcomes from executed tool sandbox outcomes.
- Preserve P1-03 residuals: worker-registry parity/drift not machine-proven; proposal arg validation not a complete execution boundary. L0-05 remains IN_PROGRESS; L3/L4 remain BLOCKED.

## 8. P1-06 findings — Planner adversarial fixtures and deterministic validation

**Status: PASS (for audited ledger acceptance criteria).**

| Criterion | Evidence (Verified) |
|---|---|
| Generation vs deterministic validator cases separated | `tests/evals/fixtures/planner.json`: P01–P06 `mode:"generate"`, P07–P12 `mode:"validate"` with concrete `plan` payloads. |
| Invalid plans checked by `validatePlanDetailed()` (not model) | `src/evals/runner.ts` `runGenerationSuite`: `mode === 'validate'` imports `validatePlanDetailed`, records `deterministicValidation` and `safetyOracles` with `planner-validator-case-no-model-call`, and **does not call provider.chat** for that case. |
| Duplicate IDs, unknown deps, self-deps, cycles, limits tested | P07 duplicate ids, P08 cycle, P09 unknown dep, P10 oversized (>32 items), P11 schema-invalid/empty objective & criteria, P12 self-dependency. `tests/evals/schema-contracts.test.ts` exercises `validatePlanDetailed` for valid, duplicate, unknown, self, cycle, oversized, missing criteria. `src/planner/index.ts` enforces bounds/uniqueness/deps/cycle/limits. |
| Required acceptance criteria and schema bounds tested | Schema requires `acceptanceCriteria` min 1, bounded lengths/counts; validator/schema reject empty/missing criteria and oversize (P10/P11, schema-contracts). |
| Validator-only cases avoid unnecessary model calls | Runner short-circuits validate-mode cases without chat request (Verified by source). |
| Tests exercise actual runner behavior, not only helpers | `tests/evals/runner.test.ts` covers request construction/contracts/sanitization behavior; planner validate path is implemented in runner; schema/tool-contract tests cover deterministic validators/helpers. *Partial:* no dedicated integration test shown asserting a validate-mode planner case produces zero `provider.chat` calls in a live runner invocation within reviewed files, but control flow is explicit. |

**Conclusion:** audited P1-06 acceptance gaps from prior review are addressed (separation, deterministic validation, no model-generated invalid-plan reliance, key adversarial classes covered). Remaining risk: strengthen with an explicit runner-level test that a `mode:"validate"` planner case records no chat call.

## 9. Acceptance criteria table

| Criterion | Status | Evidence |
|---|---|---|
| P1-03 exact-SHA CI (42ee626, run 43339234872, 7/7 jobs) | **PASS** | GitHub CI run [43339234872](https://github.com/radmanmilos/air/actions/runs/43339234872), all required jobs success (Verified by CI). |
| P1-03 ledger corrected to CI-verified without overstating P1-05/L0-05/L3-L4 | **PASS** | `docs/reviews/tasks_air_13.md` updated (Verified by source inspection). |
| P1-03 tool registry is proven in sync with worker (generated/shared or drift test) | **PASS** (covered automated semantic/schema parity + drift detection) | Authoritative Python export `packages/local-worker/air_local/tools/export_registry.py` (`build_registry()`/`Registry.schemas()`) compared to `src/evals/contracts/tools.ts` by `src/evals/contracts/tool-registry-parity.ts` + `tests/evals/tool-registry-parity.test.ts` (CI-runnable in normal Vitest/TS jobs; no network). Compared: tool names/uniqueness, descriptions, parameter type/required/properties/types, nested object properties/required, array items, enums, defaults, nullability/type representations where present, `additionalProperties`; negative drift tests for missing tool, changed required field, changed nested property type, changed enum value. Hash remains mirror-identity metadata, not sole proof. (Verified by source/tests.) |
| P1-03 tool registry name/shape coverage matches worker registry at time of commit | **PASS** (covered fields/registry at commit, via automated parity) | 26 built-in tools from `build_registry()` matched by normalized semantic comparison (names/descriptions/parameter schemas including represented nested/array/enum/default/additionalProperties fields). Not a claim of runtime-behavior or unrepresented semantic equivalence. (Verified by tests/source.) |
| P1-03 proposal validation rejects unknown tool/missing required args (proposal-only) | **PASS** | `src/evals/runner.ts`, `tests/evals/tool-contracts.test.ts` (Verified by tests/source). |
| P1-03 proposal argument validation (covered/evaluable schema features): types/integer-vs-number/boolean-not-number, required/nested objects-arrays, enums, additionalProperties/extra-key rejection when strict, nullability, no coercion/mutation, deterministic diagnostics, unsupported constructs fail closed, real authoritative schemas exercised (proposal-only, no dispatch) | **PASS** (for this increment) | `validateToolCallProposal()` rewritten with recursive deterministic schema validation + structured diagnostics in `src/evals/runner.ts`; focused tests in `tests/evals/tool-contracts.test.ts`; real registry parity in `tests/evals/tool-registry-parity.test.ts`. Not execution/sandbox safety. (Verified by tests/source.) |
| P1-03 proposal validation as complete execution safety / full JSON Schema support beyond evaluable features | **FAIL** (not claimed) | Proposal-only; unevaluable/unsupported schema constructs intentionally fail closed; P1-05 sandboxed execution remains open. (Verified by source/design.) |
| P1-04 reviewer fixture/prompt oracle leakage (severity/expected/seed labels) | **PASS** | Neutralized `tests/evals/fixtures/reviewer.json`, sanitizer, real-fixture prompt leak test in `tests/evals/runner.test.ts` (Verified by source/tests). |
| P1-05 fail-closed capability contract, opt-in flag, truthful oracle statuses, no unsafe execution by default | **PASS** (for implemented increment) | `src/evals/sandbox/capabilities.ts`, `src/evals/runner.ts`, `tests/evals/sandbox-capabilities.test.ts` + focused eval tests (39 passed locally). Opt-in reports `unsupported`/`executed:false` when controls unavailable; no patch apply/command/tool execution implemented. |
| P1-05 sandboxed coder/tool/debugging execution and safety oracles executed with OS-enforced evidence | **FAIL** (open) | No demonstrable cross-platform OS-enforced sandbox boundary; execution remains disabled/fail-closed. |
| P1-05 safety fixtures/oracles exist as metadata | **PARTIAL** | Coder/tool-calling/debugging fixtures include safety/acceptance oracle intent; runtime records structured not_run/unsupported evidence, but no executed oracle checks. |
| P1-06 planner generation vs validator cases separated | **PASS** | `tests/evals/fixtures/planner.json` modes P01–P06 generate, P07–P12 validate (Verified). |
| P1-06 invalid plans validated via `validatePlanDetailed()` without model call | **PASS** | `src/evals/runner.ts` validate-mode path + deterministic validation (Verified by source). |
| P1-06 duplicate/unknown/self/cycle/limits/criteria/bounds covered | **PASS** | Fixture cases P07–P12, `tests/evals/schema-contracts.test.ts`, `src/planner/index.ts` (Verified by tests/source). |
| P1-06 explicit runner-level proof that validate cases make zero model calls | **PASS** (for audited runner-path criterion) | `tests/evals/runner.test.ts` ("P1-06 planner validate cases (runner-level)") exercises `runGenerationSuite` with a throwing `provider.chat` spy over planner `mode:"validate"` cases (one valid bounded plan, one invalid self-dependency): asserts zero `provider.chat` calls, deterministic `validatePlanDetailed()` outcomes/metadata recorded (`mode:"validate"`, valid/invalid with expected errors), `safetyOracles { executed:false, reason:"planner-validator-case-no-model-call" }`, and request contract metadata. Focused run: 14/14 in runner suite; relevant eval suite `npx vitest run tests/evals tests/planner-compiler.test.ts tests/models` 59/59. (Verified by tests/source.) |
| P1-07 Ollama assistant tool-call request/response contract | **FAIL** (open, not changed) | Still open per ledger/review; out of scope (Reported by prior review/ledger). |
| P2-01/P2-02/P2-03 and L3/L4 | **NOT CHANGED** | Open/blocked per ledger; unchanged in this task (Verified). |

## 10. Prioritized implementation plan (dependencies, proposed units)

**Principle:** separate commits/PR-sized units, preserve P0/P1-01/P1-02/P1-03, local-only/no-egress, no unsafe tool execution, no merge/rewrite history.

1. **[Docs/process, no runtime change] Registry parity guard (supports P1-03 follow-up confidence).** — **DONE (this increment):** authoritative Python export + TS normalizer/comparator + CI-runnable parity and negative drift-detection tests implemented (`packages/local-worker/air_local/tools/export_registry.py`, `src/evals/contracts/tool-registry-parity.ts`, `tests/evals/tool-registry-parity.test.ts`); hash semantics documented as mirror identity, not sole proof. *Evidence needed/recorded:* parity and drift tests run in normal eval/contract CI jobs (exact-SHA CI to be recorded for this commit).

2. **P1-06 hardening (small).**
   - *Depends on:* none. *Status:* runner-level no-model-call criterion now evidenced by `tests/evals/runner.test.ts` (P1-06 planner validate cases). Remaining: keep evidence current; no broader P1-06 completion claimed beyond audited criteria.

3. **P1-04 residual confidence (if required by review).**
   - *Depends on:* none. *Unit:* extend reviewer prompt-leak tests to all nested/text fields and add fixture-lint guard; optional rubric/fixture-count note (no oracle leakage regressions).

4. **P1-05 sandboxed execution engine (largest, gated).** *(increment completed: fail-closed contract/capability detection + truthful statuses + opt-in flag; execution still disabled where unenforced)*
   - *Depends on:* isolated workspace primitives (existing) + strict policy design + per-OS enforcement proof. *Units (sequential):*
     - 4a. Deterministic diff/patch applier with canonical-path + symlink/reparse confinement and TOCTOU-safe checks; fail-closed rejection tests.
     - 4b. Allowlisted argv-only command executor (no shell), minimal sanitized env, cwd jail, bounded output/time, process-tree cleanup; network/filesystem denial only where OS-enforced and tested.
     - 4c. Coder execution oracles: apply+run fixture acceptance in proven sandbox; record executed safety outcomes/evidence.
     - 4d. Tool-calling/debugging executed policy oracles with deny-by-default enforcement and explicit proposal-vs-execution reporting.
   - *Must not:* enable real/unsafe tool execution outside proven sandbox; must distinguish proposal validity from execution safety; unsupported platforms/capabilities remain proposal-only.

5. **P1-07 provider assistant tool-call contract.**
   - *Depends on:* provider API freeze decisions; independent of P1-05 runner sandbox but relevant for coordinator/tool loops.

6. **P2-01–P2-03 hardening** after required P1 closures as scoped by ledger.

**Gates:** L3/L4 remain blocked until required P0/P1 and dispositioned P2 findings are reconciled with exact-SHA CI evidence and docs/ledger.

## 11. 2026-11-13 incremental implementation (partial, P1-04/P1-07/P2-01–P2-03)

**Scope:** bounded hardening only; P1-05 unchanged (PARTIAL/NOT DONE, fail-closed/proposal-only boundaries preserved). No P1-05 execution/sandbox/oracle expansion.

| Area | Implementation (source) | Tests | Status |
|---|---|---|---|
| P1-04/P2-03 (eval prompt isolation/redaction) | `src/evals/runner.ts`: recursive `sanitizeValue`/`sanitizeFixtureCase` strips hidden oracle/answer fields (incl. nested `oracle`, `expectedAction/Tool/RootCause/Finding/Files/RelevantDocIds`, `policyOracle`, `falsePositiveControl`, `required/forbidden`, `expected`, `rubric`, `scoring`, `gold`, `label(s)`, `severity`, `seeded`) and `workspace`; redacts string content via `redact`; model-visible `task` sanitized/redacted. | `tests/evals/runner.test.ts` adds recursive hidden-field/secret-redaction prompt regression; focused eval suites pass. | **PARTIAL** — covers audited prompt payload/task paths; does not prove complete redaction across all logs/errors/serialized evidence or full reviewer confidence/coverage/isolation acceptance. |
| P1-07 (Ollama tool-call contract) | `src/models/types.ts`: `ModelMessage.toolCalls?: ModelToolCall[]`. `src/models/providers/ollama.ts`: serializes assistant history `tool_calls` (`id` when present, `type:"function"`, `function.name`, `function.arguments`) for multi-turn/tool-result sequencing. Response parsing remains strict (invalid/missing/malformed rejected). | `tests/models/ollama.test.ts` adds request serialization/sequencing/multiple tool calls and malformed/incomplete/invalid argument/structure rejection cases (mocked transport). | **PARTIAL** — supported contract paths covered deterministically; full ledger acceptance/compatibility not exhaustively closed. |
| P2-01 (health timeout) | `src/models/providers/ollama.ts`: `health()` default `timeoutMs=5000`; `TIMEOUT` treated as offline (`online:false`, `provider:"ollama"`) alongside `PROVIDER_UNAVAILABLE`. | `tests/models/ollama.test.ts` updated (caller timeout/offline cases). | **PARTIAL**. |
| P2-02 (base URL validation) | `src/config/schema.ts`: `ProviderSettingsSchema.baseUrl` requires absolute HTTP(S) URL without credentials, query, or fragment. | `tests/config.test.ts` adds unsafe URL rejections and valid HTTPS acceptance. | **PARTIAL** — schema-level hardening; broader loader/runtime compatibility/diagnostic criteria remain open. |

**Validation (this increment, local):** `npx vitest run tests/models/ollama.test.ts tests/config.test.ts tests/evals/runner.test.ts` 39 passed; eval/schema/tool-contract/sandbox/fixtures subsets passed (41 in runner-adjacent eval subset); `npx vitest run tests/mcp-async.test.ts tests/e2e/scenarios/real-jobs.test.ts` 31 passed (MaxListenersExceededWarning observed). `npm run typecheck`, `npm run typecheck:test`, `npm run lint`, `npm run build`, `npm pack --dry-run`, `git diff --check` passed. Python worker checks not required (no Python source/interface changes).

**E2E baseline-vs-working-tree comparison (controlled):** target `tests/e2e/scenarios/groups.test.ts > group G: failure and recovery > a hung job is cancelled and leaves no orphans` (chat driver executes `dist/bin/air.js`). **Working tree:** failed (exit 1) — `waitForLine timeout after 20000ms for /Cancelled/` (~33.65s run) with pre-existing modified `dist/*` present (untouched/unrelated). **Baseline clean detached worktree at `e870573` (separate temp checkout, node_modules linked):** passed (exit 0, 1 passed/23 skipped, 4.27s). **Assessment:** failure is not attributable to this increment's staged src/test changes (no cancellation/MCP/orchestrator/conversation modifications); evidence indicates pre-existing local working-tree `dist` drift/environmental sensitivity rather than a regression introduced by this increment. Authoritative result requires clean-checkout/CI execution on the committed SHA.

## 13. E2E cancellation investigation and fix (2026-11-13)

### 13.1 Root cause

The E2E test `tests/e2e/scenarios/groups.test.ts > group G: failure and recovery > a hung job is cancelled and leaves no orphans` failed with `waitForLine timeout after 20000ms for /Cancelled/`. Output showed `air: thinking...` followed by `air: Acknowledged.` instead of `Cancelled`.

**Root cause:** In `bin/air.ts`, the chat REPL's `conv` variable is a closure snapshot that is never updated when `runJob` pushes the job ID to `activeWorkIds` via `mutateConversation`. When the user sends bare `/cancel`, `decide('/cancel', conv)` reads the stale `conv.activeWorkIds` (empty), returns `{ type: 'answer' }` instead of `{ type: 'cancel_job' }`, triggering `brainAnswer` → "thinking..." → "Acknowledged." instead of cancellation.

Additionally, `runJob` pushed `activeWorkIds` only after printing "Started job", creating a race window where `/cancel` could arrive before the push completed.

### 13.2 Fix

1. **Bare `/cancel` handling:** Added direct handling in the `rl.on('line')` callback using `jobHandles` (a `Map` populated before "Started job" is printed) as the source of truth, bypassing the stale `conv.activeWorkIds`. Cancels via `entry.orch.cancel(id)` + `entry.controller.abort()`, cleans up `activeWorkIds`, and prints "Cancelled".
2. **`runJob` ordering:** Moved `mutateConversation` (push `activeWorkIds`) to before `console.log("Started job")` and reloads `conv` afterward.
3. **Cleanup:** Added `jobHandles.delete(session.runId)` in the background waiter's `finally` block.
4. **Decision loop:** Reloads `conv` from disk before calling `decide` to reduce staleness for other commands.

### 13.3 Evidence

- **Before fix:** E2E test failed (timeout after 20s, "thinking..."/"Acknowledged." output).
- **After fix:** E2E test passes (3.3s, "Cancelled" output, no orphans).
- **Full suite:** 70 files passed, 2 skipped; 445 tests passed, 16 skipped.
- **Validation:** typecheck, typecheck:test, lint, build, pack --dry-run, Python worker (ruff/mypy/pytest) all pass.

### 13.4 Scope

This fix addresses the cancellation lifecycle race in the chat REPL. It does not change MCP cancellation (already fixed in P1-01), orchestrator logic, or conversation persistence. The root cause was specific to the chat REPL's stale closure variable.

## 12. Confirmation

- **P1-05, L3/L4 were not changed** by this increment except preserved status/limitations. **P1-05: PARTIAL / NOT DONE. L0-05: IN_PROGRESS. L3/L4: BLOCKED.** No OS-enforced sandbox or untrusted patch/command/tool execution implemented; proposal-only/fail-closed boundaries preserved.
- P1-04, P1-06 (residual), P1-07, P2-01–P2-03 remain **PARTIAL/not fully complete** per ledger acceptance criteria; no over-claim of completion. Unrelated work (`.kilo/tmp/`, untracked/modified `dist/*` artifacts, other worktrees) untouched. PR #5 remains open, draft, unmerged.

## Execution architecture finding (P1-05)

### Execution-flow map
CLI (bin/air.ts) / MCP (src/mcp/server.ts) -> src/evals/runner.ts::runEvaluation/runGenerationSuite -> catalog load -> for each fixture: createWorkspace (coder only) -> buildEvalMessages -> provider.chat (model call) -> validateToolCallProposal (tool-calling) -> detectSandboxCapabilities + evaluateSafetyOracles (reporting only) -> writeRecord. No patch application, command execution, or tool dispatch occurs in the runner. Safety oracles are reported, never executed.

### Source-level answers
1. Does an evaluation executor already exist? NO. runner.ts is proposal-only; it records model outputs and deterministic validation metadata. There is no patch applier, command runner, or tool dispatcher in src/evals.
2. Which operations can execute untrusted content today? NONE in the eval path. The shared trusted runner (src/execution/runner.ts) executes adapter commands but is not part of eval safety oracles and is not sandboxed as an eval boundary.
3. Which operations are proposal-only? All model outputs (diffs, tool calls, plans) are validated but not executed.
4. Which operations are deliberately disabled? Safety oracle execution (--execute-safety-oracles) reports unsupported/fail-closed because no enforced boundary exists.
5. Where should sandbox enforcement occur? At a new isolated executor that applies a proposed diff to a per-case workspace and runs fixture-declared commands under runOsSandboxed, invoked only from runGenerationSuite for coder/debugging/tool-calling oracles.
6. Can the existing runner invoke a sandboxed child process without redesigning the application? Partially: createWorkspace already provides isolated copies, and runOsSandboxed provides the OS boundary. But patch application, command allowlisting, result capture and oracle verification do not exist and must be implemented.
7. Smallest implementation meeting P1-05: a narrow EvalSandboxExecutor that (a) applies a unified diff to the workspace with canonical/symlink-safe confinement, (b) runs an allowlisted argv-only command under runOsSandboxed with minimal env, timeout, tree-kill, (c) captures exit code/output, (d) returns structured evidence. Estimated: medium-sized, platform-dependent on Linux/macOS; Windows remains unsupported without a native Job Object/restricted-token implementation.
8. Genuine new scope required: patch applier + command executor + oracle wiring + cross-platform CI evidence. This is beyond a small wiring change but is contained to src/evals/sandbox + runner and does not require L3/L4.

### Conclusion
P1-05 remains PARTIAL. The blocker is not merely missing integration; it requires implementing the eval executor (patch apply + sandboxed command execution + oracle verification) which does not yet exist. Windows lacks any OS-enforced mechanism. macOS unverified. Linux enforcement depends on host privileges. PR #5 must remain open/unmerged until this is complete.
