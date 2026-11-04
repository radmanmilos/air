# claude_plan_review_v7.md — Review of current `main` and implementation plan

## 0. How to use this document

- Review round 7 of the `air` repo ("AIR is free and so are we"). Earlier rounds: `claude_plan_review.md` (`R-`), `_v2` (`N-`), `_v3` (`F-`), `_v4` (`H-`), `_v5` (`I-`), `_v6` (`J-`). New findings here are `K-01`..`K-14` and chat issues `C-01`..`C-08`. I did not find a `review_7` file in the repository; this document is the round-7 review from my side and it also covers the whole repo.
- Part A (sections 1-6) is the review. Part B (sections 7-10) is the implementation plan. Work Part B in order.
- MUST = required. SHOULD = do unless a reason is documented in `PLAN.md`. MAY = optional.
- **[reproduced]** = I ran it on this commit. **[code]** = read from source.
- Process rule that matters most (see section 6): **a task is only done when its feature is reachable from the CLI or MCP and a test that runs the built binary proves it.** Several tasks marked `[DONE]` in `tasks_air_6.md` are modules with unit tests that nothing calls.

## 1. Summary

**Verdict: the foundation is now solid; the product you want does not exist yet; `air chat` is a stub that also crashes in the built binary.**

What improved a lot since round 6 [reproduced]: `air run` and MCP `run_task` work; a repo `.airrc.yaml` can no longer set security keys or reset your global config; the cross-process lock and seat cap hold; Ctrl+C cancels and kills the child; failover to another provider works end to end with `--allow-provider`; redaction covers 11 of 13 secret formats (was 2); UTF-8 byte caps and multibyte streaming are correct; catalog package names are fixed; 234 tests pass in parallel without touching the real home directory; build, lint and typecheck are clean.

What is wrong:

1. **`air chat` fails in the built binary** with `ERR_MODULE_NOT_FOUND ... dist/src/conversation.js`. The postbuild import rewrite turns a directory import into a file import that does not exist. The same bug breaks the MCP tools `chat_send` and `get_conversation` and the package entry `dist/src/index.js` (10 unresolved imports in `dist/`). [reproduced]
2. **Even through `tsx`, `air chat` is not a conversation.** Plain messages get a fixed "Acknowledged."; `/run` blocks until the job finishes; the conversation file ends up with 0 messages because the close handler overwrites it with a stale in-memory copy; `/status` always prints `messages=0`. [reproduced]
3. **The planner, result compiler, action schema, `injectResult`, worktree isolation module and permission policy are not used by any code path.** No import sites outside their own files and tests. [code]
4. **MCP regressed to writing worker output into its stdout** (the JSON-RPC channel), and the run id returned to the client differs from the run id inside the state it polls. `T-006` says DONE. [reproduced]
5. **`orchestrator.json` is still last-writer-wins across instances** (probe: two instances, only the second one's session survived). MCP creates one per call. [reproduced]
6. Failures print only `Failed.` with no reason; docs claim "Non-blocking follow-ups", "All review tasks complete" and an `--allow-paid` option that does not exist.

## 2. Review basis

- Fresh clone of `main` at `e19aead` (138 commits; 31 new since round 6, 38 files changed).
- Ran: `npm ci`, `build`, `typecheck`, `typecheck:test`, `lint`, `test`; the built CLI from an unrelated directory (`run`, `run --read-only`, `status`, `models`, `models --best`, `route-test`, `chat`); an MCP stdio client; fake `aider`/`goose` executables on `PATH`; probe tests for config trust, redaction, byte caps, orchestrator state; 4-process lock and seat experiments; a script that resolves every relative import in `dist/`.
- Read: `bin/air.ts`, `src/orchestrator/orchestrator.ts` (key parts), `src/conversation/*`, `src/planner`, `src/result-compiler`, `src/workspace`, `src/permissions`, `src/config/catalog.ts`, `config/catalog.json`, `AGENTS.md`, `README.md`, `tasks_air_6.md` headings.
- NOT verified: external tools' flags, winget ids, GitHub Actions results, MCP cancel and approve flows (not re-run this round), model IDs.

## 3. Verified results

| Check | Result |
|---|---|
| `build`, `typecheck`, `typecheck:test`, `lint` | Clean |
| `npm test` | 234 pass, 5 skipped; real `~/.cache/air` untouched |
| Built `air run "fix it"` (fake aider edits a file) | Works: `Succeeded (SUCCEEDED_WITH_CHANGES)`, exit 0 |
| Built `air run --read-only` where the tool edits a file | `Failed.` exit 7 with no explanation (K-05) |
| MCP `run_task`, then `get_task_status` | `COMPLETED`, `SUCCEEDED_READ_ONLY`; **but** polled id `run-…-47u5la`, state shows `run-…-akud5c` |
| MCP server stdout during a run | **Non-JSON lines present** (`hi`, `Applied edit`, `tokens: 1`) |
| Built `air chat` | **Crashes**: `Cannot find module dist/src/conversation.js` |
| `dist/` relative-import scan | 139 checked, **10 unresolved**: `bin/air.js`, `src/index.js` (x7), `src/mcp/server.js` (x2) |
| `import('dist/src/index.js')` (package `main`) | `ERR_MODULE_NOT_FOUND` |
| `air chat` via `tsx`, scripted session | "Acknowledged." for plain text; `/run` blocks ~6 s; "Started job" printed after the worker finished; conversation file has **0 messages**; `/status` shows `messages=0` |
| Repo `.airrc.yaml` setting catalog, failover mode, redaction, permissions, `trustedRepos`, verify, tools | **Ignored with a warning**; global timeouts and `maxHops` survive an unrelated repo file |
| Lock, 4 processes x 20 increments | 80 of 80 |
| Seat pool, cap 1, 4 processes | 1 concurrent holder |
| Ctrl+C during a running job | `Cancelled by user.`, child gone |
| Failover (rate-limited `aider`, `goose` installed), `--auto` without `--allow-provider` | `Failed.` exit 7, no reason printed |
| Same with `--allow-provider openai` | Switches to goose, handoff in its argv; ends `NO_CHANGES` (the fake goose edited nothing) |
| Redaction: 13 sample secrets | 11 redacted; `api_key: value` (YAML) and `password=...` are not |
| Redaction stall after `task-` / `--author` | **Still present** (withheld buffer 484 chars after 20 lines) |
| Runner cap 1000 bytes with 2-byte chars, 800 KB output | 1000 bytes in 69 ms |
| Two `Orchestrator` instances on one cache dir | File ends with only the last writer's session and event |
| `air models` | aider `openrouter/gemma-4-31b-it:free` cost 0; goose `openai/gpt-4o` cost 2 (hard-coded); `models --best` returns aider for all three different tasks |
| `config/catalog.json` | `cost`, `auth`, `limits` are `null` for every tool |

## 4. `air chat`: why it is difficult right now

These are the root causes of the problems you are seeing. They are ordered by how early they hit you.

| ID | Problem | Evidence | Fix |
|---|---|---|---|
| C-01 | **Chat cannot start from the built binary.** `scripts/fix-imports.mjs` appends `.js` to any extensionless relative import. `import('../src/conversation')` is a directory (`conversation/index.ts`), so it becomes `conversation.js`, which does not exist. Same for 7 imports in `dist/src/index.js` and 2 in `dist/src/mcp/server.js`. | `dist/` import scan; built `air chat` crash; package `main` import fails | Move to `"module": "NodeNext"` and write explicit `.js` / `/index.js` specifiers in source, then delete the script. If you keep the script, resolve directories to `/index.js`. Add a CI test that resolves every relative import in `dist/` (the scan I used is 8 lines) and a built-binary test for every command, including `chat` and the MCP chat tools |
| C-02 | **Plain messages go nowhere.** Non-slash input is stored and answered with the constant "Acknowledged." | Scripted session | Build the front agent (section 8) |
| C-03 | **`/run` blocks.** `Orchestrator.start()` awaits the whole run, then the REPL prints "Started job". The user waits; there is no progress; worker stdout is written straight into the terminal | Scripted session: "worker started" ... "worker finished" ... then "Started job" | Add a non-blocking `submit()` that returns a job handle immediately and emits events; render events through the chat UI (section 8.3) |
| C-04 | **Conversation data loss.** On close, `saveConversation(conv)` writes the stale in-memory object over the file that `appendMessage` has been updating, so a 5-message session ends with 0 messages on disk. `/status` and `--resume` read the same stale object. `saveConversation` is also unlocked and non-atomic | Scripted session: `messages on disk: 0` | One store with one write path: load from disk before every use, append under lock via an atomic write, never save a whole cached object. Prefer an append-only JSONL log per conversation plus a small index |
| C-05 | **Each `/run` builds a new `Orchestrator`**, so sessions and events from earlier runs are overwritten (K-03) and `/status` cannot see running jobs | Probe | One shared `JobManager` per chat process (later: the daemon) |
| C-06 | **`/quit` calls `process.exit(0)` while a worker runs**, orphaning or killing work without recording a state | Code | On quit: list running jobs, ask to cancel or detach; cancel through the job manager |
| C-07 | **`air chat --allow-paid` appears in the README but not in the code** (options are `--resume`, `--free-only`). `--free-only` is documented as default-true but declared as a flag | Code vs README | Align options with the policy model in section 8.2 |
| C-08 | **`AGENTS.md` says "Headless-only. No interactive TUI."**, but chat is interactive by nature | `AGENTS.md` | Decide and write it down: a line-oriented REPL with notifications is allowed; full-screen TUI is optional later |

## 5. Other findings

### P0

#### K-01 Packaging: directory imports, package `main`, and missing tests (P0) [reproduced]

- See C-01. Beyond chat: `import('air')` (the package `main`) fails, so library use is broken, and the MCP `chat_send` / `get_conversation` tools fail at call time in the built server. The CI smoke test only checks `--help`.
- Change: as C-01, plus add a CI step "import every compiled module" and a built-binary test per CLI command and MCP tool.
- Acceptance: scan reports 0 unresolved imports; `node dist/bin/air.js chat` starts; `import('./dist/src/index.js')` succeeds.

#### K-02 MCP: stdout pollution and run-id mismatch while `T-006` says DONE (P0) [reproduced]

- `Orchestrator.start()` and `resume` pass `onStdout: (c) => process.stdout.write(c)` (orchestrator lines ~249 and ~537) regardless of `mcpMode`; the failover proposal text also goes to stdout. Any MCP client that parses stdout as JSON-RPC will fail.
- The MCP server creates its own `makeRunId()` for the job, then starts an orchestrator session with a different `runId`. The client polls id A and receives state whose `runId` is B. `resume_task`, `cancel_task`, `approve_failover` and `get_task_output` may address the wrong object.
- Change: the orchestrator MUST NOT write to stdout; it emits events to an injected sink (CLI renders them, MCP stores them). One id per job, created by the job manager and used everywhere. Add a real stdio conformance test: every stdout line parses as JSON-RPC, including during failures, timeouts and failover proposals; and a test that the id returned by `run_task` is the id in `get_task_status`.

#### K-03 Orchestrator and conversation state are not multi-process safe (P0) [reproduced]

- `orchestrator.json` is rewritten atomically but from each instance's in-memory copy, so concurrent writers lose data (probe). MCP and chat create a new `Orchestrator` per call. `T-017 "Durable job/event store"` is marked DONE but this is not a store, it is a snapshot.
- Change: single owner of state (section 7, Phase 1-2): per-job append-only event logs (`jobs/<id>/events.jsonl`) plus a job index written only by the owner; conversation as append-only JSONL. No component rewrites a whole shared JSON file from memory.

#### K-04 Dead code marked done (P0 process problem) [code]

- No code path calls: `planFromRequest` (planner), `compileJobResult` (result compiler), `parseActions` / `ActionSchema`, `injectResult`, `createWorktree` / `removeWorktree` (workspace), or anything in `src/permissions`. The orchestrator never creates worktrees; there is no apply/merge step anywhere. `permission.*` config is still read by nothing, and the aider adapter still hard-codes `--yes-always`. Read-only is enforced only after the fact (a changed tree makes the run `Failed.`), not by restricting the tool.
- Change: wire them in section 7 phases, or delete them. Add a dead-code check to CI (`knip` or `ts-prune`) that fails on exports with no production importer. Define done as in section 6.

### P1

#### K-05 Failures are unexplained (P1) [reproduced]

- `Failed.` with exit 7 for: tool wrote files in a read-only run; rate limit with no allowed alternative; provider not in the allow-list. The routing code has exact skip reasons (`allow_list_blocked`, `cooldown_active`, ...) but the CLI does not print them.
- Change: always print a plain-language result: category, which candidates were skipped and why, and the exact command to proceed (for example `air run ... --allow-provider openai`). In `ask` mode with an allowed alternative, print the failover proposal and wait for a TTY answer.

#### K-06 Catalog and installer (P1) [code + earlier verification]

- Fixed: package names for aider (`pip install aider-chat`), opencode (`opencode-ai`), kilocode (`@kilocode/cli`); `factoryModule` loading removed; auto-install is global-only; remote catalog requires HTTPS.
- Still open: goose downloads use `releases/latest/...` with no version pin or SHA-256; winget ids (`aider.aider`, `opencode.opencode`, `kilocode.kilocode`, `openai.codex`) are unverified; the Copilot entry installs only the GitHub CLI; remote catalog entries with new ids are accepted unvalidated (`e as InstallEntry`) and carry install commands that `air adapters install` would run; no signature. `cost`, `auth`, `limits` exist in the schema but every catalog entry has `null`, so "free-first by policy" rests on constants in the adapters (goose is labelled `openai/gpt-4o`, cost 2).
- Change: pin versions and checksums; verify winget/brew ids in a CI `catalog-lint` job that resolves every command; remote catalogs may add metadata only (models, limits, cost), never `install`; fill `cost`, `auth`, `limits` for every entry (OpenRouter free status from its models API).

#### K-07 Redaction gaps (P1) [reproduced]

- Output still stalls after substrings such as `task-` and `--author`; `api_key: value` (YAML) and `password=...` are not redacted. Bound the withheld tail (last ~128 bytes or current line), flush whole lines, add those two patterns, and redact the actual values of environment variables named `*KEY|*TOKEN|*SECRET|*PASSWORD`. Keep the property test.

#### K-08 No real model-level routing (P1) [reproduced + code]

- Each adapter exposes one hard-coded model; `air models --best` returns the same answer for "refactor", "explain" and "summarize"; the router's task typing (`T-028`) only filters on capability flags. The goal "delegate to the most suited tool and model" needs model profiles and outcome learning (section 8.4).

#### K-09 Documentation claims exceed reality (P1)

- README: "All review tasks complete", "Non-blocking: submit work, keep talking. Follow-ups arrive while jobs run; results are compiled into one coherent reply", `--allow-paid`, "free-tier quota, ledger". PLAN.md is 411 lines. Replace with a short status list generated from CI results; mark chat, compiler, planner, worktrees, permissions as "not wired".

### P2

#### K-10 Free-first semantics (P2)

- `freeOnly` is stored in the conversation but nothing enforces it at routing time. goose (`cost 2`) can be selected as a fallback when the user allows its provider. Enforce `freeOnly` as a hard filter in the router and show the reason when a paid candidate is skipped.

#### K-11 `air verify` CLI parsing (P2) [from round 5]

- `air verify node -e 0` is parsed by commander as an air option; document `air verify -- node -e 0` or allow unknown options after the command. Config stores the verify command as a string split on whitespace; store it as an array.

#### K-12 Sessions UX (P2)

- `--sessions` failures give exit 7 with no per-session summary. Print a table.

#### K-13 Engines and build (P2)

- `engines.node` is still `>=18.0.0` while CI runs 20 and 22; set the tested minimum. Remove the `postbuild` script when K-01 is solved properly.

#### K-14 Test hooks in production code (P2)

- `MOCK_MODE` (CLI) and `AIR_MOCK_ADAPTER` (MCP) exist in shipped code. Replace with dependency injection.

## 6. Task claims vs reality (from `docs/reviews/archive/tasks_air_6.md`)

| Task | Marked | Reality |
|---|---|---|
| T-001, T-002, T-003, T-004 (config trust, RCE chain, package names, verify trust) | DONE | Confirmed fixed for config and installer; K-06 residue |
| T-005 adapter registry mismatch | DONE | Confirmed: `air run` works |
| T-006 MCP run id consistency and stdout purity | DONE | **Not true** (K-02) |
| T-007 MCP cancel kills the worker | DONE | Not re-verified |
| T-008, T-009, T-010 (seats, lock) | DONE | Confirmed |
| T-011 redaction coverage and stall | DONE | Coverage improved; stall remains (K-07) |
| T-012 byte caps | DONE | Confirmed |
| T-013 allow-provider wiring | DONE | Confirmed (failover works); no explanation on refusal (K-05) |
| T-014 recommender uses task | DONE | **Not true**: same answer for different tasks (K-08) |
| T-016 free-first policy | DONE | Sorting only; `freeOnly` not enforced; catalog data null (K-06, K-10) |
| T-017 durable job/event store | DONE | **Not true** (K-03) |
| T-018 crash recovery | DONE | Not re-verified |
| T-019 task-level baseline | DONE | Not re-verified |
| T-021 persistent conversation store | DONE | Exists; data-loss bug in chat (C-04); not used by any model |
| T-022, T-023, T-024 chat REPL, injectResult, MCP conversation tools | DONE | **Not true**: stub REPL; `injectResult` unused; MCP tools crash in built server (K-01) |
| T-025, T-026, T-027 planner, compiler, action schema | DONE | **Not wired** (K-04) |
| T-028 task capability typing | DONE | Filters on flags only |
| T-029 permission policy | DONE | **Not wired** (K-04) |
| T-030 real git worktree isolation | DONE | **Not wired**; no apply step (K-04) |

## 7. Implementation plan

Each phase ends with tests that run the built binary where one is involved. Do not start a phase until the previous phase's acceptance passes. Keep each phase small enough to merge in days, not weeks.

### Phase 0 — Make what exists real (1-3 days)

Goal: everything advertised in `--help` works from the built binary; no dead claims.

1. **Fix packaging (K-01/C-01).** Switch to `NodeNext`, explicit `.js`/`/index.js` specifiers, remove `scripts/fix-imports.mjs` (or make it resolve directories). Add `scripts/check-dist-imports.mjs` and run it in CI after build.
2. **Built-binary test per command and MCP tool** (including `chat`, `chat_send`, `get_conversation`, `resume_task`, `approve_failover`, `cancel_task`).
3. **Fix MCP (K-02):** no stdout writes outside JSON-RPC; one run id; add the stdio conformance test.
4. **Fix chat data loss (C-04) and `/status`:** a single conversation write path (append under lock, atomic), `loadConversation` before every read.
5. **Explain failures (K-05)** and fix `--allow-paid` / `--free-only` options (C-07).
6. **Honest docs (K-09):** mark unwired modules as such; correct README claims; reduce `PLAN.md` to goal, architecture, status.
7. **Dead-code CI check (K-04).**

Acceptance: `node dist/bin/air.js chat` starts and survives a 5-message scripted session with 5 messages on disk; MCP conformance test passes; import scan reports 0 unresolved; every command has a built-binary test.

### Phase 1 — Job runtime with non-blocking submit (3-5 days)

Goal: starting work never blocks the caller; any client can observe a job.

1. Create `src/jobs/` with a `JobManager` (in-process library, no CLI/MCP code inside):

```ts
interface JobManager {
  submit(spec: JobSpec): Job;                       // returns immediately
  get(id: string): Job | undefined;
  list(filter?: { conversationId?: string; state?: JobState[] }): Job[];
  events(id: string, fromSeq?: number): AsyncIterable<JobEvent>;
  cancel(id: string, reason?: string): Promise<void>;
  approve(id: string, approvalId: string, decision: 'yes' | 'no'): Promise<void>;
  amend(id: string, instruction: string): Promise<AmendResult>;   // see 8.5
  recover(): Promise<void>;                          // reconcile after crash
}
type JobState = 'QUEUED'|'RUNNING'|'AWAITING_APPROVAL'|'COMPLETED'|'FAILED'|'CANCELLED';
```

2. Move the current `Orchestrator.start()` logic (select, run, classify, failover, delta, state) behind `JobManager` workers. `Orchestrator.start()` remains as a thin blocking wrapper for `air run` (`submit` then wait). The orchestrator emits events and never touches stdout.
3. Persist per-job append-only `events.jsonl` and a small job index written only by the manager; remove `orchestrator.json`. Remove SIGINT listeners on completion.
4. MCP `run_task` calls `submit` and returns the job id immediately; `get_task_status`/`get_task_output` read events by offset.
5. Seats: acquire per job through the manager (keep the seat pool; it works now).

Acceptance: submit a 10 s job and read status at t=1 s; two clients (CLI and MCP) see one consistent job table; kill the process mid-job, restart, `recover()` marks it `FAILED(interrupted)` and kills orphans; 20 concurrent submissions respect `maxConcurrentAgents`.

### Phase 2 — Real `air chat` with a front agent (1-2 weeks)

Goal: the conversation described in your vision; see section 8 for the full specification.

1. `ModelClient` interface and a first free provider (OpenAI-compatible HTTP: OpenRouter free models, Groq, Gemini via its OpenAI-compatible endpoint, or a local Ollama). Provider pool with failover for the front agent, separate from worker routing.
2. `FrontAgent`: builds the prompt from the store, asks the model for schema-validated actions, executes them against the `JobManager`, answers the user. Extend `ActionSchema` (section 8.2).
3. Wire the existing modules: `planFromRequest` as the deterministic fallback and consistency check; `compileJobResult` as the fact source for result messages; `injectResult` to deliver job completions into the conversation while the user types.
4. `air chat` becomes an event-driven REPL (section 8.3): prompt stays usable while jobs run; job events appear as short notices; `/jobs`, `/status`, `/cancel`, `/approve`, `/apply`, `/quit` with a running-jobs prompt.
5. Fallback grammar when no model is reachable: `/` commands plus `run:`-style explicit tasks still work.

Acceptance: scenarios A1, A2, A3, A6 (section 9) pass with a scripted fake model; one manual session with a real free model is recorded in `docs/`.

### Phase 3 — Workers and routing for "right tool, right model" (1-2 weeks)

1. `ApiExecutor` for non-coding tasks (explain, summarize, plan, review) using the same `ModelClient`, so cheap questions do not spawn a coding agent.
2. Model profiles (section 8.4) replacing one-model-per-adapter constants; fill `cost`, `auth`, `limits` for every catalog entry; make `freeOnly` a hard router filter.
3. Wire `src/permissions`: map `read_only | edit | edit_and_shell` to real flags per adapter; an adapter that cannot enforce the mode is not eligible; remove the hard-coded `--yes-always`.
4. Quota ledger (requests/tokens per provider and key alias, `Retry-After` learning, predicted reset) exposed to the front agent.
5. Outcome learning: per (executor, taskType) success, verification pass, latency; EWMA; small exploration rate.

Acceptance: A4, A5, A7 pass; `route-test --explain` shows ranking inputs; `models --best` differs by task type.

### Phase 4 — Isolation and delivery (1 week)

1. Use `src/workspace` for every write job (worktree per job). Add `apply` (fast-forward, merge, or patch) with conflict reporting, `air apply <job>` and the chat `/apply`.
2. Parallel write jobs; deltas per job; verify step in the worktree; optional review job.

Acceptance: A9 passes; applying a conflicting job reports without data loss.

### Phase 5 — One owner process (1 week, can move earlier if chat and MCP must share live jobs)

1. `air serve` daemon wrapping `JobManager`, IPC over a Unix socket / Windows named pipe (owner-only), JSON-RPC, auto-started by clients. CLI, chat and MCP become clients.
2. Reconcile on daemon start; graceful shutdown cancels or detaches jobs per policy.

Acceptance: A8 passes; chat and MCP see the same running job.

### Phase 6 — Hardening and release

1. Catalog pinning, checksums, `catalog-lint` (K-06); redaction fixes (K-07); K-10..K-14.
2. Cross-platform CI including Windows chat tests; soak test with fake executors.
3. Docs generated from code; `PLAN.md` short.

## 8. Specifications for the front agent and chat

### 8.1 Principles

- AIR owns the conversation (store, summary, facts, job table). Any model, front or worker, is stateless and replaceable. This is what keeps one voice and context across model changes.
- The front agent never blocks on jobs. It answers within seconds, starts or steers jobs, and reports results when they arrive.
- Evidence over claims: results come from the workspace delta, verification output and process facts, not from a worker's prose.
- Hide machinery by default (no tool or model names in normal replies); show them on request and in `/jobs`.

### 8.2 Actions (extend `ActionSchema`)

Current: `answer`, `spawn_job`, `cancel_job`, `status`, `clarify`. Add: `amend_job {jobId, instruction}`, `ask_job {jobId, question}` (answered from the job's events), `approve {approvalId, decision}`, `apply_job {jobId}`, `set_policy {freeOnly?, allowProvider?}`. Validate with Zod; one repair retry; on failure answer only and log. Each user message yields an immediate textual reply plus zero or more actions.

### 8.3 Chat UI rules

- Line-oriented REPL; keep `rl.prompt()` responsive; print job notices above the prompt (use `readline.cursorTo` / `clearLine`, then re-render the pending input line) so output never corrupts what the user is typing.
- Worker stdout never goes to the terminal; it goes to the job log. Show at most one progress line per job per few seconds (`job j3: editing 2 files...`) and a completion message compiled by the result compiler.
- `/jobs` lists id, goal, state, age, executor and reason; `/output <job>` pages the log; `/quit` with running jobs asks cancel, wait or detach (detach requires the daemon).
- Piped (non-TTY) input must work for tests: same behavior, no cursor control.

### 8.4 Routing and models

- `ExecutorProfile` per (executor, provider, model): `cost` (`free|freemium|paid`), `auth` (`none|api_key|oauth|subscription`), `limits`, `contextWindow`, `modes`, priors per `taskType`. Free means verified: for OpenRouter read pricing from its models API and require zero prompt and completion price; tools that need a sign-in or subscription are not in the default free set.
- Hard filters: available, supports the required mode, permission enforceable, not cooling down, quota headroom, context fits, provider allowed, cost class allowed (`freeOnly` default true). Soft score: expected quality for the task type (priors updated from outcomes) x quota headroom x latency x queue length, plus a small exploration rate. Always return a reason string.
- When all free options are exhausted: say so, give the reset time, and ask before using any paid option.

### 8.5 Follow-ups while a job runs

| Condition | Strategy |
|---|---|
| Question about a running job | Answer from its events and partial output; do not touch the job |
| Unrelated request | New job, runs in parallel if seats and workspace allow |
| Amend, executor accepts live input | Send it into the session |
| Amend, job has no workspace changes yet | Cancel and respawn with the amended brief, linked by `parentJobId` |
| Amend, executor supports resume | Let it finish or pause, then resume with the new instruction |
| Otherwise | Queue as a dependent job with the previous summary and delta in its brief |

### 8.6 Context policy

- Rebuild the front agent prompt each turn from: fixed persona, rolling summary, structured facts (decisions, preferences, constraints, file paths), last K turns, and a job digest (state, goal, age, latest progress line). Compact with a cheap model when over budget; compaction must keep facts and open jobs verbatim.
- Workers never see raw chat. They get a `ContextPack` (goal, constraints, relevant facts, prior job summaries, repo conventions, files) written by AIR.
- Degrade gracefully: if every front model is rate-limited, accept the message, say what is queued and when quota resets, keep jobs running, and keep the `/` grammar working.

## 9. Acceptance scenarios (deterministic harness)

Build a harness with a fake LLM provider (scripted replies, injectable 429s), fake executors (duration, output, edits, failures), a virtual clock, and a client that drives `air chat` over piped stdin (and later the daemon over IPC).

| ID | Scenario | Pass condition |
|---|---|---|
| A1 Non-blocking | Submit a 10 s edit job; at t=1 s ask "how is it going?"; then ask an unrelated factual question | Both answers arrive in under 2 s while the job runs; status names the job and its latest progress |
| A2 Context continuity | Make the front model return 429 mid-conversation | Next reply keeps earlier decisions and preferences; voice unchanged |
| A3 Follow-up amend | While a job runs: "also add tests" | Decision table applied; new job linked to parent; one coherent thread |
| A4 Delegation | Edit a file, explain a concept, summarize a log | Each lands on a suitable executor; `/jobs` shows executor and reason; chat does not mention tools unless asked |
| A5 Free-only | All free quotas exhausted | No paid call (ledger assertion); user told the reset time and offered an opt-in |
| A6 Failure transparency | A job fails with a classified error | Plain-language explanation and a retry offer; raw log available |
| A7 Privacy | Handoff would cross to a provider outside the allow-list | Blocked or approval requested, destination named |
| A8 Crash recovery | Kill the owner process with two jobs running; restart | Jobs reconciled, conversation intact, no orphan processes |
| A9 Parallel safety | Two write jobs on one repo | Separate worktrees; applied one at a time; no cross-contaminated deltas |
| A10 Persistence | 5-message chat, quit, `--resume` | All 5 messages present and used in the next reply |
| A11 Packaging | Build, then run every command and MCP tool | No unresolved imports; every command has a built-binary test |

## 10. Definition of done and working rules

- A task is done only if: (1) the feature is reachable from the CLI or MCP, (2) a test that runs the built binary proves it, (3) no unused exports remain from it (dead-code check), (4) README and `PLAN.md` state only what CI proves. Update `AGENTS.md` rule 2 accordingly.
- Clean clone: `npm ci && npm run build && npm run typecheck && npm run typecheck:test && npm run lint && npm test` pass on Linux and Windows CI with no host tools installed; CI also runs the dist import scan, built-binary command tests, the MCP stdio conformance test, the multi-process lock and seat tests, and scenarios A1-A11 as they are implemented.
- One recorded manual session with two real free tools and one real free front model in `docs/`.
- Keep the tasks file honest: reopen `T-006`, `T-014`, `T-017`, `T-022`..`T-030` until their acceptance runs against the built binary.
