# AIR — Complete Task List from Reviews 7

**Generated:** 2026-11-04
**Sources (all in `docs/reviews/`):**
- `chatGPT_review_7.md` (R6-01..R6-27, phases N0-N2, architecture decision)
- `deepseek_review_7.md` (V-01..V-15 verification gate, M2-01..M2-10, phases M2-A..M2-E)
- `grok_review_7.md` (G7-01..G7-14, phases A-D)

**Scope:** all work happens in `E:\GitHub\air`. No changes to other repos.
**Canonical authority:** this file is the single task list for Reviews 7. Archive `tasks_air_6.md` is retained as history.
**Baseline:** reviews target `main` @ `e19aeadb4edfd8f43efa3dd266e0746cb0b3e5f3` (CI run 114 green).

## How to use
1. Work only on tasks marked `ready` (dependencies satisfied).
2. Set status to `in_progress` before editing; `done` only after tests + docs + commit/push.
3. Run the validation checklist before every commit.
4. Never start a later phase until the current phase's acceptance criteria pass with real tests.
5. Tasks marked `parallel-safe` may run concurrently; tasks sharing files must be serialized.

## Validation checklist (run before every commit)
- [ ] `npm run typecheck`
- [ ] `npm run typecheck:test`
- [ ] `npm run lint`
- [ ] `npm test`
- [ ] `npm run build`
- [ ] `npm pack --dry-run`
- [ ] Documentation updated (README, PLAN.md, docs/)
- [ ] Committed and pushed

## Review reference index
| Review | ID prefix | Theme |
|---|---|---|
| chatGPT_review_7.md | R6-xx | product + architecture + security |
| deepseek_review_7.md | M2-xx, V-xx | trust layer + verification gate |
| grok_review_7.md | G7-xx | close the loop |

## Priority legend
- **P0** — Critical blockers. Product cannot be trusted/used until closed.
- **P1** — High. Required for the "one super agent" product goal.
- **P2** — Quality/consistency. Should not block the vertical slice but must land before release.

---

# P0 — Critical blockers (close the loop + safety)

## T7-001 [DONE] — Unify MCP and Orchestrator job lifecycle (one canonical ID)
- **Priority:** P0
- **Review refs:** chatGPT R6-01/R6-02; deepseek V-12; grok G7-02
- **Area:** MCP / orchestrator
- **Files:** `src/mcp/server.ts`, `src/orchestrator/orchestrator.ts`
- **Depends on:** none
- **Parallel:** no
- **Details:** generate runId once at boundary; pass into `Orchestrator.start({ runId })`; store controller/handle/seat/workspace/promise under canonical ID; status/resume/approval/cancel/output use one lookup. Remove duplicate state records.
- **Acceptance:** returned ID = orchestrator session ID = task-state ID = event run ID; approve/resume/status/cancel all use one ID.

## T7-002 [DONE] — Make cancellation real and race-safe (process tree)
- **Priority:** P0
- **Review refs:** chatGPT R6-02; grok G7-02
- **Area:** MCP / execution
- **Files:** `src/mcp/server.ts`, `src/execution/runner.ts`, `src/orchestrator/orchestrator.ts`
- **Depends on:** T7-001
- **Details:** inject job-owned AbortSignal all the way to runner; on cancel transition cancel_requested → kill tree → await close → release seat → cancelled. Never claim cancel succeeded prematurely. Cancel must not trigger failover.
- **Acceptance:** real child+descendant process test proves no worker keeps changing files after cancel response.

## T7-003 [DONE] — Make output transport-aware (MCP stdout protocol purity)
- **Priority:** P0
- **Review refs:** chatGPT R6-03; grok G7-06
- **Area:** MCP / execution
- **Files:** `src/orchestrator/orchestrator.ts`, `src/mcp/server.ts`
- **Depends on:** none
- **Details:** replace hard-coded process.stdout/stderr callbacks with WorkerOutputSink interface; CLI streams terminal; MCP persists redacted chunks + exposes via output tool. stdout protocol-only in stdio mode; diagnostics to stderr/logs.
- **Acceptance:** spawn built `air mcp`, noisy worker stdout/stderr, every stdout frame valid MCP JSON-RPC.

