# claude_plan_review_v3.md

## 0. How to use this document

- Review round 3 of the `air` repo. Earlier rounds: `claude_plan_review.md` (`R-01`..`R-14`), `claude_plan_review_v2.md` (`N-01`..`N-14`). New findings here are `F-01`..`F-18`.
- Treat every item as a change request. Reference IDs in commit messages.
- MUST = required. SHOULD = do unless a reason is documented in `PLAN.md`. MAY = optional.
- Work in the order of section 5. Every finding has a repro or evidence line and an acceptance check; do not mark an item done without its check passing.
- Verdict: the repo is NOT done. A lot of good work landed (section 2), but the production path (built CLI, config trust, failover with real adapters, Ctrl+C) is broken in ways the test suite does not catch, because tests run through vitest/tsx and use the mock adapter.

### Review basis

- Fresh clone of `main` at commit `653c268` (19 commits since round 2; 107 files changed).
- Ran: `npm ci`, `npm run build`, `npm run typecheck`, `npm run lint`, `npm test`, `node dist/bin/air.js --help` (from an unrelated directory), plus three throwaway probe tests (config merge, allow-list with real adapter objects, verify-trust check). Probes were deleted afterwards.
- Read: `PLAN.md`, `package.json`, tsconfigs, CI workflow, `bin/air.ts`, `src/config/*`, `src/security/*`, `src/context/*`, `src/execution/runner.ts`, `src/router/router.ts`, `src/types/errors.ts`, all adapters, `src/mcp/server.ts` (structure only), adapter docs for aider/goose/opencode.
- NOT verified: any CLI flag of aider/goose/opencode/kilocode/codex/gh, model IDs in `config/models/aider-free-models.yml`, `tests/` contents beyond names and the failing one, `docs/behavior-spec.md`, the `docs/reviews/*` files.

## 1. Verified results (facts from running the repo)

| Check | Result |
|---|---|
| `npm ci` | OK |
| `npm run build` | OK (but see next row) |
| `node dist/bin/air.js --help` (any directory) | CRASHES: `ERR_MODULE_NOT_FOUND: Cannot find module '.../dist/src/config/loader' imported from .../dist/bin/air.js` |
| `npm run typecheck` | OK |
| `npm test` (Linux, Node 22) | 143 pass, 1 FAIL: `tests/paths.test.ts > resolves Windows paths` (expected `C:/AppData/air`, got `C:\AppData/air`) |
| `npm run lint` | FAILS: 122 errors, 25 warnings (breakdown in F-15) |
| CI (`.github/workflows/ci.yml`) | Runs typecheck, typecheck:test, test only. No build, no lint, no run of the built CLI. Matrix: ubuntu+windows, Node 20+22 |
| `package.json` | `main` fixed, `zod` + `cross-spawn` added, `ajv` + `inquirer` removed, MCP SDK pinned to `1.32.2`; `engines.node` still `>=18.0.0` |
| `PLAN.md` "Current state" | Claims "144 tests passing" and "CLI verified" — both are false on a clean Linux clone |

## 2. What is good (keep)

- Single error taxonomy with `ERROR_POLICY` as the only action authority (`src/types/errors.ts`).
- Exit-code table, result states (`NO_CHANGES`, `NEEDS_USER_REVIEW`, ...), read-only task flag, hop cap, visited set, per-run traces with rotation, atomic file writes.
- Shared runner: `cross-spawn`, array args, stdin closed, bounded buffers, streaming redaction, async tree-kill, process facts (timeout/cancel/spawn error) take precedence over stderr matching.
- Mock tool fixture and 144 tests; adapter conformance tests; dirty-tree guard; MCP async jobs.
- Adapter docs with exact installed versions for aider (0.86.2) and goose (1.57.0).

## 3. Audit of earlier items

Status: DONE = in code and verified. PARTIAL = implemented but incomplete or broken (finding ID given). NOT DONE = absent. DEVIATED = different decision, documented or not.

