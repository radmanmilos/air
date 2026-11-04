# AIR — Complete Task List from Reviews 6

**Generated:** 2026-11-04
**Sources (all in `docs/reviews/`):**
- `chatGPT_plan_review_6.md` (P0-01..P0-06, P1-07..P1-24, P2-25..P2-29)
- `claude_plan_review_v6.md` (J-01..J-13, M0..M7, scenarios A1..A10)
- `deepseek_plan_review_6.md` (SA-00a..SA-00c, SA-01..SA-11)
- `grok_plan_review_6.md` (G6-01..G6-12, phases V0..V4)

**Scope:** all work happens in `E:\GitHub\air`. No changes to other repos until integration is ready.
**Canonical authority:** this file is the single task list for Reviews 6. `PLAN.md` should be updated to point here and to the reviews. Archive prior `tasks_air.md` (Reviews 5) once its remaining items are absorbed (they are — see P0/P1 below).

## How to use
1. Work only on tasks marked `ready` (dependencies satisfied).
2. Before starting a task, set its status to `in_progress` and record the start date.
3. Implement, add/update tests, run the validation checklist, update docs.
4. Set status to `done` only after tests + docs + commit/push.
5. Never start a later phase until the current phase's acceptance criteria pass with real tests (per DeepSeek §8 and Grok §6).
6. Tasks marked `parallel-safe` may be worked concurrently by different agents; tasks sharing files must be serialized.

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
| chatGPT_plan_review_6.md | P0-xx / P1-xx / P2-xx | product + architecture + security |
| claude_plan_review_v6.md | J-xx | verified runtime findings + roadmap |
| deepseek_plan_review_6.md | SA-xx | super-agent vision + carryover P0s |
| grok_plan_review_6.md | G6-xx | vision-aligned implementation review |

## Priority legend
- **P0** — Critical blockers. Product cannot be trusted/used until closed.
- **P1** — High. Required for the "one super agent" product goal.
- **P2** — Quality/consistency. Should not block the vertical slice but must land before release.

---

# P0 — Critical blockers

## P0-A. Security and config trust

### T-001 [DONE] — Repo config cannot control global-only security keys
- **Priority:** P0
- **Review refs:** chatGPT P0-01, P0-06, P1-04, P1-21; claude J-03, J-04; deepseek SA-00 (carryover H-07); grok G6-06
- **Area:** config / security
- **Files:** `src/config/loader.ts`, `src/config/schema.ts`, `src/context/verify.ts`, `bin/air.ts`
- **Depends on:** none
- **Parallel:** yes (with T-002, T-003)
- **Details:**
  - Make `catalog.*`, `failover.mode`, `permission.*`, `redaction.*`, `trustedRepos`, `tools[].executable`, `verify.*`, `concurrency`, `privacy.*` global-only. Repo values are ignored with a warning.
  - Parse each config layer as partial; merge by origin; apply defaults once. Fix the broad `catch {}` in loader: catch `ENOENT` as missing, report parse/IO errors.
  - `air config --validate` must validate both global and repo sources and fail closed on malformed YAML/policy.
  - `trustedRepos` must be loaded from a user/global-only trust store; reject `trustedRepos` from repo config. Keep config provenance for security-sensitive settings.
- **Acceptance:** repo probe suite passes; a repo cannot set any global-only key; global values survive an unrelated repo file; malformed YAML surfaces as error.

### T-002 [DONE] — Remove remote-code-execution chain through catalog
- **Priority:** P0
- **Review refs:** chatGPT P0-01, P1-24; claude J-03; deepseek (catalog); grok G6-09
- **Area:** catalog / installer / security
- **Files:** `src/config/catalog.ts`, `src/installer/installer.ts`, `src/installer/status.ts`, `config/catalog.json`, `src/orchestrator/orchestrator.ts`
- **Depends on:** T-001
- **Parallel:** partially (with T-003)
- **Details:**
  - Delete silent auto-install: `Orchestrator.start()` must not call `autoInstallMissing`. Installation is explicit (`air adapters install <id>`), prints the exact command, asks for confirmation unless `--yes`.
  - Remote catalog: HTTPS-only, signed (pin a public key shipped with AIR), Zod-validated, bound to its URL in cache, allowed to add only metadata (models/limits), never executable fields (`install.commands`, `factoryModule`).
  - Remove `factoryModule` from catalog data; dynamic adapters must be local files listed in global config by absolute path.
  - Direct downloads: pin version-specific URLs + SHA-256 shipped in catalog (not fetched from same origin), verify before moving to final path, add `<cache>/bin` to adapter lookup path.
  - Bundled catalog immutable by default; remote entries cannot override bundled entries' executable fields.
  - Package-manager install commands must be validated (allowlisted executables/args), not free-form strings.
  - Binary executable value must be strict basename/path validation; install-status uses locked atomic write (no fixed `.tmp` race).
  - Verify actual binary version against catalog pin after install and before routing.
- **Acceptance:** tests that repo/remote cannot set executable fields; hash mismatch leaves no file at final path; no install runs without confirmation; `catalog-lint` CI job passes.

### T-003 [DONE] — Correct catalog package names and add catalog-lint CI
- **Priority:** P0
- **Review refs:** chatGPT P1-23; claude J-02, J-11; deepseek (catalog); grok G6-06, G6-12
- **Area:** catalog / CI
- **Files:** `config/catalog.json`, `.github/workflows/ci.yml`, `tests/catalog*.test.ts`
- **Depends on:** none
- **Parallel:** yes (with T-001)
- **Details:**
  - Fix wrong/non-existent packages: aider is Python (`pip install aider-chat` / `aider-install`), not `npm install -g aider`; kilocode is `@kilocode/cli`; opencode is `opencode-ai`; codex `@openai/codex` (correct); github-copilot needs Copilot CLI not just `gh`.
  - Verify every package name/id/URL against official docs + registry; pin exact versions.
  - Add CI `catalog-lint` job that resolves every catalog command (`npm view`, `pip index`, `winget show`, `brew info`, HTTP HEAD) and fails on mismatch; check installed binary reports pinned version + publisher metadata.
  - Represent local vs CI vs runtime version compatibility separately; mark unverified adapters experimental and out of routing.
- **Acceptance:** `catalog-lint` passes in CI; mismatched entry fails a test.

