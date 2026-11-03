# AIR — Release Readiness Review

**Review date:** 2026-11-01  
**Repository:** https://github.com/radmanmilos/air  
**Branch:** `main`  
**Reviewed commit:** `653c268ce905500654a6e730e19a4fafe54fdab9`  
**Latest GitHub Actions run:** https://github.com/radmanmilos/air/actions/runs/41283961072  
**Review type:** Full implementation and release-readiness review  
**Decision:** **NO-GO for release until all P0 items are resolved and CI is green.**

---

## 0. Instructions to the implementation agent

Treat this as a fresh release-readiness review, not permission to redesign AIR.

1. Inspect the current checkout before changing anything. This review is tied to the commit above; newer commits may already resolve individual items.
2. Keep the architecture and scope unless a finding requires a specific correction.
3. Work only inside the AIR repository.
4. Do not claim a finding is fixed until the behavior and acceptance tests pass.
5. If a finding is already fixed in a newer checkout, record the fix and test evidence rather than re-implementing it.
6. Fix P0 findings first, then P1. P2 cleanup must not distract from release blockers.
7. Do not run `npm audit fix --force` blindly. Inspect audit details and update dependencies deliberately.
8. Run narrow tests after each change, then the full validation suite.

### Required validation commands

```bash
npm ci
npm run typecheck
npm run typecheck:test
npm run build
npm run lint
npm test
npm pack --dry-run
```

The GitHub Actions workflow should run the applicable commands on every supported OS/Node combination. Add a clean package smoke test before publishing.

---

## 1. Executive assessment

AIR has progressed substantially. The repository now contains a shared execution runner, Aider and Goose adapters, additional adapter classes, a router, config schema/loader, health persistence, Git handoff, redaction, MCP jobs, task state, JSONL tracing, and a sizeable test suite.

The architecture should be retained. The remaining risks are integration correctness and the gap between documented safety rules and runtime behavior.

### Current evidence from GitHub

| Check | Latest result |
|---|---|
| `npm ci` | Passed on all four CI jobs |
| App typecheck | Passed on all four jobs |
| Test typecheck | Passed on all four jobs |
| Tests: Windows / Node 20 | Passed |
| Tests: Windows / Node 22 | Passed |
| Tests: Ubuntu / Node 20 | **Failed: 143 passed, 1 failed** |
| Tests: Ubuntu / Node 22 | **Failed: 143 passed, 1 failed** |
| `npm run build` in CI | Not run |
| `npm run lint` in CI | Not run |
| `npm pack --dry-run` in CI | Not run |

The failing test is:

```text
tests/paths.test.ts
path resolver > resolves Windows paths

Expected: C:/AppData/air
Received: C:\AppData/air
```

Both Ubuntu jobs fail on this assertion. Both Windows jobs pass. The problem is that the path resolver uses the host platform's `path.join` and `path.sep` while simulating a Windows target platform.

The latest `npm ci` output also reports **20 npm audit vulnerabilities: 16 moderate, 2 high, 2 critical**. The CI log does not identify the affected packages, so a fresh `npm audit --json` is required before deciding impact.

---

## 2. P0 — Release blockers

### R5-01 — Restore green cross-platform CI

**Files:** `src/config/paths.ts`, `tests/paths.test.ts`, `.github/workflows/ci.yml`

**Observed**
- Latest Actions run fails on Ubuntu with Node 20 and Node 22.
- 143 of 144 tests pass in each failing job.
- The failing assertion simulates Windows paths on Linux and expects forward slashes.
- Windows CI jobs pass.

**Required**
- Define one path representation contract:
  - either return native paths and test with platform-appropriate expectations; or
  - normalize all paths to forward slashes independently of host OS, using explicit Windows path handling when `platform: 'win32'`.
- Do not use the host `path.sep` when resolving a target platform different from the host.
- Apply the same behavior to config, cache, task state, health and log paths.

