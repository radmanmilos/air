# AIR e2e tests: verification of the "all implemented" report, and corrective instructions

## 0. Verdict

**Not implemented as reported.** A harness skeleton, fake executors and a fixture skeleton exist, and the whole suite is green (268 unit/e2e tests pass, 5 skipped). But the green result is misleading: most of the new e2e tests do not exercise the behavior named in their title, and the real bugs they were meant to expose still reproduce on the built binary. The security test `H-01` passes while shell injection through chat text still works.

Basis: `radmanmilos/air` `main` at `fe912d8` (221 commits, 17 new since `ad95990`), `radmanmilos/test` `main` at `8d046a9`. I ran build, typecheck, lint, `check:dist`, `npm test`, `vitest run tests/e2e`, and four real chat scenarios against the built `dist/bin/air.js` with fake `kilo` and `aider` on `PATH`. Not verified: anything needing the .NET SDK (not installed in my sandbox), real free tools, Windows behavior.

### Claims in `docs/reviews/archive/tasks_air_9.md` vs reality

| Task | Marked | Reality |
|---|---|---|
| T9-001 Harness core (sandbox, air-process, oracles, **report**) | DONE | No `report.ts`, no `preflight.ts`, no `retry.ts`, no `chat-driver.ts`, no `mcp-client.ts`. No KNOWN_GAP/XPASS status handling. Harness defects in section 3 |
| T9-002 Fake executors | DONE | Present for aider, goose, opencode, kilo, ollama, codex, copilot (both `.cmd` and `sh`). Behavior switch is `FAKE_BEHAVIOR`. Mostly unused by scenarios (section 2) |
| T9-003 Oracles with unit tests | DONE | 5 oracles (`gitClean`, `gitChangedFiles`, `fileExists`, `fileContains`, `voiceCheck`) plus `noOrphans`, which is a stub that always returns `true` (`// TODO`). Missing: dotnet/acceptance, conversation, task state, secrets scan, grounded files, structure, latency, sentinel. Only `voiceCheck` is used by any scenario |
| T9-004 Fixture TaskBoard, tag `baseline-v1`, `fixture.lock`, hidden acceptance tests | DONE | Fixture exists **inside the AIR repo** (`tests/e2e/fixtures/taskboard`), not in `radmanmilos/test` (which still has only `console_test`). No tag in either repo, no `fixture.lock`, no acceptance tests. Only 6 xUnit tests (spec: 17, baseline 14 pass + 3 fail). Source files carry comments that give away the answers (`// BUG-1: CompletedAt is never set`). No README/CONTRIBUTING/docs/noise/injection/secret files, no CLI smoke script, no FEAT-1..4 |
| T9-005 P0 deterministic scenarios (A-01, B-01..B-03, C-01, C-02, E-01..E-03, F-01, G-01s..G-03s, G-07s, H-01..H-04, I-01..I-03, J-01, K-01, K-02, L-01) | DONE | 29 tests in 9 files. Most are vacuous (section 2). B-02, B-03, C-02, E-02, E-03, G-0xs, H-02..H-04, I-02, I-03, L-01 do not exist under those meanings. Several IDs are reused for different things (`B-01` is "short question does not spawn a job" but only starts chat; `E-01` is "rate limit failover" but runs `air status`; `F-01` is redaction, my catalog's F-01 was persistence) |
| T9-006 Mutation check of tests (deliberately broken AIR builds) | DONE | `scripts/mutation-check.mjs` has 2 mutations of the **test oracles** (`voiceCheck`, `gitClean`), not of AIR. It does not show that any scenario catches an AIR regression |
| T9-007 Live suite | DONE | `npm run e2e:live` is the same command as `e2e:det` (`vitest run tests/e2e`). No `--fixture` handling, no live scenarios, no real-tool preflight |
| T9-008 P1/P2, soak, MCP groups, docs | TODO | Soak tests exist anyway but are loops of `air status` / `models` / `dashboard` (section 2). `docs/testing.md` claims things that do not exist (section 3) |
| T9-009 Old logs removed, `results/` ignored | DONE | Logs removed from the fixture repo (true). `results/` is **not** in `.gitignore` |
| `scripts/production-test.ps1` | not touched | Unchanged since round 1: still passes when nothing is detected |

## 1. What is good (keep)

- Sandbox with isolated `AIR_CACHE_DIR` / `AIR_CONFIG_DIR`, fake executors first on `PATH`, `NO_COLOR`, cleanup with retries on Windows.
- `AIR_EVENT_LOG` hook emits `message_received`, `brain_start`, `brain_end`, `job_submitted`, `job_started`, `job_finished` (6 of the 8 documented; `notice_printed` and `command_handled` are missing).
- Oracle unit tests exist and run; the fixture project skeleton (C#, three of the four seeded bugs visible in code) is a reasonable starting point.
- Baseline unchanged and healthy: build, typecheck, lint, `check:dist` clean; 268 tests pass; the test run no longer writes to the real home directory.

## 2. The new e2e tests are mostly vacuous

A test is vacuous if it would still pass on a build where the behavior is broken. I checked each one by reading it and, for the security scenario, by re-testing the bug.

| Scenario title | What it actually does | Why it proves nothing |
|---|---|---|
| `A-01` New developer asks what the project is ("reply arrives, repo unchanged, no job writes files") | Runs `air chat` with stdin **ignored** and asserts `exitCode === null \|\| exitCode === 0` | No message is ever sent; exits immediately or times out; passes on any build. It never checks the repo, a reply or jobs |
| `B-01` "short question does not spawn a job" | Runs `air chat` with stdin ignored; asserts stdout contains the banner `air chat` | No question sent. In reality a brainstorm question **does** spawn a job (below) |
| `F-01` "fake executor printing secret does not leak" | Sets `FAKE_BEHAVIOR=secret`, runs `air chat` 5 s, checks stdout lacks `sk-ant-api03` | No executor is ever invoked, so nothing could leak |
| `E-01` "rate-limited adapter triggers failover" | Sets `FAKE_BEHAVIOR=rate-limit`, runs `air status`, asserts exit 0 | `air status` never calls a worker; this is a smoke test mislabeled as failover |
| `B-02` and `C-01` "air run starts without crashing" | `air run "..."` with a 15 s timeout; asserts stdout+stderr length > 0 | Any output passes, including an error. No check of edits, worktree, merge, tests. Commit `c3b31c3` ("relax run-tasks assertions for CI") weakened these further |
| `F-02` "secret not in output" | `air run` with `FAKE_BEHAVIOR=secret`; asserts stdout lacks the key | Only valid if the fake ran and printed it; not asserted. Also ignores traces, conversation, events, state |
| `G-01` voice spec | Runs `voiceCheck` on a hard-coded string | Tests the oracle, not AIR |
| `H-01` shell metacharacters in chat text | **The payload variable is only used in the test title.** It runs `air chat` with stdin ignored and checks two sentinel files (`SENTINEL`, `PWN`) do not exist | Passes while the bug is live. I re-tested: `brainAnswer('what is this; touch /tmp/AIR_PWN2')` created the file; `shell: true` is still in `src/brain/index.ts` (lines 22, 45, 70, 91, 95). Through the real chat, `what is this; touch PWN_CHAT` created `PWN_CHAT` in the repo |
| `J-01` free-only default | `air models` exit 0 and non-empty output | Does not install a paid fake or run anything; says nothing about the policy |
| `K-01`/`K-02` MCP | initialize responds; stdout contains only JSON-RPC | No tool call, no run, no cancel; the original stdout-pollution regression only appears when a tool runs |
| `M-01..M-03` soak | Repeated `air status` / `models` / `dashboard` | Not a soak of messages, jobs or parallel processes |

Summary: of 29 e2e tests, none sends a chat message, none checks a job's effect on files, none cancels a job, and none reads `AIR_EVENT_LOG`. `airSpawn` (the interactive driver) is used by one test and never called with input.

## 3. Harness defects and claims in `docs/testing.md`

| # | Defect | Fix |
|---|---|---|
| H1 | `oracles.noOrphans` always returns `true` | Implement: snapshot processes whose argv or environment carries `AIR_E2E_MARKER` (`ps -eo pid,args` on Unix, `Get-CimInstance Win32_Process` on Windows); fail if any survive |
| H2 | `AirProcess.kill()` and the `airOnce` timeout only kill on Windows (`taskkill`); on Linux/macOS nothing is killed and `airOnce` resolves with `exitCode: null` while the child keeps running | Kill the process tree on all platforms (spawn detached, `process.kill(-pid)` on Unix); always kill in `finally` |
| H3 | `airOnce` runs with stdin `'ignore'`, so `chat` gets EOF | Use the interactive driver for chat; never use `airOnce` for `chat` |
| H4 | The sandbox **is** the repo directory and also holds `cache/`, `config/` and `events.jsonl` inside it | Put state outside the repo (`<tmp>/<id>/state`, `<tmp>/<id>/repo`); otherwise `gitClean` can never be true and tests cannot assert "repo unchanged" |
| H5 | Fixture copied with `cpSync`, not cloned at a tag; `ensureFixture` creates a git repo in the AIR working tree if missing; every scenario file copy-pastes it | Create the repo once from a tagged baseline (`git clone --local --branch baseline-v1`); remove the copy-pasted helper |
| H6 | No `report.ts`, `preflight.ts`, `retry.ts`, `chat-driver.ts`, `mcp-client.ts`; no UTF-8 `results/` output; `results/` not ignored | Build them as specified in the earlier redesign (`docs/reviews/archive/air_e2e_test_redesign.md`); add `results/` to `.gitignore` |
| H7 | No KNOWN_GAP/XPASS mechanism | Use vitest `it.fails` through a `knownGap(id, issue)` helper: passes while the bug exists, **fails when the bug is fixed** (XPASS), forcing the marker to be removed |
| H8 | `e2e:live` equals `e2e:det`; `--fixture` is not handled | Separate config (`vitest.live.config.ts`) and env `AIR_FIXTURE`; preflight decides SKIP reasons; never run live scenarios in CI |
| H9 | Scenario IDs reuse the catalog's IDs with different meanings | One ID per scenario, matching the catalog; rename or remove mismatched tests |
| H10 | `docs/testing.md` claims: harness has `report`; scenarios `A-01..M-05`; `--fixture <path>`; hidden acceptance tests; "16 tests across 6 tiers" for `production-test.ps1` (script unchanged and still weak); links to `docs/reviews/air_e2e_test_redesign.md`, which now lives in `docs/reviews/archive/` | Make the doc state only what exists; fix the link; either rewrite `production-test.ps1` as a thin wrapper over the Node harness or delete it |
| H11 | `scripts/mutation-check.mjs` mutates the test oracles, not AIR | Replace with the AIR mutation set in section 5 |
| H12 | Only 6 of 8 documented events are emitted by chat | Emit `notice_printed` and `command_handled`, add `job_progress` or drop it from the doc |

## 4. Product bugs that still reproduce (the tests must catch these)

All reproduced on `dist/bin/air.js` at `fe912d8` with fake executors; timings are real.

| ID | Behavior | Evidence | Severity |
|---|---|---|---|
| P-01 | **Command injection through chat text.** `brain` runs `kilo`/`opencode`/`ollama` with `shell: true` and the user's text as an argument | Message `what is this; touch PWN_CHAT` created `PWN_CHAT` in the repo (also confirmed via `brainAnswer` directly) | **P0 security** |
| P-02 | **"Started job" is printed only when the job finishes.** A 12 s job: "Started job" at 12.1 s, "finished" at 12.1 s. The user never learns the job id while it runs, so `/cancel <id>` cannot be used | Scripted chat session | P0 for the "one agent, non-blocking" goal |
| P-03 | **`/cancel` does not cancel.** It prints "Cancel requested for <id>" and nothing else; worker processes were still alive 4 s later (3 processes). With P-02 the id was `None` | Scripted session | P0 |
| P-04 | **Chat freezes while the brain answers.** With a fake `kilo` sleeping 6 s, `/status` sent 1 s later was answered after **5.0 s** (`execFileSync`) | Scripted session | P1 |
| P-05 | **A brainstorming question spawns a write job.** `How would you add caching to this app?` printed "Started job", created an `air/run-...` branch and a worktree | Scripted session; `decide()` treats "add" as a change request even in a question | P1 |
| P-06 | **The brain has no history and no job awareness** (`brainAnswer(trimmed)` passes only the current line); other `decide()` misroutes from my earlier table (`Should we refactor ...? trade-offs` -> write job; `I want a function that returns the greeting` and `please make it say hello AIR` -> chat only; `cancel that` and `what is the status of my job?` -> chat only) | `decide()` probe, code | P1 |

## 5. Corrective instructions

### 5.1 Rules for this round

1. **Every test must have teeth.** After writing a test, run it against a build with the targeted behavior broken. If it still passes, the test is invalid and must be rewritten. This is the acceptance criterion for the whole exercise.
2. **Write tests against desired behavior; mark real gaps with `knownGap`.** Do not weaken assertions, do not catch-and-pass, do not use `if (x) return`. A scenario that cannot run in CI is `SKIP` with a reason, never `PASS`.
3. **Titles equal contents.** A test named after a user story must send that story's messages and assert its effects.
4. **No result without evidence.** Each scenario writes its transcript, event log, `git diff`, and state snapshot under `results/<run>/<scenario>/`.

### 5.2 Build the missing harness pieces (order)

1. **Sandbox v2** (H4, H5): `repo/` (cloned at tag) separate from `state/` (`AIR_CACHE_DIR`, `AIR_CONFIG_DIR`, `events.jsonl`). Fixture created once in `globalSetup`, hash compared with `fixture.lock`.
2. **Process control** (H1-H3): cross-platform tree kill, `noOrphans` implemented, `airOnce` only for non-interactive commands.
3. **Chat driver** (new `chat-driver.ts`), minimum API:

```ts
interface ChatSession {
  say(line: string): number;                              // returns t (ms since start)
  waitForLine(re: RegExp, afterMs: number, timeoutMs: number): Promise<{ t: number; line: string }>;
  latency(sentAt: number, re: RegExp, timeoutMs: number): Promise<number>; // time from say() to matching line
  lines(): { t: number; line: string }[];
  events(): AirEvent[];                                   // parsed AIR_EVENT_LOG
  quit(): Promise<void>;                                  // /quit then kill tree if needed
}
```

4. **Oracles** the scenarios need now: `gitClean(repo)`, `gitBranches(repo)` (`air/*`), `worktrees(repo)`, `sentinelAbsent(repo, names)`, `noOrphans(marker)`, `secretsAbsent(dirs, patterns)` (state, results, events, conversation), `conversationMessages(state, id)`, `taskStates(state)`.
5. **Report** (`report.ts`): `results.json`, `summary.md` (UTF-8), statuses PASS/FAIL/SKIP/KNOWN_GAP/XPASS/FLAKY, metrics table.
6. **`knownGap` helper** around `it.fails` (H7) and `.gitignore` for `results/` (H6).
7. **Live config** (H8) and preflight.

### 5.3 Replace the vacuous tests with these real scenarios (all deterministic, CI-capable)

Each uses fake executors on `PATH`: `kilo` (brain; env `KILO_SLEEP` seconds, prints one JSON text line), `aider` (write; modifies `Program.cs` or the fixture file; env `AIR_FAKE_AIDER_SLEEP`), `goose`. Add fake behaviors where missing. Expected results on the current build are shown so you can verify that the tests have teeth.

| Scenario | Steps | Hard oracles | Expected on current `main` |
|---|---|---|---|
| **H-01 chat injection** | For each payload (`; touch SENTINEL`, `&& touch SENTINEL`, `` `touch SENTINEL` ``, `$(touch SENTINEL)`, plus the Windows variants `& echo x > SENTINEL`, `\| type nul > SENTINEL`), send `what is this <payload>` and wait for the reply or 20 s | `existsSync(repo/SENTINEL)` is false after each; reply delivered | **FAIL** (`knownGap('P-01')`) |
| **B-01 brainstorm has no side effects** | Send `How would you add due dates and reminders to this app? Give me options.` Wait until idle | No `Started job` line; `gitBranches` has no `air/*`; no worktree; `gitClean`; the `AIR_EVENT_LOG` has no `job_submitted` | **FAIL** (`knownGap('P-05')`) |
| **B-03 trade-offs** | `Should we refactor TaskService? What are the trade-offs?` | same as B-01 | **FAIL** (P-05/P-06) |
| **C-03/E-00 job start is immediate** | Send a write request with a fake aider that takes 12 s | `Started job <id>` line within 2 s of the request; `/jobs` lists the id while running; the id matches `taskStates` | **FAIL** (`knownGap('P-02')`; measured 12.1 s) |
| **E-03 cancel kills the worker** | Start a 25 s job, read the id, send `/cancel <id>` | Within 5 s: task state `CANCELLED`, `noOrphans(marker)`, chat says the job was cancelled; worktree handled per documented policy | **FAIL** (`knownGap('P-03')`) |
| **E-02 chat stays responsive during a brain call** | `KILO_SLEEP=6`; send a non-repo question, then `/status` 1 s later | `/status` answered within 2 s (events: `message_received` -> `command_handled`) | **FAIL** (`knownGap('P-04')`; measured 5.0 s) |
| **E-01 question while a job runs** | Start a 15 s write job; at 1 s ask `What is a mutex?` (brain 2 s) | Answer arrives before the job finishes; job finishes with changes; both recorded in the conversation | Expected to depend on P-02/P-04: record the result, do not assume |
| **F-01 persistence** | 5 messages, `/quit`, `air chat --resume <id>`, ask `What did I ask you first?` | Conversation file has all messages after quit; reply refers to the first message (needs history: `knownGap('P-06')` for the second assertion only) | First assertion should PASS, second KNOWN_GAP |
| **A-01 onboarding (real)** | `What is this project and how do I run it?` | Reply arrives (events `brain_end` or job finished); `gitClean`; conversation has 2 messages; reply mentions a file that exists in the repo | Check on the build; do not assume |
| **G-01s failover with consent** | Fake aider returns a 429, fake goose works; run with and without `--allow-provider` | With: goose runs, handoff text contains the task; without: message states the reason and the exact flag; never a bare `Failed.` | Run and record |
| **H-02 secrets** | Fake aider prints `sk-ant-api03-FAKE...` and a fixture file contains it; run a write job and a chat explain | `secretsAbsent` over state dir, events, conversation, results and the chat transcript | Run and record |
| **K-01 real MCP session** | initialize, tools/list, `run_task` (read-only, fake aider printing two lines), poll `get_task_status`, `get_task_output`; then `cancel_task` on a 25 s job | Every stdout line is JSON-RPC; id from `run_task` equals id in status; terminal state; after cancel `noOrphans` | Run and record (earlier probes showed stdout pollution; verify now) |
| **L-01 write job + merge** | `air run "fix the completion bug"` with a fake aider that edits `TaskService.cs`; then `air merge <id>` | Main tree untouched before merge; after merge `gitChangedFiles` equals the fixture file only; `dotnet test` if the SDK exists (else SKIP with reason) | Run and record |

Keep all other P0/P1 scenarios from the earlier redesign (`archive/air_e2e_test_redesign.md`, groups A to M) and implement them in this style.

### 5.4 Mutation checks of AIR (replace `mutation-check.mjs`)

Apply each mutation to a **fixed** build, run the named scenario, and require it to fail; restore and rebuild. The mutations that correspond to bugs still present today are your current `KNOWN_GAP`s; the check becomes meaningful once they are fixed.

| Mutation | Scenario that must fail |
|---|---|
| Re-enable `shell: true` in `src/brain/index.ts` | H-01 |
| Make `/cancel` print only | E-03 |
| Print "Started job" after `start()` returns | C-03 |
| Make the brain call synchronous again | E-02 |
| Route questions containing `add`/`refactor` to write jobs | B-01, B-03 |
| Write worker stdout to `process.stdout` in MCP mode | K-01 |
| Register the mock adapter in production | L-04 / dashboard check |
| Overwrite the conversation on close | F-01 |
| Remove redaction patterns | H-02 |
| Skip the allow-list check | G-01s |

### 5.5 Fixture work (`radmanmilos/test` or a dedicated fixture repo)

1. Put TaskBoard in the fixture repo, tag `baseline-v1`, commit its hash into `tests/e2e/fixtures/fixture.lock` in the AIR repo, and make the harness refuse to run on a hash mismatch.
2. Match the spec: 17 xUnit tests with exactly 3 named failures at baseline, README, CONTRIBUTING (with a "tests required" rule), `docs/ARCHITECTURE.md`, `docs/legacy/NOTES_OLD.md` (wrong claims), `docs/INJECTION_TEST.md`, `TODO.md`, `fixtures-secrets/fake-keys.txt`, a 2 MB `data/sample-tasks.json`, CLI smoke script for BUG-4.
3. **Remove the `// BUG-n:` comments** from the source; they tell the model where the bugs are.
4. Add the hidden acceptance tests for FEAT-1..4 under `tests/e2e/fixtures/acceptance/` in the AIR repo; the harness copies them in after a run.
5. Preflight records `dotnet --list-sdks`; scenarios needing the SDK `SKIP` with a reason when absent. A Node fixture MAY replace TaskBoard for CI so no .NET is needed.

### 5.6 Documentation and scripts

- `docs/testing.md`: state only what exists, which command runs which suite, prerequisites, how to read `summary.md`, how to add a scenario, the `knownGap` convention.
- `scripts/production-test.ps1`: make it a thin wrapper (`node dist/...` harness with `--suite live --fixture <path>`) or delete it.
- Keep `tasks_air_*.md` honest: reopen T9-001, T9-003..T9-007 and T9-009 until acceptance below passes.

## 6. Acceptance for this round

1. `npm run e2e:det` runs the scenarios in 5.3 with real inputs. Against current `main` it reports **FAIL/KNOWN_GAP for P-01..P-05** (and the second half of F-01) and PASS for the rest; no test passes without sending its story's messages.
2. Each scenario in 5.3 fails against the mutation listed for it (5.4) once the matching product bug is fixed, and fails now for the bugs still present.
3. `noOrphans`, tree kill and `secretsAbsent` have positive and negative unit tests.
4. `fixture.lock` matches the tagged fixture; the baseline `dotnet test` result is 14 pass and 3 named failures (or the scenarios SKIP with the SDK reason).
5. `report.ts` writes UTF-8 `results.json` and `summary.md` outside the fixture repo; `results/` is ignored.
6. `docs/testing.md` and `tasks_air_9.md` contain no claim that this verification contradicts.

After the tests expose them, fix the product bugs in this order: **P-01** (never use a shell; pass the prompt without interpreting it, use `cross-spawn` for `.cmd` shims on Windows), **P-02** (return the job handle immediately and print `Started job <id>` at once), **P-03** (wire `/cancel` to the job manager), **P-04** (async brain), **P-05/P-06** (intent routing and brain context), then rerun the suite and remove the `knownGap` markers as each flips (XPASS forces this).
