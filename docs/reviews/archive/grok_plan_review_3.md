# grok_plan_review_3.md

> **Document type:** Full AI-agent implementation review (third pass)  
> **Target repository:** https://github.com/radmanmilos/air  
> **Tip reviewed:** `main` @ `6e5db22bc788f3066da6e282851eefef80450dd9`  
> **Commit messages claim:** Phase 2 → Phase 5 complete  
> **Prior reviews:** Claude, ChatGPT (1–3), DeepSeek (1–2), Grok (1–2)  
> **Review date:** 2026-10-31  
> **Instruction priority:** Safety and correctness > reliable execution > maintainability > feature breadth  
> **How to use:** Treat every `G3-xx` item as a required change unless marked SHOULD/MAY. Update PLAN.md where it lags. Do not mark a phase complete until acceptance criteria pass with real tests. Reference IDs in commits.

---

## 0. Instructions to the implementation agent

1. Read this document with the current tree, `PLAN.md`, `docs/behavior-spec.md`, and prior `project_reviews/*`.
2. Inspect the live repository before changing anything.
3. Keep the project buildable and testable after every change.
4. A feature is complete only when implemented, tested, and documented — not when a commit message says “Phase N”.
5. Work only inside the `air` repository.
6. Never discard user changes, auto-commit, auto-push, or rewrite history unless the user explicitly requests it.
7. When tool CLI behavior matters, verify against installed versions; keep `docs/adapters/*.md` accurate.
8. When ambiguous, choose the safest reversible default, document it, and continue.

### Definition of done

- Code implemented, not stubbed.
- Automated tests cover success and failure paths.
- `npm ci`, `npm run build`, `npm run typecheck`, `npm run typecheck:test`, `npm test` pass on a clean clone.
- README + behavior-spec describe actual behavior.
- No secrets in logs, handoff, status, or MCP output.

---

## 1. Executive assessment

**Verdict: Substantial, real progress. The skeleton and vertical slice are largely present. Phase-complete claims overshoot what the code and tests actually prove.**

| Area | Status | Notes |
|------|--------|-------|
| Module layout | Strong | adapters, config, context, execution, health, mcp, observability, router, security, types, utils |
| Shared process runner | Present | cross-spawn, buffers, redaction, timeout, tree-kill attempt |
| Error taxonomy + policy | Present | `src/types/errors.ts` |
| Result states | Present | `src/types/result.ts` |
| Config (Zod) + paths | Present | loader, schema, platform paths |
| Health / cooldowns | Present | tracker + atomic writes |
| Aider adapter | Present | flags look plausible; **not registered in CLI/MCP adapter lists** |
| Goose adapter | Present | registered |
| Mock adapter | Present | used heavily in tests |
| Router (priority list) | Present | skip reasons recorded |
| Dirty-tree policy | Present | checkpoint + tests |
| Allow-list | Present | default first-provider; handoff check |
| Task state persistence | Present | atomic JSON under cache tasks dir |
| MCP server | Present | tools registered; **failover approval does not continue execution** |
| Verify hook | Present | module + tests |
| Adapter docs | Present | `docs/adapters/aider.md`, `goose.md` |
| Test suite breadth | Good coverage of units | **Weak on real e2e continuation** |
| PLAN.md | Lagging | Still reads like pre-implementation plan in places |
| Phase 2/3 gate (real second-agent continuation) | **Not truly proven** | Approve path and auto path incomplete |

**Bottom line for the human:** Architecture and safety intent are largely respected. The next work is hardening and closing the gap between “modules exist” and “failover actually continues work safely.”

---

## 2. Strengths to preserve

- Headless-only design; no TUI replacement.
- Vertical-slice orientation and shared `AgentAdapter` contract.
- Canonical `ErrorCategory` + `ERROR_POLICY` + `NO_FAILOVER_CATEGORIES`.
- Result states; natural language is not treated as success proof in types.
- Shared `runProcess` with redaction on capture, bounded buffers, timeout, cancel signal.
- Provider allow-list defaulting to first-attempt provider; handoff check before switch.
- Dirty-tree default refuse + `--allow-dirty` escape hatch (CLI path).
- Atomic task-state and health writes.
- Adapter spike docs exist for aider and goose.
- Broad unit tests (runner, router, health, allowlist, dirty-tree, mcp, redaction, config, paths, verify, task-state, failover gate).