## T7-004 [DONE] — Repair failover policy and exact consent (proposal digest)
- **Priority:** P0
- **Review refs:** chatGPT R6-05; grok G7-03
- **Area:** router / failover
- **Files:** `src/orchestrator/orchestrator.ts`, `src/security/allowlist.ts`, `src/mcp/server.ts`
- **Depends on:** T7-001
- **Details:** separate candidate filtering from destination authorization; remove implicit `allow.models=[firstModel]` unless documented; build immutable proposal with source/dest adapter/provider/model, data classification, context digest, cost class, reason, nonce/hash; verify against `proposal.to.*`; mandatory digest for cross-provider/paid egress; persist approval; prevent replay.
- **Acceptance:** A→B failover success/decline/altered consent tests work through MCP.

## T7-005 [DONE] — Permission enforcement in real execution path
- **Priority:** P0
- **Review refs:** chatGPT R6-04/R6-14; grok G7-03
- **Area:** permissions / adapters
- **Files:** `src/permissions/index.ts`, `src/config/schema.ts`, `src/orchestrator/orchestrator.ts`, adapter command builders
- **Depends on:** none
- **Details:** reconcile config values (`ask|auto|deny`) with policy; define one model (read_only/edit/edit_with_shell + network/install/commit/push/paths); evaluate immediately before every invocation; translate to narrowest adapter flags; fail closed if adapter cannot meet policy; remove broad flags unless auditable approval.
- **Acceptance:** conformance tests prove same task denied/allowed consistently through every entry point.

## T7-006 [DONE] — Free-only hard gate
- **Priority:** P0
- **Review refs:** chatGPT R6-13; deepseek M2-05; grok G7-03
- **Area:** router / orchestrator / config
- **Files:** `src/router/router.ts`, `src/orchestrator/orchestrator.ts`, `src/config/schema.ts`, `bin/air.ts`
- **Depends on:** T7-005
- **Details:** `freeOnly` default true; `paidFallbackRequiresApproval` default true; when freeOnly filter to costTier 0 (local/:free/catalog free) after capability checks; if none eligible and paidFallbackRequiresApproval surface proposal (ask), never silently use paid; `--allow-paid`/approval clears gate for turn/conversation; `air models --best` explains; unknown cost not free.
- **Acceptance:** free+paid eligible → free wins; freeOnly + only paid → no silent paid route; tests.

## T7-007 [DONE] — Front-agent decision loop (decide)
- **Priority:** P0
- **Review refs:** chatGPT R6-06; deepseek M2-02; grok G7-01
- **Area:** conversation
- **Files:** new `src/conversation/decide.ts`, `src/conversation/actions.ts`, `bin/air.ts`, `src/mcp/server.ts`
- **Depends on:** none
- **Details:** on each user message append user msg; produce Action(s) (control → local; Q&A → answer; workspace/code → spawn_job via planner); validate via Zod parseActions; reject invalid; never block input loop. Support answer/clarify/status/cancel/spawn_job.
- **Acceptance:** "what is a mutex?" → answer, no job; "fix bug in src/x.ts" → spawn job + ack with runId; tests for both paths.

## T7-008 [DONE] — Job completion → compile → injectResult → notify
- **Priority:** P0
- **Review refs:** chatGPT R6-09/R6-10; deepseek M2-01/M2-06; grok G7-02
- **Area:** conversation / chat / orchestrator
- **Files:** `src/conversation/*`, `bin/air.ts`, `src/mcp/server.ts`
- **Depends on:** T7-007
- **Details:** background waiter per job or shared poller: when orchestrator session terminal → compileJobResult(facts) → injectResult(convId, summary, runId); remove runId from activeWorkIds; print one line in REPL `job <id> finished: <one-line summary>`. Idempotent inject (same runId no double-append). Crash-recoverable: task completed with injectedAt null → re-inject on resume.
- **Acceptance:** integration test /run mock job → conversation gains tool/job message with compiled text; restart-safe.

