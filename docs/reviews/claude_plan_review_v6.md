# claude_plan_review_v6.md

## 0. How to use this document

- Review round 6 of the `air` repo ("AIR is free and so are we"). Earlier rounds: `claude_plan_review.md` (`R-`), `_v2` (`N-`), `_v3` (`F-`), `_v4` (`H-`), `_v5` (`I-`). New findings here are `J-01`..`J-13`.
- Part A (sections 1-5) reviews what is on `main` now. Part B (sections 6-9) is the design and build instructions for the product goal in section 5. Read both. Part B only works if Part A's P0 items are fixed first.
- MUST = required. SHOULD = do unless a reason is documented in `PLAN.md`. MAY = optional.
- **[reproduced]** = I ran it on this commit and saw the result. **[code]** = read from source, not executed.
- Put this file in `docs/reviews/` and update `PLAN.md` so it is the only authoritative plan (see J-11).

## 1. Summary

**Verdict: not usable yet, and not yet the product you described.** The engineering hygiene improved a lot (CI, lint, tests isolated, locks, MCP stdout, byte limits). But:

1. **The main command is broken.** `air run` crashes with `adapter.canHandle is not a function` on every task, and MCP `run_task` starts a job that stays `RUNNING` forever with adapter `none` [reproduced, J-01]. The 220 tests pass because they inject adapters and never use the real registry path. `PLAN.md` still says "CLI verified: `air run`".
2. **The new installer/catalog is a remote-code-execution risk and installs the wrong software** [J-02, J-03]. Verified against the npm registry: `npm install -g aider` installs an unrelated package; `kilocode` too; `opencode` does not exist under that name. A repo `.airrc.yaml` can turn on auto-install and point the catalog at any URL; remote catalog entries run commands and `import()` arbitrary modules.
3. **It is a router with failover, not an orchestrating agent.** There is no conversation, no front agent, no task decomposition, no non-blocking follow-ups, no result compilation, no free-tier quota tracking, no learning from outcomes (grep finds none of them). Part B specifies how to build that.
4. Round-5 P0s still open: repo config can grant itself trust (and now controls the catalog), cross-provider failover is impossible (`--allow-provider` is declared but never passed on), seat pool still leaks.

## 2. Review basis

- Fresh clone of `main` at `947428f` (106 commits; 54 new since round 5, 62 files changed).
- Ran: `npm ci`, `build`, `typecheck`, `typecheck:test`, `lint`, `test`, the built CLI from an unrelated directory (`--help`, `status`, `route-test`, `models`, `run`, `run --sessions`), and probes with real processes, fake `aider`/`goose` executables on `PATH`, an MCP stdio client, probe tests for config trust, redaction, runner, adapters, orchestrator state, plus `npm view` on the package names used by the catalog.
- Read: `README.md`, `PLAN.md` headings/status, `SECURITY.md`, `bin/air.ts`, `src/orchestrator/orchestrator.ts`, `src/installer/*`, `src/config/{catalog,schema,loader}.ts`, `config/catalog.json`, `src/utils/{lock,concurrency}.ts`, `src/router/catalog.ts`, diffs of `checkpoint`, `verify`, `handoff`, `streaming-redact`.
- NOT verified: that the external tools' headless flags are correct (README claims versions opencode 2.2.5, codex 0.166.0, gh 2.102.0; I did not install them), winget package ids, GitHub Actions results (not visible to me), model IDs.

## 3. Verified results

| Check | Result |
|---|---|
| `npm ci`, `build`, `typecheck`, `typecheck:test`, `lint` | All pass; lint has 0 problems |
| `npm test` | 220 pass, 5 skipped; **no longer writes to the real home directory**; runs in parallel |
| Built CLI `--help`, `status`, `route-test --explain`, `models` | Work |
| **Built CLI `air run "..."`** (fake `aider` on PATH, with and without `--read-only`) | **Fails**: `adapter.canHandle is not a function`, exit 7 |
| **MCP `run_task` then `get_task_status`** (10 s later) | `state: RUNNING`, `adapter: none`, `hops: 0`, never finishes |
| 4 processes x 20 locked increments | 80 of 80 (**fixed**) |
| Seat pool, cap 1, 4 processes, shared pool name | **2 concurrent holders** (still leaks) |
| MCP server stdout during a run | 0 non-JSON lines (**fixed**) |
| Adapter built with tool-config override | Methods present (**fixed**) |
| Runner cap 1000 bytes with 2-byte chars / 800 KB output | 1000 bytes captured in 82 ms (**fixed**) |
| Redactor: multibyte split | Correct (**fixed**); stall after `task-` / `--author` and 11 of 13 secret formats **not redacted** (unchanged) |
| Two `Orchestrator` instances on one cache dir | File ends with only the last writer's session and event (**data loss**) |
| `air run --sessions "a" "b"` write tasks, same cwd | Refused with a clear message, exit 4 (**good**) |
| `air run --sessions ... --read-only`, one tool fails | Exit 7, **no per-session summary printed** |
| Repo `.airrc.yaml` with `catalog.autoInstall: true`, `catalog.remoteUrl: http://attacker.example/...`, `failover.mode: auto`, `redaction.enabled: false`, `permission.allowShell: true`, `trustedRepos: [itself]`, `verify.command` | `errors: []`; **every value took effect** |
| Global `timeouts.defaultMs: 900000`, `maxHops: 5` plus an unrelated repo file `tools: []` | Resets to 300000 and 3 |