**Acceptance**
- `tests/paths.test.ts` passes on Ubuntu and Windows.
- CI is green on Ubuntu/Windows and Node 20/22.
- Add Windows environment override and fallback tests.

### R5-02 — Do not auto-register unverified adapters

**Files:** `src/adapters/registry.ts`, `src/adapters/{opencode,kilocode,codex,github-copilot}.ts`, `docs/adapters/*.md`, `tests/new-adapters.test.ts`

**Observed**
- The production registry includes Aider, Goose, OpenCode, Kilo Code, Codex and GitHub Copilot.
- `availableAdapters()` filters only on executable presence in `PATH`.
- The OpenCode, Kilo Code, Codex and GitHub Copilot adapters and spike documents explicitly say `UNVERIFIED`.
- Unit tests verify the adapters' own assumed command arguments; they do not verify the installed external CLIs.

**Risk**
A user who happens to have an experimental CLI installed can have AIR select an adapter whose command syntax, permissions, output, model selection and error behavior have not been verified.

**Required**
- Add adapter metadata: `verified`, `enabled`, `verificationVersion`, `verificationDate`, `headlessSupported`.
- Default production routing must include only verified and enabled adapters.
- Unverified adapters may appear in `air status`, but must be skipped by ordinary routing.
- Experimental opt-in, if offered, must be separate from normal `enabled`.
- An adapter is verified only after a real local smoke test and evidence in `docs/adapters/<adapter>.md`.

**Acceptance**
- With all executable names mocked as present, normal routing selects only verified/enabled adapters.
- Unverified adapters are visible but skipped with an explicit reason.
- PATH presence alone cannot enable an unverified adapter.

### R5-03 — Make provider/model identity match the actual command

**Files:** all adapter files, `src/adapters/registry.ts`, `src/config/{loader,schema}.ts`, `src/router/router.ts`, `src/security/allowlist.ts`

**Observed**
- Adapters expose hard-coded `provider` and `model` properties.
- Aider declares a Gemma/OpenRouter default but only passes `--model` when `task.preferredModel` exists; the declared default is not necessarily applied to the CLI.
- Goose declares OpenAI/GPT-4o but invokes only `goose run --text <prompt>`. Its active recipe may select a different provider/model.
- Other adapters also depend on local CLI defaults/configuration while publishing fixed provider/model fields.
- The config schema supports tool `enabled`, `executable`, `provider`, `model`, but the registry/adapter construction does not apply those settings.

**Risk**
AIR may display, cool down, allow-list or approve a provider/model that is not actually receiving the task. This undermines routing and provider-consent guarantees.

**Required**
- Define one source of truth for the resolved execution identity.
- Resolve provider/model from effective AIR config plus actual CLI invocation or documented local agent configuration.
- If the identity cannot be determined, mark it `unknown`; do not invent a provider/model.
- Apply configured tool enablement, executable, provider and model overrides, or remove unsupported schema fields until they are implemented.
- Use the same resolved identity for route output, cooldowns, handoff, allow-list checks, task state and traces.

**Acceptance**
- The provider/model displayed in route output matches the one passed to the CLI or resolved from documented agent configuration.
- Aider's default invocation explicitly uses the configured model.
- Goose's active recipe/provider/model is reflected accurately.
- Changing configured model changes command arguments and health/allow-list identity.
- Unknown identity is never silently represented as a guessed provider/model.

### R5-04 — Fix candidate selection and provider-consent semantics

**Files:** `src/security/allowlist.ts`, `src/router/router.ts`, `bin/air.ts`, `src/mcp/server.ts`

**Observed**
- `defaultAllowList(adapters)` uses `adapters[0]`, not the candidate actually selected for the task.
- CLI and MCP create the allow-list before routing selects the first candidate.
- If the first adapter is cooling down and a later adapter is selected, the allow-list still describes the wrong initial provider/model.
- By default, only the first provider/model is allowed; cross-provider failover is blocked.
- CLI's default `ask` path prints a failover proposal and exits. It has no interactive approval/continue flow or command to resume the same task.
- MCP `approve_failover` takes only `runId`; it has no explicit one-task provider-change consent payload.
- `allowProviderSwitch` exists in config but is not integrated.

