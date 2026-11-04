# deepseek_super_agent_review_2.md

## 0. Document metadata

- **Reviewer**: DeepSeek
- **Target repository**: https://github.com/radmanmilos/air
- **Review date**: 2026-11-04
- **Supersedes for forward-looking work**: `deepseek_super_agent_review.md` (SA-00a..SA-11).
- **Status claimed by maintainer**: SA-00a, SA-00b, SA-00c, SA-01..SA-11 all implemented.
- **Motto**: *"AIR is free and so are we."* Free-first by default. Any regression that defaults to paid is a defect.
- **Verification caveat**: I do not have live repo access in this session. Findings below treat "implemented" as "the code exists," not "the behavior is proven." Section 1 is a mandatory verification gate before M2 work begins. If any gate item fails, it becomes a P0 and M2 does not start.
- **How to use**:
  - `MUST` = blocker for the next milestone.
  - `SHOULD` = strongly recommended; defer only with a documented reason.
  - `VERIFY` = code exists, behavior unproven; must be demonstrated before proceeding.
  - IDs: `M2-xx` for new findings. SA-xx references are for traceability only.

---

## 1. Verification gate (must pass before M2 starts)

The prior review defined a ten-step definition of done for the super-agent milestone. It is the single most important artifact of this project right now, because it proves — or disproves — the claim that the vision works end-to-end. Before any new feature work, confirm each item below against current `main`. Treat every failure as a P0 and stop.

| # | Claim | Verify by | Expected | If it fails |
|---|-------|-----------|----------|-------------|
| V-01 | Concurrency cap is config-driven | Set `maxConcurrentAgents: 2`; launch 3 background tasks; count live child processes | At most 2 concurrent | P0: SA-00a not closed |
| V-02 | Catalog availability matches reality | Uninstall one adapter; run `air models` and `air models --best` | Adapter listed as unavailable; recommender excludes it | P0: SA-00b not closed |
| V-03 | Recommender respects task shape | Write task vs. read-only task; inspect chosen model | Write task never picks read-only; read-only never picks write-only | P0: SA-00c not closed |
| V-04 | Conversation persists across restart | `air chat` → messages → `Ctrl-D` → `air chat --resume <id>` | Full history restored; front agent answers coherently | P0: SA-01 broken |
| V-05 | Non-blocking UX | Start a long task, immediately ask an unrelated question | Unrelated question answered while task runs | P0: SA-02 broken |
| V-06 | Async result injection | Let the task finish; watch the conversation | New assistant message appears without user prompting | P0: SA-03 broken |
| V-07 | Free-first routing | With free adapters only, run `air chat` with no flags | Works without `--allow-paid`; `--stats` shows `estimatedCostUsd: 0` | P0: SA-04 not closed |
| V-08 | Front-agent fallback | Force a rate-limit on the front model | Transparent switch; history preserved; reply still coherent | P0: SA-05 broken |
| V-09 | Capability hints filter routing | `spawn_task` with `requiresWrite: true` in a catalog with one read-only model | Read-only model excluded | P1: SA-06 partial |
| V-10 | Free-tier counters reset | Fast-forward clock past reset window | Model re-eligible; counter reset | P1: SA-07 partial |
| V-11 | Output summarization | Task emits 5 MB stdout | Injected message ≤ 8 KB and mentions key facts | P1: SA-08 partial |
| V-12 | **The 10-step DoD scenario** | Run the scenario verbatim from prior review §10 | All ten steps pass; includes kill-and-resume mid-task | **P0: milestone not done** |

**Add V-13 through V-15 (new):**

| # | Claim | Verify by | Expected |
|---|-------|-----------|----------|
| V-13 | No secret leaks in injection path | Mock tool prints a fake API key; let it complete | Conversation and traces contain no secret |
| V-14 | Concurrent writes are safe | Race a user message against a task completion | No corruption; both messages present; ordering coherent |
| V-15 | Multi-byte truncation is safe | Mock tool prints emoji + CJK at tail boundary | No `�` in conversation or tails |

**The scenario test must be automated** (script or test), not a manual checklist. If it only exists as a manual procedure, it is not proven — it is promised.

---

## 2. Verdict

**If the verification gate passes**, the project has crossed a real threshold: the substrate and the super-agent layer both exist and behave end-to-end. That is a milestone worth naming and shipping.