Do not regress these.

---

## 3. Critical gaps (P0)

### G3-01 — Aider is implemented but not registered in runtime adapter lists (P0)

**Observed:**

- `src/adapters/aider.ts` exists and uses `--yes-always`, `--no-auto-commits`, `--message`, etc.
- CLI `listAdapters()` returns only `[MockAdapter, GooseAdapter]`.
- MCP `listAdapters()` returns the same.
- Commit messages claim Phase 2 “aider adapter” and Phase 3 “goose adapter”.

**Required:**

1. Register `AiderAdapter` in both CLI and MCP adapter lists (order intentional: prefer real tools over mock in production paths; keep mock available for tests / `AIR_USE_MOCK=1` or similar).
2. Detect whether `aider` is on PATH (or fail cleanly with `TOOL_NOT_INSTALLED`) instead of silently omitting it.
3. Tests: routing chooses aider when it is the first eligible non-mock candidate; mock remains available for offline suite.

**Acceptance:** `air route-test "fix foo" --explain` can select `aider` when the binary is available; offline tests still pass without aider installed.

### G3-02 — MCP `approve_failover` does not continue the agent (P0)

**Observed:** `approve_failover` only sets state to `SWITCHING` and returns a message. It does not:

- build a mechanical handoff from git state,
- spawn the next adapter,
- update hops / cooldowns,
- transition to RUNNING → COMPLETED/FAILED.

**Required:**

1. On approve: load task state, resolve next candidate, re-check allow-list, build handoff from **git state** (status + capped diff + changed files), spawn via `runProcess`, classify, persist state, update health.
2. Respect hop cap and no-revisit rules.
3. Never prompt on stdio.
4. Tests: MCP path A fails with RATE_LIMIT → AWAITING_APPROVAL → approve → second adapter runs (mock-to-mock is fine).

**Acceptance:** End-to-end MCP test proves continuation, not only a state flip.

### G3-03 — Success / NO_CHANGES must use workspace evidence, not stdout length (P0)

**Observed:** Both CLI and MCP use patterns equivalent to:

```ts
defaultStateForTask(readOnly, outcome.stdout.length > 0)
```

Stdout length is not a reliable proxy for “non-empty diff”. Aider can exit 0 with chatter and no file changes, or make changes with little stdout.

**Required:**

1. After a successful (exit 0) run, compute git dirty/diff relative to the pre-run checkpoint (or `git status --porcelain` / `git diff` size-capped).
2. Map:
   - write task + non-empty diff → `SUCCEEDED_WITH_CHANGES`
   - write task + empty diff → `NO_CHANGES`
   - read-only + exit 0 → `SUCCEEDED_READ_ONLY` (empty diff OK)
3. Optional trusted `verify.command` may further adjust state (already sketched in `context/verify.ts`).
4. Never treat model prose as success.

**Acceptance:** Tests with a mock that exits 0 and does not touch files → `NO_CHANGES`; mock that modifies a tracked file → `SUCCEEDED_WITH_CHANGES`.

### G3-04 — Handoff is not mechanical git-state handoff (P0)

**Observed:** `buildHandoff` emits a short markdown blurb (task, from/to, mode, files list). It does **not** include:

- branch, HEAD
- `git status`
- size-capped `git diff`
- changed file list from the failed attempt
- error category + summary
- last N KB of redacted output

PLAN and prior reviews require handoff built from data air already has — not a model summary, and not a minimal label.

**Required:**

1. Expand handoff packer (context module) to include the fields above, all redacted, size-capped.
2. Pass handoff into the next adapter’s prompt / message channel in a documented way.
3. Tests: fixture secret never appears; diff content appears when files changed.

**Acceptance:** Handoff payload matches the mechanical-git-state contract from PLAN / R-06.

### G3-05 — Unix tree-kill is incomplete without process-group spawn (P0)

**Observed:** Runner kills with `process.kill(-pid, 'SIGKILL')` on Unix, but spawn options do not set `detached: true` or a new process group. Without that, `-pid` often fails and only the direct child is killed; grandchildren can orphan.

**Required:**

