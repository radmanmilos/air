# grok_plan_review_5.md

> **Document type:** Full AI-agent implementation review (fifth pass)  
> **Target repository:** https://github.com/radmanmilos/air  
> **Tip reviewed:** `main` @ `e382d13825ffa0b370dee37c62d8c903b8c52ef4`  
> **Focus:** model listing / best-model, multi-session parallel, inter-process coordination, byte-accurate buffers, streaming redaction, workspace delta, verify trust, failover semantics, release readiness  
> **Prior reviews:** Claude, ChatGPT, DeepSeek, Grok 1–4 (archived under `docs/reviews/archive/`)  
> **Review date:** 2026-11-03  
> **Instruction priority:** Safety and correctness > reliable concurrency > maintainability > feature breadth  
> **How to use:** Treat every `G5-xx` item as a required change unless marked SHOULD/MAY. Do not expand adapters until P0 concurrency bugs are fixed.

---

## 0. Instructions to the implementation agent

1. Read this with the live tree, `README.md`, `PLAN.md`, `docs/behavior-spec.md`, `SECURITY.md`.
2. Inspect the repository before changing anything.
3. Keep the project buildable and testable after every change.
4. A feature is complete only when implemented, tested, and documented accurately.
5. Work only inside the `air` repository.
6. Never discard user changes, auto-commit, auto-push, or rewrite history unless the user explicitly requests it.

### Product-level definition of done

- Core CLI + MCP paths work offline (mock) and with discovered verified tools.
- Failover proposes and (approve/auto) continues with mechanical handoff.
- Success uses workspace **delta**, not absolute dirt or stdout volume.
- Secrets never leave redaction (including split tokens across chunks).
- Concurrency seats/locks work **across processes**, not only same-process tests.
- Unverified adapters never enter default routing.
- Docs match code.
- Clean-clone: `npm ci && npm run build && npm run typecheck && npm run typecheck:test && npm test && npm run lint` green.

---

## 1. Executive assessment

**Verdict: Feature-rich release candidate with one critical concurrency correctness bug and several semantic gaps. Not ship-as-finished until G5-01 is fixed.**

| Claimed capability | Code status | Correctness |
|--------------------|-------------|-------------|
| Model listing (`air models`) | Present | Partial — capability mapping is wrong |
| Best-model recommendation | Present | Weak — ignores task shape; cost heuristic only |
| Multi-session parallel | Present | Partial — seats do not enforce global max |
| Inter-process coordination | Present | **Broken across processes** (stale detection) |
| Byte-accurate output limits | Present | Good direction |
| Streaming redaction | Present | Strong design |
| Workspace delta detection | Present | Good (`snapshotDelta`) |
| Verify trust gating | Present | Good |
| Full failover semantics | Present | Largely good (CLI + MCP) |
| Unverified adapter gating | Present | Good |
| README accuracy vs MCP | Fixed | Good vs prior review |

**Bottom line for the human:** Architecture and most safety paths are in good shape. **Do not trust multi-process concurrency or “max concurrent agents” until G5-01/G5-02 are fixed.** Docs and gating improved a lot since review 4.

---

## 2. Progress since Grok review 4

| Prior issue | Status |
|-------------|--------|
| README claimed MCP approve does not continue | **Fixed** — README describes async MCP + approve correctly |
| Unverified adapters on default route path | **Fixed** — `availableAdapters()` requires verified+enabled+PATH |
| Success under `--allow-dirty` counted pre-existing dirt | **Fixed** — `snapshotDelta(before, after)` |
| PLAN/README drift on MCP | **Improved** |
| Streaming redaction | **Added** — overlap + straddle check |
| Model catalog + `air models --best` | **Added** |
| Multi-session + seats/locks | **Added** but concurrency logic flawed |
| SECURITY.md / audit rationale | **Added** |
| CI build+lint+pack | **Present** |

---

## 3. Critical findings (P0)

### G5-01 — Cross-process seat/lock stale detection is incorrect (P0)

**Observed in `src/utils/concurrency.ts` and `src/utils/lock.ts`:**

```ts
if (data.start !== PROCESS_START) return true; // treated as stale
```

`PROCESS_START` is **this process’s** start time. Another live AIR process writes its **own** start time into the seat/lock file. On every acquire, the current process treats every other process’s seat as stale and deletes it.

**Effect:**

- Process A holds a seat → Process B reclaims it as “stale” → both run → **maxConcurrentAgents is not enforced across processes**.
- Same pattern in `acquireLock` (`existing.start !== PROCESS_START`).