**If the gate partially fails**, the correct response is not to build M2 features. It is to close the failures. The distance to "trustworthy" is short but must be crossed honestly, because everything in M2 assumes the gate is green.

**The next milestone is M2 — "Trustworthy one agent."** Its purpose is not more features. It is proving that the agent *feels* like one agent in messy, real conditions: long conversations, many background tasks, provider flakiness, crashes, and confused users. M2 is where the "one agent feel" either holds up or breaks. It is also where the free-first promise gets tested against reality, because free tiers drift and tools lie about their underlying model.

M2 has four pillars, in priority order:

1. **Race and crash hardening** — the injection path, conversation writes, and event ordering under load.
2. **Voice and UX quality** — the front agent must never leak plumbing, must always have something useful to say, and must not dead-end.
3. **Free-first durability** — free-tier config must be updatable without a code release; tool opacity must be resolved or explicitly bounded.
4. **Release engineering** — install, first run, docs, versioning, and a proper 0.x or 1.0 tag.

Features like a second front-agent provider, additional adapters, and cost dashboards come *after* M2, not during.

---

## 3. What I assume is now true (and should not be regressed)

Assuming the gate passes, these are load-bearing and must not be touched by M2 work except to harden:

- `ConversationSession` with atomic persistence and `taskId` linkage to `TaskState`.
- The `spawn_task` / `task_status` / `task_result` / `cancel_task` tool surface.
- The neutral internal message format (provider-agnostic) — this is the single best decision in the layer.
- Same-provider front-agent fallback with preserved history.
- Free-first routing as the default policy, with `--allow-paid` as the only escape.
- Streaming redaction applied to the injection path (verify with V-13).
- The existing lock, seat, and health machinery — reused, not reimplemented.

---

## 4. New findings — the trust layer (M2-xx)

These are the issues that appear *after* the feature exists. They do not show up in unit tests. They show up when a real person uses the tool for an hour.

### M2-01 — The injection path has not been stress-tested under load (P0)

**Symptom**: async injection works for one task in isolation. It has not been proven for ten tasks completing simultaneously, or for a task completing while the user is mid-message, or for two tasks completing within the same second. Ordering, conversation-file corruption, and front-agent context confusion are all plausible failures.

**Why it matters**: the "one agent" illusion depends on results arriving in a way the front agent can reason about. Out-of-order or duplicated injections will produce confused, contradictory replies, which is the fastest way to break the illusion.

**Change**:
- MUST add a stress test that completes 10 tasks in rapid succession and asserts:
  - all 10 results appear exactly once in the conversation;
  - conversation file remains valid (no corruption);
  - front agent's reply after each completion references the correct `taskId`.
- MUST guarantee **idempotency** on injection: if a task result is injected twice (e.g., due to a crash-restart), the second injection is a no-op.
- MUST define and enforce a **causal order** for injections: task start events before task completion events; completion events ordered by `completedAt`.
- SHOULD add a `taskEventsProcessed: string[]` field to `ConversationSession` so injection is replay-safe.

**Acceptance**: stress test passes; replay after artificial crash does not duplicate messages.

---

### M2-02 — Front agent voice is not specified, only implemented (P0)

**Symptom**: the front agent works. It has no style guide. It may say "Routing to goose now..." or "Selected aider with model X" or "Task succeeded with exit code 0." Any of these break the illusion.

**Why it matters**: the "one agent feel" is 60% UX. Users will forgive a slow task; they will not forgive the agent sounding like a debug log.

**Change**:
- MUST write a **voice spec** in `docs/front-agent-voice.md` with concrete rules:
  - Never name the tool or model unless the user asks.
  - Describe task outcomes in user terms: "I updated `foo.py`" not "aider exited 0."
  - While a task runs, the front agent answers other questions normally and does not narrate task progress.
  - When a task finishes, one short sentence about *what changed for the user*, then offer the next step.
  - When a task fails, one sentence about *what to try next*, not a stack trace (traces go in `--verbose`).
- MUST add **golden tests**: input conversation + expected front-agent reply shape (natural language, no tool names, no exit codes). Use a snapshot or a small eval set.
- SHOULD add a style check that rejects any front-agent reply containing the literal strings of tool names (`aider`, `goose`, `exit code`, `stdout`) unless the user asked.
- MUST ensure the "task started" and "task finished" REPL lines are visually distinct from the agent's prose, so the agent isn't forced to narrate them.

**Acceptance**: golden tests pass; a grep of captured transcripts finds no tool names in agent prose for the standard scenario.

