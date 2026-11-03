# claude_plan_review_v5.md

## 0. How to use this document

- Review round 5 of the `air` repo. Earlier rounds: `claude_plan_review.md` (`R-`), `_v2` (`N-`), `_v3` (`F-`), `_v4` (`H-`). New findings here are `I-01`..`I-05`.
- Treat every item as a change request. Reference IDs in commit messages. Full detail, rationale and acceptance tests for each `H-` item are in `claude_plan_review_v4.md`; this document restates the evidence and the minimum required change so it can be used on its own.
- MUST = required. SHOULD = do unless a reason is documented in `PLAN.md`. MAY = optional.
- **[reproduced]** = I ran it on this commit and saw the result. **[code]** = read from the source (file unchanged since it was reproduced earlier, or not executable as a probe).
- Verdict: **not release-ready.** Build, lint, typecheck, packaging and CI hygiene are now good. But 13 of the 17 round-4 findings are unchanged, including every P0 that is about behaviour rather than tooling. The README says "Release candidate ... CLI + MCP server functional"; that is not accurate yet.

### Review basis

- Fresh clone of `main` at `e382d13` (52 commits; 11 new since round 4, 43 files changed).
- Ran on that clone: `npm ci`, `build`, `typecheck`, `typecheck:test`, `lint`, `test`, plus the built CLI from an unrelated directory (`--version`, `status --json`, `route-test --explain`, `models`, `models --best`, `config --validate`, `run --sessions`), `npm pack --dry-run`.
- Re-ran every probe from round 4 with 4 real processes, fake `aider`/`goose` executables on `PATH`, an MCP stdio client, and probe tests for config, redaction and the runner. I corrected a mistake in my own probe harness (state directories were not fully isolated in some earlier runs) and re-verified the failover, signal and session results with fully isolated state; results did not change.
- NOT verified: the external tools' flags, model IDs in `config/models/`, GitHub Actions run results (I cannot see them; statements about CI below are inferred from reproducing the steps locally).

## 1. Verified results

| Check | Result |
|---|---|
| `npm ci`, `build`, `typecheck`, `typecheck:test`, `lint` | **All pass.** Lint: 0 errors, 36 warnings (`no-explicit-any`) |
| Built CLI from `/tmp` (`--version`, `status --json`, `route-test --explain`, `models`, `config --validate`, `run --sessions`) | **Works** (fixed since round 4) |
| `npm pack --dry-run` | OK; CI also installs the tarball and runs `air --help` |
| `npm test` on a clean machine without aider/goose | 186 pass, **2 fail** (`tests/adapter-gate.test.ts`: expects `aider` to be routable, so it needs the real tool installed). On a GitHub runner these two tests should fail, so CI should be red |
| `npm test` side effects | **Creates `~/.cache/air/{air.log,concurrency,health.json,locks,tasks}`** in the real home directory [reproduced: deleted the directory, ran `npm test`, it reappeared] |
| `vitest.config.ts` | `singleFork: true`, with the comment "several test files mutate the same global cache ... parallel workers race". README repeats it |
| `README.md` / `PLAN.md` claims | README: "Release candidate. 188 tests passing ... CLI + MCP server functional". PLAN: "191 tests passing". Actual: 188 tests, 2 fail on a clean machine |

## 2. What changed for the better (keep)

- Built CLI works from any directory; `npm pack` smoke test in CI; lint, `typecheck:test` and CI build/lint steps added; `zod` 4; MCP SDK pinned; stale reviews archived in `docs/reviews/`.
- User cancellation is now separate from provider failure (`recordCancellation`, `CANCELLED` state, no cooldown, no failover) in CLI, MCP and sessions.
- `permission` section exists in the config schema (see I-01: it does nothing yet). MCP `startMcp` accepts an injected transport, which makes in-memory tests possible.
- README now states honestly that opencode/kilocode/codex/github-copilot are unverified and never routed.

## 3. Status of round-4 findings