## 4. Findings on the current build

### P0

#### J-01 `air run` and MCP `run_task` do not work in the real binary (P0) [reproduced]

- Cause: `Orchestrator.start()` and `resumeAfterApproval()` call `listAdapters(config)` from `adapters/registry`, which returns `AdapterInfo[]` (wrapper objects `{adapter, meta, available}` including unverified and unavailable adapters), not `AgentAdapter[]`. `selectCandidateFrom` then calls `adapter.canHandle` on a wrapper. `availableAdapters(config)` is the function that returns usable adapters. The CLI's own local `listAdapters` helper works (used by `--sessions`), which hides the problem. All tests pass `deps.adapters`, so the real registry path is never exercised.
- MCP: the background job swallows the thrown error and leaves state `RUNNING` forever (no `FAILED`, no error message), so clients poll indefinitely.
- Change:
  - MUST use `availableAdapters(config)` (verified + enabled + available) in every orchestrator path, and give the two functions names that cannot be confused (`listAdapterInfos` vs `availableAdapters`).
  - MUST wrap job bodies so any exception persists `FAILED` with a redacted error and emits a terminal event.
  - MUST add end-to-end tests against the BUILT binary: CLI and MCP, fake executables on `PATH`, success, edit, rate limit, crash, timeout, SIGINT. These are the tests that would have caught this. Forbid injecting adapters in these tests.
  - MUST remove "CLI verified: `air run`" from `PLAN.md` until they pass.
- Acceptance: `node dist/bin/air.js run "x" --cwd <repo>` with a fake `aider` that edits a file exits 0 and reports the changed file; the same task through MCP reaches `COMPLETED`; a thrown exception inside a job yields `FAILED` within 1 s.

#### J-02 The catalog installs wrong or non-existent packages (P0, supply chain) [reproduced via `npm view`]

| Catalog entry (linux command) | What the npm registry actually has |
|---|---|
| `npm install -g aider` | Unrelated package `aider@1.0.1`: "Lightweight website popular article component for static website". Aider is a Python tool (`pip install aider-chat` or `aider-install`). |
| `npm install -g kilocode` | Unrelated package `kilocode@1.2.0` (empty description). The real CLI is `@kilocode/cli`. |
| `npm install -g opencode` | 404. The real package is `opencode-ai`. |
| `npm install -g @openai/codex` | Correct. |
| github-copilot: `apt-get install -y gh` | Installs only the GitHub CLI, not the Copilot CLI (`@github/copilot` exists on npm); needs root. |

- Windows `winget` ids (`aider.aider`, `opencode.opencode`, `kilocode.kilocode`, `openai.codex`) and macOS brew names are unverified; I could not check them.
- The post-install check is `aider --version` plus "any `x.y.z` in the output", which a squatted package can satisfy.
- Change: MUST verify every package name, id and URL against the official project docs and the registry before it enters the catalog; pin exact versions; add a CI job that resolves every catalog command (`npm view`, `pip index`, `winget show`, `brew info`, HTTP HEAD for URLs) and fails on mismatch; check that the installed binary reports the pinned version and publisher metadata where available. Treat the catalog as code that needs review.
- Acceptance: CI job `catalog-lint` passes; a test fails if an entry points at a package whose registry metadata does not match the declared repository URL.

#### J-03 Remote-code-execution chain through config and catalog (P0, security) [reproduced config + code]