---

### M2-03 — Conversation growth is unbounded (P1)

**Symptom**: `ConversationSession.messages` grows indefinitely. Long sessions will eventually exceed any front-agent context window, causing truncation, summarization failures, or silent history loss.

**Change**:
- MUST implement **conversation compaction**: when `messages` exceed a size or token threshold, replace older turns with a single `system` message containing a redacted summary, preserving (a) the last N turns verbatim and (b) all `tool` messages referenced by `activeTaskIds`.
- MUST NOT drop task result messages until their `taskId` is removed from `activeTaskIds`.
- SHOULD persist a `compactedAt` marker and keep the raw log (append-only) for `--verbose` inspection.
- SHOULD cap conversation file size at a configurable maximum (default: 5 MB) with a clear warning to the user.

**Acceptance**: a 500-turn synthetic conversation compacts correctly; the front agent still answers a follow-up referencing a fact from turn 10 (via the summary).

---

### M2-04 — Free-tier reality drift (P1)

**Symptom**: `freeTier` limits are hardcoded in the model catalog. Providers change free-tier terms without warning. When they do, the router either over-throttles or over-uses and hits hard failures.

**Change**:
- MUST make `freeTier` values **runtime-configurable** via a user-editable `free-tier-overrides.yaml` (same precedence as other config: CLI > env > repo > global > defaults).
- SHOULD add a `air models --refresh-free` command that fetches known free-tier limits from a maintainer-hosted file (with a pinned version and a `--offline` fallback).
- MUST handle provider-reported rate limits (`Retry-After`, `X-RateLimit-*`) by updating the local counter rather than guessing.
- MUST document that free-tier values are best-effort and can drift.

**Acceptance**: overriding a free-tier limit in config changes router behavior without a code change; provider-reported rate limits update local counters.

---

### M2-05 — Tool opacity is still unresolved (P1)

**Symptom**: from AIR's perspective, `aider` is a black box. It may call GPT-4o or Claude or a local model. "Free-first" is answerable only at the *tool* level, not the *model* level. This was flagged as the biggest design risk in the previous review and it is still open.