| ID | Topic | Status |
|---|---|---|
| H-01 | Built CLI crashes | **FIXED in effect** via a `postbuild` regex rewrite (`scripts/fix-imports.mjs`); see I-03 for the fragility |
| H-02 | Lock and seats don't coordinate processes | **NOT FIXED** [reproduced]: 4 processes x 20 increments gave 40 (expected 80); cap 1 allowed 4 concurrent holders. The `start !== PROCESS_START` stale test is still there |
| H-03 | Tool config override breaks adapters | **NOT FIXED** [reproduced]: with `tools: [{id: aider, provider, model}]`, `buildCommand`, `classifyError`, `canHandle` are all `undefined` |
| H-04 | MCP server writes tool output to protocol stdout | **NOT FIXED** [reproduced]: fake `aider` printing 2 lines produced 2 non-JSON lines on the server's stdout |
| H-05 | Parallel sessions share one tree, bypass safety path | **NOT FIXED** [reproduced + code]: two sessions, one failing, exit code 0; same `cwd`; hard-coded timeout and 60 s cooldown; no failover/allow-list |
| H-06 | Cross-provider failover impossible with real adapters | **NOT FIXED** [reproduced]: rate-limited `aider` + working `goose` + `--auto` -> "No alternative candidate (RATE_LIMIT)", exit 2, goose never called |
| H-07 | Repo config can grant itself trust; clobbers global | **NOT FIXED** [reproduced]: see section 4, H-07 |
| H-08 | Ctrl+C leaves child running | **NOT FIXED** [reproduced]: SIGINT to `air`; `air` exits; the `aider` child is still alive. No signal handlers in `bin/` or `src/` |
| H-09 | Streaming redactor stalls, corrupts, misses secrets | **NOT FIXED** [reproduced]: output stops after `task-` and `--author`; `М��ла` corruption; 11 of 13 secret formats not redacted |
| H-10 | Byte limits not byte-accurate; quadratic tail | **NOT FIXED** [reproduced]: cap 1000 bytes captured 2000; 800 KB took 5.1 s |
| H-11 | Delta detection compares name sets | **NOT FIXED** [code]: `checkpoint.ts` unchanged |
| H-12 | Model listing/recommendation shallow | **NOT FIXED**: `catalog.ts` change is only a parameter rename (`_task`); `air models --best refactor` still ignores the task text |
| H-13 | Three divergent orchestrators | **NOT FIXED** [code]: MCP and sessions still hard-code a 60 s cooldown while the CLI uses `cooldownMinutes` |
| H-14 | Test/lint/CI hygiene | **PARTIAL**: build, lint, typecheck, pack are fixed; adapter-gate still depends on installed tools; tests serialised instead of isolated; no real-process tests |
| H-15 | Handoff diff unredacted, whole tree | **NOT FIXED** [code]: `handoff.ts` unchanged |
| H-16 | Test hooks in production binary | **WORSE**: `MOCK_MODE` in `bin/air.ts` plus a new `AIR_MOCK_ADAPTER` hook in `src/mcp/server.ts` |
| H-17 | Docs match reality | **PARTIAL**: updated, but still claims "functional"/"release candidate"; test counts disagree (README 188, PLAN 191) |
| F-16 | `AIR_CONFIG_DIR`/`AIR_CACHE_DIR` and test isolation | **NOT FIXED** [reproduced]: `npm test` writes to the real home |
| F-17 | Child gets the full environment | **NOT FIXED** [code]: runner unchanged |

## 4. Required changes (P0, all still open)

For each item: minimum change, then acceptance. See v4 for the longer rationale.

### H-02 Make coordination real (and stop hiding the symptom)

