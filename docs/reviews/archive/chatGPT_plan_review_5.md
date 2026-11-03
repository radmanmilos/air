# AIR — refreshed release-readiness review

**Review date:** November 3, 2026  
**Repository:** [radmanmilos/air](https://github.com/radmanmilos/air)  
**Branch:** `main`  
**Latest commit reviewed:** [`e382d13825ffa0b370dee37c62d8c903b8c52ef4`](https://github.com/radmanmilos/air/commit/e382d13825ffa0b370dee37c62d8c903b8c52ef4)  
**Latest functional-code change found:** November 2, 2026, commit [`a028d4ffdedb5dd1b4ed1dc028bac8f45e0aff59`](https://github.com/radmanmilos/air/commit/a028d4ffdedb5dd1b4ed1dc028bac8f45e0aff59)

## Executive verdict

**Better than the November 2 review, but still not release-ready.**

There has been meaningful progress. The CI workflow now runs build, lint and package smoke steps; package metadata and ESM import fixups were added; documentation is more accurate; cancellation is now tracked separately from provider failures; and an MCP client/server round-trip test was added.

However, important implementation defects remain in the features the project advertises:

1. A second process can incorrectly evict another live process's lock or concurrency seat.
2. Normal cross-provider Aider/Goose failover is still filtered out before the approval flow can run.
3. An untrusted repository can add itself to the `trustedRepos` list used to approve its own `verify.command`.
4. MCP task output is still written to stdout, the same stream used by the stdio JSON-RPC transport.
5. The streaming redactor can leak a bearer credential when its scheme is lowercase and split across output chunks.
6. CLI failover compares the final attempt against a new per-hop snapshot, so changes made by a failed first provider can be omitted from the final result.

The model recommender, multi-session execution, byte-accurate output capture, workspace delta detection and output retrieval also remain incomplete.

### Capability scorecard

| Advertised capability | Assessment | Why |
|---|---|---|
| Model listing | Partial | Lists available adapter declarations, not a live provider model inventory |
| Best-model recommendation | Incomplete | Ignores the supplied task and chooses the cheapest headless adapter |
| Multi-session parallel execution | Not demonstrated | Seat cap is hard-coded to 1; returned handles arrive only after all jobs settle |
| Inter-process coordination | Broken | A contender treats a live holder's different process-start timestamp as proof of staleness |
| Byte-accurate output limits | Incorrect for Unicode | UTF-8 byte counts are combined with UTF-16 string slicing and per-chunk decoding |
| Streaming redaction | Partial / security bug remains | Lowercase split bearer schemes bypass the streaming guard |
| Workspace delta detection | Partial | Path-membership comparison misses edits to already-dirty paths; CLI baseline resets per failover hop |
| Verify trust gating | Bypassable | Repo config can populate the trusted-repo list used to authorize repo config |
| Failover semantics | Broken for default providers | Initial allow-list blocks the alternate provider before approval; MCP `auto` flag is not carried into the checked field |

---

## What changed since the November 2 review

### Improvements confirmed in source

- `.github/workflows/ci.yml` now runs app/test typechecks, tests, `npm run build`, `npm run lint`, `npm pack --dry-run`, `npm pack`, and a package install/CLI smoke test.
- `package.json` now has a Node-based `prebuild` cleanup and a `postbuild` import fixup so compiled relative imports receive `.js` extensions for ESM execution.
- README and behavior-spec documentation were updated, including current known limitations, CLI quick start and exit-code meanings.
- `zod` was upgraded to `^4.6.7`.
- Cancellation now has a separate health counter (`recordCancellation`) and MCP now persists a cancelled terminal state correctly.
- MCP tests now use an SDK `Client` and linked `InMemoryTransport` pair to exercise real tool registration and tool calls.
- `SECURITY.md` records the November 2 audit rationale: 19 reported vulnerabilities were classified as development-only, with production dependencies reported clean at that time.

### Important qualification

The new MCP test is **not a process-level stdio test**. It uses `InMemoryTransport`; it does not launch `air mcp` with `StdioServerTransport`, so it cannot catch child output contaminating process stdout.

The latest commit on November 3 only adds the archived November 1 review document. The functional source fixes inspected here were committed on November 2. The GitHub connector's available workflow-run lookup returned no runs for the latest commit because that lookup is limited to PR-triggered runs; the combined status response was empty. I therefore cannot independently certify that the latest push CI passed. The workflow definition has improved, but a configured step is not evidence of a successful latest run.

---

# P0 — release blockers

## R6-01 — Cross-process lock recovery marks another live process's lock stale

**File:** `src/utils/lock.ts`

A lock file records the owner's PID and process-start timestamp. The contender compares the stored timestamp with its own module-level `PROCESS_START`:

```ts
if (existing.start !== PROCESS_START || !(await isPidAlive(existing.pid))) {
  stale = true;
}
```

Those timestamps belong to different processes and are expected to differ. Therefore, when process B sees a lock held by live process A, `existing.start !== PROCESS_START` is true and B treats A's lock as stale, unlinks it and creates its own lock.

This defeats the inter-process mutual-exclusion guarantee used by health flushes and task-index updates.

There is also a stale-reclamation race: contenders read a stale file and later unlink by path. One contender can remove a replacement lock created after its earlier read. Release ownership is based on PID/start only and has no unique acquisition token.

**Fix required**

- Check the liveness/identity of the PID recorded in the lock file; do not compare the holder's start time with the contender's own start time.
- Use a unique acquisition token and require it to match on release.
- Make stale reclamation ownership-safe; do not unlink a path based on an earlier, potentially stale read.
- Add a test that spawns two independent Node processes: process A holds the lock, process B must not acquire or remove it, and B must succeed only after A releases. Retain a dead-owner recovery test.

The existing tests acquire twice inside the same process and use a fabricated dead PID. They do not exercise the cross-process ownership case.

## R6-02 — Concurrency seats have the same stale-owner bug and a count/reserve race

**File:** `src/utils/concurrency.ts`

`isSeatStale()` repeats the same invalid comparison:

```ts
if (data.start !== PROCESS_START) return true;
```

A live seat created by another process is therefore liable to be deleted as stale.

Even after fixing that, the global seat cap is not atomic. The allocator counts files, checks `current < maxConcurrent`, and then creates a uniquely named seat. Two processes can both observe the last free slot and each create a different file. `O_EXCL` prevents duplicate names; it does not make the count-and-reserve operation atomic.

**Fix required**

Use an atomic slot allocator (for example, fixed slot files protected by a correctly implemented allocator lock) and safe stale-owner recovery. Add multi-process contention tests that race several child processes for the last slot and prove the configured cap is never exceeded.

## R6-03 — Provider allow-list prevents the normal Aider-to-Goose failover flow

**Files:** `bin/air.ts`, `src/mcp/server.ts`, `src/router/router.ts`, `src/security/allowlist.ts`

The CLI initializes its allow-list with `defaultAllowList(adapters)` before selecting the first candidate. That helper defaults to `adapters[0]`. If Aider is cooling down, Goose can be blocked by the Aider-derived allow-list during initial selection.

After a first candidate is chosen, the CLI narrows the allow-list to that exact provider and model. When Aider is selected, `selectCandidateFrom()` uses the same allow-list while searching for the next candidate. Goose is filtered as `allow_list_blocked` before the code can reach the approval proposal.

MCP has the same second-hop problem: it starts with an empty allow-list, selects a candidate, then narrows the list to the chosen provider/model. `resolveNextCandidate()` subsequently applies that narrow list, so the alternate provider is excluded before approval.

The verified adapters declare different identities:

- Aider: `openrouter / gemma-4-31b-it:free`
- Goose: `openai / gpt-4o`

So the advertised default cross-provider failover path cannot be exercised with the built-in verified pair. The later `checkHandoffAllowlist()` check in the CLI does not fix this because candidate selection has already filtered the alternative out.

**Fix required**

Separate candidate discovery from authorization:

1. Find viable alternatives without silently hiding a provider change.
2. In `ask` mode, disclose the exact destination provider/model and handoff payload, then request explicit one-task consent.
3. Bind approval to that exact proposal (including a proposal or payload hash) and reject stale approvals.
4. In `auto` mode, permit only destinations explicitly allowed by policy; never bypass provider restrictions.
5. Select the initial candidate first, then derive the initial policy from the actual selected candidate.

Add end-to-end CLI and MCP tests with two mock adapters on different providers: A rate-limits, AIR proposes B, approval runs B against the same workspace, decline does not run B, and auto mode cannot silently cross providers.

## R6-04 — Repository config can authorize its own verify command

**Files:** `src/config/loader.ts`, `src/config/schema.ts`, `src/context/verify.ts`, `bin/air.ts`

`loadConfig({ cwd })` merges global config and then repo `.airrc.yaml` into the same `Config` object. The schema allows `trustedRepos` in that object. `air verify-repo` then passes `config.trustedRepos` to `checkVerifyTrust()` as if that list were guaranteed to come from global/user-controlled configuration.

It is not. An untrusted repo can place its own path (or an ancestor path) in `.airrc.yaml` under `trustedRepos`, set `verify.enabled: true`, and provide `verify.command`. The trust check can then accept the command based on data loaded from the repository it is intended to distrust.

This defeats the stated source-of-trust boundary.

**Fix required**

- Load the trusted-repository list only from a separate global/user-controlled trust source.
- Ignore or reject `trustedRepos` in repo config.
- Canonicalize paths (realpath, case and separator normalization, symlink handling) before comparing them.
- Add an integration test invoking `verify-repo` in a repo whose `.airrc.yaml` tries to trust itself. It must refuse unless the repo was separately trusted globally.

The current unit tests call `checkVerifyTrust()` directly with an already-supplied list; they do not test config provenance.

## R6-05 — MCP child output still contaminates the stdio JSON-RPC stream

**File:** `src/mcp/server.ts`

`runAttempt()` passes an `onStdout` callback that calls:

```ts
process.stdout.write(c);
```

`startMcp()` defaults to `StdioServerTransport`, which uses stdout for JSON-RPC protocol messages. Arbitrary text from an agent is therefore written into the same stream as protocol frames. This can make an otherwise valid MCP client fail to parse responses.

The newer integration test does not catch this: `tests/mcp-async.test.ts` creates linked `InMemoryTransport` instances and calls tools through an SDK client. It never launches the stdio server process and never captures its stdout.

**Fix required**

- Never send child stdout to process stdout in MCP mode.
- Persist redacted output and expose it through `get_task_output`; optionally use structured MCP notifications.
- Keep diagnostics on stderr.
- Add a process-level test that launches `air mcp`, drives JSON-RPC over stdin/stdout, runs a fake agent that emits arbitrary stdout/stderr, and verifies every stdout frame remains valid JSON-RPC.

---

# P1 — correctness, security and advertised-feature gaps

## R6-06 — Lowercase bearer credentials can leak across stream chunks

**Files:** `src/security/streaming-redact.ts`, `src/security/redact.ts`

The new streaming redactor is structurally better than the previous implementation: it withholds a suffix and attempts to avoid emitting a cut through a detected secret.

But its prefix detection is case-sensitive:

- `TOKEN_PREFIXES` contains `Bearer`, not lowercase/mixed-case variants.
- `couldBeTokenPrefix()` performs case-sensitive comparisons.
- `BEARER_DETECT` is `/Bearer.../` without the case-insensitive flag, while the replacement regex `BEARER_RE` is case-insensitive.

A concrete split-boundary case is:

- chunk 1: `bearer `
- chunk 2: `opaque-long-token-value`

For the first chunk, `containsSecret()` does not recognize lowercase `bearer`, and the prefix guard does not retain it. The scheme is emitted. The second chunk no longer contains the scheme, so the bearer detector cannot redact the credential. The complete one-shot `redact()` path is case-insensitive, but the streaming path has already emitted the prefix separately.

The same detector/guard inconsistency should be checked for mixed-case credential flags.

**Fix required**

Make detection and prefix guarding case-insensitive wherever replacement is case-insensitive. Add exhaustive chunk-boundary tests for lower/mixed-case `Bearer`, flags, token prefixes and environment assignments. Assert concatenated emitted chunks plus flush equal the one-shot redacted string and never contain the original credential.

## R6-07 — Handoff sends tracked diff and untracked-file content without redaction

**File:** `src/context/handoff.ts`

`buildHandoffPack()` redacts `outputTail`, but does not redact:

- tracked diff text from `git diff HEAD`;
- newly untracked file contents read from disk;
- other raw workspace text included in the pack.

Those strings are inserted into the next provider's prompt. Secret redaction in the process runner does not protect secrets already present in the working tree.

The CLI's approval prompt prints only the first handoff line (`# air handoff`) rather than a meaningful preview of the content being transferred.

**Fix required**

Redact every handoff source before serialization. Add fake-secret tests for tracked diffs and untracked files. Show a meaningful preview (changed paths, payload size, redaction/omission summary) before consent and bind that approval to the exact payload.

This issue becomes especially important when R6-03 is fixed and cross-provider transfers are enabled.

## R6-08 — ESM handoff cannot read newly untracked file contents

**File:** `src/context/handoff.ts`

The project declares `"type": "module"`, but `readFileContent()` calls `require('node:fs')`. In native ESM, `require` is not defined. The error is swallowed by the function's `try/catch`, which returns `null`; newly created untracked files are consequently reported as unreadable and omitted from the handoff.

Use an ESM import (`readFileSync` or `readFile`) and add a test against the compiled package runtime. Fix this together with R6-07; do not restore raw unredacted transfer.

## R6-09 — Multi-session execution is serialized and its handles arrive too late

**Files:** `src/execution/sessions.ts`, `src/utils/concurrency.ts`, `bin/air.ts`, `tests/sessions.test.ts`

`runSession()` calls `withSeat(id, 1, ...)`, hard-coding the global cap to one instead of using `config.concurrency.maxConcurrentAgents`. With the seat allocator working as intended, different session IDs still serialize once the first seat is held.

`runSessions()` awaits `Promise.allSettled()` for all session promises before returning the handles. A caller cannot use the returned handles to cancel or manage a session while the group is running.

The test named “runs multiple sessions concurrently” only checks that two handles are returned. The cancellation test calls `runSessions()` to completion and then cancels a session, so it does not prove cancellation of a live process.

The CLI also maps sessions to adapters by `adapters[i % adapters.length]`; it can silently reuse a model, and if no adapter is available it indexes an empty array. Finally, all CLI sessions use the same `cwd`, so once genuine parallel writes are enabled they can race over the same files and Git index.

**Fix required**

- Pass the configured concurrency limit through `SessionConfig`.
- Return handles immediately; provide a separate aggregate wait operation.
- Fail clearly when no adapters are available or model capacity is insufficient.
- Define write-session isolation (separate worktrees/directories or an explicit read-only constraint).
- Test peak concurrency and cancellation while both tasks are still running.

## R6-10 — Model recommendation ignores the task; model identity can be fictitious

**Files:** `src/router/catalog.ts`, `bin/air.ts`, `src/adapters/registry.ts`, `src/adapters/aider.ts`, `src/adapters/goose.ts`

`air models --best <task>` receives the task string but the CLI does not pass it to the recommender. It calls `formatBestModel(catalog, { mode: 'ask', readOnly: false })`. `bestModelFor()` ignores even those two fields and simply picks the cheapest available headless adapter.

The capability mapping is also not meaningful: `code` and `write` are inferred from `headlessExecution`, while `reasoning` and `read` are inferred from `supportsStreaming`.

The catalog's provider/model declaration is not guaranteed to match the actual command:

- Aider passes `--model` only when `task.preferredModel` is set; its default command does not explicitly select the declared Gemma model.
- Goose runs `goose run --text ...` without explicitly selecting the declared OpenAI/GPT-4o identity.
- Registry config can override provider/model metadata, but command builders do not consume those overrides.
- `ToolConfig.executable` is accepted but ignored by the inspected registry/command path.
- `air models` and MCP adapter discovery do not consistently pass loaded config to `availableAdapters()`.

**Fix required**

Pass the actual task into a real capability matcher. Separate capability fields from headless/streaming flags. Ensure the model/provider shown in the catalog is exactly what the adapter will invoke, or label it as an unverified/default CLI configuration. Implement or remove unsupported executable/provider/model overrides.

## R6-11 — Output limits are not byte-safe for Unicode

**Files:** `src/execution/runner.ts`, `src/types/outcome.ts`

The runner counts UTF-8 bytes with `utf8Bytes()`, but trims using JavaScript string indexes:

```ts
stdout += text.slice(0, remaining);
```

JavaScript string indexes are UTF-16 code units, not UTF-8 bytes. With multi-byte characters, the retained output may exceed the configured cap or split a surrogate pair. The rolling-tail loop also drops characters with `slice(1)` while comparing UTF-8 byte lengths.

Each incoming OS `Buffer` is converted with `buf.toString()` independently. If a multi-byte UTF-8 character is split between process chunks, it can be decoded as replacement characters.

**Fix required**

Use a streaming decoder such as `StringDecoder`; enforce caps on byte buffers or at code-point-safe UTF-8 boundaries; define whether the byte counters describe total stream bytes or retained bytes. Add non-ASCII and split-buffer tests that assert both exact byte limits and uncorrupted text.

## R6-12 — Workspace delta misses edits to an already-dirty path

**File:** `src/context/checkpoint.ts`

`snapshotDelta()` compares only whether each path appears in the staged/unstaged/untracked name lists. If a file is already dirty before a run and the agent modifies the same file again, it remains in the same status list and the function reports no delta.

The current tests cover adding a new file next to an unrelated pre-existing edit; they do not modify the same pre-existing dirty path.

**Fix required**

Capture content-sensitive baselines (index/worktree hashes, untracked-file hashes and HEAD) and compare against the final state. Include rename, deletion and commit cases. Add a regression test that modifies an already-dirty file a second time and expects a delta.

## R6-13 — CLI failover resets the result baseline at every hop

**File:** `bin/air.ts`

The CLI captures `beforeSnap` inside the `while (hops < maxHops)` loop, immediately before each attempt. If provider A makes useful workspace changes and then fails (for example, it hits a rate limit after editing a file), provider B starts with those changes already present. If B succeeds without making further edits, the final attempt's delta is empty and AIR records `NO_CHANGES`.

The run-level result should include all changes since the initial task snapshot, not only changes made by the last provider.

**Fix required**

Capture one immutable task baseline before the first attempt and use it for the terminal result across all hops. Keep per-attempt snapshots separately for diagnostics. Add a two-adapter integration test in which A changes a file then rate-limits, B succeeds without further edits, and the final result is `SUCCEEDED_WITH_CHANGES`.

## R6-14 — Write tasks are not refused outside a Git repository

**Files:** `src/context/checkpoint.ts`, `bin/air.ts`, `src/mcp/server.ts`, `src/execution/sessions.ts`

`snapshotGit()` returns `isGitRepo: false` and `dirty: false` when `git rev-parse` fails. The CLI and MCP write guards check `snap.dirty`; they do not check `!snap.isGitRepo`. The write task can therefore proceed in a non-Git directory even though `formatDirtyReport()` says write-capable work should be refused there.

**Fix required**

Define the intended policy and enforce it explicitly. If Git evidence is required for safe write results, refuse non-Git write tasks unless the user opts into a clearly documented alternate mode. Add CLI/MCP/session tests.

## R6-15 — Health counter increments can still overwrite concurrent updates

**File:** `src/health/tracker.ts`

The lock around `flush()` protects the read-modify-write operation, but the merge still does:

```ts
successes: { ...base.successes, ...snapshot.successes }
```

Two processes can load the same count, each increment it once, and then flush sequentially. The later flush writes its stale absolute count over the first process's increment. The lock cannot make stale snapshots additive.

This remains a defect even after R6-01 is corrected.

**Fix required**

Track per-tracker increments since load and apply the increments inside the locked mutation, or perform counter increments through a locked storage operation. Test with two independent child processes that each record one success and verify the stored count rises by two.

## R6-16 — MCP output retrieval drops stderr

**Files:** `src/mcp/server.ts`, `src/execution/task-state.ts`, `src/execution/runner.ts`

The runner collects separate `stdoutTail` and `stderrTail`, but persisted task state has a single `outputTail`. MCP writes only `outcome.stdoutTail` to it. `get_task_output` then returns only that field even though the tool description says it returns stdout/stderr.

A provider that emits the reason for failure only on stderr can therefore leave the MCP caller with no useful diagnostic.

**Fix required**

Persist and return separately labeled redacted stdout and stderr tails with per-stream truncation metadata, or construct a clearly labeled combined tail. Test a mock failure where the diagnostic is emitted only to stderr.

## R6-17 — Cancellation health tracking is improved, but CLI/session terminal state is still wrong

**Files:** `bin/air.ts`, `src/execution/sessions.ts`

The November 2 fix correctly separates cancellation counts from provider failure counts, and MCP now maps cancellation to `state: 'CANCELLED'`.

However, the CLI and session runner still map only successful result values to `COMPLETED`; every other result is written as `FAILED`. `CANCELLED` is therefore persisted as `FAILED` in those paths even though the result field says `CANCELLED`.

**Fix required**

Map cancelled outcomes to terminal `CANCELLED` consistently in CLI and sessions. Add persisted-state tests, not only process exit-code assertions.

## R6-18 — MCP auto mode is not passed to the field the failover code reads

**File:** `src/mcp/server.ts`

The `run_task` input accepts `auto`, but constructs `taskInput` with `mode: args.auto ? 'auto' : 'ask'` and does not set an `auto` property. The failover branch tests `job.taskInput.auto`.

Thus the MCP `auto` flag is not available where the auto-switch decision is made. The same source path also does not consistently apply configured `failover.mode` and `allowProviderSwitch`.

**Fix required**

Use one typed runtime task-options structure; pass and test the explicit auto/ask policy end to end. Do not infer it from a similarly named mode field in some call sites and a separate boolean in others.

## R6-19 — Configuration accepts settings that execution does not consistently apply

**Files:** `src/config/schema.ts`, `src/config/loader.ts`, `src/adapters/registry.ts`, `bin/air.ts`, `src/mcp/server.ts`, `src/execution/sessions.ts`

The schema accepts `failover.mode`, `allowProviderSwitch`, `timeouts.perTool`, `concurrency.maxConcurrentAgents`, tool enablement/executable/provider/model overrides and permission settings. The inspected runtime paths do not consistently apply them:

- CLI task mode is based on `--auto`, not `config.failover.mode`.
- MCP checks `taskInput.auto`, which is not populated, and uses fixed cooldown values in the inspected path.
- `timeouts.perTool` is not used by the inspected run paths.
- Sessions hard-code a seat cap of one.
- MCP adapter discovery does not pass the loaded config.
- `ToolConfig.executable` is not used to spawn the configured executable.
- Provider/model config overrides can change displayed metadata without changing the command.

**Fix required**

Create one resolved runtime configuration object and pass it consistently to the CLI, MCP, registry, runner and session manager. For every accepted field, add a test that demonstrates a real runtime effect. Remove any configuration option that is not supported instead of silently accepting it.

## R6-20 — Malformed config can be silently treated as missing config

**File:** `src/config/loader.ts`

The global and repo config load/parse operations are wrapped in broad `try/catch` blocks with empty catch bodies. A YAML parse error is therefore swallowed in the same way as a missing file, and `loadConfig()` returns defaults without reporting the invalid configuration.

`air config --validate` uses `loadConfig()` and checks the returned `errors`, so this path may report a malformed config as valid/default rather than surfacing the YAML error. `validateConfigFile()` does report parse failures, but the CLI command does not use it for the selected config files.

**Fix required**

Treat `ENOENT` as optional/missing, but report parse and other I/O errors. Ensure `air config --validate` validates the actual global and repo files and fails closed when policy configuration cannot be parsed.

---

# P2 — tests, docs and release hygiene

## R6-21 — The MCP integration test is useful but its “stdio” label overstates what it verifies

**File:** `tests/mcp-async.test.ts`

This test is a genuine SDK client/server tool-call round trip, which is an improvement over direct helper calls. But it uses `InMemoryTransport.createLinkedPair()`. It does not launch the executable or exercise `StdioServerTransport`, OS pipes, stdout cleanliness or process termination.

Rename it to an in-memory MCP integration test and add the process-level stdio test described in R6-05. Keep both.

## R6-22 — Multi-process guarantees still have only same-process tests

**Files:** `tests/lock.test.ts`, `tests/concurrency.test.ts`

Despite the “cross-process” names, tests call the APIs twice from the same Node process. These tests cannot reproduce the different-process-start value that causes the stale-owner defect, nor can they prove the global count/reserve operation is atomic.

The new tests should launch independent processes and coordinate them through pipes/marker files. Test lock ownership, stale recovery, seat capacity and concurrent health increments.

## R6-23 — Security audit rationale is documented but not enforced by CI

**Files:** `SECURITY.md`, `.github/workflows/ci.yml`

`SECURITY.md` documents 19 development-dependency vulnerabilities, including two critical `tinypool` advisories, and states that production dependencies were clean as of November 2, 2026. This is transparent and better than ignoring the audit.

However, the workflow does not run `npm audit --omit=dev` or another production-dependency audit. The document has a re-audit trigger, but CI does not enforce it.

Add a production-dependency audit step (or a reviewed, pinned advisory policy) and keep development-toolchain exceptions explicit. Re-check the audit rather than assuming the November 2 state remains current.

## R6-24 — README's parallel-execution and coordination claims are ahead of verified behavior

**File:** `README.md`

The README now has improved known-limitations and setup sections. But it still claims that multiple tasks run concurrently and that lock files provide inter-process coordination. The current implementation and tests do not substantiate those claims because of R6-01, R6-02 and R6-09.

After fixing those issues, update the README with tested limits and state the workspace-isolation model. Until then, qualify those capabilities as experimental/incomplete.

---

# Recommended implementation order

1. **Security boundaries and protocol safety:** R6-04 (verify trust provenance), R6-05 (MCP stdout), R6-06 (streaming credential leak), and R6-07 (redact handoff payloads).
2. **Restore real failover:** R6-03 and R6-18. Prove two-provider CLI and MCP flows with approval, decline and auto policy tests.
3. **Make coordination real:** R6-01, R6-02 and R6-15. Use independent processes; same-process tests are not enough.
4. **Finish session behavior:** R6-09, with an enforced configured cap, early handles, live cancellation and workspace isolation.
5. **Make success evidence trustworthy:** R6-12, R6-13, R6-14, R6-17 and R6-20.
6. **Make output, redaction and handoff correct:** R6-08, R6-11 and R6-16.
7. **Make catalog and config honest:** R6-10 and R6-19.
8. **Enforce CI audit/tests and update docs:** R6-21 through R6-24.

## Minimum acceptance gate before release

- [ ] A repo cannot self-add to the trusted-repository list through `.airrc.yaml`.
- [ ] A second process cannot evict or release another live process's lock.
- [ ] A configured cross-process concurrency cap cannot be exceeded under contention.
- [ ] Two provider identities can complete A-fails → proposal → approve → B-continues; decline never starts B.
- [ ] CLI final result includes changes made by all failover hops.
- [ ] MCP stdout is valid JSON-RPC even when the agent prints arbitrary text.
- [ ] Lowercase and mixed-case bearer credentials split at every possible chunk boundary never leak.
- [ ] Tracked diff and untracked file secrets are redacted before handoff; untracked files work in compiled ESM.
- [ ] `air models --best` uses the actual task requirements and reports the execution identity actually selected by the adapter.
- [ ] Session handles are usable while jobs are running; a configured cap of two permits two active sessions but never three.
- [ ] Concurrent sessions do not write to the same workspace without an explicit isolation/coordination policy.
- [ ] Unicode-heavy output is not corrupted and retained output never exceeds configured byte caps.
- [ ] An additional edit to an already-dirty file is detected.
- [ ] A write-capable task outside Git follows an explicit, tested policy.
- [ ] `get_task_output` exposes both stdout and stderr with accurate truncation metadata.
- [ ] Cancellation is persisted as `CANCELLED` in every execution path and never counted as provider failure.
- [ ] Invalid YAML causes `air config --validate` to fail.
- [ ] CI runs build, lint, package smoke, production dependency audit, real multi-process coordination and process-level MCP stdio tests on supported platforms.

## Bottom line

The project is moving in the right direction, and the new build/package checks and cancellation accounting are worthwhile improvements. But the newly advertised features still need proof at their actual boundaries. The cross-process coordination code is not safe across processes; the standard verified-provider failover path is blocked; verify trust can be sourced from untrusted repo config; and the MCP stdio output path can corrupt the protocol.

I would not add more adapters or new capabilities yet. Close the P0 items, add the independent-process and actual-stdio tests, then re-run the full CI matrix. Once those tests pass on the latest commit, reassess the remaining P1 items before calling the project release-ready.

---

## Source links (pinned to the reviewed commit)

- [Latest reviewed commit `e382d13`](https://github.com/radmanmilos/air/commit/e382d13825ffa0b370dee37c62d8c903b8c52ef4)
- [CI workflow](https://github.com/radmanmilos/air/blob/e382d13825ffa0b370dee37c62d8c903b8c52ef4/.github/workflows/ci.yml)
- [README](https://github.com/radmanmilos/air/blob/e382d13825ffa0b370dee37c62d8c903b8c52ef4/README.md)
- [Security audit notes](https://github.com/radmanmilos/air/blob/e382d13825ffa0b370dee37c62d8c903b8c52ef4/SECURITY.md)
- [Config loader](https://github.com/radmanmilos/air/blob/e382d13825ffa0b370dee37c62d8c903b8c52ef4/src/config/loader.ts)
- [Config schema](https://github.com/radmanmilos/air/blob/e382d13825ffa0b370dee37c62d8c903b8c52ef4/src/config/schema.ts)
- [CLI](https://github.com/radmanmilos/air/blob/e382d13825ffa0b370dee37c62d8c903b8c52ef4/bin/air.ts)
- [Router](https://github.com/radmanmilos/air/blob/e382d13825ffa0b370dee37c62d8c903b8c52ef4/src/router/router.ts)
- [Model catalog](https://github.com/radmanmilos/air/blob/e382d13825ffa0b370dee37c62d8c903b8c52ef4/src/router/catalog.ts)
- [Adapter registry](https://github.com/radmanmilos/air/blob/e382d13825ffa0b370dee37c62d8c903b8c52ef4/src/adapters/registry.ts)
- [Aider adapter](https://github.com/radmanmilos/air/blob/e382d13825ffa0b370dee37c62d8c903b8c52ef4/src/adapters/aider.ts)
- [Goose adapter](https://github.com/radmanmilos/air/blob/e382d13825ffa0b370dee37c62d8c903b8c52ef4/src/adapters/goose.ts)
- [Lock implementation](https://github.com/radmanmilos/air/blob/e382d13825ffa0b370dee37c62d8c903b8c52ef4/src/utils/lock.ts)
- [Concurrency seats](https://github.com/radmanmilos/air/blob/e382d13825ffa0b370dee37c62d8c903b8c52ef4/src/utils/concurrency.ts)
- [Health tracker](https://github.com/radmanmilos/air/blob/e382d13825ffa0b370dee37c62d8c903b8c52ef4/src/health/tracker.ts)
- [Sessions](https://github.com/radmanmilos/air/blob/e382d13825ffa0b370dee37c62d8c903b8c52ef4/src/execution/sessions.ts)
- [Process runner](https://github.com/radmanmilos/air/blob/e382d13825ffa0b370dee37c62d8c903b8c52ef4/src/execution/runner.ts)
- [Streaming redactor](https://github.com/radmanmilos/air/blob/e382d13825ffa0b370dee37c62d8c903b8c52ef4/src/security/streaming-redact.ts)
- [Redaction patterns](https://github.com/radmanmilos/air/blob/e382d13825ffa0b370dee37c62d8c903b8c52ef4/src/security/redact.ts)
- [Provider allow-list](https://github.com/radmanmilos/air/blob/e382d13825ffa0b370dee37c62d8c903b8c52ef4/src/security/allowlist.ts)
- [MCP server](https://github.com/radmanmilos/air/blob/e382d13825ffa0b370dee37c62d8c903b8c52ef4/src/mcp/server.ts)
- [MCP integration test](https://github.com/radmanmilos/air/blob/e382d13825ffa0b370dee37c62d8c903b8c52ef4/tests/mcp-async.test.ts)
- [Handoff packer](https://github.com/radmanmilos/air/blob/e382d13825ffa0b370dee37c62d8c903b8c52ef4/src/context/handoff.ts)
- [Workspace checkpoint](https://github.com/radmanmilos/air/blob/e382d13825ffa0b370dee37c62d8c903b8c52ef4/src/context/checkpoint.ts)
- [Verify trust gate](https://github.com/radmanmilos/air/blob/e382d13825ffa0b370dee37c62d8c903b8c52ef4/src/context/verify.ts)
- [Task state](https://github.com/radmanmilos/air/blob/e382d13825ffa0b370dee37c62d8c903b8c52ef4/src/execution/task-state.ts)
- [Lock tests](https://github.com/radmanmilos/air/blob/e382d13825ffa0b370dee37c62d8c903b8c52ef4/tests/lock.test.ts)
- [Concurrency tests](https://github.com/radmanmilos/air/blob/e382d13825ffa0b370dee37c62d8c903b8c52ef4/tests/concurrency.test.ts)
- [Session tests](https://github.com/radmanmilos/air/blob/e382d13825ffa0b370dee37c62d8c903b8c52ef4/tests/sessions.test.ts)
- [Catalog tests](https://github.com/radmanmilos/air/blob/e382d13825ffa0b370dee37c62d8c903b8c52ef4/tests/catalog.test.ts)
- [Workspace-delta tests](https://github.com/radmanmilos/air/blob/e382d13825ffa0b370dee37c62d8c903b8c52ef4/tests/dirty-tree.test.ts)