### T-004 [DONE] — Fix verify trust provenance (global-only trust store)
- **Priority:** P0
- **Review refs:** chatGPT P0-06, P1-21; claude J-03; grok (security)
- **Area:** config / security
- **Files:** `src/context/verify.ts`, `src/config/loader.ts`, `bin/air.ts`
- **Depends on:** T-001
- **Parallel:** yes (with T-002)
- **Details:**
  - `trustedRepos` must come from global-only trust store; repo config cannot add itself.
  - Keep config provenance; do not flatten trusted-global policy and untrusted-repo preferences into one object.
  - Test: temp repo attempts to trust itself → refused until trusted outside that repo.
  - Verify command executes with arg arrays, `shell: false`; never concatenate user-controlled strings.
- **Acceptance:** self-trust refused test passes.

## P0-B. Core runtime (air run / MCP actually works)

### T-005 [DONE] — Fix adapter registry mismatch breaking `air run` and MCP
- **Priority:** P0
- **Review refs:** claude J-01; chatGPT P0-02; deepseek SA-00b; grok (adapters)
- **Area:** orchestrator / adapters / MCP
- **Files:** `src/orchestrator/orchestrator.ts`, `src/adapters/registry.ts`, `src/mcp/server.ts`, `bin/air.ts`
- **Depends on:** none
- **Parallel:** yes (with T-006)
- **Details:**
  - `Orchestrator.start()` / `resumeAfterApproval()` must use `availableAdapters(config)` (verified + enabled + available), not `listAdapters` (wrapper objects). Rename to avoid confusion (`listAdapterInfos` vs `availableAdapters`).
  - MCP background job must wrap body so any exception persists `FAILED` with redacted error + terminal event (no forever-RUNNING).
  - `available` must be derived from adapter registry status (same source as `check-models`); include reason when false (`not_installed`, `unverified`, `auth_required`); exclude unavailable from recommender.
  - Remove "CLI verified: air run" claim from PLAN.md until e2e passes.
- **Acceptance:** built-binary e2e (CLI + MCP, fake executables) success/edit/rate-limit/crash/timeout/SIGINT; exception yields FAILED within 1s; no adapter injection in these tests.

### T-006 [DONE] — MCP run ID consistency and stdout protocol purity
- **Priority:** P0
- **Review refs:** chatGPT P0-02, P0-04; claude J-01; deepseek (MCP); grok (MCP)
- **Area:** MCP / orchestrator
- **Files:** `src/mcp/server.ts`, `src/orchestrator/orchestrator.ts`
- **Depends on:** T-005
- **Parallel:** no (depends on T-005)
- **Details:**
  - One canonical run/work ID created once and used by CLI/MCP, task state, orchestrator state, events, approvals, cancellation, resume.
  - No agent output to stdout in MCP mode; diagnostics to stderr/logs; persisted output channel with offsets.
  - MCP `run_task` returns runId immediately (async job), poll via status/output.
- **Acceptance:** MCP e2e test launches stdio process and verifies protocol purity + run ID linkage.

### T-007 [DONE] — MCP cancellation aborts the real worker process
- **Priority:** P0
- **Review refs:** chatGPT P0-03; claude (cancellation); deepseek (MCP); grok (safety)
- **Area:** MCP / execution
- **Files:** `src/mcp/server.ts`, `src/execution/runner.ts`, `src/orchestrator/orchestrator.ts`
- **Depends on:** T-005
- **Parallel:** yes (with T-006 once T-005 done)
- **Details:**
  - `cancel_task` must abort the actual child process tree (taskkill /T /F on Windows, process group on Unix) and propagate CANCELLED.
  - Orchestrator must own the AbortController/process handle and expose it through public API.
  - `get_task_output` works for cancelled jobs.
- **Acceptance:** `tests/mcp-cancel.test.ts` passes; child process exits.

## P0-C. Concurrency and locking

### T-008 [DONE] — Enforce configured global concurrency cap (not literal 1)
- **Priority:** P0
- **Review refs:** chatGPT P1-12; claude J-08; deepseek SA-00a; grok (seats)
- **Area:** concurrency / orchestrator
- **Files:** `src/orchestrator/orchestrator.ts`, `src/utils/concurrency.ts`, `src/execution/sessions.ts`, `bin/air.ts`
- **Depends on:** none
- **Parallel:** yes (with T-009)
- **Details:**
  - Pass `config.concurrency.maxConcurrentAgents` into seat acquisition (not literal 1).
  - Use one shared seat name (e.g. `'agent'`) for global pool.
  - Orchestrator must acquire/release seats for every worker launch in every entry path (CLI, MCP, sessions).
  - Surface `SEAT_TIMEOUT`.
- **Acceptance:** `maxConcurrentAgents: 2` limits concurrency to 2 across CLI and MCP; 3-session test proves it.

### T-009 [DONE] — Fix seat pool race (atomic create + grace period)
- **Priority:** P0
- **Review refs:** chatGPT P1-18; claude J-08; deepseek (locks); grok G6-11
- **Area:** concurrency / locks
- **Files:** `src/utils/lock.ts`, `src/utils/concurrency.ts`
- **Depends on:** none
- **Parallel:** yes (with T-008)
- **Details:**
  - Use unique random ownership token per lock/seat acquisition; verify token before release/stale reclamation; use safe owner identity (PID + start time) to detect PID reuse.
  - Create slot atomically (write temp + rename/link), not `O_CREAT|O_EXCL` then write; treat empty/unparseable file as stale only after grace period (mtime older ~2s).
  - Reclaim stale only with ownership verification (no path-based unlink race).
  - Fix health counter merge: persist per-tracker increments inside locked transaction instead of merging stale absolute snapshots.
  - Update stale comments to match PID-alive policy.
- **Acceptance:** 4 processes x 20 increments = 80; cap holds under 20 concurrent submissions; genuine independent-process race tests pass.

### T-010 [DONE] — Cross-process lock ownership token + additive counters
- **Priority:** P0
- **Review refs:** chatGPT P1-18; claude (locks); deepseek (health); grok G6-11
- **Area:** locks / health
- **Files:** `src/utils/lock.ts`, `src/health/tracker.ts`
- **Depends on:** T-009
- **Parallel:** no
- **Details:** (absorbed into T-009 details; tracked separately for ownership-token + counter work)
  - Health tracker counters use additive increments under lock; no stale absolute snapshot merge.