## T7-009 [DONE] — Worker prompt from conversation context
- **Priority:** P0
- **Review refs:** grok G7-04; chatGPT R6-10
- **Area:** orchestrator / conversation
- **Files:** `src/orchestrator/orchestrator.ts`, `src/conversation/*`
- **Depends on:** T7-007
- **Details:** when spawning build worker prompt from user goal + optional conversation.summary + last N facts (bounded, redacted); never dump full history/secrets; on completion update facts with 1-3 short factual bullets from delta/compiler (not model prose).
- **Acceptance:** test spawn includes summary/facts when present; redaction applied.

## T7-010 [DONE] — MCP parity (chat_send decision loop, list_conversations, list_jobs)
- **Priority:** P0
- **Review refs:** grok G7-06; chatGPT R6-11
- **Area:** MCP
- **Files:** `src/mcp/server.ts`
- **Depends on:** T7-007, T7-008
- **Details:** `chat_send` full decision loop (not only ack); `get_conversation` return thread (redact); `list_conversations` (ids+updatedAt+title); `list_jobs` filter by conversation activeWorkIds; `approve_failover` link runId to conversation. Add job_status/job_output if missing.
- **Acceptance:** MCP client can create conversation, send message, receive reply, receive async notification on task completion.

## T7-011 [DONE] — Conversation storage hardening (path validation + concurrent save)
- **Priority:** P0
- **Review refs:** chatGPT R6-12; deepseek M2-01/M2-06
- **Area:** conversation
- **Files:** `src/conversation/index.ts`
- **Depends on:** none
- **Details:** accept only generated UUID/ULID identifiers; schema validator on load; write with lock+atomic rename; never let caller-supplied IDs become paths without validation; `saveConversation` use locked read-modify-write; add concurrent append/save tests and corrupted-file recovery.
- **Acceptance:** path traversal rejected; concurrent save+append no overwrite; corrupted file recovery behavior documented/tested.

## T7-012 [DONE] — Crash recovery in injection path (atomic + replayable)
- **Priority:** P0
- **Review refs:** deepseek M2-06; grok G7-02
- **Area:** conversation / task-state
- **Files:** `src/conversation/index.ts`, `src/execution/task-state.ts`
- **Depends on:** T7-008, T7-011
- **Details:** task completion writes TaskState with durable `injectedAt: null`; injection appends tool message and sets injectedAt in single atomic write; on resume any task state completed & injectedAt null re-injected before front agent invoked. Idempotent via `taskEventsProcessed` list in conversation.
- **Acceptance:** crash test (kill between two writes) passes; no duplicated/missing task messages.

## T7-013 [DONE] — Stress/idempotency/causal order for injection
- **Priority:** P0
- **Review refs:** deepseek M2-01
- **Area:** conversation / tests
- **Files:** tests
- **Depends on:** T7-008
- **Details:** stress test completing 10 tasks in rapid succession: all 10 results appear exactly once; conversation file valid; front agent reply references correct taskId. Idempotency on double injection. Causal order: task start before completion; completions ordered by completedAt.
- **Acceptance:** stress test green.

## T7-014 [DONE] — Transactional job store (replace snapshot) + crash recovery
- **Priority:** P0
- **Review refs:** chatGPT R6-15; deepseek M2 (durability)
- **Area:** persistence / orchestrator
- **Files:** `src/orchestrator/orchestrator.ts`, `src/execution/task-state.ts`, `src/utils/lock.ts`
- **Depends on:** T7-001
- **Details:** move lifecycle state to transactional store (SQLite pragmatic) with atomic state transitions, unique IDs, indexed events, process metadata, leases/heartbeats, restart reconciliation; or lock every read-modify-write + verify worker PID/process start identity before changing RUNNING jobs. Remove per-run SIGINT/SIGTERM listener leak (install process-level handlers once routing to active controllers, or remove in finally).
- **Acceptance:** two separate CLI/MCP processes see same jobs; crash/restart leaves consistent history; concurrent writes don't disappear.

