# grok_plan_review_4.md

> **Document type:** Full AI-agent implementation review (fourth pass) — “are we done?”  
> **Target repository:** https://github.com/radmanmilos/air  
> **Tip reviewed:** `main` @ `653c268ce905500654a6e730e19a4fafe54fdab9`  
> **Prior reviews:** Claude, ChatGPT (1–3), DeepSeek (1–2), Grok (1–3)  
> **Review date:** 2026-11-01  
> **Instruction priority:** Safety and correctness > reliable execution > maintainability > feature breadth  
> **How to use:** This is an honesty check against “done.” Apply remaining `G4-xx` items. Do not expand scope until the residual safety/docs gaps are closed.

---

## 0. Instructions to the implementation agent

1. Read this with the live tree, `PLAN.md`, `README.md`, `docs/behavior-spec.md`, and prior reviews under `docs/reviews/`.
2. Inspect the repository before changing anything.
3. Keep the project buildable and testable after every change.
4. “Done” means: behavior matches docs, tests prove the safety gates, unverified adapters are clearly gated, and clean-clone CI is green.
5. Work only inside the `air` repository.
6. Never discard user changes, auto-commit, auto-push, or rewrite history unless the user explicitly requests it.

### Definition of done (product-level)

- Core CLI + MCP paths work offline with mock and with discovered real tools.
- Failover can *propose* and (when approved/auto) *continue* with mechanical handoff.
- Success is based on workspace evidence, not model prose or stdout volume.
- Secrets never leave redaction.
- Docs (README, PLAN, behavior-spec, adapter spikes) match reality.
- `npm ci && npm run build && npm run typecheck && npm run typecheck:test && npm test` pass on a clean clone.
- Unverified adapters cannot be mistaken for production-ready.

---

## 1. Executive answer: are we done?

**Short answer: The MVP architecture is largely complete. It is not “ship and forget” done.**

What is true now:

| Capability | Status |
|------------|--------|
| Shared process runner (cross-spawn, buffers, redaction, timeout, cancel, detached Unix group) | **Done** |
| Canonical errors + policy + result states + exit codes | **Done** |
| Zod config + platform paths + atomic health/task state | **Done** |
| Adapter registry with PATH discovery (aider, goose, …) | **Done** |
| Mock test-only (not in production registry) | **Done** |
| Router priority list + skip reasons + cooldowns | **Done** |
| Dirty-tree refuse + `--allow-dirty` | **Done** |
| Mechanical git-state handoff packer | **Done** |
| Success/`NO_CHANGES` from post-run git snapshot | **Done** |
| CLI auto-failover loop with visited set + allow-list + handoff injection | **Done** |
| MCP async `run_task` (returns runId, background job) | **Done** |
| MCP `approve_failover` continues via `runAttempt` | **Done** |
| Unit/integration tests for runner, handoff, MCP lifecycle, allow-list, dirty-tree, etc. | **Strong** |
| Adapter docs for aider/goose + UNVERIFIED stubs for others | **Present** |
| CI workflow file | **Present** |

What is **not** done enough to call the product finished:

1. **Docs drift** — README “Known limitations” still claim MCP approve does not continue and `run_task` is synchronous; code contradicts this.
2. **PLAN.md structure section still labels modules as “planned”** that exist.
3. **Unverified adapters** (opencode, kilocode, codex, github-copilot) are registered in production discovery with assumed flags — violates the earlier “verify before expand” gate.
4. **Success attribution under `--allow-dirty`** can still treat *pre-existing* dirty files as agent changes (snapshot is absolute dirty, not delta vs pre-run baseline).
5. **No proven real-tool e2e** in CI (aider/goose against a real binary with partial edit + failover) — offline mocks only.
6. **MCP jobs are process-memory** — server restart loses in-flight job handles (state files exist; live AbortController does not).

**Verdict for the human:**  
Core orchestrator MVP is in good shape. Treat remaining work as **release hardening**, not greenfield. Do not market as production-complete until G4-01…G4-05 are closed.

---

## 2. Progress vs Grok review 3 (G3) — closed items