- **Acceptance:** concurrent health updates cannot overwrite one another.

## P0-D. Redaction and output safety

### T-011 [DONE] — Fix redaction coverage and streaming stall
- **Priority:** P0
- **Review refs:** chatGPT P1-09, P1-20; claude J-09; deepseek (redaction); grok (safety)
- **Area:** security / redaction
- **Files:** `src/security/redact.ts`, `src/security/streaming-redact.ts`, `tests/streaming-redact.test.ts`
- **Depends on:** none
- **Parallel:** yes (with T-012)
- **Details:**
  - One shared secret-pattern registry for detection, streaming prefix guarding, and replacement. Add all advertised families: `sk-ant-`, `sk-proj-`, `gho_`, `ghs_`, `ghu_`, `ASIA`, `xox`, `AIza`, JWT, PEM blocks, JSON/YAML `apiKey`/`password=`, credentialed URLs, Slack tokens.
  - Exact redaction of values of env vars named `*KEY|*TOKEN|*SECRET|*PASSWORD`.
  - Fix withheld buffer stall: bounded tail, line-based flush, no unbounded buffer after `task-`/`--author`.
  - `containsSecret` uses non-global detection copies (no `lastIndex` state); `--api-key` and `--api-key=value` both handled.
  - Redaction idempotent and deterministic; `allow` option protects allowlisted values.
- **Acceptance:** property tests for all token families, lower/mixed-case bearer schemes, flags, env vars, MAX_WITHHELD overflow, tokens split at every chunk boundary; no supported secret appears in streams/logs/handoffs/MCP/final responses.

### T-012 [DONE] — Byte caps must be code-point-safe
- **Priority:** P0
- **Review refs:** chatGPT P1-19; claude J-13 (minor); deepseek (runner); grok (runner)
- **Area:** execution / runner
- **Files:** `src/execution/runner.ts`, `src/types/outcome.ts`
- **Depends on:** none
- **Parallel:** yes (with T-011)
- **Details:**
  - Use code-point-safe UTF-8 truncation helper or keep captured buffers and decode only after finding a safe boundary.
  - Test emoji and non-Latin characters with cap at every byte boundary.
  - Clarify whether byte counters mean total emitted vs retained bytes, per-stream vs aggregate.
- **Acceptance:** multibyte split test passes; 1000-byte cap captures exactly 1000 bytes.

## P0-E. Free/cost honesty and adapter verification

### T-013 [DONE] — Fix cross-provider failover (allow-provider wiring)
- **Priority:** P0
- **Review refs:** chatGPT P0-05; claude J-07; deepseek (routing); grok (routing)
- **Area:** router / failover / CLI / MCP
- **Files:** `bin/air.ts`, `src/mcp/server.ts`, `src/orchestrator/orchestrator.ts`, `src/security/allowlist.ts`
- **Depends on:** T-005
- **Parallel:** yes (with T-014)
- **Details:**
  - Add `allowProviders` option to `Orchestrator.start()`; wire `--allow-provider` (CLI) and MCP schema into it.
  - Build allow-list from first candidate's actual provider; interactive consent in `ask` mode on TTY (`approve_failover` in MCP).
  - Real candidate proposals (no hardcoded goose); bind approval to exact proposal hash.
  - Add built-binary e2e: fake aider rate limit → fake goose succeeds.
- **Acceptance:** cross-provider failover e2e passes; USER_CANCELLED never triggers failover; auth/permission failures do not retry broken credentials.

### T-014 [DONE] — Model recommender must respect task requirements and use bestModel
- **Priority:** P0
- **Review refs:** chatGPT P1-09; claude (H-12); deepseek SA-00c; grok (routing)
- **Area:** router
- **Files:** `src/router/catalog.ts`, `src/orchestrator/orchestrator.ts`, `bin/air.ts`
- **Depends on:** T-005
- **Parallel:** yes (with T-013)
- **Details:**
  - Active `Orchestrator.start()` must call `chooseAdapter()`/`bestModelFor()` (currently uses priority list only).
  - Filter by `task.readOnly` (write requires `capabilities.write`), `task.mode` (`auto` requires headless), optional `requiresCode`.
  - Return `null` with reason when nothing eligible.
  - `air models --best <task>` must pass task text into filters (not fixed `mode:'ask', readOnly:false`).
  - Cost tier must be explicit catalog data, not regex (`/mini/`).
- **Acceptance:** read-only/write/ask/auto cases each have passing tests; `--explain` shows inputs.

### T-015 [DONE] — Make "verified adapters" claims accurate in CI
- **Priority:** P0
- **Review refs:** chatGPT P1-23; claude J-12, J-11; deepseek (adapters); grok G6-06
- **Area:** adapters / CI / docs
- **Files:** `src/adapters/registry.ts`, `tests/smoke-real-binary.test.ts`, `.github/workflows/ci.yml`, `README.md`, `PLAN.md`
- **Depends on:** T-003
- **Parallel:** yes (with T-016)
- **Details:**
  - Separate local validation, CI validation, runtime version compatibility.
  - Gate `verified: true` behind CI smoke confirmation; unverified adapters experimental and out of routing.
  - Smoke tests must exercise headless task path, not only `--version`; add github-copilot smoke test.
  - README single source of truth matching registry META; remove contradictory statements.
- **Acceptance:** CI runs real-binary smoke for all routed adapters; README/PLAN consistent.

### T-016 [DONE] — Free-first ranking as enforceable policy (catalog cost/auth/limits)
- **Priority:** P0
- **Review refs:** chatGPT P1-16; claude J-11, J-03; deepseek SA-04; grok G6-03, G6-12
- **Area:** catalog / router / free policy
- **Files:** `config/catalog.json`, `src/config/catalog.ts`, `src/router/catalog.ts`, `src/adapters/registry.ts`
- **Depends on:** T-003, T-014
- **Parallel:** no (depends)
- **Details:**
  - Add catalog fields `cost` (`free`/`freemium`/`paid`/`unknown`), `auth` (`none`/`api_key`/`oauth`/`subscription`), `limits` (rpm/rpd/tpm/tpd/resetsAt), `contextWindow`.
  - Default paid spend zero; paid fallback requires explicit consent; `unknown` is not `free`.
  - For OpenRouter, read `pricing` from models API; mark free only when prompt+completion prices are zero.
  - Tools needing account/subscription (Codex sign-in, Copilot plan) are `auth: oauth|subscription` and excluded from default free set unless configured.
  - Stop mapping `supportsStreaming` → `reasoning`; use explicit capability fields only.
  - Candidate ranking: available+verified+enabled → capable → not on cooldown → costTier ascending → health → context window.
