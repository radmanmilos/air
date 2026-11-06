# AIR e2e round 3: what is fixed, what is missing, and what to do next

## 0. Verdict

**The product bugs found last round are mostly fixed, but the test suite still does not prove it.** In the real binary the command injection, late "Started job", dead `/cancel`, frozen chat and brainstorm-spawns-a-write-job bugs are gone. But when I broke AIR on purpose, the new tests caught only 1 of 5 breaks, and your own `npm run mutation:check` reports "1 passed, 2 failed" (it admits two of its three mutations go undetected). Several harness modules are not used by any test, the live suite has no test files, and one core oracle (`noOrphans`) can never fail. Do not mark T9-001..T9-007 done yet.

Basis: `radmanmilos/air` `main` at `7e3d342` (233 commits, 12 new since `fe912d8`), `radmanmilos/test` `main` at `80836ea`. Ran: build, typecheck, lint, `check:dist`, `npm test`, my own real-chat probes against the built binary, five deliberate mutations of AIR, and `npm run mutation:check`. Not verified: MCP run/cancel, failover, `air merge`, resume, any live tool, .NET baseline (no SDK in my sandbox), Windows.

## 1. Verified results

| Check | Result |
|---|---|
| build, typecheck, `typecheck:test`, lint, `check:dist` | Clean |
| `npm test` | 279 pass, 5 skipped; real `~/.cache/air` untouched |
| `npm run mutation:check` | **1 passed, 2 failed**: "Re-enable shell in brain" NOT detected, "Make cancel print only" NOT detected, "Sync brain" detected |
| `npm run e2e:live` | Config includes `tests/e2e/**/*.live.test.ts`; **no such file exists**, so the live suite runs nothing |
| Harness modules imported by any test | `chat-driver` (by `real-jobs.test.ts` only). **Not imported anywhere:** `known-gap`, `report`, `preflight`, `retry`, `mcp-client` |
| Root `.gitignore` | Saved as UTF-16 (`file` reports "data"); git does not honor it. `results/` shows as untracked (`?? results/`) |
| TaskBoard fixture | 17 xUnit tests (4+3+4+6), `// BUG-n` hint comments removed, `fixture.lock` read and hashed by `sandbox.ts`. Lives in the AIR repo, not in `radmanmilos/test` (which has the old console app plus a re-added `test_log.md`). No tag, no `tests/e2e/fixtures/acceptance/` |

## 2. Product fixes confirmed in the real binary

