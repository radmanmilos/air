# grok_plan_review_2.md

> **Document type:** AI-agent delta review (second pass)  
> **Target repository:** https://github.com/radmanmilos/air  
> **Branch / tip reviewed:** `main` @ `17f8e3697905352c7b348260dc18b49420e5646d` (and parents through `3e441e6f`)  
> **Prior reviews in tree:** Claude, ChatGPT (1+2), DeepSeek, Grok (`project_reviews/grok_plan_review.md`)  
> **Review date:** 2026-10-31  
> **Instruction priority:** Safety and correctness > reliable execution > maintainability > feature breadth  
> **How to use:** This is a delta. Do not redesign the product. Apply remaining items; update `PLAN.md` where it still lags the code or the gates. Reference IDs (`G2-xx`) in commits.

---

## 0. Instructions to the implementation agent

1. Read this document together with current `PLAN.md`, `docs/behavior-spec.md`, and prior `project_reviews/*`.
2. Inspect the live tree before changing anything. Do not assume this snapshot is perfect.
3. Keep the project buildable and testable after every change. Prefer small, verifiable increments.
4. Do not mark a phase complete until its acceptance criteria pass with real tests and real artifacts.
5. Work only inside the `air` repository.
6. Never discard user changes, auto-commit, auto-push, or rewrite history unless the user explicitly requests it.
7. When tool CLI behavior is required, verify against installed versions and record findings in `docs/adapters/<tool>.md`.
8. When ambiguous, choose the safest reversible default, document it, and continue.

### Definition of done (any item)

- Implemented, not stubbed.
- Automated tests cover success and failure paths.
- `npm run build`, `npm run typecheck`, `npm run typecheck:test`, `npm test` pass.
- `docs/behavior-spec.md` and CLI help match actual behavior.
- No secrets in logs, handoff, or status output.

---

## 1. Progress since Grok review 1

**Good progress. Several P0/P1 foundations from Grok + DeepSeek are now in code.**

| Item | Status |
|------|--------|
| Canonical `ErrorCategory` + `ERROR_POLICY` + `NO_FAILOVER_CATEGORIES` | **Done** — `src/types/errors.ts` |
| Result states + `defaultStateForTask` | **Done** — `src/types/result.ts` |
| Shared domain types (`TaskInput`, `CommandSpec`, `ToolCapabilities`, …) | **Done** — `src/types/index.ts` |
| `AgentAdapter` contract | **Done** — `src/adapters/adapter.ts` |
| `MockAdapter` + conformance helper | **Done** — `src/adapters/mock.ts`, `conformance.ts` |
| Secret redaction layer + tests | **Done** — `src/security/redact.ts`, `tests/redaction.test.ts` |
| `.env.example` | **Done** |
| `docs/behavior-spec.md` + conformance test | **Done** (partial — see G2-04) |
| Adapter conformance tests | **Done** — `tests/adapter-conformance.test.ts` |
| Mock fixture tests | **Done** — `tests/fixtures.test.ts` |
| Vitest `@/` alias | **Done** |
| Package deps (zod, cross-spawn, vitest, pinned MCP SDK) | **Done** |
| CLI commands implemented | **Not done** — still “Not implemented yet” |
| `docs/adapters/*.md` (Phase 0 spikes) | **Missing** |
| Shared process runner (cross-spawn, tree-kill, buffers) | **Missing** |
| Zod config loader + path resolver | **Missing** |
| Health / cooldown persistence | **Missing** |
| Real aider adapter | **Missing** |
| PLAN.md fully reflecting Grok/DeepSeek decisions | **Lagging** (see G2-01) |

**Phase assessment**

- **Phase 0:** Incomplete. Mock + vitest exist; **adapter spike docs do not**.
- **Phase 1 (Skeleton):** Partially started (types, redaction, adapter contract). Config, paths, process runner, atomic health still absent.
- **Phase 2+:** Not started (correct). Do not start real one-agent execution until Phase 0 + skeleton gates pass.

---

## 2. Strengths to preserve

- Headless-only, vertical-slice order, provider/model cooldowns, mechanical git handoff, no stdout-prose scanning.
- Phase 2 = failover *proposal only*; Phase 3 = first real cross-agent continuation.
- `ERROR_POLICY` and `NO_FAILOVER_CATEGORIES` correctly block failover on `USER_CANCELLED`, `AUTH_ERROR`, `PERMISSION_DENIED`, `TOOL_NOT_INSTALLED`, `TASK_FAILURE`.
- Redaction runs on patterns that matter (sk-, Bearer, `--api-key`, `*_KEY=`).
- Conformance path rejects adapters that return categories inconsistent with stderr evidence.
- Behavior-spec is treated as executable documentation.

Do not regress any of the above.

---

## 3. Required corrections (delta)

### G2-01 — Sync PLAN.md with implemented decisions (P0)

**Observed:** Commit message claims DeepSeek + Grok reviews were applied, and code reflects many of them, but `PLAN.md` still reads largely as the pre-Grok document. It does not list the new modules (`src/types/errors.ts`, redaction, `AgentAdapter`, behavior-spec), concurrency/governance notes, or config schema versioning / `air config migrate`.

