# AIR — Full Repository, Architecture, and Implementation Review

> **Target:** `https://github.com/radmanmilos/air`  
> **Branch:** `main`  
> **Review date:** 2026-10-31  
> **Reviewed HEAD:** `6e5db22bc788f3066da6e282851eefef80450dd9`  
> **Latest commit reviewed:** `Phase 5: verify hook, README, behavior-spec updates`  
> **Review type:** Fresh end-to-end source review, not a delta-only review  
> **Priority order:** Correct runtime behavior and user-data safety > reliable failover > MCP correctness > observability and polish

---

## 0. Instructions to the implementation agent

This review replaces none of the prior review history, but it is the current implementation-focused assessment. Read it together with the current `PLAN.md` and previous files in `project_reviews/`.

1. Inspect the live repository again before editing. This review is based on the HEAD above; newer commits may have changed the findings.
2. Do not add more architecture documents instead of fixing the runtime. Keep `PLAN.md` as the single current implementation plan.
3. Treat every P0 item below as a release blocker. Fix P0s before calling AIR usable or marking Phases 2–5 complete.
4. Do not claim a feature is complete because a class, interface, command, or test stub exists. Completion requires an end-to-end behavior test.
5. Do not weaken dirty-tree, permission, provider-consent, or secret-handling protections to make tests pass.
6. Keep MockAdapter and mock executables test-only. They must never be selected by a normal installed AIR CLI or MCP server.
7. After each correction, run and report the exact commands and results listed in Section 8. Do not report tests as passing unless they were run on the current commit.
8. Make focused changes. Do not rework the product concept or reintroduce premature LLM-based routing.

### Priority definitions

- **P0 — Critical:** AIR can select the wrong tool, falsely report success, fail to fail over, lose context, expose data, or claim unsupported behavior. Fix before further feature work.
- **P1 — High:** Core operational guarantees are incomplete or configuration/runtime behavior is misleading. Fix before calling the relevant phase complete.
- **P2 — Medium:** Reliability, diagnostics, documentation, and maintainability improvements. Fix before a public release.

---

## 1. Executive assessment

The project has progressed significantly since the initial scaffold. This is no longer just a README and CLI placeholder. The repository now contains a configuration system, platform path resolver, health tracker, shared process runner, Aider and Goose adapters, router, Git snapshot code, task persistence, provider allow-list helpers, redaction, trace logging, MCP server, verification helper, mock process, and a growing test suite.

The architectural direction is still good:

- Keep AIR as an orchestrator of existing headless tools.
- Keep the priority-list router until real misroutes justify more complex scoring.
- Keep provider/model-scoped cooldowns.
- Keep user approval separate from agent permissions.
- Keep Git-state-based handoff rather than trusting a failed model's summary.
- Keep MCP task IDs and approval as explicit lifecycle transitions.
- Keep test doubles out of production execution.

**However, the README currently says “Phases 0–5 complete” and “94 tests passing”, while source inspection shows that several critical workflows are not actually connected end to end.** The most important issue is that the normal CLI and MCP registries currently register `MockAdapter` and `GooseAdapter`, but not `AiderAdapter`. The CLI therefore does not execute the two real adapters represented in the README as intended.

There are also independent correctness blockers in result detection, failover, handoff, health/cooldown persistence, and MCP approval. AIR has the pieces, but the pieces are not yet composed into a reliable orchestration system.

### Current status by area

| Area | Source-level assessment |
|---|---|
| Project concept and high-level architecture | Good; retain |
| Package metadata, main path, shebang, lockfile | Improved; re-run clean install/package verification |
| Config schema and path resolver | Implemented, but runtime error handling and effective config use are incomplete |
| Aider adapter | Exists, but is not registered by the production CLI/MCP registry |
| Goose adapter | Exists and is registered, but provider/model identity is hard-coded rather than derived from the active Goose recipe/profile |
| Mock adapter | Correctly located under `tests/`, but incorrectly imported by production CLI and MCP code |
| Router | Priority list exists; configuration, actual discovery, and some capability semantics are not wired correctly |
| Git state | Basic path snapshot exists; it is not yet a complete before/after diff checkpoint or handoff payload |
| Success detection | Incorrectly inferred from stdout length rather than actual repository changes |
| Failover | Not reliable end to end; cooldowns, candidate advancement, handoff delivery, and approval are incomplete |
| Health tracker | Exists, but production runs do not record/flush outcomes or set cooldowns |
| MCP | Server exists, but asynchronous job and approval/continuation semantics are incomplete |
| Secret redaction | Improved, but chunk-boundary leakage and prompt/task-state coverage remain |
| Verification hook | Manual command helper exists; configured verification is not integrated into `air run` |
| Tests | More numerous, but many are unit-level; critical CLI/MCP/failover flows are not tested end to end |
| README phase-complete claim | Not supported by the source-level review; revise until acceptance gates really pass |

---

## 2. Critical findings — P0

### R4-01 — Production adapter registry uses MockAdapter and omits Aider

**Files:**
- `bin/air.ts` — `listAdapters()`
- `src/mcp/server.ts` — `listAdapters()`
- `tests/mock-adapter.ts`
- `tests/fixtures/mock-tool.js`
- `package.json` — `files`

**Observed behavior**

Both production registries currently return:

```ts
return [new MockAdapter(), new GooseAdapter()];
```