| Bug | Result now (built `air.js`, fake executors) |
|---|---|
| P-01 shell injection in chat | `what is this; touch PWN_CHAT` no longer creates the file; brain uses `cross-spawn` without a shell |
| P-02 job id only at the end | "Started job" appears at **0.2 s** for a 12 s job; "finished" at 12.2 s |
| P-03 `/cancel` | Job id visible at 2.2 s; after `/cancel <id>` **0** worker processes remained 5 s later (precise `ps` check). Note: an earlier quick check of mine counted 2 processes; that was a counting artifact (it matched the probe's own shell), the precise check shows none |
| P-04 chat freeze | With a 4 s brain call, `/status` was answered in about 0.8 s while the brain was still working |
| P-05 brainstorm spawns a write job | `How would you add caching to this app?` and `Should we refactor ...? trade-offs` now go to the brain; no job, no `air/*` branch, no worktree |
| Events | `AIR_EVENT_LOG` now emits all 8 documented events |
| Fixture | 17 tests, hints removed, lock hash checked |

## 3. Product gaps still open (the tests should capture these)

| ID | Gap | Evidence |
|---|---|---|
| P-06 | **The brain still gets no conversation history.** The code passes `conv.messages` (a stale in-memory object that is never updated; the real messages are on disk), so the history is always empty | Fake `kilo` that records its prompt: the second question's prompt was exactly `Tell me a fun fact about owls`, with no earlier turn and no job list. The same stale `conv` feeds `activeWorkIds` and the `status` action |
| P-07 | **`delete all the files` now spawns a WRITE job** (it was a chat answer before). No confirmation | `decide()` probe. It runs in a worktree, but a destructive request should ask first |
| P-08 | **Intent gaps remain:** `I want a function that returns the greeting` and `please make it say hello AIR` are answered, not executed; `cancel that` and `what is the status of my job?` go to the brain; `also add tests for it` starts an unrelated write job with no link to the previous one; `Can you brainstorm three ways to structure a todo list app?` now spawns a read-only job | `decide()` probe |
| P-09 | **Answers about repo files are ungrounded.** `what does Program.cs do` goes to a brain that cannot read the repo | `decide()` probe |
| P-10 | **`/cancel <unknown id>` prints "Cancelled <id>"** even when no such job exists; `air: thinking...` is printed without a newline and merges with later output | Code and transcript |

## 4. Test suite: why it still lacks teeth

### 4.1 Mutation results (I broke AIR, rebuilt, and ran the matching real scenario)

| Mutation of AIR | Scenario | Result |
|---|---|---|
| Brain made blocking (sync spawn) | `real: P-04` | **Not caught** (test passes in 0.3 s) |
| `shell: true` re-added to the brain | `real: P-01` (3 payloads) | **Not caught** |
| `/cancel` does nothing | `real: P-03` | **Not caught** |
| "Started job" delayed 6 s | `real: P-02` | **Not caught** (test took 6.4 s and passed) |
| Questions with add/refactor spawn a write job | `real: P-05` | **Caught** |

### 4.2 Why each test passes on a broken build

| Test | Cause |
|---|---|
| P-04 responsiveness | The message `What is this project?` routes to a **read-only job**, not to the brain, so no brain call happens. There is also no latency assertion: it waits up to 10 s for `messages=` and never compares the time to 2 s |
| P-01 injection | It asserts right after the first `air: ` line, which is `air: thinking...`, printed **before** the brain's command runs. With `shell: true` the sentinel appears about 50-80 ms later (I confirmed it exists when checked slightly later), so the test looks too early. Also, the e2e fake-executors folder has no `kilo` (it was renamed `kilocode`), so the brain path depends on the fake `opencode`, whose output is not the JSON the brain parses; the reply is `Acknowledged.` |
| P-03 cancel | It waits for a `Cancelled` line, which the chat prints regardless of effect, then calls `oracles.noOrphans`. **`noOrphans` can never return false:** on Linux its regexes are double-escaped in source (`/^\\d+$/`, `/\\0/g`), so they match a literal backslash and no process is ever inspected; on Windows it searches process **command lines** for a marker that exists only in the **environment** |
| P-02 "within 2 s" | No timing assertion (15 s timeout) and `FAKE_DELAY_MS=200`, so a blocking implementation looks identical |
| F-01 persistence | **No assertion at all.** It sends a message, sends `/status`, waits for the line `messages=`, and ends. It never checks the count, the file, or resume |
| L-01 write job | The key assertions are inside `if (stateFile exists) { if (worktreePath ...) { expect } }`, so they are silently skipped when anything is missing. It never runs `air merge` and never checks the changed-files list |
| A-01 onboarding | Only checks that a job started, finished and the tree is clean; no reply content or grounding check |

### 4.3 Remaining vacuous or misleading tests

`security.test.ts` still has a test named `H-01: Shell metacharacters in chat text` whose payload appears only in its title (it runs `air chat` with stdin ignored); `run-tasks.test.ts` still has `B-02`, `C-01`, `F-02`, `G-01` (any output passes; hard-coded string for voice); `mcp.test.ts` `K-01`/`K-02` start the server but never run a tool; `J-01` only lists models; `M-01..M-03` repeat `air status/models/dashboard`. Only some titles were renamed `SMOKE:`. The old IDs still collide with the scenario catalog.

### 4.4 Dead or missing harness pieces

- `known-gap.ts` (`it.fails`) is never used even though P-06..P-10 are known gaps; `report.ts`, `preflight.ts`, `retry.ts` and `mcp-client.ts` are not used by anything; no `results/` output is produced.
- No `*.live.test.ts` exists; `e2e:live` is an empty suite.
- `tests/e2e/fixtures/minimal` is turned into a nested git repo inside the AIR working tree by `fixture()` in `real-jobs.test.ts`.
- Not implemented from the catalog: B-02/B-03 refinement, C (bug fix on TaskBoard with `dotnet test`), D (features, hidden acceptance tests), E-01/E-04/E-05 (question during a job, parallel jobs, steering), F-02..F-04, the whole G group (failover with and without consent, no executors, hang/timeout, dirty tree, merge conflict, crash recovery), H-03..H-08, I-02..I-05, J-02/J-03, real MCP tool run and cancel, L-02..L-05, real soak (message burst, parallel processes).

## 5. Corrective instructions

### 5.1 Rules (unchanged, now enforced by the mutation gate)

1. A test is valid only if it **fails on a build with the targeted behavior broken**. `npm run mutation:check` is the gate: it must report every mutation detected before any task is marked done.
2. No assertion-free tests, no `if (x) { expect }` around the key assertion, no waiting on a line the product prints regardless of effect.
3. Timing requirements are asserted numerically (`expect(latencyMs).toBeLessThan(2000)`), measured from `AIR_EVENT_LOG` or the chat driver, never implied by a timeout.

### 5.2 Fix the harness defects

1. **`noOrphans`**: rewrite and unit test it with a real process. Linux: iterate `/proc/<pid>/environ` and `cmdline` using correctly escaped regexes (`/^\d+$/`, `/\0/g`); macOS: `ps -E`/`ps eww`; Windows: query processes and check `AIR_E2E_MARKER` via an approach that sees environment (or give workers a marker in **argv**, e.g. `--air-e2e-marker=<id>`, and search command lines). Unit tests: a spawned process carrying the marker makes it return `false`; after kill it returns `true`.
2. **Chat driver**: `latency(sentAt, pattern, timeoutMs)` returns milliseconds; add `waitForReply(afterMs)` that waits for the final reply line or the event `brain_end`/`job_finished`, not the `thinking...` prefix; expose events from `AIR_EVENT_LOG`.
3. **Fake brain**: add a fake `kilo` that implements `--version` and `run ... --format json`, prints one JSON `{type:"text", part:{text:...}}` line, supports `FAKE_DELAY_MS`, and **records the exact prompt it received** to a file the test can read (needed for history/grounding checks). Keep `kilocode` as the adapter fake.
4. Remove the nested-repo creation from `fixture()`; build fixtures in the sandbox from a tagged clone.
5. Re-save the root `.gitignore` as UTF-8 and verify with `git check-ignore results/x`.

### 5.3 Rewrite the weak tests (specifics)

| Test | Required change |
|---|---|
| P-04 | Use a non-repo question that routes to `answer` (for example `Explain the difference between async and threads`). Fake brain delay 6 s. Send `/status` 1 s later. Assert `latency < 2000` ms **and** that the brain call was still in flight (no `brain_end` yet). Add a second assertion that the final reply later arrives |
| P-01 | For every payload (`; touch SENTINEL`, `&& touch SENTINEL`, `` `touch SENTINEL` ``, `$(touch SENTINEL)`, `\| touch SENTINEL`, and Windows variants) wait for the **final reply or `brain_end`** (and a 500 ms settle), then assert the sentinel is absent and `gitClean` |
| P-02 | `FAKE_DELAY_MS=12000` for the worker; assert `Started job` appears within 2000 ms of the request and `finished` only after ~12 s; assert the id matches a task state file |
| P-03 | Start a 30 s job, `/cancel <id>`, then assert: task state `CANCELLED` within 5 s, `noOrphans` (fixed) true, worker really gone by process snapshot; also assert `/cancel unknown-id` says no such job (P-10) |
| F-01 | Send 5 messages, `/quit`, read the conversation file (assert 5+ user messages), restart with `--resume <id>`, ask for the first message and assert the fake brain's recorded prompt contains it (history). Mark the history assertion `knownGap('P-06')` until fixed |
| L-01 | Unconditionally read the task state, assert the worktree path exists and contains the edit; then run `air merge <id>` and assert the main tree changed only in the expected file |
| A-01 | Assert the reply or job result mentions a file that exists in the repo (`groundedFiles` oracle) |
| Old vacuous tests | Delete or fully rewrite `security H-01`, `run-tasks B-02/C-01/F-02/G-01`, `mcp K-01/K-02`, `J-01`, `soak M-01..M-03` (see 5.5 and the earlier catalog). One ID, one scenario, name equals content |

### 5.4 Make `mutation:check` real

Replace the three shallow mutations with a gate that runs the **real scenarios** against each mutation of AIR and requires them to fail. Minimum set (the first five I verified are currently undetected; they are the acceptance test for 5.3):

| Mutation | Must be caught by |
|---|---|
| Brain made blocking (replace async spawn with sync) | P-04 |
| `shell: true` in the brain spawn | P-01 |
| `/cancel` handler does nothing | P-03 |
| "Started job" printed after a delay | P-02 |
| Questions containing add/refactor spawn write jobs | P-05 |
| Conversation overwritten on quit | F-01 |
| History not passed to the brain | F-01 (history assertion, once P-06 is fixed) |
| Redaction removed | H-02 |
| Allow-list check skipped | failover scenario |
| Mock adapter registered in production | CLI state scenario |

Run it in CI nightly and before every "done" claim. Restore and rebuild after each mutation; fail the script if the working tree is dirty at the end.

### 5.5 Wire or remove the dead modules; build the missing groups

1. Use `knownGap` for P-06..P-09 (and keep XPASS behavior). Use `preflight` for SKIP reasons (dotnet, executors, brain, Ollama), `report` through a vitest reporter or `afterAll` that writes `results/<run>/summary.md` and `results.json`, `retry` only for classified infrastructure failures, and `mcp-client` in real MCP scenarios (tool run, stdout purity during a run, id equality between `run_task` and `get_task_status`, `cancel_task` with an orphan check).
2. Create the live suite: `tests/e2e/live/*.live.test.ts` for the live scenarios in the earlier catalog (A-02, B-04/B-05, C-03, D-01..D-05, H-02/H-03). Read `AIR_FIXTURE` from the environment; `SKIP` with a reason when tools or credentials are missing; a run with zero tests must fail, not pass.
3. Implement the missing scenario groups in section 4.4 in priority order: G (failure and recovery), E-01/E-04/E-05, F-02..F-04, C and D on TaskBoard with hidden acceptance tests, H-03..H-08, I-02..I-05, L-02..L-05, real soak.

### 5.6 Product fixes the tests will now demand (order)

1. **P-06**: build the brain prompt from the stored conversation (load from disk or update the in-memory object on every append), include a job digest (id, goal, state), and use the same fresh data for the `status` action and `activeWorkIds`.
2. **P-07/P-08**: destructive verbs (`delete`, `remove all`, `drop`, `wipe`) require confirmation before spawning; add write-intent patterns (`I want`, `please make`, `make it`, `can you add ...`); link `also ...` follow-ups to the previous job (parent id, summary in the brief); handle natural-language cancel/status; keep brainstorm out of jobs.
3. **P-09**: for questions about named repo files, route to a read-only job or give the brain a bounded repo context so answers are grounded.
4. **P-10**: `/cancel` of an unknown id says so; print `thinking...` on its own line or use a spinner that cannot merge with output.

### 5.7 Hygiene and documentation

- Move or duplicate TaskBoard into `radmanmilos/test` with a tag `baseline-v1` (the lock hash already exists), or drop the claim; add the missing fixture files from the earlier spec (README, CONTRIBUTING, `docs/` noise, `docs/INJECTION_TEST.md`, fake secrets file, 2 MB data file, CLI smoke script) and `tests/e2e/fixtures/acceptance/` for FEAT-1..4. Remove `test_log.md` from the fixture repo again.
- `docs/testing.md`: remove "hidden acceptance tests" and the live-suite claim until they exist; keep the "production-test.ps1 unchanged" note or replace the script with a wrapper over the Node harness.
- Reopen T9-001, T9-003, T9-005, T9-006, T9-007 in the task list until acceptance below passes.

## 6. Acceptance for this round

1. `npm run mutation:check` reports **every** mutation in 5.4 detected, with the real scenarios as detectors (and exits non-zero otherwise).
2. `noOrphans` has positive and negative unit tests using a real marked process; the P-03 test fails when `/cancel` is a no-op.
3. P-01, P-02, P-03, P-04, F-01 and L-01 are rewritten as in 5.3 and each fails on its mutation.
4. `knownGap` markers exist for every open gap in section 3, and `npm run e2e:det` reports them as KNOWN_GAP, not PASS.
5. `npm run e2e:live` runs at least the listed live scenarios, or fails with a clear "no tests" / SKIP report; `results/` output is produced and git-ignored (verified with `git check-ignore`).
6. The remaining scenario groups in 4.4 exist or are listed in the task file as open with owners, and `docs/testing.md` states only what exists.
