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

**What exists (Verified by source):** `EVAL_TOOL_DEFINITIONS` mirrors 26 tools from the internal Python worker registry (`packages/local-worker/air_local/tools/builtin.py` via `files.py`, `shell.py`, `web.py`, `git.py`, `ollama_tools.py`, `code_analysis.py`, `scaffold/*`) and is exposed as request `tools` plus model-visible catalog in tool-calling prompts (`src/evals/runner.ts` `suiteContract`/`buildEvalMessages`/`buildEvalChatRequest`). `EVAL_TOOL_REGISTRY` (name map) is exported and baselined in `scripts/check-dead-code.mjs` but not consumed by runtime logic in this package (static scan). *Verified by source inspection*.

**Parity assessment (Verified by comparison):** names and registration set match the worker's `build_registry()` (26 tools). Core parameters/required fields/descriptions align for the compared tools (e.g. `read_file`/`write_file`/`append_file`/`list_dir`/`search_files`/`file_info`, `run_shell`, `web_search`/`web_fetch`, git tools incl. `run_tests cwd/pattern`, ollama lifecycle, `analyze_code`/`check_dependencies`/`count_lines`, scaffold/test/doc tools). *Not exhaustively field-for-field machine-compared for every schema detail against Python at runtime.*

**Gaps / not proven (Inference):**
- The mirror is **manual/duplicated** TypeScript vs Python; no generation step or automated parity test currently proves ongoing sync. A worker tool added/renamed or a parameter/required/type/description change can drift silently.
- `stableHash(EVAL_TOOL_DEFINITIONS)` records the **eval mirror identity** only; it does **not** prove parity with the live worker registry.
- `tests/evals/tool-contracts.test.ts` asserts presence of a few expected names and proposal validation behavior, but does **not** detect registry drift/omissions vs worker.
- `run_shell` description in mirror states "argv, no shell" / allowlisted (aligned with `shell.py` behavior) — wording parity is important for model behavior but not automatically enforced.

**Recommendation (not implemented):** establish a maintainable parity mechanism: (a) generate a shared normalized tool-contract artifact from the worker registry consumed by TS evals, or (b) add a test that loads/normalizes the Python registry definition (or a checked-in exported JSON snapshot produced from it) and asserts name/required/parameter-schema/description equivalence with `EVAL_TOOL_DEFINITIONS` in CI. Treat hash as mirror-version metadata, not parity proof.

## 5. Tool proposal validator limitations (`src/evals/runner.ts`)

**Actual behavior (Verified by source/tests):** `validateToolCallProposal()` (`src/evals/runner.ts`) checks: tool-call presence (absent => valid/no reasons), known tool name in allowed registry (`unknown_tool`), `type === 'function'`, arguments is a non-array object, and all declared `required` keys present. If `parameters.properties` exists it computes extra keys and **returns `{ valid: true, reasons: ['extra_arguments:...'] }`** (extra keys tolerated/recorded, not rejected). It does **not** validate argument value types, enums, formats, nested schemas, or coercion; it does **not** enforce `additionalProperties:false`. *Verified by `src/evals/runner.ts` and `tests/evals/tool-contracts.test.ts` (unknown/missing rejected; registered call accepted).*