- **Acceptance:** with both free and paid eligible, free wins; `air models --free`/`--all`; tests lock ranking.

## P0-F. Persistence and state durability

### T-017 [DONE] — Durable job/event store (replace single JSON snapshot)
- **Priority:** P0
- **Review refs:** chatGPT P0-05 (state), P1-14; claude J-05; deepseek (task-state); grok (state)
- **Area:** persistence / orchestrator
- **Files:** `src/orchestrator/orchestrator.ts`, `src/execution/task-state.ts`, `src/utils/lock.ts`
- **Depends on:** T-009
- **Parallel:** yes (with T-018)
- **Details:**
  - Replace `orchestrator.json` whole-file rewrite with transactional store (SQLite or locked append-only event log). Single writer; no cross-instance overwrite.
  - Atomic temp-write+rename where file-based; cross-process lock.
  - `load()` must not silently ignore corrupt state; recover/reconcile.
  - Remove SIGINT/SIGTERM listeners per run after completion (no leak).
  - Events have hard size limits + truncation metadata; output buffers bounded.
- **Acceptance:** two orchestrator instances on one cache dir → no data loss; crash mid-write recoverable.

### T-018 [DONE] — Crash recovery and reconciliation of running jobs
- **Priority:** P0
- **Review refs:** chatGPT P1-11, P1-14; claude (recovery); deepseek (task-state); grok (recovery)
- **Area:** persistence / orchestrator / execution
- **Files:** `src/orchestrator/orchestrator.ts`, `src/execution/sessions.ts`, `src/execution/runner.ts`
- **Depends on:** T-017
- **Parallel:** no
- **Details:**
  - On daemon/process start, reconcile: processes recorded running but dead → `FAILED(interrupted)`; living orphans → re-attach or kill; preserve conversation/job table.
  - Stale-running-task recovery: mark run interrupted; do not auto-restart agent; allow status/recovery inspection.
  - Multi-task file safety: no overwrite of another task's file; locked index append.
  - Record worker PIDs; manage process groups; release leases/slots safely.
- **Acceptance:** kill daemon mid-job, restart → state recovered, no orphan processes; tests pass.

### T-019 [DONE] — Task-level baseline across whole work item (not per hop)
- **Priority:** P0
- **Review refs:** chatGPT P1-15; claude (delta); deepseek (delta); grok (delta)
- **Area:** orchestrator / context / git
- **Files:** `src/orchestrator/orchestrator.ts`, `src/context/checkpoint.ts`, `src/context/handoff.ts`
- **Depends on:** none
- **Parallel:** yes (with T-020)
- **Details:**
  - Capture one immutable baseline for the whole user work item before first worker starts; keep per-attempt snapshots for debugging.
  - Compute final user-visible change set from initial baseline to final workspace + commit state (handle committed changes; clean tree after commit must not appear empty).
  - Content fingerprints (`git hash-object`) before/after; track untracked deletions; pre-existing dirt not counted.
- **Acceptance:** failover A→B where A made changes → final delta not empty; commit case handled.

### T-020 [DONE] — Handoff diff redaction and scope
- **Priority:** P0
- **Review refs:** chatGPT P0-06 (handoff), P1-20; claude J-09; deepseek (redaction); grok (handoff)
- **Area:** context / redaction
- **Files:** `src/context/handoff.ts`, `src/security/redact.ts`, `src/security/streaming-redact.ts`
- **Depends on:** T-011, T-019
- **Parallel:** no
- **Details:**
  - Redact handoff fully (tracked diff + untracked contents) via single choke point.
  - Handoff builds from git state only (branch, HEAD, status porcelain, size-capped diff, changed files, error category, last N KB redacted output); never model prose.
  - Preview destination/size before consent; bind approval to payload hash.
  - Cross-provider data transfer requires explicit policy/consent; block or require approval, naming destination.
- **Acceptance:** redaction tests on handoff; cross-provider block test passes.

---

# P1 — High (product core)

## P1-A. Conversation and front agent (new layer)

### T-021 [DONE] — Introduce persistent ConversationSession store
- **Priority:** P1
- **Review refs:** chatGPT P1-07; claude J-06; deepseek SA-01; grok G6-01
- **Area:** conversation
- **Files:** new `src/conversation/thread.ts` (or `src/conversation/session.ts`), `src/types/index.ts`
- **Depends on:** T-017
- **Parallel:** yes (with T-022)
- **Details:**
  - `Conversation`/`ConversationSession`: id (ULID), createdAt/updatedAt, messages[], activeWorkIds[], summary?, facts[], userPreferences (freeOnly, paidFallbackRequiresApproval), frontAgentModel.
  - Neutral provider-agnostic message format (role: user/assistant/system/tool/job; content; ts; workItemId?).
  - Persist to `<cache>/conversations/<id>.json` (or threads) via atomic write + lock; safe concurrent append (user msg + task completion).
  - Load on `--resume`; reconcile after restart.
  - CLI: `air conversations list/show`; MCP: `get_conversation`.
- **Acceptance:** persist/reload round-trip; concurrent appends don't corrupt; crash recovery.

### T-022 — Non-blocking `air chat` REPL with follow-ups
- **Priority:** P1
- **Review refs:** chatGPT P1-07, P1-11; claude J-06; deepseek SA-02; grok G6-02
- **Area:** chat UX
- **Files:** new `src/chat/` (or `bin/air.ts` chat command), MCP
- **Depends on:** T-021, T-005
- **Parallel:** no
- **Details:**
  - `air chat` REPL: accepts input while background work runs; never blocks on task completion.
  - Controls: `/status`, `/jobs`, `/cancel <id>`, `/dashboard`, `/approve`, `/apply`; `Ctrl-C` cancels current foreground thought/task; `Ctrl-D`/exit persists + quits.
  - Render front-agent reply, subtle "task started" ack, async "task finished" notification injected as assistant message.
  - `--resume <id>`, `--free-only` (default true), `--allow-paid`, `--model <provider/model>`.
  - `--dev` verbose diagnostics.
- **Acceptance:** scenario: submit 10s edit job, at t=1s ask unrelated question → answered while job runs; task completion message appears unprompted.