`bin/air.ts` imports `AiderAdapter`, but does not register or instantiate it. The MCP server also registers MockAdapter and GooseAdapter, not Aider. As a result, a normal `air run` or MCP `run_task` starts with the mock tool, not Aider.

This is not just a documentation discrepancy: the mock process prints simulated output and makes no repository edits. The app can therefore report a simulated run as a successful coding task.

There is also a packaging problem. Production code imports `MockAdapter` from `tests/`, while the package manifest does not include the source `tests/` directory. TypeScript may emit the imported `dist/tests/mock-adapter.js`, but the mock adapter locates `tests/fixtures/mock-tool.js` relative to itself, and that JavaScript fixture is not copied by the TypeScript build. The installed package can therefore contain a production dependency on a missing test fixture.

**Required correction**

1. Add one production adapter registry/factory under `src/adapters/`.
2. Register `AiderAdapter` and `GooseAdapter` only when enabled and configured; verify executable availability before treating them as candidates.
3. Remove all imports of `tests/mock-adapter` from `bin/air.ts`, `src/mcp/server.ts`, and production source.
4. Inject mock adapters explicitly in tests through dependency injection; never register them in the default runtime.
5. Ensure test fixtures are never required by production runtime or included accidentally in the package.
6. Ensure status output reflects actual adapter discovery and authentication/configuration state; do not hard-code `available: true`.

**Acceptance tests**

- `air run` with Aider and Goose installed launches a real configured adapter, never MockAdapter.
- If Aider is not installed, it is marked unavailable with a specific reason and is skipped.
- No MockAdapter or `tests/` import is reachable from the production entrypoint dependency graph.
- `npm pack --dry-run` plus a clean package install proves the installed `air` binary does not reference missing test fixtures.
- MCP `get_status` reports the real registered adapters and their detected availability.

---

### R4-02 — Success is inferred from stdout, not from the Git diff

**Files:**
- `bin/air.ts` — `runAction()`
- `src/mcp/server.ts` — `run_task`
- `src/types/result.ts`
- `src/context/checkpoint.ts`

**Observed behavior**

The CLI and MCP compute the result using logic equivalent to:

```ts
 defaultStateForTask(!!options.readOnly, outcome.stdout.length > 0)
```

`stdout.length > 0` is not evidence that files changed. An agent can print progress, commentary, or “Done” and make no edits. Conversely, an agent can modify files while producing little or no stdout. The adapter spike docs explicitly acknowledge that Aider can exit 0 with no changes.

This can falsely report `SUCCEEDED_WITH_CHANGES` and return exit code 0 for a task that made no change. It can also report `NO_CHANGES` when edits were actually made. A read-only task can be reported successful even if the agent modified the repository.

**Required correction**

1. Capture a reliable initial workspace snapshot before each attempt.
2. Capture the final workspace snapshot after the process has fully stopped.
3. Determine changed files and actual diff from before/after state, including untracked files and staged changes.
4. Do not count stdout, stderr, or free-form model text as proof of changes or completion.
5. For `--read-only`, detect and report any workspace mutation; do not mark it `SUCCEEDED_READ_ONLY` if files changed.
6. Define an explicit final policy for `NO_CHANGES`: return a distinct result and documented exit code, or require user review. Do not print “Succeeded” while the result state means “no changes” without explaining that distinction.
7. Apply exactly the same result classifier to CLI and MCP.

**Acceptance tests**

- Exit 0 + arbitrary stdout + no file modifications → `NO_CHANGES`.
- Exit 0 + empty stdout + actual file modifications → `SUCCEEDED_WITH_CHANGES`.
- Read-only task + no modification → `SUCCEEDED_READ_ONLY`.
- Read-only task + file modification → `NEEDS_USER_REVIEW` or a documented failure state.
- Agent prints “Done” but does not edit files → never reported as changed-success.
- CLI and MCP return the same result state and exit/status mapping.

---

### R4-03 — The CLI failover loop does not advance reliably to the next candidate

**Files:**
- `bin/air.ts` — `runAction()` failover loop
- `src/router/router.ts`
- `src/health/tracker.ts`
- `src/types/errors.ts`

**Observed behavior**

The CLI has a `visited` set, but the main loop calls `selectCandidate(taskInput, adapters, tracker)` again with the full original adapter list on every iteration. When a failure occurs, it separately calls `selectCandidate()` with the failed adapter filtered out, but after that it only prints the proposal/handoff and executes `continue`. The next loop does not use the selected `next` candidate; it calls the original full list again.

The code also never calls the health tracker's `setCooldown`, `recordFailure`, `recordSuccess`, or `flush` from the actual CLI/MCP run path. The cooldown tracker is loaded, but a provider/model that just hit a rate limit is not recorded as cooling down. Therefore the router has no durable knowledge of the failure it just observed.

`ERROR_POLICY` defines `RATE_LIMIT` and `QUOTA_EXCEEDED` as `wait_cooldown`, but the runtime does not apply a cooldown or use a retry deadline before selecting the next candidate.

**Required correction**