**Required:**

1. Update the “Reviews applied” section to include Grok (`G-01`–`G-12`) and DeepSeek (`G-01`–`G-06` from that doc).
2. Document in PLAN:
   - Canonical types live in `src/types/`.
   - `AgentAdapter` is the only adapter surface the router may depend on.
   - Redaction is mandatory on all captured output before logs/handoff/status.
   - Config schema is versioned; `air config migrate` exists (even if stubbed until implemented).
   - Concurrency: atomic health/cooldown writes; max concurrent agents (default 1) as a future/planned control.
3. Keep the Phase 0–5 table and the explicit **Gate: no real second-agent continuation before handoff + redaction + allow-list**.

**Acceptance:** A reader of PLAN.md alone can find the error taxonomy, result states, adapter contract, redaction rule, and phase gates without reading the review files.

### G2-02 — Finish Phase 0 (adapter spikes) before more skeleton (P0)

**Observed:** `docs/` contains only `behavior-spec.md`. No `docs/adapters/aider.md` (or second tool). Phase 0 “Done when” still requires those docs.

**Required:**

1. Create `docs/adapters/aider.md` from a real installed-CLI experiment:
   - Exact headless invocation (executable + flags).
   - How to pass prompt and optional file list.
   - Model/provider selection.
   - Disable auto-commit / auto-approve / interactive prompts (verify current flag names, e.g. `--yes-always`).
   - Exit codes and error stream (stderr vs stdout) for success, rate limit, auth, model unavailable.
   - Any structured output mode.
2. Create the same for one second candidate (goose or opencode) after confirming headless mode.
3. Do not invent flags. If a tool cannot run headlessly, document that and drop it from initial scope.

**Acceptance:**

- Both markdown files exist and match installed CLI behavior.
- Phase 0 criteria in PLAN.md are satisfied.
- `npm test` still passes offline with no real tools required.

### G2-03 — Implement the shared process runner next (P0)

**Observed:** `MockAdapter` and fixture tests spawn via `node:child_process.spawn` directly. There is still no shared execution module used by all adapters.

**Required:** One module (e.g. `src/execution/runner.ts`) that:

- Uses `cross-spawn` with argument arrays; never `shell: true`.
- `stdio: ['pipe','pipe','pipe']`; close or ignore child stdin.
- Streams stdout/stderr to the caller while keeping a bounded rolling buffer + truncation metadata.
- Supports timeout + `AbortSignal`; tree-kill on cancel/timeout (`taskkill /T /F` on Windows, process group on Unix).
- Returns structured result: exit code, signal, timedOut, cancelled, buffered stdout/stderr (already redacted or ready for redaction).
- Injection-safe: task text with quotes, `&`, `|`, `$()` reaches the child unmodified.

Wire `MockAdapter` (and later real adapters) through this runner only.

**Acceptance:**

- Unit tests for success, timeout, cancel, injection, bounded buffer.
- No orphan processes after timeout/cancel.
- Runner is the only place that spawns tools.

### G2-04 — Align CLI, behavior-spec, and stubs (P1)

**Observed mismatches:**

- `docs/behavior-spec.md` documents `air status --json` and `air config migrate`.
- `bin/air.ts` does not register `--json` on status, does not register `config migrate`, and every command still prints “Not implemented yet”.
- Behavior-spec test only checks that the *spec text* mentions commands; it does not assert CLI help or implemented behavior.

**Required:**

1. Either implement the documented options (even as thin stubs that return a clear “not implemented” structured message) **or** remove them from the behavior-spec until the phase that delivers them.
2. Prefer: keep them in the spec and register the flags/subcommands so `--help` matches the spec; body can still be incomplete if the message is explicit and tested.
3. Strengthen `tests/behavior-spec.test.ts` so that every command listed in the spec appears in `air --help` output (spawn the CLI or import the commander program).

**Acceptance:** Spec, `--help`, and registered commands stay in sync. No documented flag that the CLI does not accept.

### G2-05 — Fix MockAdapter `classifyError` edge case (P1)

**Observed:** In `src/adapters/mock.ts`:

```ts
if (exitCode === 0) return 'TASK_FAILURE';
```

Exit 0 is success (or `NO_CHANGES` / read-only), not a failure category. Classification is only meaningful on failure paths. Returning `TASK_FAILURE` on exit 0 will confuse any caller that always classifies.

**Required:**

- On `exitCode === 0`, either do not call `classifyError`, or return a dedicated non-failure sentinel only if the type system requires it — prefer not classifying success.
- Keep the rule: never scan stdout prose; only stderr + exit code + structured fields on non-zero / signal exits.
- Add a test: `false_positive` / `succeed` / `no_changes` must not yield `RATE_LIMIT` or `TASK_FAILURE` from a success path used by the runner.

**Acceptance:** Success exits are never labeled as failure categories in the execution path.

### G2-06 — Redaction: close remaining gaps (P1)

**Observed:** Good baseline. Gaps:

