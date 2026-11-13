# P1 Evaluation Follow-up Review (P1-03 CI, P1-04/P1-05/P1-06 Investigation)

**Scope:** Verification, ledger correction, and investigation only. No P1-04/P1-05/P1-06 implementation was performed. No source, fixture, or test behavior was changed.

## 1. Exact repository / commit reviewed

- **Repository:** `https://github.com/radmanmilos/air`
- **Local checkout:** `E:\GitHub\air`
- **Branch:** `fix/l0-05-p0-conversation-atomic` (tracks `origin/fix/l0-05-p0-conversation-atomic`) — *Verified by `git branch -vv`/`git status`*.
- **Local HEAD / PR head:** `42ee626809446d4cd17c44633db890401b2d9688` (`fix(evals): provide authoritative schemas and tool context (P1-03)`) — local == origin == PR #5 head. *Verified by git/GitHub (`gh pr view 5`)*.
- **PR:** [#5](https://github.com/radmanmilos/air/pull/5) (OPEN, base `main`). *Verified by GitHub*.
- **`main` HEAD:** `f5e45a345f430b96d66933838944469886879689`. *Verified by git*.
- **Worktree state (pre-edit):** only untracked `?? .kilo/tmp/`; preserved. Unrelated worktrees present and untouched (`air/run-mw3wal87-imma95`, `air/run-mw4vz2cg-zl4qjp`). *Verified by `git status --short`, `git branch -vv`*.
- **P1-03 implementation diff reviewed:** commit `42ee626` (14 files: eval runner/contracts/planner/model type/fixtures/tests/dead-code baseline/ledger). *Verified by `git show --name-only` and source inspection*.

## 2. P1-03 exact-SHA CI evidence

- **Exact SHA:** `42ee626809446d4cd17c44633db890401b2d9688`
- **Workflow run:** [43339234872](https://github.com/radmanmilos/air/actions/runs/43339234872) — **completed, conclusion: success**. *Verified by GitHub CI (`gh run view`)*.

| Job | Conclusion | URL |
|---|---|---|
| test (ubuntu-24.04, 22) | success | [131603085194](https://github.com/radmanmilos/air/actions/runs/43339234872/job/131603085194) |
| test (windows-latest, 22) | success | [131603085160](https://github.com/radmanmilos/air/actions/runs/43339234872/job/131603085160) |
| Python worker (ubuntu-24.04, 3.12) | success | [131603084775](https://github.com/radmanmilos/air/actions/runs/43339234872/job/131603084775) |
| Python worker (ubuntu-24.04, 3.14) | success | [131603085065](https://github.com/radmanmilos/air/actions/runs/43339234872/job/131603085065) |
| Python worker (windows-latest, 3.12) | success | [131603085223](https://github.com/radmanmilos/air/actions/runs/43339234872/job/131603085223) |
| Python worker (windows-latest, 3.14) | success | [131603085381](https://github.com/radmanmilos/air/actions/runs/43339234872/job/131603085381) |
| Real-binary smoke tests | success | [131604525364](https://github.com/radmanmilos/air/actions/runs/43339234872/job/131604525364) |

**Count:** 7/7 required jobs green for the exact SHA.

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

**Status: FAIL / NOT COMPLETE for sandboxed execution & safety-oracle execution (by design/open scope).**

| Area | Evidence (Verified) |
|---|---|
| Runner execution boundary | `src/evals/runner.ts`: generation suites store proposals/validation metadata only; no tool dispatch, no diff application, no fixture command execution. Records `safetyOracles: { executed:false, reason:"proposal-only-runner-does-not-execute" }` for coder/tool-calling; planner validate cases record deterministic validation without model call. Help text states proposals not executed. |
| Tool-calling fixtures/oracles | `tests/evals/fixtures/tool-calling.json`: includes policy/safety cases (T08 outside workspace, T09 path escape, T10 unregistered/disallowed, T11 invalid args, T12 untrusted tool output) as **expected/hidden oracle metadata** (`policyOracle`, `expectedTool`) — not executed. |
| Coder fixtures/oracles | `tests/evals/fixtures/coder.json`: workspace-based tasks with acceptance/commands implied; runner does not apply diff or run `node --test`. K06/K07 safety-oriented cases exist as fixture intent/oracles only in proposal-only mode. |
| Debugging | `tests/evals/fixtures/debugging.json`: diagnostic evidence/repair oracles present; no automatic repair execution/scoring in runner. |
| Workspace harness (existing) | `tests/evals/helpers/workspace.ts` / `tests/evals/workspace.test.ts` provide isolated temp workspace copy/cleanup and path/symlink checks for fixture staging (Verified by file presence/tests referenced in prior state); **not** a sandboxed execution engine for applying untrusted model patches or running arbitrary commands. |

**Not verified / open:** isolated apply-and-run sandbox with enforced filesystem/process/network boundaries, symlink/path-traversal enforcement during untrusted write application, subprocess allowlisting/timeout/cleanup guarantees, destructive-op and egress prevention tests, and distinction of proposal validation vs actual execution safety outcomes.

**Proposed sandbox architecture (Recommendation, not implemented):**
1. **Isolated executor per case:** ephemeral temp workspace copied from fixture; no writes outside workspace root (canonical-path + symlink-aware checks before/after).
2. **Patch application stage (coder):** accept only bounded patch/diff format; apply via deterministic applier; reject path escapes, absolute/protected paths, symlinks escaping root; record applied files/deltas.
3. **Command execution stage:** run only fixture-declared/allowlisted verification commands with explicit cwd, env scrub, timeout, output capture, and killed process tree; default **no network** and no shell unless explicitly modeled and denied by policy tests.
4. **Policy/safety checks:** assert no file mutations outside workspace, no disallowed/protected paths touched, no tool executed for denied cases; treat tool output/model text as untrusted.
5. **Oracles & reporting:** record `executed:true/false` per oracle with pass/fail/violation reasons, distinguishing proposal-schema validity from executed safety/acceptance.

**Minimum safe implementation sequence & fail-closed behavior (Recommendation):**
- Step 1: executor contract + deterministic diff applier with strict path/symlink confinement tests (fail closed on any escape/ambiguity).
- Step 2: allowlisted command runner (timeout, cwd jail, env/network restrictions where feasible) + cleanup guarantees.
- Step 3: coder acceptance oracles (apply diff, run fixture command, compare expected outcomes) separated from safety violations.
- Step 4: tool-calling/debugging execution oracles with deny-by-default policy checks and explicit `executed` evidence.
- **Fail closed:** on parse/apply ambiguity, boundary violation, disallowed command/tool, timeout, or unverifiable environment, record failure/violation (never success) and never execute outside the allowed sandbox.

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
| P1-05 sandboxed coder/tool/debugging execution and safety oracles executed | **FAIL** | Runner records `safetyOracles.executed:false` (proposal-only); no apply/run/deny-enforcement executor (Verified by source). |
| P1-05 safety fixtures/oracles exist as metadata | **PARTIAL** | Coder/tool-calling/debugging fixtures include safety/acceptance oracle intent but unexecuted (Verified by fixtures/source). |
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

4. **P1-05 sandboxed execution engine (largest, gated).**
   - *Depends on:* isolated workspace primitives (existing) + strict policy design. *Units (sequential):*
     - 4a. Deterministic diff/patch applier with canonical-path + symlink confinement, fail-closed rejection tests.
     - 4b. Allowlisted command executor (cwd jail, timeout, process-tree cleanup, restricted env/network posture per platform capability) with tests.
     - 4c. Coder execution oracles: apply+run fixture acceptance in sandbox; record executed safety outcomes.
     - 4d. Tool-calling/debugging executed policy oracles with deny-by-default enforcement and explicit proposal-vs-execution reporting.
   - *Must not:* enable real/unsafe tool execution outside sandbox; must distinguish proposal validity from execution safety.

5. **P1-07 provider assistant tool-call contract.**
   - *Depends on:* provider API freeze decisions; independent of P1-05 runner sandbox but relevant for coordinator/tool loops.

6. **P2-01–P2-03 hardening** after required P1 closures as scoped by ledger.

**Gates:** L3/L4 remain blocked until required P0/P1 and dispositioned P2 findings are reconciled with exact-SHA CI evidence and docs/ledger.

## 11. Confirmation

- **P1-07, P2, and L3/L4 were not changed** by this task. Ledger preserves their open/blocked status. No P1-04/P1-05/P1-06 implementation was started. No source/fixture/test runtime behavior was modified. Unrelated work (`.kilo/tmp/`, other worktrees) untouched. *Verified by `git diff --stat`/inspection of edited files (docs only).*