| ID | Topic | Status | Notes |
|---|---|---|---|
| R-01 | Vertical slice first | DONE | Phase order followed |
| R-02 | Mock tool + tests | DONE | `tests/fixtures/mock-tool.js`, 25 test files |
| R-03 | (provider, model) cooldown keys | PARTIAL | Tracker keyed correctly, but keys come from hard-coded labels: F-05 |
| R-04 | Classify from exit code + stderr only | PARTIAL | Patterns too loose, no real samples: F-11 |
| R-05 | Repo state at failover | PARTIAL | Snapshot + dirty-tree refusal done; change detection wrong: F-07 |
| R-06 | Mechanical handoff + task state | PARTIAL | Exists; leaks data: F-08 |
| R-07 | Provider allow-list | PARTIAL | Default-deny exists, not configurable, blocks all real failover: F-04 |
| R-08 | Headless, no-prompt MCP, async jobs, atomic writes | PARTIAL | Done, but orchestration duplicated in CLI and MCP: F-13 |
| R-09 | Verify CLIs via spikes; limit to two tools | PARTIAL | aider/goose spiked; four unverified adapters routed in production: F-10 |
| R-10 | cross-spawn, tree kill, Ctrl+C | PARTIAL | Ctrl+C / signal handling missing: F-06 |
| R-11 | Hop cap, exit codes, success definition | PARTIAL | Table done; `ask` mode exit code wrong, verify unwired: F-12, F-14 |
| R-12 | Config decoupling | PARTIAL | Zod single source done; env dir overrides missing: F-16 |
| R-13 | Traces + `--explain` | DONE | |
| R-14 | Package fixes | PARTIAL | `main`, deps, SDK pin done; `engines`, lint not: F-15 |
| N-01 | ESM module resolution | NOT DONE | Changed to `bundler` (not `NodeNext`); built CLI crashes: F-01 |
| N-02 | Baseline commands green | PARTIAL | `npm test` and `npm run lint` not green: F-15 |
| N-03 | Repo config is untrusted | NOT DONE | Everything accepted from repo config: F-02, F-03 |
| N-04 | Permission modes per tool | NOT DONE | `--read-only` only relabels results: F-09 |
| N-05 | Move handoff + allow-list into Phase 2 | DONE (in code) | But failover never succeeds in production: F-04 |
| N-06 | Worktree isolation | DEVIATED | Snapshot-only; edits land in user's tree. Acceptable only if F-07 and F-08 are fixed |
| N-07 | Adapter contract (provider/model/classify) | PARTIAL | Contract exists; no permission modes; values hard-coded: F-05 |
| N-08 | Exit codes + success semantics | DONE | |
| N-09 | Config + paths | PARTIAL | `AIR_CONFIG_DIR`/`AIR_CACHE_DIR` not implemented: F-16 |
| N-10 | Model list tooling | PARTIAL | `air models` lists adapters; it does not check provider model availability; `.ps1` still the only refresher |
| N-11 | CI on Windows + Linux | PARTIAL | Exists; missing build/lint/smoke: F-15 |
| N-12 | Split Phase 2 | DONE (moot) | Code is layered; plan table still shows old phases |
| N-13 | Spike checklist | PARTIAL | Docs lack captured stderr/exit-code samples: F-11 |
| N-14 | Review docs hygiene | DONE | Moved to `docs/reviews/` |

## 4. Findings

### P0 — blocks calling the project done

#### F-01 The built CLI does not start (P0)

- Evidence: `npm run build && cd /tmp && node /path/to/air/dist/bin/air.js --help` -> `ERR_MODULE_NOT_FOUND ... dist/src/config/loader`. `package.json` `bin` points at this file, so `npm link`/`npm i -g` produce a broken `air` command.
- Cause: `"type": "module"` + `"moduleResolution": "bundler"` + extensionless relative imports (`'../src/config/loader'`). `bundler` assumes a bundler resolves the imports; plain `tsc` output does not. `tsx` and vitest resolve extensionless imports, so dev and tests hide it. This is the exact failure predicted in N-01; changing to `bundler` removed the deprecation warning but not the bug.
- Change:
  - MUST choose ONE of: (a) `"module": "NodeNext"`, `"moduleResolution": "NodeNext"`, and `.js` extensions on every relative import in `bin/` and `src/`; or (b) bundle the CLI with `tsup`/`esbuild` into `dist/` and point `bin`/`main` at the bundle. (a) is the smaller change.
  - MUST add a test that runs the built output: build, then spawn `node dist/bin/air.js --help` from a temp directory and `status --json`, asserting exit 0 and parseable output.
  - MUST remove `"CLI verified"` from `PLAN.md` until this passes.