| G3 item | Status |
|---------|--------|
| G3-01 Aider registered via registry/PATH | **Closed** — `src/adapters/registry.ts` |
| G3-02 MCP approve continues | **Closed** — `approve_failover` → `resolveNextCandidate` → `runAttempt` |
| G3-03 Success from workspace evidence | **Mostly closed** — uses post-run `snapshotGit` dirty flags (see residual G4-03) |
| G3-04 Mechanical handoff | **Closed** — `src/context/handoff.ts` + tests |
| G3-05 Unix tree-kill | **Mostly closed** — `detached: true` on non-Windows + process-group kill |
| G3-06 Visited set / hop cap / allow-list | **Closed** in CLI and MCP paths |
| G3-08 Mock not imported from tests in production | **Closed** — `src/adapters/mock.ts` + registry excludes mock |
| G3-12 MCP async | **Closed** — `run_task` returns runId; job runs in background |

This is real, substantial closure. Good work.

---

## 3. Residual required work

### G4-01 — Fix README / behavior-spec drift (P0)

**Observed:** README “Known limitations” still says:

- MCP `approve_failover` flips state but does not continue
- MCP `run_task` awaits the full process
- opencode/kilocode not implemented

Code and newer adapter docs contradict several of these lines.

**Required:**

1. Rewrite README Known limitations to match current code.
2. State clearly which adapters are **verified** vs **UNVERIFIED**.
3. Align `docs/behavior-spec.md` with actual flags, exit codes, and MCP async behavior.
4. Remove or update any “pending G3-02/G3-12” language.

**Acceptance:** A new user reading only README cannot be misled about MCP failover or adapter maturity.

### G4-02 — Gate UNVERIFIED adapters (P0)

**Observed:** Registry registers opencode, kilocode, codex, github-copilot with assumed CLI flags. Spike docs correctly say UNVERIFIED, but runtime treats them like first-class candidates when the binary is on PATH.

**Required (pick one policy and implement it):**

- **Option A (recommended):** Only auto-register adapters whose spike doc is marked verified (aider, goose). Others require explicit config enable, e.g. `adapters.experimental: ["opencode"]`.
- **Option B:** Keep discovery but mark `available: false` with reason `unverified_adapter` until a conformance/spike checklist is checked in.

Also: earlier plan said drop kilocode until headless is confirmed. Registering it now without verification regresses that decision.

**Acceptance:** Default install never routes production tasks to UNVERIFIED adapters without explicit user opt-in. Tests cover the gate.

### G4-03 — Success detection must use pre/post delta (P0)

**Observed:** CLI/MCP compute:

```ts
const afterSnap = snapshotGit(cwd);
const changed = afterSnap.staged.length > 0 || afterSnap.unstaged.length > 0 || afterSnap.untracked.length > 0;
```

Under `--allow-dirty`, pre-existing dirty files make `changed === true` even if the agent did nothing → false `SUCCEEDED_WITH_CHANGES`.

**Required:**

1. Capture `beforeSnap` (already done in CLI).
2. Compute delta: paths newly dirty relative to `beforeSnap`, or `git diff` against the recorded HEAD/snapshot, not absolute dirty.
3. If `--allow-dirty` and attribution is ambiguous, prefer `NEEDS_USER_REVIEW` or `NO_CHANGES` over false success.
4. Tests: dirty tree + allow-dirty + agent makes no edits → not `SUCCEEDED_WITH_CHANGES`.

**Acceptance:** Pre-existing dirt never counts as agent success.

### G4-04 — PLAN.md file-structure “planned” markers (P1)

**Observed:** PLAN still shows config/execution/health/mcp/router as “planned” in the structure block while the code exists.

**Required:** Update PLAN structure and phase table to “implemented” with residual risks called out (unverified adapters, MCP in-memory jobs, dirty delta). Keep reviews-applied list current.

**Acceptance:** PLAN is a trustworthy map of the repo.

### G4-05 — MCP job durability after process restart (P1)

**Observed:** Task JSON is persisted; `jobs` Map holds AbortController and live promise. After MCP process exit, approve/cancel on old runIds cannot resume a live child.