- A repo `.airrc.yaml` can set `catalog.autoInstall: true` and `catalog.remoteUrl` (reproduced, no errors). `Orchestrator.start()` then calls `autoInstallMissing` on every task: it fires installs for every missing catalog tool in the background, with no consent and no retry limit (a failed tool is reinstalled on every run).
- `loadCatalog` fetches the remote catalog with no HTTPS requirement, no signature, no schema validation (`as CatalogData`), and remote entries override bundled ones by `id`. Entries carry `install.commands` (executed via `runProcess`) and `factoryModule` (executed with `await import(entry.factoryModule)` in the AIR process). The cached copy is not bound to the URL it came from.
- Direct downloads: bundled goose entry uses `releases/latest/download/...` strings with no `signatureUrl`, so nothing is verified; where `signatureUrl` exists, the expected hash is fetched from the same origin (integrity only, not authenticity). The binary is written to its final path before verification and then executed by the verify step. "Proxy support" mutates `process.env.HTTP_PROXY` globally while other work runs; Node's `fetch` does not read those variables by default, so it is likely a no-op (verify).
- Direct-download installs go to `<cache>/bin`, which is not on `PATH` and is not consulted by `isOnPath`, so a "successfully installed" goose is not routable [code].
- Change:
  - MUST make `catalog.*`, `failover.mode`, `permission.*`, `redaction.*`, `trustedRepos`, `tools[].executable`, `verify.*`, `concurrency`, and `privacy.*` global-only; repo values are ignored with a warning (this closes H-07).
  - MUST delete remote-catalog override of install commands. If a remote catalog is wanted, it MUST be HTTPS-only, signed (pin a public key shipped with AIR), schema-validated with Zod, bound to its URL in the cache, and allowed to add only metadata (models, limits), never executable fields.
  - MUST remove `factoryModule` from catalog data. Dynamic adapters MUST be local files listed in global config by absolute path.
  - MUST remove silent auto-install. Installation is explicit (`air adapters install <id>`), prints the exact command, and asks for confirmation unless `--yes` is given on the CLI. Never from MCP without a client confirmation.
  - Direct downloads MUST pin version-specific URLs and a SHA-256 shipped in the catalog (not fetched from the same origin), verify before moving the file to its final path, and add `<cache>/bin` to the adapter lookup path.
  - Remove or fix proxy handling (use an explicit dispatcher).
- Acceptance: tests that repo config cannot set any listed key; a remote catalog with an `install.commands` or `factoryModule` field is rejected; a hash mismatch leaves no file at the final path; no install runs without confirmation.

#### J-04 Repo config still controls security settings and clobbers global config (P0) [reproduced]

- See the probe in section 3. The verify trust check itself is now correct (real paths, required `source`), but the repo can add itself to `trustedRepos`, which defeats it. Defaults from each parsed layer still overwrite global values.
- Change: as in round 5 (H-07) plus the J-03 key list: parse each layer as partial, merge by origin, apply defaults once, define the global-only key set.
- Acceptance: tests that a repo file cannot set any global-only key; global values survive an unrelated repo file.

#### J-05 Orchestrator state is process-local and loses data (P0 for the daemon design) [reproduced]

- `orchestrator.json` is rewritten whole from each instance's in-memory map by `writeFileSync` (no lock, not atomic). MCP creates a new `Orchestrator` per call. Probe: two instances on one directory; the file ended with only the second instance's session and event. `events` grows without bound and the whole file is rewritten on every `log()` call. `SIGINT`/`SIGTERM` listeners are added per run and never removed.
- Change: replace with the job/event store in section 6.3 (single writer, append-only event log). Remove listeners on completion.

### P1

#### J-06 It is a failover wrapper, not an orchestrator (P1) [code]

- `start()` runs one task on one tool, sequentially, and returns the last attempt. README says results are "compiled into one response" and work is "distributed"; neither exists. `chooseAdapter` (best model) is not used by `start()`, which uses priority-list order. `bestModelFor` still ignores the task text and is "cheapest eligible first". `air resume` re-runs the task with a one-line prefix ("Continue from previous session X") and carries no real context. Section 6 is the remedy.

#### J-07 Cross-provider failover is still impossible (P1) [code]

- The allow-list is built from the first candidate only. `--allow-provider` is declared in the CLI (`bin/air.ts`) and the MCP schema but never passed to `Orchestrator.start()` (no `allowProviders` option exists). Add the option and a global `privacy.allowedProviders`; interactive consent in `ask` mode on a TTY (the prompt exists), `approve_failover` in MCP. Add the built-binary e2e test (fake `aider` rate limit -> fake `goose`) once J-01 is fixed.