1. Refactor orchestration into an explicit candidate-attempt state machine.
2. After a run ends, classify the failure, update health, set the provider/model cooldown when required, and persist health before making the next routing decision.
3. Track visited `(tool, provider, model)` candidates for the run and exclude them from subsequent selection.
4. Do not rely on re-running the original selector with the original candidate list after deciding on a different candidate.
5. Handle shared provider/model limits: if two adapters use the same `(provider, model)`, both must be excluded while that key is cooling down.
6. Respect `failover.maxHops`, `cooldownMinutes`, retry metadata, and the action policy consistently.
7. Keep `retry_same`, `wait_cooldown`, `propose_switch`, `stop_ask_user`, and `abort` semantics distinct.

**Acceptance tests**

- A fails with RATE_LIMIT → cooldown persisted → B on a different eligible provider is proposed/selected.
- A and B share `(provider, model)` → B is skipped after A hits a rate limit.
- A→B→A ping-pong cannot occur.
- The exact candidate approved by the user is the candidate actually launched next.
- A success increments health success count; every classified failure increments the appropriate failure count.
- Restarting AIR preserves cooldowns and status displays the active cooldown.

---

### R4-04 — Handoff text is generated but never delivered to the replacement agent

**Files:**
- `src/security/allowlist.ts` — `buildHandoff()`
- `bin/air.ts` — failover branch
- `src/mcp/server.ts` — failover/approval branch
- `src/context/checkpoint.ts`

**Observed behavior**

The CLI calls `buildHandoff(taskInput, adapter, nextAdapter)` and prints the returned text to the terminal. It does not add that handoff to the next `TaskInput`, write a handoff file, or pass it to the adapter command. The next agent therefore receives the original task, not the handoff instructions.

The current handoff text only includes task/from/to/mode/file hints. It does not include the Git baseline, actual changed-file list, diff summary, test results, last output tail, failure evidence, or uncertainty about pre-existing changes. `buildHandoff()` does not accept a `GitSnapshot` or a completed `ProcessOutcome`.

The MCP server does not build or deliver a handoff at all. Its `approve_failover` handler only changes the task state to `SWITCHING`.

**Required correction**

1. Define a typed `HandoffPackage`, not a display-only string.
2. Build it from the original task, explicit constraints, before/after Git state, changed file list, size-capped diff, verification results, last useful redacted output, error category, and remaining work.
3. Include a strict instruction to inspect the current working tree and continue from it; never restart from scratch blindly.
4. Pass the handoff package to the replacement adapter as its actual prompt/instructions, using the adapter's supported prompt-file or text mechanism.
5. Keep the original user task immutable and record each attempt separately.
6. Do not launch the next agent until handoff construction, redaction, provider-destination checks, and approval are complete.

**Acceptance tests**

- A mock agent changes two files and then rate-limits; B receives the actual changed file list, diff/context, original goal, and continuation instruction.
- Verify the next adapter's generated command contains/reads the handoff package, not only the original task.
- A handoff exceeding the configured budget is deterministically truncated with metadata.
- A pre-existing user change is distinguished or explicitly marked as ambiguous; AIR never claims it was made by the failed agent without evidence.

---

### R4-05 — Default “ask” mode does not actually ask, and provider consent is not wired

**Files:**
- `bin/air.ts` — `runAction()`
- `src/security/allowlist.ts`
- `src/config/schema.ts`
- `src/mcp/server.ts`

**Observed behavior**

The README and plan say failover asks before switching by default. In the CLI, if `--auto` is not set, the failure branch prints a generic failure and exits; it does not present a switch proposal or ask for confirmation. The configured `config.failover.mode` is also not applied to `taskInput.mode`; mode comes only from `options.auto`.

The current `defaultAllowList(adapters)` allows only the first adapter's provider/model. With the current adapter order (Mock/OpenRouter followed by Goose/OpenAI), a cross-provider switch is denied. The config exposes `allowProviderSwitch`, but there is no effective configuration/approval path that uses it. The MCP handler constructs an allow-list but does not use it in the approval path.

**Required correction**

1. Resolve failover mode from CLI override > environment > repo config > global config > defaults.
2. In interactive CLI `ask` mode, show the proposed next agent, provider, model, permission mode, and what task/context/diff will be sent; ask for explicit confirmation.
3. In non-interactive CLI mode, return a durable `AWAITING_APPROVAL` state and provide a documented resume/approve command rather than silently failing.
4. In MCP mode, require a separate approval tool call; never prompt on stdio.
5. Make provider allow-list configurable, strict by default, and shared by CLI and MCP.
6. A one-task provider exception must be explicit, scoped to that run, logged, and disclosed. `--auto` must never bypass it.
7. Ensure approval of failover does not implicitly grant broader agent file/shell permissions.

**Acceptance tests**

- Default interactive CLI mode displays a real approval prompt and does not switch on rejection.
- Config `mode: auto` works only when the CLI has not overridden it and the provider is allowed.
- An unapproved provider change is blocked in CLI and MCP.
- An explicit one-task exception is recorded and cannot silently become a permanent allow-list entry.

---

### R4-06 — MCP jobs, approval, cancellation, and output retrieval are not complete

**Files:**
- `src/mcp/server.ts`
- `src/execution/task-state.ts`
- `tests/mcp.test.ts`

**Observed behavior**