### T-023 — Async result injection into conversation
- **Priority:** P1
- **Review refs:** chatGPT P1-07; deepseek SA-03; grok G6-04, G6-05
- **Area:** conversation / injection
- **Files:** `src/conversation/*`, `src/orchestrator/*`, `src/security/redact.ts`, `src/security/streaming-redact.ts`
- **Depends on:** T-021, T-011
- **Parallel:** yes (with T-024)
- **Details:**
  - `TaskResultSummary`: `{ taskId, status, tool, provider, model, durationMs, changes, errors?, verifyOutput?, nextSteps? }`.
  - Redact before injection; cap inline (default 4KB; larger summarized); hard cap final injected (default 8KB).
  - Inject as `tool` message keyed by taskId; atomic with conversation write.
  - Crash recovery: if injection missed, re-inject on next load from task-state.
  - Summarize via front agent if context allows, else cheap secondary model (SA-08).
- **Acceptance:** mock task end-to-end → assistant message references what task did without user asking; crash mid-injection recovered.

### T-024 — Front agent model selection and same-provider fallback
- **Priority:** P1
- **Review refs:** deepseek SA-05, SA-11; grok (front agent); chatGPT (supervisor)
- **Area:** front agent
- **Files:** `src/conversation/*`, `src/router/catalog.ts`, config
- **Depends on:** T-021, T-016
- **Parallel:** yes (with T-023)
- **Details:**
  - Designate front-agent model (configured or auto-selected from free tier at session start), persisted in session.
  - Neutral message format convertible to any provider API; don't bind to one provider's schema.
  - Same-provider fallback chain on rate limit/auth; history preserved; transparent to user.
  - No cross-provider front-agent fallback in MVP (document limitation; prompt-only fallback as escape hatch).
  - Must not route front agent to exhausted free tier used by background tasks.
  - Graceful degradation: if all front models rate-limited, accept message, say what's queued + reset time; built-in command grammar works with no model.
- **Acceptance:** forced rate-limit → transparent switch, coherent reply; history preserved; docs state limitation.

### T-025 — Front agent action schema (Zod) + fallback
- **Priority:** P1
- **Review refs:** deepseek SA-02; claude (planner); chatGPT (supervisor)
- **Area:** front agent
- **Files:** `src/conversation/*`, `src/types/*`
- **Depends on:** T-024
- **Parallel:** yes (with T-026)
- **Details:**
  - Each user message produces zero or more actions: answer directly, `spawn_job`, `cancel_job`, amend running job, ask clarification, status.
  - Actions as schema-validated JSON (Zod) with one repair retry; invalid output falls back to "answer only" + log failure.
  - Front agent never blocks on job; control returns immediately after decision.
  - Rebuild prompt from store each turn: persona, rolling summary, structured facts, last K turns, short job digest (state, goal, age, last progress line). Compact with cheap model when transcript exceeds budget; compaction preserves facts + open jobs verbatim.
  - Workers never see raw chat; they get a `ContextPack` written by AIR/front agent.
  - Fixed persona prompt, no tool names unless asked; post-processor strips "As an AI model X..." artifacts.
- **Acceptance:** scenario tests with scripted fake model pass.

## P1-B. Planner and delegation

### T-026 — Lightweight delegation planner
- **Priority:** P1
- **Review refs:** chatGPT P1-08; claude (planner); deepseek (hints); grok G6-08
- **Area:** planner
- **Files:** new `src/planner/` or `src/orchestrator/planner.ts`
- **Depends on:** T-025, T-014
- **Parallel:** yes (with T-027)
- **Details:**
  - Turn user request into small typed work graph (work items with objective, acceptance criteria, required capabilities, inputs/artifact refs, dependencies, permissions, workspace, budget, result schema).
  - Deterministic task types + front-agent hints (`requiresWrite`, `requiresCode`, `requiresLongContext`, `maxDurationMs`); light heuristics fallback (verbs/file extensions); no heavy LLM classifier.
  - Adaptive: one worker enough for simple request; compound → inspect/implement/test/review.
  - Read-only work can run concurrently with independent checks; conflicting writes serialized or real worktrees.
  - Each work item measurable result state.
- **Acceptance:** simple task → one work item; compound → decomposed; tests.

### T-027 — Result compiler (one coherent user-facing reply)
- **Priority:** P1
- **Review refs:** chatGPT P1-10, P2-25; claude (compiler); deepseek (injection); grok G6-04
- **Area:** result compilation
- **Files:** new `src/result-compiler/` or `src/orchestrator/compile.ts`
- **Depends on:** T-023, T-019
- **Parallel:** yes (with T-026)
- **Details:**
  - `compileJobResult(session) → assistantMessage`: outcome label, adapter id (hideable), workspace delta summary, verify status, short redacted tail, next-step hint; no full transcripts by default.
  - Verify completion criteria from facts (delta, verification, output), never trust worker's "done" prose.
  - Resolve duplication/conflict across workers; link evidence/artifacts; state what changed.
  - Golden tests for SUCCEEDED_WITH_CHANGES, SUCCEEDED_READ_ONLY, NO_CHANGES, FAILED, CANCELLED, NEEDS_USER_REVIEW.
- **Acceptance:** golden tests pass; redaction on compiled messages.

## P1-C. Routing and free-first policy

### T-028 — Task capability typing and cost-aware routing
- **Priority:** P1
- **Review refs:** chatGPT P1-09, P1-16; claude (routing); deepseek SA-06, SA-07; grok G6-03
- **Area:** router / health
- **Files:** `src/router/router.ts`, `src/router/catalog.ts`, `src/health/tracker.ts`, `src/types/*`
- **Depends on:** T-016, T-014
- **Parallel:** yes (with T-029)
- **Details:**
  - Task typing: front agent assigns `taskType` (code_edit/code_review/explain/research/summarize/plan/test/other) + constraints; deterministic fallback + consistency check.
  - Capability hints filter candidate set before priority ordering; record inferred capabilities in trace event.
  - Free-tier quota tracking: extend health state per (provider,model) with `freeTierUsage` (requestsThisMinute/Today, resetAt); increment on spawn; deprioritize ≥80%, exclude at 100%; reset by `freeTier.resetWindowMs`.
  - Score: expectedQuality (EWMA outcomes) x quota headroom x latency x queue length, small exploration rate; return ranking + reason string.
  - Quota ledger: track requests/tokens per (provider,key alias) rolling windows; learn limits from 429 Retry-After; expose "available again at HH:MM".
  - When all free options exhausted: tell user, wait or ask paid opt-in; never spend silently.
  - `air status --json` surfaces quota state; `route-test --explain` shows inputs.