#### J-08 Seat pool still leaks and is barely used (P1) [reproduced]

- Slot files are created with `O_CREAT|O_EXCL` and then written. Another process's `reclaimStale` can read the still-empty file, treat it as stale (`!data`) and delete a live holder's seat; with a shared pool name and cap 1, 4 processes produced 2 concurrent holders. Seats are only used by `--sessions`; single runs and MCP jobs ignore `maxConcurrentAgents`.
- Change: create the slot with an atomic write (write a temp file, `link`/`rename` into place) and treat an empty or unparseable file as stale only after a grace period (mtime older than ~2 s). Acquire a seat in the job manager for every job. Surface `SEAT_TIMEOUT`.

#### J-09 Redaction (P1) [reproduced]

- Output stalls after substrings like `task-` and `--author` (the withheld buffer is unbounded); 11 of 13 secret formats are not redacted (Anthropic `sk-ant-`, OpenAI `sk-proj-`, `gho_`, Slack, Google `AIza`, JWT, PEM blocks, JSON/YAML `apiKey`, `password=`, credentialed URLs). Fix as in H-09: bounded tail, line-based flush, broader patterns, and exact redaction of values of environment variables named `*KEY|*TOKEN|*SECRET|*PASSWORD`. Property test plus a stall test.

#### J-10 Seat/job concurrency, sessions UX (P1) [reproduced]

- `--sessions` with a failing read-only session exits 7 with no per-session output. Print a summary table (session, tool/model, result, first error line). Sessions bypass the allow-list, failover and handoff (they use a reduced path); route them through the same job manager (section 6).

### P2

#### J-11 Documentation contradicts the code (P2)

- README says all six adapters are verified and eligible for routing, then says only aider and goose are verified and the rest are "never routed". README exit-code table disagrees with `exit-codes.ts` (code: `TASK_FAILURE` is 7, `FAILOVER_PROPOSED` is 6; README lists `TASK_FAILURE` as 6). The catalog description says "free, no-login, no-license", but Codex needs an OpenAI sign-in and Copilot needs a GitHub account and Copilot plan; the catalog has no `free`, `auth` or `limits` fields (only a `"free"` tag). `PLAN.md` is 401 lines with repeated sections.
- Change: one short `PLAN.md` (goal, architecture, decisions, status) with statements backed by named CI jobs; generate the exit-code table from `exit-codes.ts`; add `cost` and `auth` fields to the catalog (section 6.6).

#### J-12 Tests do not exercise the shipped path (P2)

- The real-binary smoke job only runs adapter `--version` checks (gated by `AIR_SMOKE_TEST=1`). Nothing runs `air run` end to end. See J-01 for the required e2e tests. Keep unit tests; add a rule that every user-facing command has one built-binary test.

#### J-13 Minor (P2)

- `engines.node` is still `>=18.0.0` while CI uses Node 22; set it to what you test.
- `scripts/fix-imports.mjs` rewrites compiled imports with regexes; a relative import of a directory would become `./x.js` and break. Prefer `NodeNext` with `.js` extensions in source, or a bundler.
- `MOCK_MODE` handling in `bin/air.ts` and `AIR_MOCK_ADAPTER` in the MCP server are test hooks in production code; use dependency injection.
- `verify.ts` uses `spawnSync` (blocks the event loop; matters in a daemon).
- Handoff diff is still `git diff HEAD` for the whole tree (includes pre-existing changes) though it is now redacted.

## 5. Status of earlier items (summary)

| Item | Now |
|---|---|
| H-01 built CLI | Fixed (postbuild rewrite; fragile, J-13) |
| H-02 lock | Fixed (80/80). Seats: J-08 |
| H-03 adapter override | Fixed |
| H-04 MCP stdout | Fixed (0 non-JSON lines) |
| H-05 parallel sessions | Partly: write sessions on one cwd are refused; exit code reflects results; no isolation, no summary (J-10) |
| H-06 cross-provider failover | Not fixed (J-07) |
| H-07 repo trust | Verify gate fixed; repo can still self-trust and set catalog/permission keys (J-04) |
| H-08 Ctrl+C | Handlers exist in `runAction`/`start()`; not verifiable end to end until J-01 is fixed |
| H-09 redaction | Multibyte fixed; stall and coverage open (J-09) |
| H-10 byte limits | Fixed |
| H-11 delta | Fixed in code: content fingerprints (`git hash-object`) compared before/after; not probed |
| H-12 model recommendation | Not fixed (still cheapest-first, ignores task) |
| H-13 one orchestrator | Partly: `Orchestrator` shared by CLI and MCP; `--sessions` still separate; broken (J-01) |
| H-14 / I-02 tests | Isolated and parallel now; still no built-binary e2e (J-12) |
| I-01 `permission` config unused | Not fixed (still unread; repo-writable) |