1. The `run_task` tool awaits `runProcess()` before returning its response. It does not return a run ID immediately and continue as an independent background task. A caller cannot reliably obtain the ID needed to poll/cancel a long-running job while it is running.
2. `approve_failover` only changes state to `SWITCHING`; it does not launch the proposed adapter or complete a continuation.
3. `get_task_output` looks for `t.state?.output`, but the persisted task type contains `outputTail`, and the runner's output is not persisted to either field. This endpoint therefore returns empty output.
4. `cancel_task` can mark any task cancelled without checking whether it is still active. The in-flight `run_task` then writes a final state that maps every non-success result—including `CANCELLED`—to `FAILED`, overwriting the cancellation state.
5. The in-memory task map is not the source of truth after restart; persisted task records do not contain all output/lifecycle information needed by the exposed tools.
6. The MCP test only checks that `startMcp` is exported; it does not exercise JSON-RPC tools or lifecycle transitions.

**Required correction**

1. `run_task` should validate and persist a `QUEUED` job, start the worker, and immediately return the run ID and initial state.
2. Run the same orchestrator/state machine used by CLI; do not maintain separate incomplete MCP failover logic.
3. Persist state transitions and bounded/redacted output incrementally. Make `get_task_output` read the actual persisted output tail/events.
4. Make `approve_failover` execute the approved transition and resume the job; merely setting `SWITCHING` is insufficient.
5. Make cancellation idempotent and terminal-state-safe. A completed task cannot be overwritten as cancelled; a cancelled task cannot later be overwritten as failed/succeeded by a race.
6. Return structured run IDs and result states in MCP responses, not only plain text.
7. Handle client disconnects, server shutdown, and interrupted jobs explicitly.
8. Enforce the same provider-consent and permission controls as CLI.

**Acceptance tests**

- `run_task` returns a run ID before a hanging mock process finishes.
- A second MCP request can poll status and cancel the process using that ID.
- `get_task_output` returns the redacted output captured so far and after completion.
- An approval causes the replacement agent to launch with the handoff package.
- Rejection leaves the state terminal and does not run another agent.
- Cancellation during execution ends in `CANCELLED`, kills the process tree, and is not overwritten.
- MCP protocol stdout contains only JSON-RPC protocol messages.

---

### R4-07 — Process-tree termination is not guaranteed on Unix, and CLI cancellation is not connected

**Files:**
- `src/execution/runner.ts`
- `bin/air.ts`

**Observed behavior**

The Unix timeout/cancel path sends a signal to `process.kill(-pid, ...)`, but the spawn options do not set `detached: true` or otherwise establish a process group whose ID is the child PID. In the normal default spawn configuration, the negative-PID process-group kill may fail; the fallback `child.kill()` only kills the direct child, potentially leaving its grandchildren running.

The runner supports `AbortSignal`, but `runAction()` does not create or pass a signal and does not wire SIGINT/Ctrl+C to an abort controller. As a result, CLI users do not get the task-state-preserving cancellation path described in the plan. The signal listener in the runner is also not removed after the child finishes.

**Required correction**

1. Establish a process group on Unix (for example, a carefully tested detached process group) before using negative-PID kill.
2. Keep the Windows `taskkill /T /F` path, but test it on Windows and handle missing PID/permission errors.
3. Wire CLI SIGINT/SIGTERM into an `AbortController`, terminate the child tree, persist a terminal/interrupted state, and use the documented exit code.
4. Remove abort listeners and timers after every completion path.
5. Ensure timeouts/cancellation cannot leave orphaned processes or indefinitely pending promises.

**Acceptance tests**

- Mock parent launches a grandchild; timeout kills both parent and grandchild on Unix and Windows.
- Ctrl+C during a CLI run marks the task cancelled/interrupted and leaves no child process.
- Abort before spawn, during spawn, and after normal completion are handled without races or listener leaks.

---

### R4-08 — Streaming redaction can leak secrets split across output chunks

**Files:**
- `src/security/redact.ts`
- `src/execution/runner.ts`
- `src/execution/task-state.ts`
- `bin/air.ts`
- `src/mcp/server.ts`

**Observed behavior**

The runner calls `redact(buf.toString())` independently for each stdout/stderr chunk, then immediately streams that chunk to the terminal and stores it. If a token is split across two OS output chunks, neither individual chunk necessarily matches the token regex, and the original secret can pass through. This is a realistic streaming boundary case and is not covered by the current redaction tests.

The “single choke point for all outbound text” claim is also broader than the implementation: the original task is printed to the terminal and persisted in task state without redaction; `buildHandoff()` includes the task prompt verbatim; MCP task records also store the prompt. Output redaction alone does not protect these paths.

**Required correction**

1. Implement a streaming redactor that retains a bounded overlap between chunks so token patterns spanning chunk boundaries are detected before output is emitted.
2. Apply redaction to the final captured buffers as a second defensive layer.
3. Test API tokens split at every position across arbitrary chunk boundaries, including multibyte UTF-8 output.
4. Define a separate policy for user-provided task text: do not silently corrupt the original task sent to the first agent, but do not persist/log or transmit potentially sensitive prompt text to another provider without the configured redaction/consent policy.
5. Ensure task state, trace, CLI diagnostics, MCP output, and handoff use the same redaction policy.
6. Avoid writing raw command lines or environment values into traces.

**Acceptance tests**

- A fake provider token split across multiple chunks never appears in terminal callbacks, captured output, logs, task state, or handoff.
- Redaction remains idempotent and deterministic.
- Quoted values and `--key=value` / `--key value` flags are covered.
- A prompt containing a secret-like value follows an explicit, tested storage/handoff policy.