Same-process tests pass (same `PROCESS_START`), so the bug is invisible to current unit tests.

**Required:**

1. Stale means: PID is dead (`!isPidAlive(pid)`), **or** (optional) PID alive but recorded start time does not match that PID’s actual start (platform-specific; often omit and rely on PID only).
2. **Never** compare another process’s `start` to `this` process’s `PROCESS_START`.
3. Add an integration test that simulates two different `start` values / two PIDs and asserts the live seat is **not** reclaimed.
4. Document the stale policy in a short comment next to `isSeatStale` / lock stale check.

**Acceptance:**

- Two concurrent Node processes cannot both hold seats when `maxConcurrent === 1`.
- Crashed PID seats are still reclaimed.
- Tests fail if the cross-process bug regresses.

### G5-02 — Multi-session does not enforce a global concurrency cap (P0)

**Observed in `src/execution/sessions.ts`:**

```ts
await withSeat(id, 1, async () => { ... });
```

Each session uses a **unique seat name** (`config.id`) with `maxConcurrent = 1`. That only prevents two runs with the **same id**. N different session ids can all run at once with no global limit.

Comments claim “respecting maxConcurrentAgents” and “excess sessions wait for a seat,” but the code does not implement a shared pool.

**Required:**

1. One global seat namespace (e.g. fixed name `"agent"` or config-driven) with `maxConcurrent = config.maxConcurrentAgents` (default 1).
2. Or a semaphore counting active seats regardless of name.
3. Wire the same cap into CLI `--sessions` and MCP job starts.
4. Tests: with `maxConcurrentAgents: 1`, two sessions serialize; with `2`, two can overlap.

**Acceptance:** Documented config key controls real parallelism; tests prove it.

### G5-03 — Parallel sessions on the same `cwd` are unsafe (P0)

**Observed:** `runSessions` runs multiple adapters against the same working tree with no worktree/isolation story.

Two agents editing the same files concurrently will corrupt attribution, handoff, and user work.

**Required:**

1. Default: refuse multi-session when more than one session targets the same `cwd` unless each session is `readOnly` **or** an explicit isolation mode is chosen.
2. Document that true parallel write sessions need separate worktrees (future) or separate dirs.
3. Tests for the refusal path.

**Acceptance:** Concurrent write sessions on one repo are blocked or isolated by design, not left as silent data races.

---

## 4. High priority (P1)

### G5-04 — Model catalog capability mapping is fictional (P1)

**Observed in `src/router/catalog.ts`:**

```ts
code: a.capabilities.headlessExecution,
reasoning: a.capabilities.supportsStreaming,
write: a.capabilities.headlessExecution,
read: a.capabilities.supportsStreaming,
```

`headlessExecution` is not “code ability.” `supportsStreaming` is not “reasoning” or “read.” `bestModelFor` only filters `headless` and sorts by crude cost tier; task `readOnly` / mode are ignored (`_task`).

**Required:**

1. Map catalog fields from real adapter capabilities (`fileEditing`, `shellAccess`, `imageInput`, `headlessExecution`, optional `contextWindow`).
2. Do not invent reasoning/code flags unless adapters declare them.
3. `bestModelFor` should at least respect `readOnly` vs write (`fileEditing`) and availability.
4. Document that cost tier is a heuristic, not provider billing truth.

**Acceptance:** Catalog output matches declared capabilities; unit tests for best-model write vs read-only.

### G5-05 — Byte-accurate limits: verify UTF-8 edge cases (P1)

Runner tracks `stdoutBytes` / `stderrBytes` with `utf8Bytes` and rolling tails. Good direction.

**Required:**

1. Confirm truncation never splits a multi-byte code point in a way that corrupts redaction input (or document that redaction runs on decoded strings only).
2. Tests: buffer filled with multi-byte UTF-8; assert byte caps and that `StreamingRedactor.flush()` still yields full redaction equality property where claimed.
3. Persist truncation flags on task state (already partially done in sessions).

**Acceptance:** Documented invariants + tests for multi-byte truncation.

### G5-06 — Streaming redaction: keep the equality property tested (P1)

Design is strong (overlap, straddle check, flush-once).

**Required:**

1. Property test: for random strings including secrets at boundaries, `feed* + flush === redact(full)`.
2. Ensure live terminal streaming uses the same redactor instance as capture (no unredacted path).
3. Confirm `--api-key=value` and env-style assignments still covered via `redact()`.

**Acceptance:** Existing `streaming-redact.test.ts` covers split secrets; no raw secret in onStdout callbacks in runner tests.