**Required (MVP-acceptable minimum):**

1. Document: in-flight MCP jobs do not survive server restart; status may show last persisted state as interrupted.
2. On load of a stale `RUNNING` task after restart: mark `interrupted` / `FAILED` with clear message; never pretend the child is still owned.
3. SHOULD: refuse `approve_failover` on jobs not present in the live `jobs` map with an actionable message.

**Acceptance:** Documented + tested stale-RUNNING recovery path.

### G4-06 — Real-tool smoke path (P1, optional for offline CI)

Offline mock coverage is good. Before calling the product “done” for real use:

1. Manual or optional CI job: `aider` (if installed) runs a tiny task in a temp git repo.
2. Same for goose if available.
3. Do not fail default CI when binaries are absent.

**Acceptance:** Documented smoke steps in README or `docs/`; default `npm test` stays offline.

### G4-07 — resolveNextCandidate should exclude current + visited up front (P2)

**Observed:** MCP `resolveNextCandidate` calls `selectCandidate` on the full adapter list then checks `visited`. Prefer filtering adapters (and cooling-down providers) before selection so skip reasons stay accurate in traces.

**Acceptance:** Trace/skips show why the previous candidate was not reconsidered.

### G4-08 — Detached spawn + stdio (P2)

**Observed:** Unix uses `detached: true` for process-group kill. Confirm on macOS/Linux that stdout/stderr streaming still works reliably with cross-spawn + detached (some platforms need `child.unref()` only after listeners are attached, or explicit `stdio` handling).

**Acceptance:** Runner timeout/cancel tests pass on Linux and macOS CI; no hung pipes.

### G4-09 — Packaging / CI hygiene (P2)

- Confirm `.github/workflows/ci.yml` runs install, typecheck, test, build.
- Confirm published `files` field does not need `bin/` source if only `dist` is published (bin points at `dist/bin/air.js` — good).
- `npm run lint` exists; ensure eslint config matches and CI runs it or document skip.

---

## 4. Explicit non-goals (still)

- Building a full TUI or replacing agent UIs.
- Auto-commit / auto-push.
- Trusting model “Done” text.
- Scanning model stdout prose for rate limits.
- Complex scoring/classifier before observed misroutes.
- Treating UNVERIFIED adapters as equal to aider/goose.

---

## 5. Phase reality (honest)

| Phase | Status |
|-------|--------|
| 0 Spikes | **Done** for aider/goose; **incomplete** for opencode/kilocode/codex/copilot (UNVERIFIED) |
| 1 Skeleton | **Done** |
| 2 One-agent | **Done** for mock + discovered real tools |
| 3 Handoff + safety | **Done** for allow-list + mechanical handoff + continuation paths; residual dirty-delta attribution |
| 4 MCP | **Done** for async + approve-continues; residual restart durability |
| 5 Expand | **Premature** for unverified adapters — gate them (G4-02) |

---

## 6. Ordered next actions (short list)

1. **G4-01** — Fix README + behavior-spec to match code.
2. **G4-02** — Gate UNVERIFIED adapters behind explicit opt-in.
3. **G4-03** — Pre/post snapshot delta for success detection.
4. **G4-04** — Refresh PLAN structure/phase status.
5. **G4-05** — Document + test MCP stale-job behavior.
6. **G4-06** — Optional real-tool smoke docs.
7. Then freeze feature scope and only fix bugs.

---

## 7. Summary for the human

You are **much closer to done** than at review 3. The dangerous gaps (aider not registered, MCP approve no-op, stdout-length success, thin handoff, mock in production imports) were actually fixed in code and tests.

What remains is **release integrity**:

- Docs that still describe old limitations.
- Unverified adapters sitting on the default discovery path.
- Dirty-tree success attribution edge case under `--allow-dirty`.
- Honest PLAN and MCP restart semantics.

Close G4-01 through G4-05, then the MVP can reasonably be called **feature-complete for aider/goose + mock**, with experimental adapters clearly labeled and opt-in. Expanding further before that would be scope creep, not completion.