## 6. What you want vs what exists

Your goal: **one super agent** that takes incoming work, orchestrates execution across sessions, tools and models, monitors it, and returns a result; mainly free tools and models; delegates each job to the best-suited tool or model; seamless like one AI: the user can send follow-ups while work runs; the one agent the user talks to keeps the conversation context whichever models run behind it.

| Requirement | Today | Gap |
|---|---|---|
| One conversational agent the user talks to | None. CLI `run <task>` and MCP tools only | No front agent, no conversation store, no chat interface |
| Takes incoming work, orchestrates sessions/tools/models | Router picks one tool; sequential failover | No task analysis, decomposition, planning or parallel plan; sessions are a separate reduced path |
| Monitors execution, brings back a result | Process status, tail output, workspace delta | No progress model, no result synthesis in one voice, no verification step |
| User can follow up while work runs | `run` blocks until done; MCP polls | No long-lived owner of jobs, no follow-up semantics, no job message queue |
| Context preserved regardless of background models | None (each tool call starts cold; resume = one line) | Context must be owned by AIR, not by any model |
| Free-first | Catalog tag "free"; cheapest-first sort by regex | No cost/auth/limits model, no free-tier quota ledger, no hard "never spend" policy |
| Best-suited tool/model per job | Priority list; `bestModelFor` ignores the task | No task typing, no capability profiles per model, no outcome learning |

## 7. Target architecture (instructions for the implementation AI)

### 7.1 Principles

1. **Two planes.** A *conversation plane* (the front agent) that is always responsive, and an *execution plane* (jobs) that runs asynchronously. The front agent never blocks on a job.
2. **AIR owns the context.** The canonical conversation, a structured "state of the world" and the job table live in AIR's store. Any model, front or worker, is stateless and can be swapped mid-conversation. This is what makes the experience feel like one agent.
3. **One owner process.** A local daemon (`air serve`) is the single writer of state and the single owner of running jobs. The CLI chat, the MCP server and editor integrations are thin clients over local IPC. This also removes the cross-process file-locking problems found in rounds 4-6.
4. **Free-first by policy, not by hope.** Every executor has a declared and verifiable cost class; paid use is off unless explicitly allowed; quotas are tracked.
5. **Explain on demand, hide by default.** The user talks to "AIR". Which tool or model ran is available via `/jobs` and in answers when asked, never forced into the conversation.
6. **Evidence over claims.** Results come from workspace deltas and verification output, never from a model saying it succeeded.

### 7.2 Components

| Component | Responsibility |
|---|---|
| `air serve` daemon | Owns job manager, conversation store, quota ledger, health, seats. Listens on a Unix domain socket / Windows named pipe (owner-only permissions). JSON-RPC 2.0, newline-delimited. Auto-started by clients when absent |
| Conversation store | Append-only turns, rolling summary, structured facts (see 7.3), per-conversation job links. SQLite or JSONL with a single writer |
| Front agent | LLM that reads the user message plus digest and emits one or more *actions* (7.4). Runs on a small, fast, free, tool-capable model from a separate `front` pool with its own failover; deterministic command fallback when no model is reachable |
| Job manager | Creates jobs, enforces seats and quotas, runs executors, streams events, handles cancel/amend/resume, reconciles orphans after a crash |
| Executors | `CliExecutor` (aider, goose, opencode, kilocode, codex, copilot via adapters) and `ApiExecutor` (direct calls to free model APIs for questions, summaries, planning, review, classification). Both implement one `Executor` interface |
| Router | Scores executors for a job (7.6); returns ranked candidates with reasons |
| Result compiler | Turns raw output + delta + verification into a `JobResult`, then lets the front agent write the user-facing answer |
| Workspace manager | Per-job git worktrees, apply/merge, delta computation |
| Ledger | Per (provider, key alias) usage, limits, 429/Retry-After history, per-(executor, task type) outcome statistics |
| Clients | `air chat` (terminal UI), MCP server (stdio) proxying to the daemon, `air run` as a convenience wrapper that submits a job and streams events |

### 7.3 Data model (TypeScript sketch; adjust names, keep the semantics)