**Change**:
- MUST resolve this explicitly, not implicitly. Choose one:
  - **(a) Tool-level free-ness**: mark each adapter as `free` or `paid` based on its expected default configuration. Aider-with-Ollama is free; aider-with-GPT-4o is paid. Document the assumption.
  - **(b) Provider-level visibility**: extend the adapter contract with an optional `reportsProvider(): { provider, model } | null` that adapters implement where the tool exposes it (e.g., aider's `--model` flag). Where null, fall back to (a).
- MUST document the chosen approach in `docs/behavior-spec.md` under "free-tier semantics."
- SHOULD prefer (b) where feasible, because it enables free-tier tracking at the granularity users actually care about.

**Acceptance**: `air models --free` output is explainable by the chosen model; `--stats` free/paid determination is correct under the chosen model.

---

### M2-06 — Crash recovery in the injection path is not exercised (P0)

**Symptom**: V-06 proves injection works when nothing crashes. It has not been proven when the process dies between "task finished" and "result injected." A half-written conversation is one of the worst user experiences possible.

**Change**:
- MUST make injection **atomic and replayable**:
  - Task completion writes `TaskState` with a durable `injectedAt: null`.
  - Injection appends the `tool` message and sets `injectedAt` in a single atomic write to the conversation store.
  - On session resume, any task with `state: completed` and `injectedAt: null` is re-injected before the front agent is invoked.
- MUST add a test that kills the process between the two writes and asserts recovery on restart.
- MUST ensure idempotency: replaying injection twice does not produce duplicate messages (M2-01's `taskEventsProcessed` list covers this).

**Acceptance**: crash test passes; no duplicated or missing task messages.

---

### M2-07 — Silent tool switching leaks (P1)

**Symptom**: failover from one tool to another (aider → goose) happens silently by design. But some tools have observable side effects (aider auto-commits, goose edits files directly). If the front agent doesn't tell the user which changes were made, users will be surprised by their working tree.

**Change**:
- MUST include a **change summary** in the injected `tool` message: files added/modified/deleted, plus any commits created (if the tool auto-commits).
- MUST have the front agent surface change summaries in natural language ("I updated three files" / "I also made a commit").
- SHOULD require an explicit `--allow-commits` flag for tools that auto-commit; without it, tools that commit should be disabled or run in a no-commit mode.
- MUST refuse to run in a dirty tree by default (already true in substrate; verify it applies to background tasks too).

**Acceptance**: injecting a task that modified 3 files produces a message with a change summary; front-agent prose mentions the change count.

---

### M2-08 — No release engineering (P1)

**Symptom**: no `CHANGELOG.md`, no versioned release, no install script, no `air` on `PATH` for a fresh user. "Works on the developer's machine" is not "released."

**Change**:
- MUST produce a `CHANGELOG.md` with the M2 milestone as the first entry.
- MUST bump `package.json` to a versioned release (0.9.0 or 1.0.0, maintainer's call).
- MUST publish to npm (or at minimum `npm pack --dry-run` proving a clean tarball) — no `tests/`, no cache, no `.env`.
- SHOULD provide an install script (`install.sh`) that checks for Node version, runs `npm install -g air`, and prints a first-run tutorial.
- SHOULD provide a `air --version` that matches the tag.

**Acceptance**: a fresh machine can install and run the 10-step DoD scenario.

---

### M2-09 — Observability for users, not just developers (P2)

**Symptom**: traces go to JSONL for debugging. Users have no way to see, at a glance, what happened during a session.

**Change**:
- SHOULD add `/stats` in the REPL and `air chat --stats` (as SA-10) that reports: messages, tasks, tools used, free/paid, total estimated cost, cooldowns active.
- SHOULD add `/tasks` in the REPL to list active and recent tasks with status.
- MUST ensure these views contain no secrets.

**Acceptance**: `/stats` and `/tasks` work in a live session and are accurate.

---

### M2-10 — Second front-agent provider is deferred, but the seam must exist (P2)

**Symptom**: the current front-agent provider is whatever the MVP chose. The seam for adding a second provider is not documented.

**Change**:
- MUST document the `ChatProvider` interface in `docs/adapters/chat-providers.md` with a worked example.
- SHOULD NOT implement a second provider during M2. Reserve it for M3.
- MUST have a test that swaps in a mock `ChatProvider` to prove the seam works.

**Acceptance**: interface documented; mock provider test passes; no second provider shipped in M2.

---

## 5. The next milestone — M2 "Trustworthy one agent"

**Goal**: the super agent works end-to-end, survives real usage patterns, sounds like one assistant, and can be installed by a stranger.

**In scope (in order)**:

1. Verification gate (Section 1) fully green.
2. Injection hardening: idempotency, causal order, crash recovery (M2-01, M2-06).
3. Front-agent voice spec and golden tests (M2-02).
4. Conversation compaction (M2-03).
5. Free-tier drift resilience and tool-opacity decision (M2-04, M2-05).
6. Change-summary visibility and tool side-effect safety (M2-07).
7. Release engineering: version, changelog, install, npm publish (M2-08).
8. User-facing observability: `/stats`, `/tasks` (M2-09).
9. ChatProvider interface documented for M3 (M2-10).

**Out of scope (M3+)**:

- Second front-agent provider (M3).
- New adapters beyond aider + goose (M3).
- Opencode / kilocode (on request).
- Config schema v2 (only when a real breaking change appears).
- Web UI, desktop app.
- Multi-user, multi-tenant.
- Cross-machine sync.
- Voice/image input.
- Fine-grained budget enforcement beyond per-token estimate.
- LLM classifier for task routing (front-agent hints remain the mechanism).

---

## 6. Implementation plan (M2, phased)

### Phase M2-A — Prove the claim (1 session)

Do not write any new feature code until this phase is done.

- Run every verification item V-01 through V-15 against `main`.
- Convert the 10-step DoD scenario (V-12) into an **automated test** (`tests/scenario/one-agent.test.ts` or a `scripts/scenario-one-agent.sh` with deterministic mocks).
- Document the results in `docs/m2-verification.md` with pass/fail and evidence (command + output).
- Any failure becomes a P0 with an ID (M2-A-x) and is closed before M2-B starts.

**Exit criteria**: all V-items pass; the scenario test exists and is green.

### Phase M2-B — Race and crash hardening (1–2 sessions)

- **M2-01**: injection idempotency, causal order, stress test (10 concurrent tasks).
- **M2-06**: crash-recoverable injection with replay-safe `taskEventsProcessed`.
- Add V-14 (concurrent write) and V-15 (UTF-8 in conversation) as permanent tests.

**Exit criteria**: stress test green; crash recovery test green.

### Phase M2-C — Voice and UX (1–2 sessions)

- **M2-02**: write `docs/front-agent-voice.md`; implement golden tests for standard scenarios (success, failure, follow-up during task, follow-up after task).
- Tune the "task started" and "task finished" REPL rendering so the agent does not need to narrate.
- Verify with a manual play-through that a non-author can use the agent without seeing tool names.

**Exit criteria**: golden tests green; manual review by a second person confirms the illusion holds.

### Phase M2-D — Durability and free-first reality (1–2 sessions)

- **M2-03**: conversation compaction with a test.
- **M2-04**: runtime-configurable free tiers; provider-reported rate-limit ingestion.
- **M2-05**: tool-opacity decision, documented and implemented consistently.
- **M2-07**: change summaries and tool side-effect safety.

**Exit criteria**: 500-turn compaction test green; free-tier override test green; change summary appears in injected messages.

### Phase M2-E — Release engineering (1 session)

- **M2-08**: version, changelog, install script, npm publish.
- **M2-09**: `/stats` and `/tasks`.
- **M2-10**: `ChatProvider` interface documented with mock test.

**Exit criteria**: a fresh machine installs AIR and runs the 10-step scenario; docs published.

---

## 7. Definition of done for M2

M2 is done when **all** of the following are true:

1. Every verification item V-01..V-15 passes with documented evidence.
2. The 10-step DoD scenario exists as an automated test and is green in CI.
3. Stress test (10 concurrent task completions) is green.
4. Crash-recovery test (kill between task finish and injection) is green.
5. Front-agent voice spec exists, golden tests pass, and a manual review confirms no tool names leak in standard prose.
6. Conversation compaction is implemented and proven with a 500-turn test.
7. Free-tier overrides work without code changes.
8. Tool-opacity decision is documented and consistently applied.
9. Change summaries appear in injected messages; tool auto-commit behavior is gated.
10. `CHANGELOG.md` exists; version is bumped; install path works on a fresh machine.
11. `/stats` and `/tasks` work in a live session.
12. `ChatProvider` interface is documented with a mock-backed test.

If any of these is not true, M2 is not done — regardless of feature count.

---

## 8. Anti-patterns to avoid in M2

- Treating "implemented" as "proven." The whole point of M2-A is that these are different claims.
- Adding a second front-agent provider, a web UI, or a task classifier before the gate is green.
- Letting the front agent narrate tool names, exit codes, or "switching now" messages.
- Injecting results without idempotency, then fixing it "later."
- Hardcoding free-tier limits and expecting them to stay accurate.
- Ignoring the tool-opacity question again.
- Shipping without a changelog or install path.
- Building `/stats` before `/tasks` — tasks are more useful and reveal more bugs.
- Writing a new locking scheme for conversations when the existing lock pattern works.
- Expanding conversation storage to a database in M2. The JSON store with atomic writes is fine; compaction is the fix, not a migration.

---

## 9. What "done" does *not* mean after M2

M2 gives you a **trustworthy one-agent**. It does not give you:

- A second front-agent provider.
- A second family of adapters.
- A web UI.
- Cost guarantees for paid modes.
- Cross-machine continuity.
- A public API beyond MCP.

Do not let the success of M2 pull you into building those before the current milestone is properly packaged, documented, and used by at least one real person who isn't on the team.

---

## 10. Honest caveats

- **I cannot verify the "all implemented" claim from here.** The verification gate exists because that claim is the most likely place for optimism to leak in. It is not a criticism; it is a standard step.
- **The hardest part of M2 is not code.** It is M2-C (voice) and M2-D (tool opacity). The first is subjective; the second requires a decision you've deferred twice. Both are worth doing slowly.
- **The scenario test is the whole milestone in miniature.** If it exists and is green, M2 is 70% done. If it doesn't exist yet, treat it as the first thing you write, not the last.
- **Free-tier tracking will keep drifting.** The point of M2-04 is not to solve drift permanently but to make drift cheap to fix without a release. If the limits live in code, they will silently rot.
- **"One agent feel" is fragile.** A single leaked tool name in a reply can break the illusion. Budget for multiple iterations on the voice and the injection timing, even after the code is correct.
- **Release engineering is not glamorous.** It is also the difference between a project and a product. M2-08 is small but must not be skipped.

---

*End of document. Append future findings as `deepseek_super_agent_review_3.md`, not merged into this file.*