---

## 3. High-priority findings — P1

### R4-09 — Git snapshot is not yet a reliable checkpoint or a safe before/after comparison

**Files:** `src/context/checkpoint.ts`, `bin/air.ts`, `src/security/allowlist.ts`

**Observed behavior**

`snapshotGit()` records file names from `git diff --name-only` and `git ls-files`, but not the actual staged/unstaged patch or untracked file contents. It does not record a post-run snapshot or diff. Git errors are swallowed and converted to empty strings, so a missing Git executable, inaccessible repository, or non-Git directory can appear to be a clean tree. File names are parsed by splitting on newline, which is not robust for unusual valid Git paths containing newlines.

The CLI captures `snap` only for the initial dirty check. It is not passed into `buildHandoff()` and is not used to compare the result after execution.

**Required correction**

- Use `git status --porcelain=v1 -z` or another NUL-safe status format.
- Preserve clear errors for “not a Git repository”, “Git unavailable”, and genuine clean state; do not silently treat all errors as clean.
- Capture a size-capped binary diff for staged and unstaged tracked changes plus a safe representation of untracked files.
- Capture before and after snapshots for every attempt.
- When `--allow-dirty` is used, explicitly mark attribution as uncertain unless AIR can prove which hunks/files changed during its run.
- Do not include sensitive files in snapshots/handoff; apply exclusions and secret scanning before sharing.

**Acceptance tests**

- Test clean, staged, unstaged, untracked, renamed, deleted, binary, ignored, and unusual filenames.
- A non-Git directory is not reported as a verified clean Git workspace.
- Before/after snapshots correctly identify a mock agent's edits.
- User pre-existing changes are never overwritten or falsely attributed.

---

### R4-10 — Health tracking and cooldown persistence are not connected to real runs

**Files:** `src/health/tracker.ts`, `bin/air.ts`, `src/mcp/server.ts`, `src/router/router.ts`

**Observed behavior**

The health tracker supports `recordSuccess`, `recordFailure`, `setCooldown`, and `flush`, but the production execution paths currently only load it. They do not update it after success/failure, do not set a cooldown after rate-limit/quota errors, and do not flush a new state. Status therefore reports stale or empty health data, regardless of actual run history.

**Required correction**

- Centralize post-attempt health updates in the shared orchestrator.
- Record success/failure for each attempted `(provider, model)`.
- Set cooldowns for `RATE_LIMIT` and `QUOTA_EXCEEDED`, using provider retry metadata when available and configured fallback duration otherwise.
- Persist the health state before the next routing decision.
- Ensure unrelated models/providers are not blocked.
- Report active cooldown reason and expiry through both CLI and MCP.

**Acceptance tests**

- Rate-limit failure creates a persisted provider/model cooldown.
- A different model/provider remains eligible.
- Success/failure counters increment and survive restart.
- Expired cooldowns are not treated as active.

---

### R4-11 — Adapter provider/model identity can differ from the actual process configuration

**Files:**
- `src/adapters/aider.ts`
- `src/adapters/goose.ts`
- `docs/adapters/aider.md`
- `docs/adapters/goose.md`
- `src/config/schema.ts`

**Observed behavior**

`AiderAdapter` declares `provider = 'openrouter'` and a hard-coded model identifier. However, it only passes `--model` when `task.preferredModel` is set; the current CLI does not populate `preferredModel` from effective configuration. Aider may therefore use a different model from the adapter's advertised model due to its own config/environment.

`GooseAdapter` hard-codes `provider = 'openai'` and `model = 'gpt-4o'`, but `goose run --text` does not pass those values. The spike document says Goose provider/model selection comes from the active recipe/environment. Therefore AIR may record a false provider/model, apply a wrong cooldown key, and make an incorrect provider-consent decision.

Both adapters currently return `true` from `canHandle()` and do not perform executable/auth/profile discovery.

**Required correction**

1. Make provider/model configuration explicit and truthful.
2. For Aider, build the exact command from the effective AIR tool/provider/model configuration or reliably inspect the effective Aider config; ensure the value recorded in health/trace equals the model actually passed to Aider.
3. For Goose, support an explicit configured recipe/profile and determine its provider/model, or report provider/model as unknown and disable provider/model-specific failover claims until resolved.
4. Add a `detect()`/availability contract that checks executable/version and the configured profile/provider state where safely possible.
5. Do not register an adapter whose advertised identity is inconsistent with its built command.
6. Make `--tool`, `--provider`, and `--model` overrides functional or remove them from the public contract until implemented.

**Acceptance tests**

- Adapter identity equals the generated command's actual provider/model configuration.
- Goose with two different profiles reports the correct provider/model for each.
- Aider config/environment override cannot silently diverge from health/cooldown identity.
- Missing executable/profile is reported before launch as a specific skip reason.

---

### R4-12 — Config errors and config values are not reliably enforced at runtime

**Files:** `src/config/loader.ts`, `src/config/schema.ts`, `bin/air.ts`, `src/mcp/server.ts`

**Observed behavior**