```ts
type JobState = 'QUEUED'|'RUNNING'|'AWAITING_APPROVAL'|'AWAITING_INPUT'|'COMPLETED'|'FAILED'|'CANCELLED';

interface Job {
  id: string; conversationId: string; parentJobId?: string;
  goal: string;                        // normalized by the front agent
  taskType: 'code_edit'|'code_review'|'explain'|'research'|'summarize'|'plan'|'test'|'other';
  constraints: { readOnly: boolean; files?: string[]; workspace: 'main'|'worktree'; allowShell: boolean; freeOnly: boolean };
  brief: ContextPack;                  // built by AIR, see below
  assignment?: { executorId: string; provider: string; model: string; reason: string };
  state: JobState; attempts: Attempt[]; result?: JobResult;
  createdAt: string; updatedAt: string;
}
interface JobEvent { jobId: string; seq: number; ts: string; type: 'state'|'output'|'progress'|'decision'|'error'|'approval_request'|'result'; data: unknown }
interface ContextPack {                // what any worker receives; never raw chat history
  goal: string; constraints: string[]; relevantFacts: string[]; priorJobSummaries: string[];
  repo: { conventions?: string; files: string[] }; attachments?: string[];
}
interface JobResult { summary: string; changes: { path: string; kind: 'added'|'modified'|'deleted' }[];
  verification?: { command: string; ok: boolean; excerpt: string }; artifacts: string[]; caveats: string[]; followUps: string[] }
interface Conversation { id: string; turns: Turn[]; summary: string; facts: Fact[]; jobIds: string[] }  // facts: decisions, preferences, constraints, file paths
interface ExecutorProfile {
  id: string; kind: 'cli'|'api'; provider: string; model: string;
  cost: 'free'|'freemium'|'paid'; auth: 'none'|'api_key'|'oauth'|'subscription';
  limits?: { rpm?: number; rpd?: number; tpm?: number; tpd?: number; resetsAt?: string };
  contextWindow?: number; modes: ('read'|'write'|'shell')[]; supportsResume: boolean; supportsLiveInput: boolean;
  priors: Partial<Record<Job['taskType'], number>>;   // 0..1 declared prior, updated by the ledger
}
```

### 7.4 Front-agent behaviour specification

Each user message produces zero or more **actions**; the front agent always answers the user immediately, then actions proceed in the background.

| Intent | Action |
|---|---|
| Direct question that needs no tools | Answer from the front model (or a one-off `ApiExecutor` call) |
| New work | `spawn_job` (one or several jobs if the work splits cleanly), confirm in one sentence |
| "What's happening?" / "status" | Answer from the job table and latest events; no executor call |
| Question about a running job | Answer from that job's event stream and partial output; do not touch the job |
| Amend a running job ("also add tests") | Decision table below |
| Independent request while jobs run | `spawn_job`; it runs in parallel if seats and workspace allow |
| Cancel / stop | `cancel_job` (tree kill, state `CANCELLED`) |
| Approval prompts (failover to another provider, shell, apply changes) | Ask once, in plain language; the answer resumes the job |
| Ambiguous | One short clarifying question, never blocking other work |

Amend decision table (executors rarely accept input mid-run):

| Condition | Strategy |
|---|---|
| Executor `supportsLiveInput` | Send the message into the running session |
| Job early (no workspace changes yet) | `cancel` + `spawn_job` with the amended brief and `parentJobId` |
| Job has changes and executor `supportsResume` | Let it finish or pause, then resume that session with the new instruction |
| Otherwise | Queue as a dependent job that starts after the current one with its summary and delta in the brief |

Rules:

- MUST keep one conversational voice. A fixed persona prompt, no tool names unless asked, and a post-processor that strips "As an AI model X..." artifacts.
- MUST rebuild the front agent's prompt from the store on every turn: persona, rolling summary, structured facts, last K turns, a short job digest (state, goal, age, last progress line). Compact with a cheap model when the transcript exceeds the budget; compaction MUST preserve facts and open jobs verbatim.
- MUST NOT let any worker see raw chat; workers get a `ContextPack` written by AIR/front agent.
- MUST degrade gracefully: if every front model is rate-limited, accept the message, say what was queued and when quota resets, and keep jobs running. A built-in command grammar (`/jobs`, `/status`, `/cancel <id>`, `/approve`) works with no model.
- Front-agent actions MUST be produced as schema-validated JSON (Zod) with one repair retry; invalid output falls back to "answer only" and logs the failure.

### 7.5 Execution, isolation and results