## T7-015 [DONE] — Health counter additive increments (no stale merge)
- **Priority:** P0
- **Review refs:** chatGPT R6-16
- **Area:** health
- **Files:** `src/health/tracker.ts`
- **Depends on:** none
- **Details:** persist atomic increment events/deltas under lock; calculate increment relative to loaded base. Multi-process test N workers concurrent record successes same key → exact totals.
- **Acceptance:** concurrent health updates cannot overwrite one another.

## T7-016 [DONE] — Concurrency-seat stale reclamation ownership race
- **Priority:** P0 (P2 in review but safety)
- **Review refs:** chatGPT R6-20
- **Area:** concurrency
- **Files:** `src/utils/concurrency.ts`
- **Depends on:** none
- **Details:** token-checked removal with atomic strategy; recheck path contains same token before unlink; competing-process stress tests.
- **Acceptance:** no seat lost under contention.

## T7-017 [DONE] — Verify-repo command parsing + process tree containment
- **Priority:** P0 (P2 review)
- **Review refs:** chatGPT R6-26
- **Area:** context / verify
- **Files:** `src/context/verify.ts`
- **Depends on:** none
- **Details:** structured `command: string[]` config; use shared process runner with process-tree cancellation and output caps; async spawn (not spawnSync).
- **Acceptance:** quoted args preserved; timeout kills tree.

## T7-018 [DONE] — Node engine floor vs import.meta.dirname
- **Priority:** P0 (P1 review)
- **Review refs:** chatGPT R6-17; grok hygiene
- **Area:** packaging
- **Files:** `package.json`, `src/config/catalog.ts`
- **Depends on:** none
- **Details:** either support Node 18 using fileURLToPath(import.meta.url) and run CI on minimum supported Node, or raise engines.node to actual tested baseline and document. Package metadata and CI matrix must agree.
- **Acceptance:** package metadata and CI agree; runtime catalog loads on declared floor.

## T7-019 [DONE] — Real adapter verification version gating
- **Priority:** P0 (P1 review)
- **Review refs:** chatGPT R6-18
- **Area:** adapters / router
- **Files:** `src/adapters/registry.ts`, `src/router/*`
- **Depends on:** none
- **Details:** at discovery execute safe version check, normalize/compare against supported ranges, store result; gate routing on measured version + required feature probes; separate exists/version compatible/headless verified/task smoke verified states.
- **Acceptance:** arbitrary binary on PATH not routed unless version compatible.

## T7-020 [DONE] — Adapter permission conformance table + refuse non-conforming
- **Priority:** P0
- **Review refs:** chatGPT R6-14; grok G7-03
- **Area:** adapters / permissions
- **Files:** `src/adapters/*`, `src/permissions/index.ts`
- **Depends on:** T7-005
- **Details:** build adapter permission-conformance table; refuse to route to adapters that cannot satisfy requested policy; combine adapter flags with OS/container/worktree isolation; tool flags are one control not security boundary.
- **Acceptance:** read-only label trusted only if actual child command restricted.

---

# P1 — High (product core)

## T7-021 [DONE] — Front-agent voice spec + golden tests
- **Priority:** P1
- **Review refs:** deepseek M2-02
- **Area:** docs / conversation / tests
- **Files:** new `docs/front-agent-voice.md`, conversation code, tests
- **Depends on:** T7-007
- **Details:** write voice spec: never name tool/model unless asked; describe outcomes in user terms; while task runs answer other questions normally; when task finishes one short sentence about what changed; when fails one sentence what to try; traces go to --verbose. Golden tests: input conversation + expected reply shape (natural language, no tool names/exit codes). Style check rejects replies containing literal tool names (`aider`,`goose`,`exit code`,`stdout`) unless user asked. REPL task started/finished lines visually distinct.
- **Acceptance:** golden tests pass; grep of captured transcripts finds no tool names in agent prose for standard scenario.