- `loadConfig()` wraps both file reading and YAML parsing in a broad `try/catch`. Malformed YAML can therefore be swallowed by the same catch intended for a missing file and treated as if no config exists.
- `runAction()` destructures only `{ config }` and ignores `errors`. MCP does the same. A malformed or schema-invalid repo configuration can therefore be ignored while the task proceeds with defaults.
- `config.tools`, `config.failover.mode`, `config.failover.allowProviderSwitch`, `timeouts.perTool`, and `verify` are not consistently applied by the runtime paths.
- `route-test` does not load effective config, so it may explain a decision different from `air run`.
- `migrateConfig()` currently returns success with “already at version 1” without reading, validating, or writing any config. It is not a real migration operation.

**Required correction**

1. Separate file-not-found handling from YAML parse errors and permission/read errors.
2. Fail closed for invalid effective configuration on `air run` and MCP task submission; show the file/key error and do not silently execute with defaults.
3. Make the effective config the single input to adapter registration, routing, timeout selection, failover mode, provider policy, and verification behavior.
4. Make `route-test` load exactly the same config and registry as `run`.
5. Implement real version inspection and migration, or remove the `migrate` claim until an older config format exists and can be migrated.
6. Make config output redact all secrets and show non-secret effective values/precedence.

**Acceptance tests**

- Malformed YAML returns a clear non-zero config error; the task is not launched.
- Invalid repo config cannot silently fall back to defaults.
- CLI/environment/repo/global/default precedence is tested for every supported field.
- `route-test` and `run` choose the same candidate for the same task/config snapshot.
- Migration tests load an older fixture, migrate it, and validate the resulting file.

---

### R4-13 — Concurrent state updates can still lose data

**Files:** `src/utils/atomic.ts`, `src/health/tracker.ts`, `src/execution/task-state.ts`, `src/config/schema.ts`

**Observed behavior**

`atomicWriteJson()` writes a temporary file and renames it, which prevents readers from observing a partially written JSON file. It does not make a read-modify-write sequence safe across processes. Two processes can both read the same health state or task index, append different records, and then overwrite each other's result. `appendTaskIndex()` is a concrete read-modify-write race.

The plan/config mention a per-config-directory lock and `maxConcurrentAgents`, but no shared lock/semaphore is used by the current run path. The `maxConcurrentAgents` setting is not enforced.

**Required correction**

- Add a cross-process lock or another safe transactional update mechanism for shared health/cooldown state and task index mutations.
- Prefer deriving task listings from independent task files or make the index append-safe; do not rely on unlocked read-modify-write.
- Enforce `maxConcurrentAgents` and the documented default of 1.
- Define whether separate repositories share a global concurrency limit or have separate limits.
- Make stale lock recovery safe and prevent two live processes from stealing each other's locks.

**Acceptance tests**

- Concurrent process test creates multiple task IDs without losing any index/state records.
- Concurrent health updates preserve both updates.
- `maxConcurrentAgents: 1` prevents a second agent from starting while the first is still active.
- Lock crash/recovery does not permit duplicate execution or permanent deadlock.

---

### R4-14 — Verification is not integrated and the helper drops stderr

**Files:** `src/context/verify.ts`, `src/config/schema.ts`, `bin/air.ts`, `docs/behavior-spec.md`

**Observed behavior**

The config schema has `verify.enabled` and `verify.command`, and the README/plan refer to a verify hook. However, `air run` never runs the configured verification command or uses its result to determine the final result state. The separate `air verify <cmd...>` is a manually invoked command, not the configured post-task verification hook.

`runVerify()` uses `stdio: ['ignore', 'pipe', 'ignore']`, so stderr is discarded and cannot be shown in `VerifyResult`. The helper also has no documented Windows process-tree timeout behavior.

**Required correction**

1. Decide whether verification is a manual utility only or a post-task hook. Keep documentation aligned with the actual product behavior.
2. If it is a post-task hook, invoke it from the shared orchestrator only when configured and trusted; pass argument arrays with no shell.
3. Capture and redact both stdout and stderr.
4. Include verifier exit code and outcome in the task result and task record.
5. Define timeout/cancellation behavior and test Windows command shims.
6. A repo-provided verify command must still require the explicit trust policy described in the plan.

**Acceptance tests**

- A passing verifier is recorded as passed.
- A failing verifier changes the final task state according to the documented policy.
- stderr is available in the diagnostic report and is redacted.
- An untrusted `.airrc.yaml` verify command is never executed automatically.

---

## 4. Medium-priority findings — P2

### R4-15 — The trace implementation does not match the per-run JSONL observability contract

**Files:** `src/observability/trace.ts`, `src/config/paths.ts`, `bin/air.ts`, `src/mcp/server.ts`

**Observed behavior**

`trace()` appends JSON lines to the single `paths.logFile` (`air.log`) rather than `traces/<runId>.jsonl`. Current CLI/MCP call sites mainly record `router_pick` and `run_complete`; they do not reliably record process launch, classified evidence, cooldown updates, every candidate/skip reason, approval decisions, handoff metadata, cancellation, or final state transitions.

**Required correction**

- Either implement the documented per-run trace file or update the contract to a single JSONL stream with a reliable `runId` filter.
- Emit structured events for task start, routing inputs, candidate/skip reasons, process start/end, normalized error, cooldown, approval, handoff, provider destination, cancellation, verification, and final result.
- Redact structured fields before persistence; do not rely only on serializing everything to one string.
- Keep output bounded/rotated and make trace write errors diagnosable without breaking execution.