**Scope and risk (Verified/Inference):**
- **Intentional for proposal-only evaluation:** runner stores proposals and deterministic validation metadata; generation suites do not execute tool calls/apply patches/run commands (`runGenerationSuite` records `toolProposalValidation` and `safetyOracles: { executed:false, reason:"proposal-only-runner-does-not-execute" }` for coder/tool-calling). *Verified by runner/tests/help text.*
- Malformed argument **values/types** can be marked valid if names/required presence pass. Extra keys are accepted (flagged in reasons) rather than rejected.
- **Execution safety boundary:** this validator must **not** be treated as a complete execution-safety or runtime-argument-validation boundary. Downstream/runtime execution (and P1-05 sandboxed evaluation) would require independent, strict validation and policy enforcement. Current eval path does not execute proposed tools, so proposal-validation gaps do not imply executed compromise in this runner.

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
| P1-03 tool registry is proven in sync with worker (generated/shared or drift test) | **FAIL** | Manual mirror in `src/evals/contracts/tools.ts`; hash is mirror identity only; no parity/drift test (Verified by source). |
| P1-03 tool registry name/shape coverage matches worker registry at time of commit | **PARTIAL** | 26 tools/names and key params/required aligned by inspection; not machine-proven exhaustive parity (Verified by comparison/Inference). |
| P1-03 proposal validation rejects unknown tool/missing required args (proposal-only) | **PASS** | `src/evals/runner.ts`, `tests/evals/tool-contracts.test.ts` (Verified by tests/source). |
| P1-03 proposal validation enforces full arg types/extra-key rejection/execution safety | **FAIL** (not claimed complete) | Value types/enums/nesting not validated; extras accepted/recorded; runner proposal-only, not execution boundary (Verified by source). |
| P1-04 reviewer fixture/prompt oracle leakage (severity/expected/seed labels) | **PASS** | Neutralized `tests/evals/fixtures/reviewer.json`, sanitizer, real-fixture prompt leak test in `tests/evals/runner.test.ts` (Verified by source/tests). |
| P1-05 fail-closed capability contract, opt-in flag, truthful oracle statuses, no unsafe execution by default | **PASS** (for implemented increment) | `src/evals/sandbox/capabilities.ts`, `src/evals/runner.ts`, `tests/evals/sandbox-capabilities.test.ts` + focused eval tests (39 passed locally). Opt-in reports `unsupported`/`executed:false` when controls unavailable; no patch apply/command/tool execution implemented. |
| P1-05 sandboxed coder/tool/debugging execution and safety oracles executed with OS-enforced evidence | **FAIL** (open) | No demonstrable cross-platform OS-enforced sandbox boundary; execution remains disabled/fail-closed. |
| P1-05 safety fixtures/oracles exist as metadata | **PARTIAL** | Coder/tool-calling/debugging fixtures include safety/acceptance oracle intent; runtime records structured not_run/unsupported evidence, but no executed oracle checks. |
| P1-06 planner generation vs validator cases separated | **PASS** | `tests/evals/fixtures/planner.json` modes P01–P06 generate, P07–P12 validate (Verified). |
| P1-06 invalid plans validated via `validatePlanDetailed()` without model call | **PASS** | `src/evals/runner.ts` validate-mode path + deterministic validation (Verified by source). |
| P1-06 duplicate/unknown/self/cycle/limits/criteria/bounds covered | **PASS** | Fixture cases P07–P12, `tests/evals/schema-contracts.test.ts`, `src/planner/index.ts` (Verified by tests/source). |
| P1-06 explicit runner-level proof that validate cases make zero model calls | **PARTIAL** | Control flow prevents chat call; no dedicated test asserting zero provider invocations for validate case found (Verified by inspection). |
| P1-07 Ollama assistant tool-call request/response contract | **FAIL** (open, not changed) | Still open per ledger/review; out of scope (Reported by prior review/ledger). |
| P2-01/P2-02/P2-03 and L3/L4 | **NOT CHANGED** | Open/blocked per ledger; unchanged in this task (Verified). |

## 10. Prioritized implementation plan (dependencies, proposed units)

**Principle:** separate commits/PR-sized units, preserve P0/P1-01/P1-02/P1-03, local-only/no-egress, no unsafe tool execution, no merge/rewrite history.

1. **[Docs/process, no runtime change] Registry parity guard (supports P1-03 follow-up confidence).**
   - *Depends on:* none. *Unit:* add automated parity check (generated shared contract from `packages/local-worker/air_local/tools` or normalized snapshot + TS comparison test) and document hash semantics. *Evidence needed:* CI test proves parity or fails on drift.

2. **P1-06 hardening (small).**
   - *Depends on:* none. *Unit:* add runner-level test asserting planner `mode:"validate"` performs no `provider.chat` and records deterministic validation/safety markers; adjust docs if needed.

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

## 11. Confirmation

- **P1-07, P2, and L3/L4 were not changed** by this documentation-only reconciliation. Ledger preserves their open/blocked status. **P1-05: PARTIAL / NOT DONE. L0-05: IN_PROGRESS. L3/L4: BLOCKED.** No OS-enforced sandbox or untrusted patch/command/tool execution is implemented; P1-05 execution oracles have not been run. P1-03 registry-parity and proposal-validator limitations remain open.
- **This documentation-only task did not add further runtime implementation.** The P1-05 fail-closed contract was implemented in `02cbaadf9b03aeec0009315f71d0b69ef44fabcb` (CI [43391210944](https://github.com/radmanmilos/air/actions/runs/43391210944), 7/7). Latest documentation/branch SHA before this correction: `4bd48db041a3b01c7251ceab7055264ffff5a8bf` (CI [43398692962](https://github.com/radmanmilos/air/actions/runs/43398692962), 7/7). No source, test, fixture, or runtime behavior was modified. Unrelated work (`.kilo/tmp/`, untracked `dist/` artifacts, other worktrees) untouched. *Verified by diff inspection (intended docs only for this correction).*