**Required**
- Create the task's provider-destination policy only after the actual first candidate is selected.
- Make the proposed failover disclose the exact destination provider/model and the task/context/diff/output that will be sent.
- A provider change must require an allow-list entry or explicit one-task user consent. `--auto` must never bypass the policy.
- Implement a usable CLI `ask` flow: prompt and continue in the same process, or persist `AWAITING_APPROVAL` and add a command to approve/resume the same run.
- Do not label a proposal-only exit as `ALL_EXHAUSTED`.
- MCP approval must bind to the exact pending proposal and destination.

**Acceptance**
- Allow-list is derived from the actual first selected candidate.
- A blocked candidate does not prevent considering later eligible candidates.
- Provider changes cannot happen without allow-list permission or explicit one-task consent.
- CLI `ask` can approve and continue the same run without restarting the original task.
- `--auto` cannot bypass provider restrictions.

### R5-05 — Resolve the actual next candidate, not a placeholder

**Files:** `src/mcp/server.ts`, `bin/air.ts`, `src/router/router.ts`

**Observed**
- MCP `runAttempt()` stores a hard-coded proposed replacement: `goose / openai / gpt-4o`.
- `resolveNextCandidate()` calls `selectCandidate()` over the full list, then returns `null` if the first selected candidate is already visited. It does not continue searching later candidates.
- For model-unavailable/process-crash errors where the current candidate is not cooling down, the first selection may be the original candidate; the resolver then returns `null` despite later eligible candidates.
- CLI chooses the next candidate before applying allow-list checks; if that candidate is blocked, it exits instead of searching later.
- `visited` is keyed only by provider/model, so a different agent on the same provider/model may be incorrectly prevented even when the failure was agent-specific.

**Required**
- Implement one shared `findNextEligibleCandidate()` for CLI and MCP.
- Filter by executable availability, verification/enabled state, cooldown, allow-list, required capabilities and visited policy before selection.
- Store the actual candidate in `proposedSwitch`; never hard-code Goose.
- Define revisit identity, preferably `(tool, provider, model)`, while provider/model cooldowns remain shared for quota limits.
- Recompute the proposal before approval and reject stale approvals if the candidate changed.

**Acceptance**
- A → B → C works when B is unavailable/blocked and C is eligible.
- Current candidate being visited does not prevent selection of a later candidate.
- A process crash can switch to another agent using the same provider/model when policy allows.
- A rate limit blocks every tool using the same provider/model.
- CLI and MCP make the same selection for the same registry/config/health state.

### R5-06 — Repair streaming redaction before exposing real API output

**Files:** `src/security/streaming-redact.ts`, `src/security/redact.ts`, `src/execution/runner.ts`

**Observed**
`StreamingRedactor.feed()` currently combines the previous tail with the new chunk, redacts the combined string, stores the last 128 characters as the next tail, and returns the entire combined string.

This causes two problems:
1. The retained tail is returned now and again with the next chunk, duplicating output.
2. A secret split across chunks can leak its first portion. The first incomplete token does not match the full secret pattern and is emitted before the next chunk arrives. Redaction on a later chunk cannot retract text already printed or stored.

**Required**
- Buffer the uncertain suffix and emit only the prefix that cannot become part of a secret match.
- Combine withheld suffix with the next chunk and emit only newly safe characters.
- `flush()` must emit the remaining suffix exactly once.
- Handle UTF-8 chunk boundaries safely; byte overlap and JS string slicing are not interchangeable.
- Ensure terminal callbacks, captured output, traces and handoff all use the same redacted output.

**Acceptance**
- A fake secret split at every possible character boundary never appears in emitted or final output.
- Adjacent chunks are emitted exactly once.
- `redact(feed(all chunks) + flush())` equals `redact(fullOriginalText)`.
- Add multi-byte UTF-8 boundary tests.
- Run a child process that deliberately writes a token in many small chunks.