- `containsSecret` uses global regexes with `.test()`; lastIndex can cause intermittent false negatives. Reset or use non-global copies for tests.
- `allow` option is a no-op (comment says informational). Either implement allowlisting or remove the option until needed.
- Command-line redaction should also cover values after `=` in flags (`--api-key=secret`).
- Ensure every path that writes logs, handoff, or status runs `redact()` (document the single choke point).

**Acceptance:**

- Tests remain deterministic.
- `--api-key=secret` form is redacted.
- Documented choke point for all outbound text.

### G2-07 — Config, paths, health (Phase 1 skeleton) (P1)

Still required before one-agent execution:

1. **Central path resolver** — one module; platform table already in PLAN (XDG / macOS Application Support / Windows APPDATA). No feature may hard-code `~/.config` or `~/.cache`.
2. **Zod config** — single schema, version field, precedence CLI > env > repo `.airrc.yaml` > global > defaults. Repo config untrusted until validated/trusted.
3. **Atomic health/cooldown file** — `(provider, model)` keys; temp + rename; safe under concurrent CLI + future MCP.
4. **Logger** — structured JSONL for routing/failover events; always redacted.

**Acceptance:** Path unit tests with mocked platform/env; config validation errors name file + key; concurrent write test does not corrupt health state.

### G2-08 — Do not advance past the Phase 2/3 gate (P0 reminder)

- Phase 2 may *propose* failover with reasoning, cooldowns, alternatives (mocked).
- Phase 2 must **not** launch a second real agent against a partially edited tree.
- Phase 3 is the first phase allowed to do real continuation, and only after mechanical handoff, redaction, allow-list/consent, and durable task state are tested.

**Acceptance:** No code path starts a second real agent until Phase 3 acceptance tests exist and pass.

### G2-09 — TypeScript / packaging hygiene (P2)

**Observed:** Latest commit message migrates `moduleResolution` to `bundler`; verify the committed `tsconfig.json` / `tsconfig.test.json` match that (some fetches still showed `"node"`). Confirm:

- `npm ci` on a clean clone succeeds.
- `npm run build`, `typecheck`, `typecheck:test`, `test` all green.
- Emitted `dist/bin/air.js` is runnable via package `bin` on Unix and Windows.
- No unused dependencies; lockfile matches `package.json`.

**Acceptance:** Clean-clone install + build + test documented in a short CONTRIBUTING or tests README note.

### G2-10 — Router and observability remain deferred correctly (P2)

- Keep priority-list routing until real misroutes appear.
- Hop cap default 3; no revisit of the same (tool, provider, model) while in cooldown.
- When implementing status: `air status` canonical; `health` true alias; optional `--json` matching a documented schema.
- Per-run JSONL traces when the execution path exists (Grok G-11).

Do not build the classifier or scoring now.

---

## 4. Phase checklist (unchanged gates)

| Phase | Must produce | Exit criteria |
|-------|--------------|---------------|
| **0 Spikes** | `docs/adapters/aider.md` + one other; mock modes; vitest green | Artifacts exist; tests offline |
| **1 Skeleton** | Paths, Zod config, process runner, logger+redaction, atomic health, tests | `npm ci` + build + typecheck + test green |
| **2 One-agent** | Aider adapter, `air run`, stream+buffer, classification, run IDs, result states, dirty-tree check, checkpoint snapshot, **failover proposal only** | Single-agent + mock proposal tests; no second real agent |
| **3 Handoff + safety** | Second adapter, task state, mechanical handoff, redaction in path, allow-list/consent, real continuation | E2E A→partial fail→B continues safely |
| **4 MCP** | Async jobs, typed tools, no stdio prompts | MCP tests pass |
| **5 Expand** | More adapters after verification; scoring only if needed | Tests pass |

---

## 5. Explicit non-goals (still)

- Interactive TUI replacement.
- Auto-commit / auto-push.
- Trusting model “Done” text as success.
- Scanning model stdout prose for rate limits.
- Importing model lists from other repos.
- Real multi-agent continuation before Phase 3 gates.
- Complex classifier/scoring before the vertical slice is proven.

---

## 6. Suggested immediate next actions (ordered)

1. **G2-01** — Update `PLAN.md` so it matches the code and gates.
2. **G2-02** — Write real `docs/adapters/aider.md` (+ one second tool).
3. **G2-05** — Fix success-path `classifyError` behavior; add tests.
4. **G2-03** — Implement shared process runner; route MockAdapter through it.
5. **G2-06 / G2-07** — Harden redaction; add path resolver + Zod config + atomic health.
6. Only then wire `air run` to MockAdapter end-to-end (still Phase 1/2), keeping failover as *proposal only*.

---

## 7. Summary for the human

The last round of work correctly landed the shared types, error policy, result states, adapter contract, mock + conformance, and redaction. That is the right foundation.

What is still blocking a truthful “Phase 0/1 complete” claim:

1. Missing adapter spike docs (`docs/adapters/`).
2. Missing shared process runner.
3. Missing config + path + health skeleton.
4. CLI / behavior-spec drift (`--json`, `config migrate`).
5. PLAN.md not fully updated to match the code.

If the implementation agent follows the ordered next actions and respects the Phase 2/3 gate, the project stays on a safe path. Do not start real aider execution or real failover until Phase 0 spikes and the process runner are done.