## T7-022 [DONE] — Conversation compaction (bounded growth)
- **Priority:** P1
- **Review refs:** deepseek M2-03; grok G7-11
- **Area:** conversation
- **Files:** `src/conversation/index.ts`
- **Depends on:** T7-011
- **Details:** when messages exceed size/token threshold, replace older turns with single system message containing redacted summary, preserving last N turns verbatim and all tool messages referenced by activeTaskIds. Never drop task result messages until taskId removed from activeWorkIds. Persist compactedAt marker; keep raw log (append-only) for --verbose. Cap conversation file size configurable (default 5MB) with warning.
- **Acceptance:** 500-turn synthetic conversation compacts correctly; front agent still answers follow-up referencing fact from turn 10 via summary.

## T7-023 [DONE] — Runtime-configurable free tiers + provider rate-limit ingestion
- **Priority:** P1
- **Review refs:** deepseek M2-04
- **Area:** config / router / health
- **Files:** `src/config/*`, `src/router/*`, `src/health/tracker.ts`, `bin/air.ts`
- **Depends on:** T7-006
- **Details:** make freeTier values runtime-configurable via user-editable `free-tier-overrides.yaml` (precedence CLI > env > repo > global > defaults). Add `air models --refresh-free` fetching maintainer-hosted file (pinned version, --offline fallback). Handle provider-reported rate limits (Retry-After, X-RateLimit-*) by updating local counter. Document best-effort drift.
- **Acceptance:** overriding free-tier limit in config changes router behavior without code change; provider-reported rate limits update local counters.

## T7-024 [DONE] — Tool opacity decision (tool-level vs provider-level)
- **Priority:** P1
- **Review refs:** deepseek M2-05
- **Area:** adapters / docs
- **Files:** `src/adapters/*`, `docs/behavior-spec.md`
- **Depends on:** none
- **Details:** resolve explicitly: (a) tool-level free-ness mark adapter free/paid based on expected default config, documented; or (b) provider-level visibility extend adapter contract with optional `reportsProvider(): {provider,model}|null`, where null fall back to (a). Prefer (b) where feasible. Document chosen approach in docs/behavior-spec.md under "free-tier semantics." Acceptance: `air models --free` output explainable; `--stats` free/paid determination correct.
- **Acceptance:** documented + consistently applied.

## T7-025 [DONE] — Change summaries in injected messages + tool side-effect safety
- **Priority:** P1
- **Review refs:** deepseek M2-07; grok G7-08
- **Area:** result-compiler / conversation / orchestrator
- **Files:** `src/result-compiler/index.ts`, `src/conversation/*`, `src/orchestrator/*`
- **Depends on:** T7-008
- **Details:** include change summary in injected tool message: files added/modified/deleted + commits created (if auto-commit). Front agent surfaces change summaries in natural language. Require explicit `--allow-commits` for tools that auto-commit; without it disable or run no-commit mode. Refuse to run in dirty tree by default (verify applies to background tasks). Result compiler include delta file list, verify PASS/FAIL, duration, adapter id (optional/verbose); default user-facing text short; always redact.
- **Acceptance:** injecting task that modified 3 files produces message with change summary; front-agent prose mentions change count.

## T7-026 [DONE] — Planner quality (light)
- **Priority:** P1
- **Review refs:** grok G7-07; chatGPT R6-07
- **Area:** planner
- **Files:** `src/planner/index.ts`
- **Depends on:** T7-007
- **Details:** prefer single write work item unless parallel read-only clear; sequential review → edit when both match; never schedule two writers on one cwd without worktree isolation (use worktree path in orchestrator start for write jobs). Add Zod schema + versioning + migration for plans (R6-23).
- **Acceptance:** planner tests for multi-step, dependencies, replanning, malformed output.