### R5-07 — Compare workspace state against the initial snapshot

**Files:** `bin/air.ts`, `src/context/checkpoint.ts`, `src/context/handoff.ts`

**Observed**
- CLI captures `beforeSnap = snapshotGit(cwd)` before execution but does not use it.
- After execution, `changed` is computed from whether the working tree is dirty at all.
- With `--allow-dirty`, pre-existing user changes are counted as agent-produced changes.
- Read-only tasks can be marked `NEEDS_USER_REVIEW` because of unrelated initial modifications.
- `buildHandoffPack()` uses `git diff HEAD`, which excludes untracked file contents; it only lists their names from status.

**Required**
- Compare a complete initial snapshot with the final snapshot.
- Keep staged, unstaged, untracked, renamed and deleted state separate.
- Under `--allow-dirty`, report uncertain attribution; do not claim pre-existing edits were created by AIR.
- Include untracked contents in handoff only when safe and size-capped; otherwise explicitly state that content was omitted and needs inspection.
- Distinguish a non-Git directory or Git command error from a clean Git tree.

**Acceptance**
- Pre-existing staged/unstaged/untracked files with no agent changes remain unchanged in the result.
- Agent changes are detected relative to the initial snapshot.
- Read-only tasks with unrelated initial dirt are not marked as modified by AIR.
- Handoff describes untracked files or explicitly marks their content omitted.
- Non-Git directories receive a deliberate documented policy.

---

## 3. P1 — High-priority correctness and security work

### R5-08 — Persist MCP output and make `get_task_output` return real output

**Files:** `src/mcp/server.ts`, `src/execution/task-state.ts`, `src/types/outcome.ts`

**Observed**
- MCP `runAttempt()` calls `runProcess()` without stdout/stderr callbacks.
- `TaskState` defines `outputTail`, but the retrieval path reads `state.output`.
- Final task state does not persist a bounded output tail.
- `get_task_output` can therefore return an empty string although the agent produced output.

**Required**
- Capture redacted stdout/stderr tails and persist them as `outputTail` with truncation metadata.
- Make retrieval read the persisted field.
- Keep a hard output cap and label stdout/stderr.
- Keep job/task state consistent after cancellation, crash or completion.

**Acceptance**
- MCP client starts a task, polls status and retrieves non-empty output from a mock.
- Output retrieval works after terminal completion and after server restart.
- Output is redacted and bounded.

### R5-09 — Implement actual concurrency control and safe read-modify-write

**Files:** `src/utils/atomic.ts`, `src/execution/task-state.ts`, `src/health/tracker.ts`, `src/config/schema.ts`

**Observed**
- Temp-file-plus-rename avoids partial files but does not protect concurrent read-modify-write operations.
- `appendTaskIndex()` can lose task IDs when two processes read/modify/write simultaneously.
- Health tracker load/mutate/flush can lose counters and cooldown updates.
- `maxConcurrentAgents` exists in config but there is no shared cross-process semaphore.

**Required**
- Implement an inter-process lock or transactional coordination around shared state.
- Enforce `maxConcurrentAgents` across CLI and MCP processes.
- Make task-index updates concurrency-safe.
- Define stale lock recovery with PID/process-start validation and bounded timeout.
- Do not treat atomic rename as a concurrency lock.

**Acceptance**
- Concurrent mock tasks do not lose task-index IDs.
- Health counters/cooldowns are preserved.
- Configured concurrency cap is enforced across processes.
- Crashed AIR does not leave an unrecoverable lock.

### R5-10 — Make output limits byte-accurate and expose truncation metadata

**Files:** `src/execution/runner.ts`, `src/types/outcome.ts`, `src/mcp/server.ts`

**Observed**
- `stdoutTruncated` and `stderrTruncated` are tracked locally but are not returned in `ProcessOutcome`.
- `maxBufferBytes` is enforced using JS string `.length`, which counts UTF-16 code units, not UTF-8 bytes.
- Captured output retains a prefix, not a rolling tail, although handoff/debugging usually needs recent output.
- Existing tests do not assert truncation metadata or byte limits.