**Acceptance tests**

- A failover fixture produces a complete, ordered trace that explains every decision.
- A task's trace can be retrieved independently of other tasks.
- No secret fixture appears in any event field.

### R4-16 — Router capability and availability semantics are weaker than the contract

**Files:** `src/adapters/adapter.ts`, `src/router/router.ts`, adapter implementations

**Observed behavior**

- `AgentAdapter.canHandle()` permits `boolean | Promise<boolean>`, but `selectCandidate()` is synchronous and treats a Promise as truthy. A future async implementation will silently be considered eligible.
- The router checks `headlessExecution` only when `task.mode === 'ask'`. AIR is headless-only in both `ask` and `auto` modes, so the check should not depend on failover preference.
- Most capability fields (`fileEditing`, `shellAccess`, `imageInput`, `structuredOutput`, cancellation) are not used for task requirements.
- Adapter `canHandle()` currently returns true without checking installation/configuration.
- Candidate status does not honor enabled tools, preferred tool/provider/model, or provider allow-list from effective config.

**Required correction**

- Make `selectCandidate` async if `canHandle` remains async, or narrow the contract to synchronous checks.
- Always require `headlessExecution` for production candidates.
- Define task-required capabilities and enforce them before selection.
- Filter disabled/unavailable/disallowed adapters before scoring/priority selection.
- Make explicit user overrides deterministic and visible in `--explain` output.

**Acceptance tests**

- An async `canHandle()` false result is not selected.
- A non-headless adapter is never selected in any mode.
- Disabled tools, unavailable executables, missing capabilities, and disallowed providers are each skipped with precise reasons.
- `--tool`/provider/model preferences work only when actually supported and available.

### R4-17 — Task state does not yet contain enough durable execution information

**Files:** `src/execution/task-state.ts`, `bin/air.ts`, `src/mcp/server.ts`

**Observed behavior**

The task record stores the original task and a small final state, but does not persist an attempt history, initial/final Git snapshots, handoff package reference, output tail, verification result, provider-consent decision, or interruption metadata. `outputTail` exists in the interface but is not populated by the run paths. The task index is also unbounded and has no retention policy.

**Required correction**

- Persist each attempt as a separate record or append-only event, including tool/provider/model, timestamps, process outcome, error category, cooldown, and handoff reference.
- Persist a bounded redacted output tail and truncation information.
- Record before/after Git snapshot references and final result.
- Record provider-consent and permission decisions without storing secret values.
- On restart, mark stale RUNNING/QUEUED/SWITCHING states as interrupted; never automatically restart an agent.
- Define retention/cleanup for old task state and traces.

**Acceptance tests**

- Kill AIR mid-run; task status becomes inspectable as interrupted after restart.
- An attempt history reconstructs all agents tried and why.
- Task output can be retrieved after restart.
- Retention deletes only expired AIR-owned records and never workspace files.

### R4-18 — CLI, README, and behavior specification are still ahead of actual behavior

**Files:** `README.md`, `docs/behavior-spec.md`, `bin/air.ts`, `tests/behavior-spec.test.ts`

**Observed behavior**

README says Phases 0–5 are complete and 94 tests are passing. The code does contain many modules and tests, but the production registry, failover, handoff, success detection, and MCP lifecycle findings above show that the feature-level acceptance criteria are not satisfied yet.

The behavior-spec test checks that certain strings appear in `docs/behavior-spec.md`; it does not actually execute `air --help` and compare the live commands/options to the specification. The behavior spec says `run_task` uses async jobs, but the implementation waits for the process before returning. The CLI's `config` without `--validate` still prints `Not implemented yet` although the command description says “Show or edit configuration”.

**Required correction**

- Do not claim Phases 0–5 complete until the P0/P1 acceptance tests in this review pass.
- Distinguish implemented, partially implemented, and planned features in README.
- Make `docs/behavior-spec.md` match live CLI/MCP behavior exactly.
- Test the real CLI help output and options, not only static spec strings.
- Either implement `air config` display behavior or change its description to match the implemented commands.
- Publish test count only from an actual current CI/test run.

**Acceptance tests**

- CI runs the complete suite on the current commit and records the test count.
- A test launches the compiled CLI `--help` and checks commands/options against the behavior spec.
- A test exercises every documented CLI command's implemented path.
- README contains no completion claim for a workflow whose acceptance tests are missing.

---

## 5. Required implementation order

Do not try to fix everything at once. Use this order because the dependencies matter.

| Order | Work | Must be true before moving on |
|---|---|---|
| 1 | R4-01 production registry and test isolation | Default CLI/MCP registries contain only real configured adapters; Aider and Goose are discoverable |
| 2 | R4-02 Git-based result detection + R4-09 snapshot correctness | Success/no-change/read-only results are based on actual workspace delta |
| 3 | R4-03 failover state machine + R4-10 health/cooldowns | Candidate progression and persisted cooldowns work with mocks |
| 4 | R4-04 handoff delivery + R4-05 approval/provider consent | A partial task can safely continue with a replacement using actual handoff context |
| 5 | R4-07 process tree + cancellation + R4-08 streaming redaction | Timeouts/cancellation and secret handling are safe on supported platforms |
| 6 | R4-06 MCP lifecycle | MCP can submit, poll, approve, cancel, and retrieve output for a real run |
| 7 | R4-12 config enforcement + R4-13 concurrency + R4-14 verification | Config/runtime behavior and shared state are correct |
| 8 | R4-15 through R4-18 observability, contract, durable state, docs and CI | Release criteria can be demonstrated and reproduced |