- **Acceptance:** A4/A5 scenarios pass; ranking deterministic given ledger snapshot.

### T-029 [DONE] — Permission policy enforcement (shared, real)
- **Priority:** P1
- **Review refs:** chatGPT P1-17; claude (permissions); deepseek (permissions); grok (permissions)
- **Area:** permissions / adapters
- **Files:** `src/config/schema.ts`, `src/config/loader.ts`, adapter command builders, new `src/permissions/policy.ts`
- **Depends on:** T-001
- **Parallel:** yes (with T-028)
- **Details:**
  - Create shared permission policy evaluated before every worker invocation: read-only/write access, allowed paths, shell/process, network, install/update, commit/push, data egress.
  - Translate to narrowest supported adapter flags; reject/isolate if adapter cannot enforce boundary.
  - Remove hardcoded broad flags (`--yes-always`, `--auto`, `--allow-all-tools`) unless permission mode allows.
  - Config `permission.mode` (`read_only|edit|edit_and_shell`), `broadApproval`, `autoCommit`, `allowShell` actually applied.
  - Cross-provider data transfer requires explicit policy/consent.
- **Acceptance:** read-only task never routes to non-enforcing adapter; permission tests pass.

## P1-D. Workspace isolation and results

### T-030 — Real git worktree isolation per write job
- **Priority:** P1
- **Review refs:** chatGPT P1-13; claude (isolation); deepseek (isolation); grok (isolation)
- **Area:** workspace / isolation
- **Files:** `src/execution/sessions.ts`, new `src/workspace/manager.ts`
- **Depends on:** T-019
- **Parallel:** yes (with T-031)
- **Details:**
  - Do not trust boolean `isolated` flag. Isolation manager must allocate separate worktree/directory, pass that dir to worker, track source commit + baseline.
  - Write jobs run in own git worktree under `<cache>/worktrees/<jobId>` on branch `air/<jobId>`; read-only jobs may share main tree.
  - Parallel write jobs safe. Delivery to user's branch is explicit apply step (fast-forward/merge/patch); conflicts reported, never overwritten.
  - Until real isolation exists, refuse parallel write sessions against one checkout even if `isolated:true`.
- **Acceptance:** two parallel write jobs on different files succeed; apply conflict reported without data loss; flag-only isolation rejected.

### T-031 [DONE] — Mechanical handoff from git state (not model summary)
- **Priority:** P1
- **Review refs:** chatGPT (handoff), claude (handoff); deepseek (handoff); grok (handoff)
- **Area:** context / handoff
- **Files:** `src/context/handoff.ts`
- **Depends on:** T-019, T-020
- **Parallel:** yes (with T-030)
- **Details:**
  - Build handoff pack from branch, HEAD, `git status --porcelain`, size-capped `git diff`, changed file list, error category, last N KB redacted output.
  - Never include model-generated prose as evidence.
  - `Orchestrator.resume()` retrieves actual conversation history/worker outputs/plan/artifacts/checkpoint and reconstructs intent (not synthetic one-line note).
  - Expose `air resume <runId> [task]` CLI and MCP `resume_task` with `parentRunId` and handoff context.
- **Acceptance:** resume carries real context; tests for CLI + MCP resume.

## P1-E. Observability and monitoring

### T-032 [DONE] — First-class typed event log / monitoring
- **Priority:** P1
- **Review refs:** chatGPT P2-25, P1-11; claude (monitor); deepseek (events); grok G6-10
- **Area:** observability / events
- **Files:** `src/orchestrator/orchestrator.ts`, new event types, `bin/air.ts` dashboard
- **Depends on:** T-017
- **Parallel:** yes (with T-033)
- **Details:**
  - Events as first-class typed append-only records with monotonic sequence numbers and worker IDs.
  - Distinguish conversation/turn/plan/work-item/execution/adapter-attempt events.
  - Lifecycle/progress events: accepted, planning, plan-ready, queued, worker-started, worker-progress, waiting-for-approval, retrying/failover, verifying, worker-completed, result-compiled, awaiting-user-input, completed/failed/cancelled.
  - Heartbeat, progress, output cursor, retry count, resource usage, artifact refs.
  - Expose event cursor so front agent asks for updates since last check (`get_events(workId, afterSequence)`).
  - `air dashboard` shows active jobs linked to thread ids, free vs paid last selection, cooldowns, seat utilization; reads persisted store.
  - Structured JSONL traces for every routing decision, tool launch, failure classification, failover event; skip reasons exact (`cooldown_active`, `capability_mismatch`, etc.).
  - `air status --json` machine-readable health/cooldown; `air route-test --explain`.
  - Cost/free observability: `free` + `estimatedCostUsd` in trace events per spawn; `air chat --stats` / `/stats` showing messages, tasks, tools, all-free-yes/no, estimated cost; aggregate per session/day.
- **Acceptance:** event cursor polling works; dashboard shows required sections; traces contain skip reasons + cost.

### T-033 — MCP conversation tools
- **Priority:** P1
- **Review refs:** deepseek SA-09; grok G6-07; chatGPT (MCP behavior)
- **Area:** MCP
- **Files:** `src/mcp/server.ts`
- **Depends on:** T-021, T-022
- **Parallel:** yes (with T-032)
- **Details:**
  - Add MCP tools: `chat_send(message)` (returns immediately with front-agent reply + job ids), `get_conversation`, `job_status`, `job_output(offset)`, `job_cancel`, `job_approve`, `job_apply`, plus event notifications for progress.
  - Reuse same ConversationSession store as CLI.
  - Keep existing `run_task`/`approve_failover` for power users.
  - MCP stdout protocol only; diagnostics stderr/logs.
- **Acceptance:** MCP client can create conversation, send message, receive reply, receive async notification on task completion.

## P1-F. Adapters and catalog integrity