**Required**
- Define a captured-output structure with content, byte length and truncation flag.
- Count bytes accurately.
- Preserve useful tail output for handoff; document whether prefix is also retained.
- Include truncation metadata in task state and MCP results.

**Acceptance**
- Multi-byte output proves byte cap is respected.
- Oversized stdout/stderr report truncation.
- Tail contains final error details after long output.
- Sustained output cannot cause unbounded memory growth.

### R5-11 — Apply configuration to runtime and fail closed on malformed config

**Files:** `src/config/loader.ts`, `src/config/schema.ts`, `src/adapters/registry.ts`, `bin/air.ts`, `src/mcp/server.ts`

**Observed**
- Config defines tool enablement, executable override, provider/model, failover mode, per-tool timeout, provider-switch policy and concurrency.
- Registry uses a fixed adapter list and does not apply configured `tools`.
- CLI `run` uses `options.auto` instead of effective `config.failover.mode`.
- CLI ignores per-tool timeouts and uses only `defaultMs`.
- `runAction` consumes only `{config}` and ignores returned config errors.
- `loadConfig()` catches YAML parse/read/permission errors as if the file were simply missing, silently falling back to defaults.

**Required**
- Apply configured enablement, executable, provider and model overrides.
- Apply failover mode, per-tool timeouts, concurrency and provider-switch policy.
- Ignore only genuinely missing optional config files; parse/permission errors must be surfaced.
- CLI and MCP must reject invalid effective config rather than execute with defaults.
- `air config --validate` and runtime loader must share validation behavior.

**Acceptance**
- Disabled adapters are never routed.
- Configured executable/provider/model values are used by execution and displayed identity.
- Config `failover.mode` works; CLI overrides take precedence.
- Per-tool timeout overrides default timeout.
- Malformed YAML yields a non-zero config error for CLI and MCP.

### R5-12 — Separate user cancellation from provider failure

**Files:** `bin/air.ts`, `src/mcp/server.ts`, `src/health/tracker.ts`

**Observed**
- CLI records cancelled runs as `PROCESS_CRASH`.
- MCP records `USER_CANCELLED` as a provider/model failure.
- User cancellation is not evidence of provider failure.

**Required**
- Track cancellation as a distinct event/metric.
- Do not add a provider failure count or cooldown for user cancellation.
- Ensure cancellation never triggers failover.
- Keep CLI and MCP behavior identical.

**Acceptance**
- Cancelled task increments cancellation telemetry only.
- No provider failure/cooldown is recorded.
- No failover occurs.

### R5-13 — Make headless permission defaults explicit

**Files:** adapter files, `src/config/schema.ts`, README, adapter docs

**Observed**
- Aider always receives `--yes-always`.
- Experimental adapters contain assumed `--yes`/`--allow` flags.
- Such flags may broaden approval of agent actions.
- Config does not define a clear per-adapter permission mode.

**Required**
- Permission mode must be separate from failover mode.
- Document exactly what every non-interactive/approval flag authorizes.
- Do not enable broad shell/tool approval merely because AIR is headless.
- Disable unverified adapter invocation until flags and permissions are verified.
- Display the effective permission mode before execution.
- Keep automatic commits disabled by default.

**Acceptance**
- Tests verify default permission arguments for each verified adapter.
- No unverified broad-approval flag is passed.
- Consent to switch agents does not change agent permission mode.

### R5-14 — Triage dependency vulnerabilities before publishing

**Files:** `package.json`, `package-lock.json`, CI/security workflow

**Observed**
Latest `npm ci` output reports:

```text
20 vulnerabilities (16 moderate, 2 high, 2 critical)
```

**Required**
- Run `npm audit --json`.
- Identify runtime vs development dependency impact for each high/critical issue.
- Update vulnerable packages or document a specific accepted, time-bounded risk.
- Do not run `npm audit fix --force` without reviewing breaking changes.
- Add an audit step or scheduled dependency review.