- Acceptance: on a clean clone, `npm ci && npm run build && node dist/bin/air.js --help` works from any directory, on Windows and Linux CI.

#### F-02 Repo `.airrc.yaml` is fully trusted (N-03 not implemented) (P0, security)

- Evidence (probe): a repo `.airrc.yaml` containing `failover.mode: auto`, `failover.allowProviderSwitch: true`, `redaction.enabled: false`, `verify.enabled: true` + `verify.command: ./evil.sh`, and `tools: [{id: aider, executable: ./evil.sh}]` loaded with `errors: []` and every value took effect. `strict` mode only rejects unknown top-level keys.
- Evidence (probe): `checkVerifyTrust([cwd + '/evil.sh'], [], '/some/repo')` returns `{ trusted: true, source: 'cli' }`. The "CLI-supplied" test is `command[0].startsWith(process.cwd())`, which is a path-prefix check, not a source check. There is also no `trustedRepos` key in the config schema, so the list the function expects does not exist.
- Today `tools[].executable` is not read anywhere, so this is latent; it becomes arbitrary command execution the moment F-05 wires tool config in.
- Change:
  - MUST track the origin of every config value (`cli | env | global | repo`).
  - MUST define repo-safe keys (priority order, task patterns, verify command *definition*, timeouts within caps) and global-only keys (provider/model allow-lists, `failover.mode`, `failover.allowProviderSwitch`, `redaction.*`, `tools[].executable`, `trustedRepos`, permission modes). Global-only keys found in repo config MUST be ignored with a warning naming file and key.
  - MUST add `trustedRepos: string[]` to the global schema. A repo-sourced `verify.command` MUST run only if the repo's real path (after `realpath`) is in `trustedRepos`. A command given on the CLI is trusted because of its origin, never because of its path. Delete the `startsWith(process.cwd())` logic.
  - MUST NOT allow repo config to disable redaction or logging redaction.
- Acceptance:
  - Test: each of the five probe settings above, placed in a repo config, has no effect and produces a warning.
  - Test: repo `verify.command` with an absolute path inside the repo is refused unless the repo is trusted; a CLI-supplied command runs.

#### F-03 A repo config silently resets global settings (P0)

- Evidence (probe): global config `timeouts.defaultMs: 900000`, `failover.maxHops: 5`. Without a repo config: 900000 / 5. With a repo `.airrc.yaml` containing only `tools: []`: 300000 / 3.
- Cause: Zod `.default({})` fills every missing section with defaults when parsing the repo file, and `merge()` then overwrites the global values with those defaults.
- Change:
  - MUST parse each layer as partial (no defaults applied per layer), merge deeply by origin precedence, and apply defaults once at the end.
  - SHOULD unit-test merge with a table of layer combinations.
- Acceptance: test that a repo config with one key changes only that key; a global value survives an unrelated repo config.

#### F-04 Failover cannot succeed with the real adapters (P0)

- Evidence (probe, real adapter objects): default allow-list = first adapter's provider+model (`openrouter` / `gemma-4-31b-it:free`).
  - aider -> goose: blocked, `provider openai not in allow-list`.
  - aider -> codex: blocked, same reason.
  - aider -> opencode: allowed, but opencode (and kilocode) have the SAME provider+model as aider, so after a rate limit the router skips them as `cooldown_active`.
  - There is no config key to widen the allow-list (`allowProviderSwitch` is a boolean that nothing reads).
- Evidence (code, `bin/air.ts`): only `RATE_LIMIT`, `QUOTA_EXCEEDED`, `TIMEOUT` set a cooldown. `MODEL_UNAVAILABLE`, `PROCESS_CRASH`, `CONTEXT_LENGTH` have policy `propose_switch` but no cooldown, so the next `selectCandidate` returns the same adapter and the loop exits with "already visited; refusing to loop" (exit 3).
- Evidence (code): the loop computes `next` (for the allow-list check and the handoff text) but then `continue`s and calls `selectCandidate` again over ALL adapters. The adapter that actually runs next can differ from the one named in the handoff.
- Tests did not catch it because they use mock adapters that share one allow-list.
- Change:
  - MUST add global config for privacy: `privacy.allowedProviders` (and optionally models). Default stays "first-attempt provider only".
  - MUST make selection take an `exclude` set (visited keys) so the router skips visited candidates instead of the loop aborting.
  - MUST run the candidate that was checked against the allow-list and named in the handoff (select once, check, run that one).
  - MUST add a model-level cooldown for `MODEL_UNAVAILABLE` and a short per-attempt exclusion for `PROCESS_CRASH`/`CONTEXT_LENGTH`, so the router moves on.
  - MUST add an end-to-end failover test using the REAL adapter classes with fake `aider`/`goose` executables (small scripts put first on `PATH`) that simulate rate limit, and assert the second tool runs with the handoff in its argv. Run it against the built `dist` output.