- Root cause: `acquireLock` and `isSeatStale` call a holder "stale" when `existing.start !== PROCESS_START` (the *current* process's start time). A live lock from another process always differs, so every process steals every other process's lock. Seat counting is also check-then-create across different file names.
- Evidence this matters: your own README and `vitest.config.ts` say test workers "race on the shared global health file"; that is this bug. `singleFork` hides it.
- Change:
  - Replace the lock with an atomic `mkdir`-based lock directory plus heartbeat (refresh mtime every few seconds; stale when mtime is older than a threshold or the PID is dead), or adopt `proper-lockfile`. Never compare a holder's start time with the current process's.
  - Replace seats with N fixed slot files (`slot-0..slot-(N-1)`) created with `O_EXCL`; the cap is the number of slots.
  - Timeouts MUST be visible errors (`LOCK_TIMEOUT`, `SEAT_TIMEOUT`) with a trace entry; `withSeat`/`withLock` returning `null` MUST NOT be ignored (today `runSession` silently drops the session, and `tracker.flush()` silently drops health writes).
  - Read the cap from `config.concurrency.maxConcurrentAgents` (sessions hard-code 1 and a 30 s wait).
  - Make health counters additive under the lock (merge deltas, not absolute values).
  - Remove `singleFork` once tests use isolated directories (I-02).
- Acceptance (real child processes, not async functions): 4 processes x 20 increments = exactly 80; cap 2 with 6 workers never exceeds 2 holders; SIGKILL of a holder frees the lock within the stale threshold; a seat timeout surfaces as an error; the full suite passes with parallel workers.

### H-03 Fix adapter construction from config

- `applyConfig` uses `{ ...adapter, provider, model }`, which drops prototype methods. Build the adapter through its constructor (`new AiderAdapter({ provider, model, executable })`).
- The adapter MUST pass the model/executable it reports to the child (`--model` for aider; the documented mechanism for goose). If it cannot guarantee that, it MUST report `provider/model: unknown` and the router MUST not fail over to or from `unknown`.
- Acceptance: a registry test calls every adapter method on an adapter built with overrides; an argv test proves the configured model reaches the child; `air status` shows whether provider/model came from config or a default.

### H-04 MCP stdout must carry only JSON-RPC

- `runAttempt` passes `onStdout: (c) => process.stdout.write(c)` (and stderr likewise). Remove it. Deliver output through `get_task_output` (persist capped stdout and stderr to files under the task directory; return both with offsets), progress notifications, or a log file.
- Replace the in-memory test with a real stdio test (see I-02). Acceptance: spawn `node dist/bin/air.js mcp`, run a tool that prints text, a failing tool, and a timing-out tool; every stdout line parses as JSON-RPC.
- Also: load config from each task's `cwd` (the server loads it once from its own cwd), validate `cwd`, add an `allowDirty` parameter, remove the `AIR_MOCK_ADAPTER` env hook (H-16).

### H-05 Parallel sessions need isolation and shared logic

- One worktree per session (`git worktree add` on a task branch). Refuse parallel sessions on one tree unless an explicit flag acknowledges the risk.
- Route sessions through the same orchestrator as single runs (H-13): dirty-tree check, allow-list, failover, handoff, redaction, hop cap, config timeouts and cooldown, delta.
- Exit code MUST reflect session results (print a per-session summary table; worst result wins). Guard `adapters.length === 0` (modulo by zero).
- Acceptance: two parallel sessions on different files in separate worktrees do not interfere; one failed session makes the process exit non-zero; each delta contains only that session's files.

### H-06 Make cross-provider failover possible and testable

- Add a global-config allow-list (`privacy.allowedProviders`, optional `allowedModels`) and a per-run CLI flag (`--allow-provider openai`). Remove or implement `failover.allowProviderSwitch` (nothing reads it). In `ask` mode on a TTY, prompt with destination provider/model and handoff byte size; in MCP, `approve_failover` consent already binds to the proposal.
- Add an end-to-end test that runs the BUILT CLI with fake `aider`/`goose` executables on `PATH`: rate limit -> goose runs with the handoff in argv when allowed; stops with exit 2 and a clear reason when not.

### H-07 Repo config must not control security settings (re-verified)

- Probe: one repo `.airrc.yaml` set `failover.mode: auto`, `redaction.enabled: false`, `permission.mode: auto`, `permission.allowShell: true`, `permission.autoCommit: true`, `trustedRepos: [<its own path>]`, `verify.command: ./evil.sh`, and `tools[0].executable: ./evil.sh`. `loadConfig` returned `errors: []` and every value took effect.
- Probe: global config with `timeouts.defaultMs: 900000` and `failover.maxHops: 5`; an unrelated repo file containing only `tools: []` changed them to 300000 and 3.
- Change: parse each layer as partial (no per-layer defaults), merge by origin, apply defaults once. Define global-only keys (`failover.mode`, `failover.allowProviderSwitch`, `privacy.*`, `redaction.*`, `permission.*`, `tools[].executable`, `trustedRepos`, `concurrency`, `verify.*` unless trusted); in repo config they are ignored with a warning naming file and key. Fix `checkVerifyTrust`: make `source` a required argument (no default), compare `realpath` + `path.relative` (reject `..`, handle Windows case), run verify through the shared async runner (no `execFileSync`, capture stderr, tree-kill).
- Acceptance: tests that a repo file cannot set any global-only key; `../` and case-variant paths are not trusted; global values survive an unrelated repo config.

### H-08 Handle signals

- Create an `AbortController` per run in the CLI; on SIGINT/SIGTERM (and Windows console close) abort, kill the child's process tree, write state `CANCELLED`, flush health, exit with `USER_CANCELLED`. Abort all jobs and sessions on MCP server shutdown.
- Acceptance: built-CLI test with a hanging fake tool; after SIGINT no child remains and the state file says `CANCELLED` (Windows variant via `taskkill` checks).

## 5. Required changes (P1)

### H-09 Redaction: stalls, corrupts, misses secrets

- Use `StringDecoder('utf8')`; hold only a bounded tail (last ~128 bytes or the current line), flush whole lines promptly, hard-cap withheld bytes (today `rawWithheld` is unbounded and anything following `sk-`, `--key`, `--auth`, `Bearer` is held until process exit).
- Add Anthropic `sk-ant-`, OpenAI `sk-proj-`, GitHub `gho_`/`ghs_`/`ghu_`, Slack `xox*-`, Google `AIza`, JWT, PEM blocks, JSON/YAML `apiKey`/`api_key`, `password=`, credentialed URLs; also redact the actual values of env vars named `*KEY|*TOKEN|*SECRET|*PASSWORD`.
- Acceptance: property test (random chunk splits equal `redact(whole)`, no secret substring); stall test (secret-free output after `task-` still streams within one chunk); multibyte test.

### H-10 Byte-accurate output limits

- Accumulate in `Buffer`s, cap by bytes on UTF-8 boundaries, keep the tail in a ring buffer (O(1) per chunk). Apply the same helper in handoff (it slices by characters). Acceptance: 1/2/3/4-byte characters at the cap; 10 MB output in under 1 s.

### H-11 Delta detection by content

- Fingerprint dirty and untracked files (content hash, size-capped) before and after each attempt; report modified/created/deleted/reverted. Handle non-git directories explicitly. Acceptance: edit of a pre-modified file detected; edit of a pre-existing untracked file detected; true deletion reported as deleted; agent revert reported as reverted.

### H-12 Model listing and recommendation

- `--best <task>` MUST use the task text (read-only vs edit, shell, context size) and filter by availability, cooldown, allow-list and permission support before ranking. Move capability and cost data into a maintained, user-editable catalog (`source: verified|declared|unknown`) instead of inferring from adapter booleans and a regex (`/mini/` also matches `gemini-...`). Router and recommender share one scoring function.

### H-13 One orchestrator

- Extract `src/orchestrator/runTask(input, deps)` (no `process.exit`, no `console`, injected adapters/tracker/clock/snapshot/runner). CLI, MCP and sessions become thin wrappers. This removes the 60 s vs `cooldownMinutes` divergence and gives one place to fix H-05, H-06, H-08, H-11.

### H-14 Make tests honest

- `adapter-gate.test.ts` MUST inject adapters or put fake executables on `PATH` (it currently reads the machine).
- Add the real-process tests listed above (locks, seats, MCP stdio, SIGINT, built-CLI failover, sessions exit code) to CI.
- Set `engines.node` to what you test (>=22 recommended; CI runs 20 and 22).

### H-15 Handoff

- Build it from the per-attempt delta, cap by bytes, pass the whole pack through redaction as the last step, delete the second `buildHandoff` in `security/allowlist.ts`, show the destination provider and size before sending.

### H-16 Remove test hooks from production code

- Delete `MOCK_MODE` handling from `bin/air.ts` and `AIR_MOCK_ADAPTER` from `src/mcp/server.ts`; inject adapters through the orchestrator's `deps`.

### F-17 Environment for children

- Build a minimal environment per adapter (`PATH`, home/user dirs, temp dirs, locale, proxy variables, plus only the key variables that adapter declares).

## 6. New findings (round 5)

### I-01 `permission` settings exist but are never read (P0, security)

- `permission.{mode, broadApproval, autoCommit, allowShell}` is defined in the schema and loader defaults. `grep` finds no use anywhere else in `src/` or `bin/`. The aider adapter still hard-codes `--yes-always` (and `--no-auto-commits`, which contradicts a config `autoCommit: true`).
- It is also repo-writable (H-07 probe), so wiring it up without fixing H-07 would make a malicious repo able to turn on shell access.
- Change: MUST map `permission` to each adapter's real flags through a `supportedPermissionModes` contract, with an adapter refusing a mode it cannot enforce (router skips it with an exact reason). `read-only` tasks MUST not be routed to an adapter that cannot enforce read-only. Permission keys are global-only. Record the effective mode in the trace and task state. Delete keys that nothing implements.
- Acceptance: argv test per mode and adapter; read-only task is never routed to an adapter that cannot enforce it; repo config cannot change permission keys.

### I-02 Tests hide the real bugs (P1)

- `singleFork` serialises the suite to avoid the cross-process race that H-02 is. Test workers and several features write to the real `~/.cache/air`.
- `mcp-async.test.ts` describes itself as "mcp stdio round-trip" but uses `InMemoryTransport`, so it cannot see stdout pollution (H-04).
- Change: implement `AIR_CONFIG_DIR` and `AIR_CACHE_DIR` in `src/config/paths.ts`; set both to a per-test-file temp directory in a vitest global setup, and add a guard that fails the run if the real cache directory was touched. Add a real stdio MCP test (spawn the built binary). Name tests for what they actually do.

### I-03 The `postbuild` import rewrite is a fragile substitute for correct module settings (P2)

- `scripts/fix-imports.mjs` appends `.js` to any relative import without an extension, using regexes over compiled output. It works for the current files, but: a relative import of a directory (`'./config'` resolving to `config/index.ts`) would become `./config.js`, which does not exist; `.json` imports and `import type` edge cases are untested; and source/`tsx` behaviour (`moduleResolution: bundler`) differs from what Node runs.
- Change: SHOULD move to `"module": "NodeNext"` and write `.js` extensions in source (then delete the script), or bundle with `tsup`/`esbuild`. If the script stays, add a test that builds and imports every compiled module, and a directory-import case.

### I-04 Release claims run ahead of the facts (P1)

- README says "Release candidate ... CLI + MCP server functional"; PLAN says 191 tests; README says 188. On a clean machine 2 tests fail, parallel execution/failover/MCP have the reproduced defects above, and `docs/` contains a "release readiness" review that predates these results.
- Change: MUST replace status text with a short list of what CI proves, and drop "release candidate" until section 7 is satisfied.

### I-05 `air verify` argument parsing (P2)

- `air verify node -e 0` fails with `error: unknown option '-e'` (commander treats `-e` as an air option). Use `air verify -- node -e 0` in docs, or configure the command to pass unknown options through (`.allowUnknownOption()` + `--`). `verify-repo` splits the configured command with `split(/\s+/)`, which breaks quoted arguments; store the command as an array in config.

## 7. Work order and definition of done

| Step | Items | Done when |
|---|---|---|
| 1 Honest tests | I-02, H-14, F-16 | Tests use isolated dirs and run in parallel; `adapter-gate` no longer reads the host; real-stdio MCP test exists (it will fail on H-04: that is the point) |
| 2 Coordination | H-02 | Multi-process lock/seat tests pass |
| 3 Protocol and signals | H-04, H-08 | MCP stdio conformance test and SIGINT test pass |
| 4 Config, trust, permissions | H-07, H-03, I-01, F-17 | Repo config cannot set global-only keys; overrides round-trip; permission modes enforced or refused |
| 5 One orchestrator, failover | H-13, H-06, H-16 | Built-CLI failover e2e passes with and without allow-list; no test hooks in prod code |
| 6 Parallel sessions and deltas | H-05, H-11 | Worktree per session; content-fingerprint deltas; exit code reflects results |
| 7 Output and secrets | H-09, H-10, H-15 | Property, byte-cap and performance tests; handoff is delta-based and redacted |
| 8 Features and docs | H-12, I-03, I-04, I-05 | `--best` reflects task and policy; docs state only what CI proves |

Release criteria (all required):

- Clean clone: `npm ci && npm run build && npm run typecheck && npm run typecheck:test && npm run lint && npm test` exits 0 on Linux and Windows CI with no host tools installed, tests run in parallel, and no file is created in the real home directory.
- CI also runs the built CLI, the real stdio MCP test, the multi-process coordination tests, the SIGINT test, and the built-CLI failover end-to-end test.
- A repo `.airrc.yaml` cannot widen provider access, enable auto-failover, change executables, disable redaction, change permissions, add itself to `trustedRepos`, or run commands.
- One documented manual failover run with two real tools is recorded in `docs/`.