## T7-027 [DONE] — Worktree lifecycle (review/apply/merge, cleanup, GC)
- **Priority:** P1
- **Review refs:** chatGPT R6-08/R6-22; grok G7-09
- **Area:** workspace
- **Files:** `src/workspace/index.ts`, `bin/air.ts`, `src/mcp/server.ts`
- **Depends on:** T7-002
- **Details:** integrate WorkspaceManager into job launch; every concurrent write worker gets own actual worktree path; persist base commit/branch/changed files/patch/diff/lifecycle; read-only tasks may share source if safe. Add diff review, conflict checking, explicit `air merge <jobId>` / apply action; never auto-merge/discard. On cancel/failure/restart preserve useful diffs and recover worktree not blindly delete. Worktree IDs/branches validated; cleanup never deletes user-owned work. Add `air worktrees gc`/TTL.
- **Acceptance:** two concurrent write workers cannot alter each other's worktree or user's checkout; user can inspect and explicitly apply one completed diff; real git integration test.

## T7-028 [DONE] — Chat UX completeness (slash commands)
- **Priority:** P1
- **Review refs:** grok G7-05; deepseek M2-09
- **Area:** chat
- **Files:** `bin/air.ts`
- **Depends on:** T7-007, T7-008
- **Details:** commands `/status`, `/jobs`, `/cancel <id>`, `/run`, `/plan <goal>`, `/quit`, `/help`, `/last` (reprint compiled result), `/stats`, `/tasks`. Show conversation id on start; support --resume. Windows-safe readline. REPL lines for task started/finished visually distinct.
- **Acceptance:** commands work; help lists them.

## T7-029 [DONE] — MCP list_conversations / list_jobs + event notifications
- **Priority:** P1
- **Review refs:** grok G7-06; chatGPT R6-11
- **Area:** MCP
- **Files:** `src/mcp/server.ts`
- **Depends on:** T7-010
- **Details:** add `list_conversations`, `list_jobs` (filter by conversation activeWorkIds), `get_job_result`, `get_events(afterSequence)`, progress notifications. Reuse ConversationSession store.
- **Acceptance:** MCP parity tests.

## T7-030 [DONE] — Typed event model strengthening
- **Priority:** P1
- **Review refs:** chatGPT R6-24
- **Area:** orchestrator / events
- **Files:** `src/orchestrator/orchestrator.ts`, types
- **Depends on:** T7-014
- **Details:** events with stable event ID, sequence, conversation/work/work-item/execution reference, payload schema, actor, cursor semantics. Typed events not ad-hoc strings.
- **Acceptance:** event cursor polling works across processes.

## T7-031 [DONE] — Multi-session CLI path uses central scheduler
- **Priority:** P1 (P2 review)
- **Review refs:** chatGPT R6-27
- **Area:** CLI / orchestrator
- **Files:** `bin/air.ts`, `src/execution/sessions.ts`
- **Depends on:** T7-026
- **Details:** replace `air run --sessions` round-robin with multiple work items submitted to central scheduler; retain SessionManager as low-level executor utility.
- **Acceptance:** sessions tests updated; central policy applied.

## T7-032 [DONE] — README/PLAN/docs honesty update for review-7 state
- **Priority:** P1
- **Review refs:** chatGPT R6-19; deepseek M2-08; grok G7-13
- **Area:** docs
- **Files:** `README.md`, `PLAN.md`, `docs/behavior-spec.md`, `docs/front-agent-voice.md`
- **Depends on:** implementation tasks
- **Details:** mark planner/permission/worktree/result compilation experimental scaffolding until wired; state chat messages acknowledged but not yet supervised until decision loop wired; update after wiring. Document free-only policy once without contradiction. CHANGELOG.md with M2 milestone first entry; bump version; install path; `air --version` matches tag.
- **Acceptance:** docs consistent with registry/CI; help test passes.

---

# P2 — Quality and consistency

## T7-033 [BLOCKED] — Conversation summary compaction (already T7-022) placeholder
- **Priority:** P2
- **Review refs:** grok G7-11
- **Area:** conversation
- **Details:** absorbed into T7-022.

## T7-034 [DONE] — Dashboard links conversations
- **Priority:** P2
- **Review refs:** grok G7-12
- **Area:** CLI
- **Files:** `bin/air.ts`
- **Depends on:** T7-010
- **Details:** show conversation id, active jobs, last message ts in `air dashboard`.
- **Acceptance:** dashboard displays them.