**Acceptance**
- No unexplained critical/high vulnerability remains at release.
- Accepted exceptions document package, advisory, exposure and mitigation.
- Clean install and tests remain green.

### R5-15 — Validate the package users will install

**Files:** `.github/workflows/ci.yml`, `package.json`, `eslint.config.mjs`, tsconfigs

**Observed**
- CI runs install, app typecheck, test typecheck and tests.
- CI does not run `npm run build`, `npm run lint`, or `npm pack --dry-run`.
- Package declares Node `>=18`, but the CI matrix only tests Node 20 and 22.

**Required**
- Add build, lint and package dry-run steps.
- Add package smoke test: install packed tarball in a temp directory and verify `air --help` and a read-only/status command.
- Either test Node 18 or raise the declared minimum to the lowest version actually verified.
- Verify package `bin` works on Windows and Unix-like platforms.

**Acceptance**
- CI validates build, lint, tests, package contents and installed CLI behavior.
- Engine declaration matches supported/tested versions.

### R5-16 — Strengthen actual adapter and MCP integration tests

**Files:** adapter tests and MCP tests

**Observed**
- New adapter tests assert command builder output but do not invoke the installed CLI.
- MCP tests mostly call internal helpers or check exported functions; they do not exercise the stdio JSON-RPC transport end-to-end.
- This can let assumed command syntax and incomplete MCP wiring look complete.

**Required**
- Keep mock-process tests as the standard offline suite.
- Add mock executable end-to-end tests through the production registry and CLI path.
- Add MCP stdio integration test for run, status, output, approval and cancel.
- Real adapter smoke tests should be opt-in and use installed tools; no paid API calls in the standard suite.
- Do not treat command-builder unit tests as external CLI verification.

**Acceptance**
- Mock end-to-end CLI and failover tests pass.
- MCP stdio integration proves background execution, polling, output retrieval, approval and cancellation.
- Adapter verification remains separate from command-builder tests.

---

## 4. P2 — Documentation and polish

### R5-17 — Synchronize README, PLAN and behavior specification

**Files:** `README.md`, `PLAN.md`, `docs/behavior-spec.md`, `docs/adapters/*.md`

**Observed**
- README says 94 tests pass; latest suite has 144 tests, with one failing on Ubuntu.
- README known limitations still say MCP approval does not continue execution and MCP `run_task` waits for the full process, while current source contains background jobs and a continuation path.
- README says lint is not configured, but `package.json` and `eslint.config.mjs` configure it.
- `docs/behavior-spec.md` exit-code table lists 0–4; source defines 5 (`NO_CHANGES`) and 6 (`TIMEOUT`).
- Unverified adapters are listed in the adapter table alongside verified ones.

**Required**
- Separate implemented+verified, implemented+unverified, experimental and unsupported.
- Update test count only after latest CI is green.
- Document all exit codes.
- Do not claim CLI ask mode can approve/continue if it only proposes and exits.

**Acceptance**
README, PLAN, behavior spec, CLI help and actual runtime agree.

### R5-18 — Make the README quick start executable

**File:** `README.md`

**Observed**
Quick start shows:

```bash
npm install
npm run dev
air --help
```

A local npm install does not normally put the local `air` binary on the user's interactive shell PATH. `npm run dev` only runs the script for that command.

**Required**
Use a reproducible local command, for example:

```bash
npm ci
npm run dev -- --help
```

For global CLI installation, document build + `npm link` or tarball installation explicitly.

**Acceptance**
A new developer can follow the quick start verbatim from a clean clone.

### R5-19 — Reconcile the exit-code helper with the public contract

**Files:** `src/types/exit-codes.ts`, tests and docs

**Observed**
- `EXIT_CODES.NO_CHANGES` is 5.
- `exitCodeFor('NO_CHANGES')` returns `EXIT_CODES.SUCCESS` (0).
- CLI's direct run path exits with code 5 for `NO_CHANGES`.
- Tests currently expect the helper to return 0.