### T-034 [DONE] — Adapter conformance and registry honesty
- **Priority:** P1
- **Review refs:** chatGPT P1-23, P1-24; claude J-02, J-11; deepseek (adapter contract); grok G6-06, G6-12
- **Area:** adapters / catalog
- **Files:** `src/adapters/adapter.ts`, `src/adapters/conformance.ts`, `src/adapters/registry.ts`, `config/catalog.json`
- **Depends on:** T-002, T-003, T-015
- **Parallel:** yes (with T-035)
- **Details:**
  - `AgentAdapter` contract: id, provider, model, capabilities, canHandle, buildCommand, parseOutput, classifyError. Conformance suite gates registration.
  - Process facts (timeout/cancellation/spawn error) take precedence over stderr matching in classifyError.
  - Adapter built with tool-config override keeps methods (no prototype loss); pass configured model/executable to argv.
  - Test-only mock adapter under `src/adapters/mock.ts` (or `tests/` re-export); never reachable from production code; `grep -r "tests/" src bin` returns no results.
  - Adapter metadata (provider/model) must align with catalog metadata and actual command configuration (fix goose/opencode/kilocode/codex/copilot mismatches).
  - Catalog capability honesty: no fuzzy mapping (streaming→reasoning); explicit fields only.
- **Acceptance:** conformance suite passes for all registered adapters; metadata alignment test passes.

### T-035 [DONE] — Free adapter install UX polish
- **Priority:** P1
- **Review refs:** grok G6-09; claude (installer); deepseek (installer)
- **Area:** installer / CLI / MCP
- **Files:** `src/installer/*`, `bin/air.ts`, `src/mcp/server.ts`
- **Depends on:** T-002, T-003
- **Parallel:** yes (with T-034)
- **Details:**
  - Install opt-in, shows commands before running; verify after install updates status used by router.
  - No silent download of untrusted binaries without checksum when available.
  - Catalog remote URL optional and validated.
  - `air adapters list/install/upgrade/uninstall/status` and MCP `list_adapters/install_adapter/upgrade_adapter/uninstall_adapter` (write ops require consent).
  - Post-install adds `<cache>/bin` to adapter lookup path.
- **Acceptance:** install flow tests pass; consent required for writes.

## P1-G. Tests and CI honesty

### T-036 — Built-binary e2e tests (no adapter injection)
- **Priority:** P1
- **Review refs:** chatGPT P1-23, P2-26, P2-27; claude J-01, J-12; deepseek (tests); grok (tests)
- **Area:** tests / CI
- **Files:** `tests/e2e/` (new), `.github/workflows/ci.yml`
- **Depends on:** T-005, T-006, T-007
- **Parallel:** yes (with T-037)
- **Details:**
  - End-to-end tests against BUILT binary: CLI + MCP, fake executables on PATH, success, edit, rate limit, crash, timeout, SIGINT; exceptions yield FAILED.
  - Real stdio MCP test (launch process with StdioServerTransport), not just InMemoryTransport; detect stdout protocol contamination; restart/recovery.
  - Rule: every user-facing command has one built-binary test.
  - Node engine range matches tested version (raise to Node 20+ or use Node 18-compatible URL-to-path); test minimum in CI.
  - Windows + Linux CI matrix.
- **Acceptance:** e2e suite green in CI on both platforms.

### T-037 — Concurrency and live-cancellation proof tests
- **Priority:** P1
- **Review refs:** chatGPT P2-26; claude (tests); deepseek (tests); grok (tests)
- **Area:** tests
- **Files:** `tests/sessions.test.ts`, `tests/orchestrator.test.ts`, `tests/concurrency*.test.ts`
- **Depends on:** T-008, T-009, T-007
- **Parallel:** yes (with T-036)
- **Details:**
  - Blocked-worker tests measuring overlapping process lifetimes; prove one cancellation stops only one live process.
  - Verify configured seat limits; test final synthesized user response.
  - Multi-process coordination tests (4 processes x 20 increments); genuine independent-process race tests.
  - Test isolation: `AIR_CONFIG_DIR`/`AIR_CACHE_DIR` per test; global setup; guard real cache writes; parallel-safe.
  - Scenario harness (deterministic): fake LLM provider (scripted replies, injectable rate limits), fake executors (configurable duration/output/edits/failures), virtual clock, client over IPC; A1-A10.
- **Acceptance:** all scenario tests pass; no writes to real home dir.

---

# P2 — Quality and consistency

## P2-A. Docs and claims

### T-038 — Rewrite PLAN.md and README to reflect reality
- **Priority:** P2
- **Review refs:** chatGPT P2-28; claude J-11; deepseek (docs); grok G6-06
- **Area:** docs
- **Files:** `PLAN.md`, `README.md`, `docs/behavior-spec.md`, `docs/adapters/*`
- **Depends on:** T-015, T-034
- **Parallel:** yes (with T-039)
- **Details:**
  - One short `PLAN.md` (goal, architecture, decisions, status) with statements backed by named CI jobs; delete old plan text; keep archived plan as historical context.
  - Generate exit-code table from `src/types/exit-codes.ts` (fix: TASK_FAILURE=7, FAILOVER_PROPOSED=6).
  - README lists only implemented adapters with verified status; document known limitations honestly.
  - Create canonical product spec for one-conversation/many-workers architecture; keep old plan as history not proof.
  - `docs/behavior-spec.md` authoritative Given/When/Then; test validates `air --help` against documented commands.
  - Adapter docs with confirmed flags/versions.
- **Acceptance:** docs consistent with registry/CI; help test passes.

### T-039 [DONE] — Hygiene: imports, test hooks, spawnSync, Node engine
- **Priority:** P2
- **Review refs:** chatGPT P2-29; claude J-13; deepseek (hygiene); grok (hygiene)
- **Area:** tooling / hygiene
- **Files:** `package.json`, `scripts/fix-imports.mjs`, `bin/air.ts`, `src/mcp/server.ts`, `src/context/verify.ts`, `src/config/catalog.ts`
- **Depends on:** none
- **Parallel:** yes (with T-038)
- **Details:**
  - Node engine range matches `import.meta.dirname` usage (use Node 18-compatible URL-to-path or raise minimum); test minimum in CI.
  - Prefer `NodeNext` with `.js` extensions in source or a bundler; remove regex import rewrites.
  - Move `MOCK_MODE`/`AIR_MOCK_ADAPTER` test hooks out of production code via dependency injection.
  - `verify.ts` uses async spawn (not `spawnSync`) to avoid blocking event loop.
  - Handoff diff scope: use task-level baseline (T-019), not whole-tree `git diff HEAD`.