- Write jobs run in their own git worktree under `<cache>/worktrees/<jobId>` on branch `air/<jobId>`. Read-only jobs may share the main tree. Parallel write jobs are therefore safe. Delivery to the user's branch is an explicit **apply** step (fast-forward, merge or patch); conflicts are reported, never overwritten. Replaces the "refuse parallel write sessions" workaround.
- Every attempt records: executor, provider/model, argv hash, start/end, exit facts (timeout/cancel/spawn error first), classified error, workspace delta (content fingerprints), redacted output tail, redacted full log on disk with byte offsets.
- After a successful write job run the verify command if the repo has one (trusted repos only, global config); a failed verification is a job result, not a hidden detail. Optionally spawn a cheap `review` job.
- `JobResult` is produced by the result compiler from facts (delta, verification, output) and then phrased by the front agent. Never trust the worker's own claim of success.
- On daemon start, reconcile: processes recorded as running but dead -> mark `FAILED(interrupted)`; living orphans -> re-attach or kill; conversation and job table are preserved.

### 7.6 Routing, free-first policy and learning

1. **Task typing.** The front agent assigns `taskType` and constraints; rules (file extensions, verbs, `readOnly`) provide a deterministic fallback and a consistency check.
2. **Candidate filter (hard rules):** executor available and installed; supports required modes; permission mode enforceable; not in cooldown; quota headroom > 0; context window fits; provider allowed by the privacy allow-list; **cost class allowed** (`freeOnly` default true; `freemium` only inside its free limits; `paid` only with explicit opt-in per provider).
3. **Score (soft):** `expectedQuality(taskType)` from priors updated by outcomes (EWMA of success, verification pass, and retries per executor and task type) x quota headroom x latency estimate x queue length, with a small exploration rate so new free models get tried. Return the ranking and the reason string for traces and `/jobs`.
4. **Quota ledger.** Track requests and tokens per (provider, key alias) in rolling windows; learn limits from 429 `Retry-After` headers and store reset times; expose "available again at HH:MM" to the front agent. When all free options are exhausted, tell the user and either wait or ask for permission to use a paid option; never spend silently.
5. **Make "free" verifiable.** Catalog fields `cost`, `auth`, `limits`. For OpenRouter, read `pricing` from the models API and mark a model free only when prompt and completion prices are zero. Tools that need an account or subscription (Codex sign-in, Copilot plan) are `auth: oauth|subscription` and excluded from the default free set unless the user configured them. Add a `catalog-lint` job that fails on unverifiable claims.
6. Replace the cost-tier regex (`/mini/` matches `gemini-...`) with explicit catalog data.

### 7.7 Interfaces