## T7-035 [DONE] — E2E smoke path for conversation loop
- **Priority:** P2
- **Review refs:** grok G7-14; deepseek M2-A
- **Area:** tests
- **Files:** `tests/scenario/` or scripts
- **Depends on:** T7-007, T7-008
- **Details:** automated scenario test (not manual): temp git repo → scripted air chat lines → mock/real aider if present → assert conversation file contains compiled result. Include kill-and-resume mid-task.
- **Acceptance:** scenario test exists and green in CI.

## T7-036 [DONE] — ChatProvider interface documented + mock swap test
- **Priority:** P2
- **Review refs:** deepseek M2-10
- **Area:** docs / conversation
- **Files:** `docs/adapters/chat-providers.md`, tests
- **Depends on:** T7-007
- **Details:** document ChatProvider interface with worked example; test swaps mock ChatProvider proving seam. Do not implement second provider in M2.
- **Acceptance:** interface documented; mock provider test passes.

## T7-037 [DONE] — Remote catalog integrity (signed/pinned)
- **Priority:** P2
- **Review refs:** chatGPT R6-25
- **Area:** installer / catalog
- **Files:** `src/config/catalog.ts`, `src/installer/*`
- **Depends on:** none
- **Details:** use pinned checksums in trusted metadata or verify publisher signatures with trusted key; keep install explicit user action.
- **Acceptance:** tampered hash fails install.

## T7-038 [BLOCKED] — Second front-agent provider deferred (document seam)
- **Priority:** P2
- **Review refs:** deepseek M2-10
- **Area:** docs
- **Details:** absorbed into T7-036.

## T7-039 [DONE] — Verification gate V-01..V-15 automated
- **Priority:** P0 (gate)
- **Review refs:** deepseek §1
- **Area:** tests / docs
- **Files:** `docs/m2-verification.md`, tests
- **Depends on:** all P0
- **Details:** run every V-01..V-15 against main; convert 10-step DoD scenario into automated test; document pass/fail with evidence. Any failure becomes P0 with ID and closed before M2-B.
- **Acceptance:** all V-items pass; scenario test exists and green.

---

# Phased roadmap (Reviews 7)

| Phase | Scope | Tasks | Exit criteria |
|---|---|---|---|
| **P0a** | Job lifecycle + safety | T7-001..T7-006, T7-014..T7-020 | Built-binary e2e cancel/output/failover/permission/free-only green |
| **P0b** | Conversation loop | T7-007..T7-013 | air chat decides, spawns, injects compiled results; restart-safe |
| **P1a** | Voice + compaction + free tiers + opacity | T7-021..T7-024 | golden tests; compaction; free overrides |
| **P1b** | Context + worktrees + chat UX + MCP parity | T7-009, T7-025..T7-031 | write isolation real; thread facts improve follow-ups |
| **P2** | Polish + docs + release | T7-032, T7-034..T7-039 | scenario test green; docs match reality |

Do not start a later phase until the current phase's acceptance criteria pass with real tests.

---

# Definition of done (Reviews 7 / M2)
M2 done when all: V-01..V-15 pass with evidence; 10-step DoD scenario automated & green in CI; stress test 10 concurrent completions green; crash-recovery test green; voice spec + golden tests; compaction 500-turn test; free-tier overrides work; tool-opacity documented & applied; change summaries in injected messages; tool auto-commit gated; CHANGELOG + version bump + install path; /stats & /tasks work; ChatProvider interface documented with mock test.

---

# Anti-patterns to avoid (Reviews 7)
- Treating "implemented" as "proven."
- Adding second front-agent provider/web UI/task classifier before gate green.
- Letting front agent narrate tool names/exit codes/"switching now".
- Injecting results without idempotency.
- Hardcoding free-tier limits.
- Ignoring tool-opacity question.
- Shipping without changelog/install path.
- Building /stats before /tasks.
- Writing new locking scheme for conversations when existing lock pattern works.
- Expanding conversation storage to DB in M2 (JSON + atomic writes fine; compaction is the fix).
- Auto-merge/discard worker changes.
filePath">
E:\GitHub\air\docs\reviews\tasks_air_7.md