- Acceptance: that end-to-end test passes on Linux and Windows CI; with `privacy.allowedProviders: [openrouter, openai]` aider -> goose succeeds, without it the run stops with a clear "provider not allowed" message and the right exit code.

#### F-05 Provider/model labels are hard-coded and tool config is ignored (P0)

- Evidence: `AiderAdapter` has `provider = 'openrouter'`, `model = 'gemma-4-31b-it:free'` as constants, but `buildCommand` passes `--model` only if `task.preferredModel` is set; otherwise aider uses its own configured default. `GooseAdapter` has `openai` / `gpt-4o`, but `docs/adapters/goose.md` says model/provider are chosen by recipe/environment, not flags. Codex and `gh` also use constants. `config.tools[].{enabled, executable, provider, model}` is parsed by Zod and never read (grep finds no use outside the schema). Adapter order is the order in `registry.ts`, so priority cannot be configured.
- Impact: cooldown keys (R-03), the allow-list (R-07) and every privacy decision are computed from labels that may not describe what actually runs. A user whose aider sends to Anthropic would be tracked and "allow-listed" as OpenRouter/gemma.
- Change:
  - MUST build adapters from config: `provider`, `model`, `executable`, `enabled`, and priority order come from `config.tools[]` (global-only for `executable`, see F-02).
  - MUST make the adapter pass the same model it reports (aider `--model`, goose via the env/recipe mechanism documented in the spike). If the adapter cannot guarantee the reported model, it MUST report `provider: 'unknown'` and the router MUST treat unknown as "not allowed to fail over to or from" unless the user configured it.
  - `air status` / `route-test` MUST show provider/model and whether each came from config or a default.
  - MUST NOT ship a default model that the user never chose; if no model is configured, say so in `air status`.
- Acceptance: test that changing `tools[].model` changes the argv passed to the child and the cooldown key; test that a tool with no configured model shows `unconfigured`.

#### F-06 No signal handling; Ctrl+C orphans the child on Unix (P0)

- Evidence: `grep SIGINT|SIGTERM|process.on` over `bin/` and `src/` finds nothing. `runAction` never passes an `AbortSignal` to `runProcess`, so `cancelled` can never be true from the CLI. On Unix the runner spawns children with `detached: true` (own process group) so the terminal's Ctrl+C reaches `air` only; `air` dies and aider keeps running and editing files.
- Change:
  - MUST create an `AbortController` per run; on `SIGINT`/`SIGTERM` (and Windows console close) abort it, kill the child tree, write task state `CANCELLED`, flush the health tracker, exit with `EXIT_CODES.USER_CANCELLED`.
  - MUST do the same for MCP job cancel and server shutdown.
- Acceptance: test that spawns the built CLI against a hanging mock tool, sends SIGINT, and asserts no child process remains and the task state is `CANCELLED` (Windows variant via `taskkill` assertions).

#### F-07 "Changed files" detection is wrong when the tree is dirty or after attempt 1 (P0)