- `air chat`: terminal UI with a conversation pane and a jobs panel; streaming front-agent replies; job completion notices appear inline without interrupting typing; `/jobs`, `/status`, `/cancel`, `/approve`, `/apply <job>`.
- MCP server: tools `chat_send(message)` (returns immediately with the front agent's reply and any job ids), `job_status`, `job_output(offset)`, `job_cancel`, `job_approve`, `job_apply`, plus event notifications for progress. A host agent (VS Code, Claude Code) may instead call `spawn_job` directly and act as the front agent; both modes use the same daemon.
- `air run "<task>"`: submits a job, streams events, exits with the documented code; remains scriptable.
- All stdout in MCP mode is JSON-RPC only; diagnostics go to stderr or files.

### 7.8 Security requirements (MUST)

- Global-only config keys and the catalog rules from J-03/J-04. Repo config is advisory.
- Local IPC accessible only to the owning user (socket mode 0600 / pipe ACL); no TCP listener.
- Child processes get a minimal environment plus only the key variables their executor declares; never the full parent environment.
- Redaction at the single choke point for logs, events, handoff packs, and MCP output, with the pattern set and env-value redaction from J-09.
- Install/upgrade only on explicit user action; downloads pinned and hash-verified before use.
- Permission modes (`read_only | edit | edit_and_shell`) map to real executor flags; an executor that cannot enforce the requested mode is not eligible.

## 8. Roadmap with acceptance tests

Do the milestones in order. Each ends with automated tests that run in CI against the built binary where a binary is involved.

| M | Scope | Acceptance |
|---|---|---|
| **M0 Make it work** | J-01, J-12 | Built-binary e2e (CLI + MCP) with fake executables: success, edit, rate limit, crash, timeout, SIGINT; exceptions yield `FAILED`; no adapter injection in these tests |
| **M1 Close the security holes** | J-02, J-03, J-04, J-09, global-only config, no auto-install, catalog-lint CI, minimal child env | Section 7.8 tests; repo config probe suite passes; hostile remote catalog rejected |
| **M2 Job runtime + daemon** | 7.2 daemon, job manager, append-only event store, IPC, `air run` as client, reconcile on restart; fix seats (J-08); remove `orchestrator.json` (J-05) | Kill the daemon mid-job and restart: state recovered; two clients see one consistent job table; concurrency cap holds under 20 concurrent submissions |
| **M3 Front agent** | Conversation store, front-agent prompt builder, action schema, fallback grammar, `air chat`, `chat_send` MCP tool, compaction | Scenarios A1, A2, A3, A6 below pass with a scripted fake model; then with one real free model in a manual run |
| **M4 Executors** | `ApiExecutor` (OpenAI-compatible endpoints: OpenRouter free models, Gemini free tier, Groq, Ollama), adapter capabilities (`supportsResume`, `supportsLiveInput`), permission enforcement, result compiler | Non-coding tasks run through `ApiExecutor`; read-only enforced or refused per executor |
| **M5 Routing and ledger** | Task typing, profiles, scoring, quota ledger, outcome learning, free-only policy, explanations | A4, A5 pass; ranking is deterministic given a ledger snapshot; `--explain` shows inputs |
| **M6 Isolation and apply** | Worktrees per write job, apply/merge, parallel jobs, verify step | Two parallel write jobs on different files succeed; apply conflict is reported without data loss |
| **M7 Quality and release** | Cross-platform CI (Windows and Linux), soak test with fake executors, docs generated from code, PLAN.md rewrite | Release criteria in section 9 |

## 9. Vision acceptance scenarios and definition of done

Implement these as a deterministic scenario harness: a fake LLM provider (scripted replies, injectable rate limits), fake executors (configurable duration, output, edits, failures), a virtual clock, and a client that talks to the daemon over IPC.

| ID | Scenario | Pass condition |
|---|---|---|
| A1 Non-blocking | Submit a 10 s code-edit job, then at t=1 s ask "how is it going?", then ask an unrelated factual question | Both answers arrive in under 2 s while the job is still running; the status answer names the job and its latest progress line |
| A2 Context continuity | Mid-conversation, make the active front model start returning 429 so the front agent switches models | The next reply still uses earlier decisions and preferences; the user sees no change in voice |
| A3 Follow-up amend | While a job runs, say "also add tests for it" | Decision table is applied (cancel+respawn, resume, or queued dependent); one coherent thread; the new job links to its parent |
| A4 Delegation | Submit a mixed set: edit a file, explain a concept, summarize a long log | Each lands on a different suitable executor per profile; `/jobs` shows executor and reason; chat does not mention tools unless asked |
| A5 Free-only | `freeOnly: true`, all free quotas exhausted | No paid call is made (ledger assertion); the user is told when quota resets and offered an opt-in |
| A6 Failure transparency | A job fails with a classified error | The user gets a plain-language explanation and an offer to retry on another executor; raw logs remain available |
| A7 Privacy | A handoff would cross to a provider outside the allow-list | It is blocked or requires explicit approval, with the destination named |
| A8 Crash recovery | Kill the daemon during two running jobs, restart | Jobs are reconciled; conversation and job table are intact; no orphan processes |
| A9 Parallel safety | Two write jobs on the same repo | Run in separate worktrees; results are applied one at a time; no cross-contamination of deltas |
| A10 Install safety | Request a tool that is not installed | AIR proposes the exact install command and waits for confirmation; nothing installs silently |

Definition of done:

- Clean clone: `npm ci && npm run build && npm run typecheck && npm run typecheck:test && npm run lint && npm test` pass on Linux and Windows CI with no host tools installed, tests run in parallel, and nothing is written to the real home directory.
- CI also runs the built-binary e2e suite (CLI, MCP, chat via IPC), the scenario harness A1-A10, the catalog lint, and the multi-process coordination tests.
- One documented manual session with two real free tools and one real free front model, recorded in `docs/`.
- `README.md` and `PLAN.md` state only what CI proves.

## 10. Immediate next steps (first week, in this order)

1. Fix J-01 and add the built-binary e2e tests (M0). Nothing else matters until `air run` works.
2. Make `catalog.*`, `trustedRepos`, `permission.*` and related keys global-only; disable auto-install and remote catalog execution fields (J-03, J-04). Correct the catalog package names (J-02) and add `catalog-lint`.
3. Write the Part B design into `PLAN.md` (short), delete the old plan text, and start M2 with the in-process `JobManager` library (testable without IPC) before adding the daemon wrapper.