- **Acceptance:** typecheck/build/test green; no test hooks in prod code.

---

# Phased roadmap (consolidated)

Mapping to review roadmaps (chatGPT phases A-D, Claude M0-M7, DeepSeek phases 0-A-D, Grok V0-V4).

| Phase | Scope | Tasks | Exit criteria |
|---|---|---|---|
| **P0 / M0** | Make it work + close security holes | T-001..T-020 | Built-binary e2e (CLI+MCP) success/edit/rate-limit/crash/timeout/SIGINT; exceptions→FAILED; repo config probe; redaction tests; concurrency cap; catalog-lint |
| **P1a / M1-M2** | Durable execution engine | T-017, T-018, T-008, T-009, T-010, T-030, T-031, T-032 | Kill daemon mid-job & restart recovers; concurrency cap under 20 submissions; worktrees real |
| **P1b / M3** | Conversation + front agent | T-021, T-022, T-023, T-024, T-025 | `air chat` runs full conversation, persists across restart, non-blocking |
| **P1c / M4-M5** | Planner + routing + ledger + executors | T-026, T-027, T-028, T-029 | A1-A6 scenarios pass with scripted fake model |
| **P1d / M6** | Isolation + apply + MCP conversation tools | T-030, T-033 | Parallel write jobs; apply conflicts reported |
| **P1e / M7** | Quality & release | T-034, T-035, T-036, T-037, T-038, T-039 | A1-A10 harness green on Linux+Windows; docs match CI |

Do not start a later phase until the current phase's acceptance criteria pass with real tests.

---

# Dependency and parallelism map

## Can run in parallel (no shared files / no deps)
- **Wave 1 (independent, P0):** T-001, T-003, T-005, T-008, T-009, T-011, T-012, T-019
- **Wave 2 (after Wave 1):** T-002 (after T-001), T-004 (after T-001), T-006 (after T-005), T-007 (after T-005), T-010 (after T-009), T-013 (after T-005), T-014 (after T-005), T-015 (after T-003), T-017 (after T-009), T-020 (after T-011+T-019)
- **Wave 3:** T-016 (after T-003+T-014), T-018 (after T-017), T-021 (after T-017), T-024 (after T-021+T-016), T-032 (after T-017), T-034 (after T-002+T-003+T-015), T-035 (after T-002+T-003)
- **Wave 4:** T-022 (after T-021+T-005), T-023 (after T-021+T-011), T-025 (after T-024), T-026 (after T-025+T-014), T-027 (after T-023+T-019), T-030 (after T-019), T-031 (after T-019+T-020), T-033 (after T-021+T-022), T-036 (after T-005+T-006+T-007), T-037 (after T-008+T-009+T-007)
- **Wave 5 (polish):** T-028 (after T-016+T-014), T-029 (after T-001), T-038 (after T-015+T-034), T-039 (independent)

## Must be serialized (shared files)
- `src/orchestrator/orchestrator.ts`: T-005, T-006, T-007, T-008, T-013, T-017, T-018, T-019, T-021-context, T-032 touch it → serialize edits; use feature branches.
- `src/config/loader.ts` / `schema.ts`: T-001, T-002, T-004, T-029 → serialize.
- `config/catalog.json`: T-002, T-003, T-016, T-034 → serialize.
- `bin/air.ts`: T-006, T-007, T-008, T-013, T-022, T-032, T-035, T-039 → serialize.
- `src/mcp/server.ts`: T-005, T-006, T-007, T-013, T-033, T-035, T-039 → serialize.

---

# Acceptance scenarios (A1-A10) → task mapping

| Scenario | Required tasks |
|---|---|
| A1 Non-blocking | T-021, T-022, T-023, T-025 |
| A2 Context continuity across front-model switch | T-021, T-024 |
| A3 Follow-up amend | T-022, T-025, T-026, T-027 |
| A4 Delegation to different executors | T-026, T-028, T-034 |
| A5 Free-only exhausts → no paid call | T-016, T-028, T-008 |
| A6 Failure transparency | T-027, T-011, T-032 |
| A7 Privacy (cross-provider handoff blocked) | T-020, T-029, T-013 |
| A8 Crash recovery | T-017, T-018, T-021 |
| A9 Parallel safety (worktrees) | T-030, T-019 |
| A10 Install safety (consent) | T-002, T-035 |

---

# Definition of done (super-agent milestone)

1. Clean clone: `npm ci && npm run build && npm run typecheck && npm run typecheck:test && npm run lint && npm test` pass on Linux and Windows CI, tests parallel, nothing written to real home dir.
2. CI also runs built-binary e2e (CLI, MCP, chat via IPC), scenario harness A1-A10, catalog-lint, multi-process coordination tests.
3. One documented manual session with two real free tools and one real free front model, recorded in `docs/`.
4. `README.md` and `PLAN.md` state only what CI proves.
5. All ten acceptance scenario steps (DeepSeek §10) pass.

---

# Anti-patterns to avoid (from reviews)
- Do not treat super agent as "MCP + wrapper"; needs own conversation session + front-agent model.
- Do not block REPL on task completion.
- Do not inject raw tool output without redaction + size caps.
- Do not spawn paid models without explicit user flag.
- Do not bind conversation store to one provider's native schema.
- Do not build heavy task classifier; use hints + light heuristics.
- Do not attempt cross-provider front-agent fallback in MVP.
- Do not rebuild execution/routing/health/failover; reuse.
- Do not add web UI before `air chat` proven end-to-end.
- Do not allow multi-writer sessions on one cwd.
- Do not treat model "Done" prose as success; keep workspace delta.
- Do not default-route to paid while free capable tools exist.

---

# Immediate next steps (first week, in order)
1. **T-005** fix adapter registry mismatch + built-binary e2e (M0). Nothing else matters until `air run` works.
2. **T-001, T-003, T-004** make config/catalog safe (global-only keys, correct package names, catalog-lint).
3. **T-009, T-011** close lock + redaction holes.
4. **T-017** durable store; then **T-021** ConversationSession.
5. **T-022** `air chat` REPL with synchronous front agent; verify persist/resume.
6. Only then start Phase B (delegation via tools + async injection).

The single most important thing to get right is the `ConversationSession` data model: neutral (provider-agnostic), well-linked to `TaskState`, safe to append concurrently.