- Evidence (`bin/air.ts`): `beforeSnap` is computed and never used. `changed` is `afterSnap` having any staged/unstaged/untracked files at all. With `--allow-dirty` (pre-existing changes) or on a second attempt after partial edits, `changed` is always true, so `NO_CHANGES` can never be reported and a no-op run is shown as `SUCCEEDED_WITH_CHANGES`. Comparing file lists would also miss a tool re-editing a file that was already modified.
- Change:
  - MUST compute a fingerprint before and after each attempt (e.g. hash of `git diff HEAD` plus a hash of each untracked file's content, size-capped) and compare.
  - MUST report the per-attempt delta, not the cumulative dirty state.
- Acceptance: tests for (a) clean tree, tool changes nothing -> `NO_CHANGES`; (b) dirty tree, tool changes nothing -> `NO_CHANGES`; (c) dirty tree, tool edits an already-modified file -> `SUCCEEDED_WITH_CHANGES`; (d) second attempt after partial edits.

### P1 — fix before relying on it

#### F-08 Handoff leaks data and includes unrelated work (P1)

- Evidence (`src/context/handoff.ts`): only `outputTail` goes through `redact`. The `git diff`, `prompt`, `summary` and file list do not. `git diff HEAD` also includes the user's own uncommitted changes (with `--allow-dirty`), which are then sent to the next provider; new untracked files appear by name only. The diff is cut at 4096 bytes by character count.
- Change:
  - MUST pass the entire assembled pack through the redaction choke point once, as the last step.
  - MUST build the diff from the attempt delta (F-07 baseline), not the whole tree. Exclude paths matching a secrets deny-list (`.env*`, key files) from the diff and the tail.
  - SHOULD include small untracked text files within the byte cap; cap by bytes, not characters.
  - MUST show the user (in `ask` mode) which provider receives the handoff and the byte size, before sending.
- Acceptance: test with a fixture secret in the prompt, the diff, and stderr — it appears nowhere in the pack; test that pre-existing dirty changes are absent from the handoff.

#### F-09 `--read-only` is a label, not a permission (N-04 not implemented) (P1, security)

- Evidence: adapters ignore `task.readOnly`. aider is always launched with `--yes-always`. A "read-only" task can still edit files; the only effect is that a changed tree yields `NEEDS_USER_REVIEW`. There is no permission-mode concept in the adapter contract.
- Change:
  - MUST add `permissionMode` (`read_only | edit | edit_and_shell`) to the adapter contract with `supportedPermissionModes`. An adapter that cannot enforce the requested mode MUST refuse it (router skips it with reason `permission_mode_unsupported`).
  - MUST map modes to the real flags found in the spikes (for aider, check whether an ask-only chat mode exists in 0.86.2 and record it in `docs/adapters/aider.md`).
  - Default `edit`. `edit_and_shell` MUST be settable only from CLI, env or global config (F-02).
  - MUST record the effective mode in the trace and the task state.
- Acceptance: test that a read-only task is never routed to an adapter that cannot enforce it; adapter argv tests per mode.

#### F-10 Unverified adapters are in the production route (P1)

- Evidence: `registry.ts` auto-registers `opencode`, `kilocode`, `codex` and `gh` whenever the binary is on `PATH`. Their docs say `UNVERIFIED` and "assumed" flags (`run --prompt ... --yes`, which auto-approves). `PLAN.md` itself says additional adapters come after verification (Phase 5). `codex exec --skip-git-repo-check` disables a safety check. `gh` is "available" for anyone with the GitHub CLI, whether or not the copilot extension exists. Round 1 (R-09) asked to drop these from the initial scope.
- Change:
  - MUST register only verified adapters by default (aider, goose). Others MUST require `experimental: true` per tool in global config.
  - `gh` detection MUST check the copilot extension, not just `gh` on `PATH`.
  - MUST NOT pass auto-approve or git-guard-disabling flags from an unverified spike.
  - Each adapter promoted from experimental MUST have a spike doc with the N-13 fields and captured samples (F-11).
- Acceptance: with only `codex` on `PATH` and no config, `air status` lists it as experimental/disabled and `route-test` never chooses it.

#### F-11 Error classification is too loose and has no real samples (P1)

- Evidence (`aider.ts`, copied to the other adapters): `/429/` and `/401/` match any number containing those digits (line numbers, ports, hex). `NOT_FOUND_RE = /not found|not installed|enoent/` matches "file not found" or "module not found" in stderr and classifies it `TOOL_NOT_INSTALLED`, whose policy is `stop_ask_user`. `/timeout|timed out/` matches provider/network timeouts and is treated as the tool timing out. `docs/adapters/aider.md` says "stderr contains provider error" without a captured sample, so the patterns are unvalidated (N-13).
- Change:
  - MUST capture real stderr + exit code samples per tool for: rate limit, auth failure, bad model, context too long, network failure (offline or blocked), and store them under `tests/fixtures/samples/<tool>/`. Classification tests MUST assert against those files.
  - MUST anchor numeric codes (`\b429\b` with HTTP/status context) and prefer the provider's message text.
  - `TOOL_NOT_INSTALLED` MUST come only from a spawn error (`ENOENT`), never from stderr text.
  - Add a `NETWORK_ERROR` match (it exists in the taxonomy but no adapter produces it) and make its `retry_same` action bounded (max retries + backoff).
  - Share the regex set in one module instead of copy-pasting it across six adapters.
- Acceptance: classification tests run on the captured samples; a stderr line "FileNotFoundError: x.py not found" is `TASK_FAILURE`.

#### F-12 `ask` mode never asks; TIMEOUT cooldown; missing-tool handling (P1)

- Evidence (`bin/air.ts`): with default `failover.mode: ask`, a failover-worthy failure prints "Failover proposed" and exits 3 — the same code as "all candidates exhausted". The user cannot tell "I have a proposal" from "nothing is left". A TIMEOUT sets a 60-minute cooldown on the whole provider/model, although a long task hitting the timeout says nothing about the provider's health. `TOOL_NOT_INSTALLED` (spawn error) exits the run instead of skipping to the next tool.
- Change:
  - MUST add a distinct exit code and `--json` payload for "failover proposed" (with the proposed candidate, destination provider, and the exact command to approve, e.g. `air run --auto ...` or `air approve <runId>`). If stdin is a TTY, MAY prompt with `readline`; never prompt in MCP mode.
  - TIMEOUT SHOULD NOT start a provider cooldown (or only a very short one); record it in health stats only.
  - Spawn errors MUST mark the tool unavailable for this run and continue to the next candidate.
- Acceptance: table-driven test of failure category -> exit code, cooldown set (yes/no), next action.

#### F-13 Orchestration is duplicated in CLI and MCP (P1)

- Evidence: `runAction` in `bin/air.ts` (about 200 lines, with `console.log` and `process.exit` inside) and `src/mcp/server.ts` (395 lines) each implement run, classify, cooldown, failover, handoff. F-04 and F-07 would have to be fixed twice.
- Change:
  - MUST extract `src/orchestrator/` exposing `runTask(input, deps): Promise<RunResult>` and a step API for MCP approval (`proposeNext`, `continueWith`). No `process.exit`, no `console` inside; dependencies (adapters, tracker, clock, snapshot, runner) injected.
  - `bin/air.ts` and `src/mcp/server.ts` MUST be thin wrappers that format output and map results to exit codes.
  - Existing CLI and MCP tests MUST keep passing against the wrappers.
- Acceptance: both entry points call the same function; one failover test file covers both paths with injected fakes.

#### F-14 Verify hook is not wired into `air run` (P1)

- Evidence: `config.verify` (`enabled`, `command`) is parsed and never read. `runVerify` is only reachable through the standalone `air verify <cmd>` command. `PLAN.md` lists "verify hook" under Phase 5 as done. `runVerify` also uses `execFileSync` (blocks the event loop, and in the MCP server it would stall other jobs) and discards stderr (`stdio: ['ignore','pipe','ignore']`), so `VerifyResult.stderr` is always empty.
- Change:
  - MUST either wire it (after a successful edit run, run the trusted verify command, add result state `VERIFY_FAILED`, include the report in the trace) or state in `PLAN.md` that it is standalone-only and remove `verify.*` from the schema.
  - If kept: use the shared async runner (timeouts, tree-kill, redaction), capture stderr, apply the trust rule from F-02.
- Acceptance: test that a failing verify command changes the result and exit code; untrusted repo verify is refused.

### P2 — hygiene

#### F-15 Tests, lint, CI and engines (P2, but needed for "done")

- `tests/paths.test.ts` fails on Linux. `normalize()` in `src/config/paths.ts` splits on the host `sep`, so Windows path logic only works on Windows. Make path building use `path.win32`/`path.posix` explicitly according to the platform argument, and test all three platforms on every OS.
- `npm run lint`: 122 errors. About 73 are parse errors because ESLint lints `dist/*.d.ts`, `tests/` and `vitest.config.ts`, none of which are in the project used for typed linting; 33 are `no-console` in `bin/air.ts` (a CLI prints by design). Fix with an ignore for `dist`, `parserOptions.project` pointing at `tsconfig.test.json` (or a lint-specific tsconfig), and `no-console` off for `bin/` and the output layer. Then triage the real `no-unused-vars` and `no-explicit-any` items.
- CI MUST add: `npm run build`, `npm run lint`, and the built-CLI smoke test from F-01. Keep the Windows+Linux matrix.
- `engines.node` is `>=18.0.0` while CI tests 20 and 22 and `@types/node` is 20. Set `>=22` (or declare the minimum you actually test), and align `@types/node`.
- `eslint@8` is deprecated; plan an upgrade to ESLint 9 flat config (`eslint.config.mjs` already exists).
- Root `cross-spawn.d.ts` duplicates `src/types/cross-spawn.d.ts`; the runner comment says cross-spawn is "ESM-only" and imports it dynamically, which is unnecessary (it is CommonJS and works with `esModuleInterop`). Use a normal import and delete one `.d.ts`.
- Acceptance: `npm ci && npm run build && npm run typecheck && npm run typecheck:test && npm run lint && npm test` exits 0 on Linux and Windows; CI runs all of these.

#### F-16 Test isolation: env dir overrides missing (P2)

- Evidence: `AIR_CONFIG_DIR` / `AIR_CACHE_DIR` (N-09) appear nowhere in `src/`. During review, setting `AIR_CONFIG_DIR` did nothing and a probe wrote to the default `~/.config/air/config.yaml`. The test suite can therefore read and write the developer's real config, cache, health file and tasks.
- Change: MUST implement both env overrides in `src/config/paths.ts`, and MUST set them to a temp directory in a vitest global setup so no test touches the real home. Add a test asserting that after the suite no file was created under the real config/cache dirs (or that the setup fails if `HOME`-based paths are resolved).

#### F-17 Child processes receive the full environment (P2, security)

- Evidence: `runProcess` spawns with `{ ...process.env, ...spec.env }`. Every tool inherits every provider's API keys and tokens in the user's environment. A fallback tool therefore holds keys for providers it should never use, and unverified adapters get them too.
- Change: SHOULD build a minimal env per adapter: base (`PATH`, `HOME`/`USERPROFILE`, `SystemRoot`, temp dirs, locale, proxy vars) plus only the key variables that adapter declares. Document the list in each spike doc. The aider adapter already forwards `OPENROUTER_API_KEY` explicitly, which would then be redundant.
- Acceptance: test that a canary env var not declared by the adapter is absent in the child.

#### F-18 Plan and docs must match reality (P2)

- `PLAN.md` "Current state" claims 144 passing tests, all commands green and "CLI verified". Update it from an actual clean-clone run after fixing F-01 and F-15, and keep it to facts that CI proves.
- Phase table still shows the original six phases while the code and the "Reviews applied" list describe more; either update the table or delete it in favor of a short status list.
- `PLAN.md` is 389 lines with sections repeated (File Structure twice, "Reviews applied" twice). Collapse into one plan: goal, architecture, decisions, status.
- Record accepted deviations explicitly: no worktree isolation (N-06), and the rule that makes F-07/F-08 safe instead.

## 5. Work order to finish

| Step | Items | Done when |
|---|---|---|
| 1 Make it run | F-01, F-15 (build/lint/smoke in CI), F-16 | Clean clone: build, built `air --help`, lint, tests green on both OSes |
| 2 Fix trust and config | F-02, F-03 | Repo-config probe tests pass; global values survive repo config |
| 3 Make adapters honest | F-05, F-10, F-09, F-17 | Provider/model/executable/priority come from config; only verified adapters routed by default; permission modes enforced or refused |
| 4 Extract orchestrator and fix failover | F-13, F-04, F-12, F-06, F-07 | End-to-end failover test with fake aider/goose executables on the built CLI passes; Ctrl+C test passes; no-change detection tests pass |
| 5 Make handoff safe | F-08 | Redaction and delta-only handoff tests pass |
| 6 Make classification evidence-based | F-11 | Samples in `tests/fixtures/samples/`; classification tests run on them |
| 7 Close the loop | F-14, F-18 | Verify wired or removed; plan reflects reality |

## 6. Definition of done for the project

- Clean clone, CI green on Windows and Linux, including build, lint, tests and a run of the built CLI.
- A real (not mock) failover run is demonstrated by an automated test using fake tool executables, and once manually with two real tools; the result is recorded in `docs/`.
- No config value from a repo file can widen provider access, enable auto-failover, change executables, disable redaction, or run commands without the repo being trusted in global config.
- `PLAN.md` states only what the tests prove.