---

## 6. Mandatory end-to-end acceptance scenarios

Add tests that exercise the real orchestrator with mock executables and temporary Git repositories. A test that merely checks a function exists is not an acceptance test.

1. **Real adapter registry:** production registry contains Aider/Goose according to config and never MockAdapter.
2. **Tool unavailable:** Aider missing → skipped with `TOOL_NOT_INSTALLED`; Goose can be selected if eligible.
3. **Successful edit:** agent changes a file and exits 0 → `SUCCEEDED_WITH_CHANGES`.
4. **False success:** agent prints substantial output and exits 0 without editing → `NO_CHANGES`, never changed-success.
5. **Read-only:** agent reads and exits 0 without editing → `SUCCEEDED_READ_ONLY`.
6. **Read-only violation:** agent edits a file → `NEEDS_USER_REVIEW` or documented failure.
7. **Rate limit:** A hits a rate limit → cooldown is persisted → a different eligible `(provider, model)` is proposed.
8. **Shared provider limit:** B shares A's `(provider, model)` → B is skipped.
9. **Candidate progression:** approval of B actually launches B; the router does not restart A or hit a false visited-candidate error.
10. **Partial-work handoff:** A changes two files then fails → B receives a handoff containing current Git evidence and continues from the existing tree.
11. **Handoff redaction:** secret-looking values are not sent across provider boundary without explicit policy/consent.
12. **Default ask:** CLI asks; rejection does not start B.
13. **Auto mode:** only uses a provider/model already allowed; no implicit privacy exception.
14. **Dirty working tree:** default write task refuses; `--allow-dirty` preserves and clearly labels existing changes.
15. **Missing Git:** AIR reports Git/workspace checkpoint unavailable; it does not pretend the workspace was clean.
16. **Timeout tree kill:** parent and grandchild are terminated.
17. **Ctrl+C:** CLI persists cancelled/interrupted state and terminates the process tree.
18. **Streaming secret:** token split across arbitrary chunk boundaries never reaches terminal, log, task file, or handoff.
19. **MCP async:** `run_task` returns a run ID immediately; status/output can be polled while execution is still running.
20. **MCP approval:** `approve_failover` starts the approved replacement with handoff; it is not merely a state update.
21. **MCP cancellation:** cancel during a running task returns terminal `CANCELLED` and cannot be overwritten by the completion handler.
22. **MCP output:** `get_task_output` returns actual bounded redacted output during and after the run.
23. **Invalid config:** malformed or invalid YAML stops execution with a useful error; defaults are not silently used.
24. **Concurrency:** two process instances cannot lose health or task-index updates; configured agent concurrency is enforced.
25. **Verification:** approved verify command's stdout/stderr/exit code are captured and final result reflects its policy.
26. **Packaging:** clean package install launches the compiled binary with no reference to test fixture files.

---

## 7. Definition of done for the next milestone

The next milestone should be **“Reliable CLI failover between two real agents”**, not “all phases complete”. It is complete only when:

- The production registry uses real Aider and Goose adapters, not the test mock.
- The selected adapter identity matches the actual provider/model used by the command/profile.
- Actual Git diffs, not stdout, determine whether work changed.
- Rate-limit errors update persisted provider/model cooldowns.
- The router advances to the exact approved next candidate.
- The replacement process receives a real redacted handoff package.
- The default approval path and provider allow-list are enforced.
- A mock end-to-end test covers partial edits → rate limit → approval → continuation.
- A real smoke test with both installed tools is documented, including versions and known limitations.
- The CLI and MCP share the same task orchestration logic; MCP approval/cancel/output are functional.

---

## 8. Required verification commands and reporting

Run these on the current commit and report exact output/exit status:

```bash
npm ci
npm run typecheck
npm run typecheck:test
npm test
npm run build
npm pack --dry-run
```

Also run focused smoke tests:

```bash
npm run dev -- --help
npm run dev -- route-test "change a test file" --explain
```

Once real adapters are registered and installed, run a small controlled smoke task with Aider and Goose. Do not use a valuable working tree or real secrets in the mock acceptance tests.

Add CI for Linux, Windows, and macOS. At minimum, CI should run `npm ci`, both type checks, `npm test`, `npm run build`, and package dry-run on every pull request.

**Environment limitation of this review:** I inspected the GitHub source through the repository integration. I could not clone the repository or execute `npm ci`/tests in this review environment because outbound DNS/network access to GitHub was unavailable. Therefore this document distinguishes source-level findings from runtime/test results; it does not claim that the current build fails or that the 94-test count is false. The implementation agent must verify the commands above on its own current checkout.

---

## 9. Final direction

Do not redesign AIR. The project has enough architecture. The remaining gap is integration correctness.

Focus on proving this single promise:

> A real coding agent can start a task, make partial edits, hit a genuine provider failure, and AIR can safely select an approved alternative, pass the actual current workspace state to it, and finish without losing user changes, lying about success, leaking secrets, or bypassing permissions.

Until that scenario passes end to end, AIR should be described as an active prototype with implemented subsystems—not as a completed multi-agent failover orchestrator.