**Required**
Choose one public contract. Prefer retaining code 5 if callers need to distinguish a write task that produced no changes. Update helper, tests, docs and CLI consistently.

**Acceptance**
The helper, CLI, tests, README and behavior spec agree.

---

## 5. Recommended implementation order

| Order | Work | Gate |
|---|---|---|
| 1 | R5-01 CI path failure | Latest required CI matrix is green |
| 2 | R5-02 adapter verification gate | Unverified binaries cannot be selected |
| 3 | R5-03 provider/model identity and config | Route, command, cooldown and allow-list use the same identity |
| 4 | R5-04/R5-05 candidate search and approval | CLI and MCP can safely select, disclose, approve and continue |
| 5 | R5-06 streaming redaction | Split secrets never leak; output is not duplicated |
| 6 | R5-07 workspace baseline/handoff | Initial user state is not misclassified as agent work |
| 7 | R5-08 MCP output | Output retrieval returns bounded, redacted output |
| 8 | R5-09/R5-10 concurrency and buffers | Concurrent runs are safe; output limits are observable |
| 9 | R5-11/R5-12/R5-13 config, health, permissions | Runtime policy matches config and cancellation does not degrade health |
| 10 | R5-14/R5-15 dependency and release CI | Audit triaged; build/lint/package smoke green |
| 11 | R5-16 through R5-19 tests/docs/exit helper | Documentation reflects verified behavior |

---

## 6. Release acceptance checklist

- [ ] Latest CI green on Ubuntu/Windows and all supported Node versions.
- [ ] `npm ci`, typechecks, build, lint, tests and package smoke test pass.
- [ ] Unverified adapters visible but disabled from default routing.
- [ ] Provider/model metadata corresponds to the actual CLI invocation.
- [ ] Actual first selected candidate defines the provider allow-list.
- [ ] Blocked candidates do not stop search for later permitted candidates.
- [ ] CLI ask mode can approve and continue the same task.
- [ ] MCP approval binds to exact displayed destination and consent.
- [ ] No hard-coded failover destination.
- [ ] Split-secret tests prove no partial secret is emitted.
- [ ] Streaming overlap is not duplicated.
- [ ] `--allow-dirty` result uses the initial workspace snapshot.
- [ ] Handoff handles untracked files and reports omissions.
- [ ] MCP `get_task_output` returns persisted, bounded and redacted output.
- [ ] Concurrent runs cannot lose task-index or health updates.
- [ ] Output truncation metadata is byte-correct and exposed.
- [ ] User cancellation does not degrade provider health.
- [ ] Default permission flags do not broaden access without explicit policy.
- [ ] Critical/high npm audit findings resolved or documented with rationale.
- [ ] README, PLAN, behavior spec and CLI help agree.

---

## 7. Preserve these good decisions

Do not regress:
- Headless operation and argument-array process spawning.
- Shared process runner.
- Provider/model-level cooldown concept.
- Canonical error categories and task result states.
- Git-state handoff rather than model-generated progress summary.
- Secret redaction before persistence and handoff.
- Default dirty-tree refusal.
- No automatic reset, stash, clean, commit or push.
- Asynchronous MCP task model.
- Explicit user control over provider destination.
- Simple priority-list router before introducing complex scoring.

---

## 8. Final instruction to the implementation agent

The architecture is sufficiently mature. Do not start another redesign or add more adapters before fixing the release blockers.

The core release proof must demonstrate this complete mock scenario:

> Start with a clean Git baseline → Agent A edits files → Agent A hits a rate limit → AIR saves the state and cooldown → AIR finds a real eligible Agent B → AIR discloses its provider/model and the data that will be sent → user approves → Agent B receives a safe handoff and continues from the actual working tree → final outcome is computed against the initial baseline → CLI/MCP status and output match the real run.

Only after this scenario, the acceptance checklist, and the CI matrix pass should AIR be described as release-ready.