1. On Unix, spawn in a new process group (e.g. `detached: true` and/or `setpgid`) so tree-kill works, **or** document and implement an alternative that reliably kills the full tree for the tools you support.
2. Test: mock that spawns a child sleeps; timeout/cancel leaves no orphans (best-effort assertion via process listing or fixture design).
3. Windows `taskkill /T /F` path is fine; keep it.

**Acceptance:** Timeout/cancel tests pass on Linux/macOS CI without orphan processes from the mock fixture.

### G3-06 — Auto-failover loop must not bypass allow-list or hop rules (P0)

**Observed:** CLI auto path filters out current adapter and calls `selectCandidate` again; allow-list is checked. Good start. Gaps:

- Handoff text is printed but not clearly injected into the next run’s task prompt.
- Cooldown updates on RATE_LIMIT / QUOTA must happen before selecting the next candidate.
- Revisit prevention for the same (tool, provider, model) within the task must be explicit (visited set).
- Hop cap exit code 2 must list skip reasons.

**Required:** Codify visited set + cooldown write + handoff injection + structured “all exhausted” message. Tests for hop cap, allow-list block, and cooldown skip.

**Acceptance:** A→B→A ping-pong impossible; blocked provider never runs; hop cap returns exit 2 with reasons.

---

## 4. High-priority gaps (P1)

### G3-07 — PLAN.md still lags the implementation (P1)

**Required:** Refresh PLAN.md so it reflects:

- Modules that exist (runner, tracker, allowlist, task-state, MCP tools, verify, trace).
- Runtime adapter registration policy (mock vs real).
- Actual handoff fields and success detection rules.
- MCP approve = continue (once G3-02 is done).
- Current phase status honestly (what is proven vs scaffolded).

**Acceptance:** PLAN alone is a trustworthy map of the codebase.

### G3-08 — Production paths must not depend on `tests/` imports (P1)

**Observed:** MCP server imports `MockAdapter` from `../../tests/mock-adapter`. CLI also pulls mock from tests.

**Required:** Move mock adapter to `src/adapters/mock.ts` (or keep dual export). Production bundles must not import from `tests/`.

**Acceptance:** `src/mcp` and `bin/air.ts` import only from `src/` (and package deps).

### G3-09 — Dirty-tree and checkpoint coverage in the full run path (P1)

**Observed:** Dirty-tree tests exist; CLI refuses dirty write tasks without `--allow-dirty`. Ensure:

1. Checkpoint snapshot is stored on task state for later attribution.
2. `--allow-dirty` never auto-resets/stashes/reverts.
3. Ambiguous overlapping edits surface `NEEDS_USER_REVIEW` rather than false confidence.

**Acceptance:** Integration test: dirty tree refused; allow-dirty preserves user files; no auto-clean.

### G3-10 — Observability completeness (P1)

**Observed:** `trace` helper exists. Ensure every run emits JSONL events for:

- route decision (chosen + skips with reasons)
- spawn start/end
- error classification (category + evidence source)
- failover propose / approve / reject
- final result state + exit code

`air route-test --explain` must match the same reasoning shape as traces.

**Acceptance:** One forced-failover test asserts trace contains the decision chain.

### G3-11 — Config trust model for verify.command (P1)

**Observed:** verify module exists. PLAN requires: do not execute repo `verify.command` by default; require explicit trust.

**Required:** Enforce untrusted `.airrc.yaml` until validated/trusted; never shell-concatenate verify commands; array args + `shell: false` only.

**Acceptance:** Tests prove untrusted verify is not executed; trusted path runs with argv array.

### G3-12 — MCP async semantics (P1)

**Observed:** `run_task` appears to await the full process inside the tool handler. Long runs will hit client timeouts.

**Required:**

1. `run_task` should queue/start work and return `runId` quickly (state QUEUED/RUNNING).
2. Poll via `get_task_status` / `get_task_output`.
3. Approval remains a state transition without stdin prompts.

**Acceptance:** MCP test: `run_task` returns before a long mock finishes; status progresses to COMPLETED.

---

## 5. Medium-priority / cleanup (P2)

### G3-13 — Result mapping for NO_CHANGES vs FAILED

Clarify CLI/MCP exit codes:

| Situation | ResultState | Exit |
|-----------|-------------|------|
| Changes made | SUCCEEDED_WITH_CHANGES | 0 |
| Read-only OK | SUCCEEDED_READ_ONLY | 0 |
| Write, no diff | NO_CHANGES | 0 or distinct code (document choice; prefer 0 with clear message) |
| Task failure | FAILED | 1 |
| All exhausted | — | 2 |
| User cancel | CANCELLED | 3 |
| Config / dirty refuse | — | 4 |

### G3-14 — Redaction choke point

Ensure status, traces, handoff, MCP output, and verify reports all pass through `redact`. Add `--api-key=value` form if not already covered. Avoid global-regex `.test()` lastIndex bugs in `containsSecret`.

### G3-15 — README honesty

README should state what works today (mock/goose offline, aider when installed, MCP tools list, known limits: approve continues only after G3-02, success uses git evidence after G3-03). Avoid “Phase 5 complete” language if e2e continuation is incomplete.

### G3-16 — Packaging

Verify clean-clone: `npm ci && npm run build && npm test`. Ensure bin shebang and `package.json` bin path work. Confirm lockfile matches deps (including any types for cross-spawn).

---

## 6. Phase reality check (authoritative for this review)

| Phase | Claimed | Actual | Gate to call it done |
|-------|---------|--------|----------------------|
| 0 Spikes | Done | **Done** | adapter docs + mock modes exist |
| 1 Skeleton | Done | **Mostly done** | runner/config/paths/health present; fix process-group kill (G3-05) |
| 2 One-agent | Done | **Partial** | aider not in listAdapters; success uses stdout length |
| 3 Handoff + safety | Done | **Partial** | allow-list yes; handoff too thin; no proven real continuation |
| 4 MCP | Done | **Partial** | tools exist; approve does not continue; not truly async |
| 5 Expand / verify | Done | **Partial** | verify module exists; not fully gated by trust policy |

**Do not start Phase 5 “expand adapters” work until G3-01–G3-06 are closed.**

---

## 7. Explicit non-goals (still)

- Interactive TUI replacement.
- Auto-commit / auto-push.
- Trusting model “Done” text.
- Scanning model stdout prose for rate limits.
- Complex classifier/scoring before misroutes are observed.
- kilocode / other tools until headless is documented and tested.

---

## 8. Ordered next actions

1. **G3-01** — Register Aider (and policy for mock) in CLI + MCP lists; PATH detect.
2. **G3-03** — Success/NO_CHANGES from git evidence vs checkpoint.
3. **G3-04** — Mechanical git-state handoff packer + redaction.
4. **G3-05** — Reliable tree-kill (process group on Unix).
5. **G3-02 + G3-12** — MCP approve continues execution; `run_task` async.
6. **G3-06** — Visited set, cooldown before re-route, hop-cap messaging.
7. **G3-08** — Move mock out of `tests/` for production imports.
8. **G3-07 / G3-15** — Sync PLAN + README to reality.
9. Add one **integration** test: mock A partial file change → RATE_LIMIT → approve/auto → mock B sees handoff + dirty tree and completes.

---

## 9. Test gaps to fill (minimum)

- [ ] Aider registered when binary present; skipped cleanly when not.
- [ ] Exit 0 + no file changes → `NO_CHANGES`.
- [ ] Exit 0 + file changes → `SUCCEEDED_WITH_CHANGES`.
- [ ] MCP approve actually runs second adapter.
- [ ] MCP `run_task` returns runId before long job finishes.
- [ ] Handoff contains status/diff; secrets redacted.
- [ ] Timeout kills mock child tree (Unix + Windows where CI allows).
- [ ] Hop cap and allow-list block with exit 2 and reasons.
- [ ] Untrusted `verify.command` not executed.

---

## 10. Summary for the human

The project moved from scaffold to a real architecture in a short time: runner, router, health, config, adapters, MCP, allow-list, dirty-tree, and a solid unit-test base.

What is **not** yet true despite Phase 2–5 commit titles:

1. Aider is not actually on the default runtime adapter list.
2. Failover approval does not continue work in MCP.
3. Success is still inferred from stdout volume, not git state.
4. Handoff is a label, not a mechanical context pack.
5. Process-tree kill on Unix is likely incomplete.
6. PLAN/README over-claim completeness.

Close G3-01 through G3-06 before adding more adapters or calling the orchestrator production-ready. After those, the system will match the safety model the earlier reviews established.