### G5-07 — Verify trust gate: keep repo path canonical (P1)

`checkVerifyTrust` uses string prefix on `cwd`. Symlinks / relative paths can bypass or false-positive.

**Required:**

1. Canonicalize both `cwd` and trusted entries (`fs.realpath` / `path.resolve`) before compare.
2. Tests with relative vs absolute paths.
3. CLI `verify --` remains always trusted; repo verify remains gated.

**Acceptance:** Trust decisions are path-canonical and tested.

### G5-08 — Failover semantics checklist (P1)

Confirm and test end-to-end:

| Behavior | Must hold |
|----------|-----------|
| RATE_LIMIT / QUOTA | cooldown + propose/auto switch |
| AUTH / PERMISSION / USER_CANCELLED / TASK_FAILURE | no failover |
| Hop cap | exit 2, clear message |
| Allow-list | blocks cross-provider without consent |
| Handoff | mechanical git pack injected into next prompt |
| MCP approve | continues via `runAttempt` |
| Visited set | no A→B→A ping-pong |

**Required:** One integration test matrix (mock modes) that asserts the table. Fail the build if AUTH triggers switch.

### G5-09 — Health file races under parallel vitest (P1)

README notes: “188 tests passing (single-fork; parallel workers race on the shared global health file).”

**Required:**

1. Tests must use isolated cache dirs (`paths` override or env) so vitest can parallelize safely.
2. Or document forced single-thread in `vitest.config.ts` and CI until isolation exists.

**Acceptance:** `vitest` default pool does not flake on health/cooldown files.

---

## 5. Medium priority (P2)

### G5-10 — Docs / behavior-spec polish

- Behavior-spec `air models` text still says “exits non-zero if any are blocked” — verify that matches implementation.
- PLAN.md should list sessions, catalog, concurrency, streaming-redact as implemented (not planned).
- Remove any residual “pending G3-02” language anywhere in docs/reviews current folder.

### G5-11 — Seat acquire busy-loop

`acquireSeat` retries every 50ms until timeout. Acceptable for MVP; SHOULD use backoff and surface a clear “concurrency limit reached” error to CLI/MCP callers when null.

### G5-12 — MCP job memory vs disk

Jobs live in process memory; state is on disk. After restart, approve/cancel on old runIds should fail clearly (interrupted). Document in README Known limitations if not already.

### G5-13 — Cost tier / provider identity

Heuristic cost tiers from model name substrings will mis-rank. Fine for v0 if labeled “heuristic.” SHOULD allow config overrides per model.

---

## 6. Explicit non-goals (still)

- Trusting model “Done” text as success.
- Scanning model stdout prose for rate limits.
- Auto-commit / auto-push / auto-stash.
- Treating UNVERIFIED adapters as production-ready.
- Unlimited parallel writers on one working tree.

---

## 7. Phase / release reality

| Area | Reality |
|------|---------|
| Phases 0–4 core | **Effectively done** for aider/goose + mock |
| Unverified adapter expand | **Correctly gated** from routing |
| Concurrency / multi-session | **Not release-ready** until G5-01/G5-02/G5-03 |
| Model catalog | **Usable listing**; recommendation not trustworthy yet |
| Streaming redaction + delta success | **Strong** |
| MCP failover | **Implemented** (docs now match) |
| Release candidate label | **Optimistic** until P0 concurrency fixed |

---

## 8. Ordered next actions

1. **G5-01** — Fix stale seat/lock logic (PID-based, not “my PROCESS_START”).
2. **G5-02** — Global maxConcurrentAgents pool for sessions/MCP/CLI.
3. **G5-03** — Refuse multi-writer sessions on the same cwd.
4. **G5-04** — Honest catalog capabilities + better best-model filter.
5. **G5-08** — Failover matrix test.
6. **G5-09** — Isolate test cache dirs or pin vitest threads.
7. **G5-05/G5-06/G5-07** — Hardening tests for bytes, redaction, verify paths.
8. Freeze features; only bugfixes until RC is honest.

---

## 9. Summary for the human

The project has grown into a real orchestrator: routing, failover, handoff, MCP async, delta-based success, streaming redaction, verify trust, gated unverified adapters, and improved docs.

The **headline risk** is concurrency:

- Seats/locks treat other processes’ records as stale because they compare start times to **this** process.
- Multi-session uses per-id seats with max 1, so it does not enforce a global agent cap.
- Parallel write sessions on one repo are still allowed.

Fix those before calling multi-session or inter-process coordination “done.” Everything else is polish and recommendation quality, not foundation failure.
