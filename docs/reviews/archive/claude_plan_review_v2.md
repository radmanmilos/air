# claude_plan_review_v2.md

## 0. How to use this document

- This is review round 2 of the `air` repo. Round 1 was `claude_plan_review.md` (items `R-01`..`R-14`). New items here are `N-01`..`N-14`.
- Treat every item as a change request. Reference IDs in commit messages.
- MUST = required. SHOULD = do unless a reason is documented in `PLAN.md`. MAY = optional.
- Work order: section 3 (baseline fixes) -> section 4 (plan corrections) -> section 5 (remaining phases). Do not start Phase 1 until section 3 passes.
- This document supersedes round-1 advice only where it says so. `PLAN.md` stays the single source of truth; update it as you go.

### Review basis

- Reviewed commit `22522d8` (4 commits on `main`): `PLAN.md`, `README.md`, `package.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`, `bin/air.ts`, `src/index.ts`, `tests/README.md`, `config/models/*`.
- Ran in a clean clone: `npm install`, `npm run build`, `npm run typecheck`, `npm test`, `npm run lint`, `node dist/bin/air.js --help`.
- Skimmed only the headings of `project_reviews/chatGPT_plan_review.md` (not audited line by line).
- Not verifiable by the reviewer: any CLI flag of aider/goose/opencode/kilocode, and whether the model IDs in `config/models/aider-free-models.yml` exist.

## 1. Verified baseline (facts from running the repo)

| Check | Result |
|---|---|
| `npm install` | OK |
| `npm run build` | OK. Output is `dist/bin/air.js` and `dist/src/index.js` |
| `npm run typecheck` | OK |
| `node dist/bin/air.js --help` | OK. Lists run, status, health, route-test, config, mcp |
| `npm test` | FAILS: vitest reports "No test files found, exiting with code 1" |
| `npm run lint` | FAILS: `eslint` is not installed and there is no eslint config |
| `package.json` `main` | `./dist/index.js`, but the file is actually `dist/src/index.js` (broken) |
| `package.json` `bin` | `./dist/bin/air.js` (correct) |
| Dependencies present | commander, yaml, ajv, chalk, inquirer, @modelcontextprotocol/sdk `^1.0.0` |
| Dependencies planned but absent | cross-spawn, zod |
| All commands | Stubs printing "Not implemented yet" (expected at this stage) |
| Files with UTF-8 BOM | `PLAN.md`, `config/models/aider-free-models.yml`, `config/models/check-free-models.ps1` |

## 2. Audit of round-1 items (R-01..R-14)

Status: DONE = reflected and verifiable. PLAN = written in the plan, no code yet (acceptable for the current phase). PARTIAL = incomplete or contradictory. OPEN = not addressed.

| ID | Topic | Status | Remaining action |
|---|---|---|---|
| R-01 | Vertical slice first | DONE (plan) | Phase 2 is too large; see N-12 |
| R-02 | Mock adapter + runnable acceptance tests | PLAN | Nothing exists yet; `tests/` holds only a README. Do in Phase 0 |
| R-03 | (provider, model) cooldown keys | PARTIAL | Adapter interface cannot report provider/model; see N-07 |
| R-04 | Error classification from exit code + stderr, never stdout prose | PLAN | Per-tool detail comes from spikes (N-13) |
| R-05 | Repo state at failover | PARTIAL | Plan says "git branch/worktree" (undecided), "don't auto-commit" (contradicts branch checkpoint), no dirty-tree rule, no partial-edit policy; see N-06 |
| R-06 | Mechanical handoff + durable task state | PARTIAL | Scheduled in Phase 3 but Phase 2 failover needs it; see N-05 |
| R-07 | Provider allow-list | PARTIAL | Scheduled in Phase 3 but Phase 2 failover needs it; repo-config trust problem; see N-03, N-05 |
| R-08 | Headless-only, no-prompt MCP, async jobs, atomic writes | DONE (plan) | Add timeout default values and concurrency test in Phase 1 |
| R-09 | Verify CLI flags via spikes; reduce to two tools; drop kilocode | PARTIAL | Plan says "aider + one other (TBD)" and `docs/adapters/` is listed, but no spike checklist or exit criteria are in the plan; see N-13. README still advertises four tools |
| R-10 | cross-spawn, array args, tree kill, Ctrl+C | PLAN | `cross-spawn` not in `package.json` yet; Ctrl+C handling not in plan text |
| R-11 | Hop cap, loop control, exit codes, success definition | PARTIAL | Exit-code table undefined; read-only tasks and "task-complete signal" undefined; see N-08 |
| R-12 | Config decoupling | PARTIAL | Self-contained: DONE. Zod chosen but `config/schema.json` and `ajv` still present; model refresh is Windows-only PowerShell; see N-09, N-10 |
| R-13 | Per-run JSONL trace + `--explain` | PLAN | Trace location not stated in plan |
| R-14 | Package/repo fixes | PARTIAL | DONE: status/health merged (alias), `engines`, `files`, vitest, README marked planned. OPEN: `main` path wrong, `inquirer` still present, MCP SDK still `^1.0.0`, `ajv` still present, `npm test` and `npm run lint` fail |

## 3. Baseline fixes (do first; all P0 unless stated)

### N-01 ESM module resolution will break the built CLI (P0)

- Problem: `package.json` has `"type": "module"` but `tsconfig.json` uses `"module": "ESNext"` with `"moduleResolution": "node"`. TypeScript accepts extensionless relative imports (`import { x } from './foo'`) and emits them unchanged; Node's ESM loader then fails with `ERR_MODULE_NOT_FOUND`. `npm run dev` (tsx) will hide this bug because tsx resolves extensionless imports. It will first appear when `src/` gets a second file imported from `bin/air.ts`.
- Change:
  - MUST set `"module": "NodeNext"` and `"moduleResolution": "NodeNext"` in `tsconfig.json`.
  - MUST write relative imports with `.js` extensions (`import { x } from './foo.js'`).
  - MUST add an import from `bin/air.ts` to a `src/` module now, and a test that runs the built `dist/bin/air.js` (`node dist/bin/air.js --help`) so the failure mode is covered.
- Acceptance:
  - `npm run build && node dist/bin/air.js --help` works with `bin/air.ts` importing from `src/`.
  - A test spawns the built binary and asserts exit code 0.

### N-02 Baseline commands must all be green (P0)

- Change:
  - MUST fix `main` to the real built path (e.g. `./dist/src/index.js`), or set `rootDir: "src"` layout so `main` and `bin` are both correct. Verify with `node -e "import('air')"`-style check or a test that `import()`s the file named by `main`.
  - MUST add one real test now (e.g. CLI `--help` smoke test) so `npm test` exits 0. MUST NOT use `passWithNoTests`.
  - MUST either add `eslint` + `typescript-eslint` + a config, or remove the `lint` script. Prefer adding it; add `npm run lint` to the Phase 1 done-when list.
  - MUST include `tests/**` in typechecking (a `tsconfig.test.json` that extends the base, or include `tests` in `include` with a separate build config that excludes tests from `dist`).
  - SHOULD set `engines.node` to `>=22` (Node 18 and 20 are end-of-life as of this review) and align `@types/node`.
  - SHOULD pin `@modelcontextprotocol/sdk` to a current exact version and read its current API before writing Phase 4 code.
  - SHOULD remove `inquirer`/`@types/inquirer` (use `@inquirer/prompts` or `readline`) and `ajv` (see N-09).
- Acceptance: on a clean clone, `npm ci && npm run build && npm run typecheck && npm run lint && npm test` all exit 0.

### N-11 CI on Windows and Linux (P1, do in Phase 0)

- Problem: the plan requires Windows process tests, and the repo is already on GitHub, but no CI exists.
- Change:
  - MUST add `.github/workflows/ci.yml` with a matrix of `ubuntu-latest` and `windows-latest` running `npm ci`, build, typecheck, lint, test.
  - SHOULD add macOS later, once spawn tests exist.
- Acceptance: CI is green on both OSes for the baseline.

## 4. Plan corrections (edit `PLAN.md`)

### N-03 Repo-local config is untrusted input (P0, security)

- Problem: precedence is `CLI > env > repo > global > defaults`. A cloned repo's `.airrc.yaml` can therefore override global settings. A malicious or careless repo config could widen `privacy.allowed_providers` (sending code to another provider), set `failover.mode: auto`, set tool timeouts/permissions, or define command overrides (arbitrary command execution).
- Change:
  - MUST define a trust boundary in `PLAN.md`: repo config MAY set routing preferences (priority order, task patterns, verify command). Repo config MUST NOT: add or widen provider allow-lists, enable auto-failover, change tool binary paths/commands, loosen permission modes, or disable redaction.
  - Security-sensitive keys MUST come from global config, env, or CLI only. If present in repo config they MUST be ignored with a warning (or require explicit per-repo trust recorded in global config).
  - `verify.command` from repo config runs arbitrary commands: MUST require per-repo trust (global config lists trusted repo paths), otherwise MUST NOT run.
- Acceptance:
  - Test: repo `.airrc.yaml` containing `allowed_providers: [evil]` has no effect.
  - Test: repo `.airrc.yaml` with `failover.mode: auto` is ignored with a warning.
  - Test: untrusted repo `verify.command` does not execute.

### N-04 Specify permission and approval flags per tool (P0, security)

- Problem: the plan says "separate routing approval from permissions" as a principle but defines no behavior. Headless runs need auto-approve flags (e.g. aider's yes-to-all, goose/opencode permission modes), which let the agent edit files and run shell commands unattended.
- Change:
  - MUST add a "Permissions" section to `PLAN.md`: for each run, a `permissionMode` (`read_only` | `edit` | `edit_and_shell`), default `edit`, mapped by each adapter to the exact tool flags. Adapter MUST refuse a mode the tool cannot enforce rather than silently granting more.
  - MUST run attempts in the checkpoint branch/worktree (N-06) so edits are isolated from the user's working tree.
  - MUST NOT pass a blanket auto-approve flag that includes shell access unless `edit_and_shell` was explicitly requested by CLI or global config (not repo config, see N-03).
  - MUST record the effective permission mode in the run trace (R-13).
- Acceptance:
  - Test: adapter `buildCommand` output for each mode matches the recorded spike findings (N-13).
  - Test: requesting `edit_and_shell` from repo config is ignored.

### N-05 Phase 2 depends on work scheduled in Phase 3 (P0)

- Problem: Phase 2's done-when is "forced-failover passes with mock and real tool". Failover needs a handoff and must respect a provider allow-list, but handoff (R-06) and allow-list (R-07) are Phase 3. Phase 2 would either skip them or send data to another provider with no controls.
- Change:
  - MUST move to Phase 2: a minimal handoff (goal, branch, `git status`, size-capped `git diff`, changed files, error class) and a default-deny provider rule (only the first-attempt provider is allowed unless the global config lists others).
  - Phase 3 then extends: durable task state files, richer handoff, secret redaction hardening, full allow-list config and `route-test` display.
  - Redaction logger from Phase 1 MUST be applied to the minimal handoff in Phase 2.
- Acceptance:
  - Phase 2 failover test: a second provider not in the allow-list is never selected; with it allowed, the handoff text reaches the second mock tool.

### N-06 Checkpoint design contradicts itself (P0)

- Problem: `PLAN.md` says "Checkpoint (git branch/worktree) before attempt" and "Checkpoints: Before each attempt, don't auto-commit by default". A branch checkpoint of uncommitted work needs a commit or stash, and "branch/worktree" is an unmade decision. The plan also lacks a dirty-tree rule and a partial-edit policy (round-1 R-05).
- Change (decide and write into `PLAN.md`):
  - MUST choose ONE mechanism. Recommended: run each task in a dedicated git worktree on branch `air/<task-id>`, created from the current `HEAD`. The user's working tree is never touched until they merge.
  - MUST refuse to start when the main working tree has uncommitted changes, unless `--allow-dirty` is passed; with `--allow-dirty`, uncommitted changes are NOT carried into the worktree unless `--include-dirty` is also passed (state which).
  - MUST define the partial-edit policy: edits from a failed attempt stay in the task worktree and are described to the next tool via the handoff (default: keep). Reverting is an explicit command, never automatic.
  - MUST say who commits: air creates one commit per attempt on the task branch (labelled with tool/model) so attempts are inspectable, or air leaves edits uncommitted in the worktree. Pick one. Note this is separate from the user's repo history because it lives on the task branch.
  - MUST define cleanup: `air tasks list` / `air tasks clean` (or equivalent) removing finished worktrees.
- Acceptance:
  - Test (temp git repo): user's pre-existing uncommitted file is unchanged after a run.
  - Test: failed attempt leaves partial edits visible in the task worktree and listed in the next attempt's handoff.
  - Test: dirty main tree without `--allow-dirty` exits with the documented config/usage exit code.

### N-07 Adapter interface cannot support the plan (P1)

- Problem: `IAirAdapter` is `detect, getCapabilities, buildCommand, parseOutput, classifyError`. R-03 requires each attempt to know `(provider, model)`; N-04 requires permission mapping; R-04 requires structured error info.
- Change:
  - MUST add to the adapter contract: `resolveProviderModel(config): { provider: string; model: string }`, `supportedPermissionModes`, and `classifyError({ exitCode, stderr, structured? }): { category: ErrorCategory; retryAfterMs?: number; matched?: string }`.
  - MUST pass adapters only data they are allowed to classify on (exit code, stderr, structured output). The type signature SHOULD make stdout prose unavailable to `classifyError`.
  - MUST add `ErrorCategory` values to the types in the plan only through one shared file (`src/types/`), imported everywhere.
- Acceptance:
  - Type test or unit test: `classifyError` cannot be called with stdout text.
  - Test: two adapters configured with the same provider produce the same cooldown key.

### N-08 Exit codes and success semantics are undefined (P1)

- Problem: "hop cap/exit codes (R-11)" is listed without the codes. "Exit 0 with non-empty diff or task-complete signal" has an undefined signal. A read-only task (explain, review) always has an empty diff and would be reported as `no_changes`.
- Change:
  - MUST define and document an exit-code table. Proposed (adjust, then fix it in `PLAN.md` and README):
    - `0` success
    - `1` task failure
    - `2` usage or config error
    - `3` all candidates exhausted (cooldown or disallowed)
    - `4` user abort / cancel
    - `5` `no_changes` (tool exited 0 with empty diff on an edit task)
    - `6` timeout
  - MUST add a task mode: `edit` (default) or `read_only` (from `permissionMode`, N-04). `no_changes` applies only to `edit`.
  - MUST define "task-complete signal" concretely per adapter after the spikes, or delete the phrase.
- Acceptance:
  - Table-driven test: each documented condition yields its code.
  - Test: `read_only` task with empty diff exits `0`.

### N-09 One config source of truth and platform paths (P1)

- Problem: the plan chooses Zod, but the file tree still lists `config/schema.json`, `package.json` still has `ajv`, and `config/default.yaml` does not exist. README hard-codes `~/.config/air/` and `~/.cache/air/`, while the plan says "platform-appropriate"; these differ on Windows.
- Change:
  - MUST define the config schema once in Zod (`src/config/schema.ts`). MUST remove `schema.json` and `ajv` from the plan and `package.json`; generate JSON Schema from Zod only if editor support is wanted.
  - MUST create `config/default.yaml` and load it relative to the package root using `import.meta.url`, NOT the current working directory (the package ships `config` via `files`).
  - MUST pick a path strategy for config, cache, and state (e.g. a small `paths` module using `%APPDATA%`/`%LOCALAPPDATA%` on Windows, XDG on Linux, `~/Library` on macOS) and make README match. Allow override by `AIR_CONFIG_DIR`/`AIR_CACHE_DIR` env vars (useful for tests).
  - Validation errors MUST name the file, key path, and the offending value type (never the value if the key is secret-like).
- Acceptance:
  - Test: invalid config yields an error naming file and key.
  - Test: running the built CLI from an unrelated working directory still finds `default.yaml`.
  - Test: `AIR_CONFIG_DIR`/`AIR_CACHE_DIR` redirect all reads and writes (no writes to the real home directory in the test suite).

### N-12 Split Phase 2 (P1)

- Problem: Phase 2 bundles adapter, run command, streaming, classification, checkpoint, failover, cooldowns, hop cap, exit codes, and traces, with a done-when that needs a real tool.
- Change: replace Phase 2 with:
  - **2a Single run:** mock adapter, process runner, stream+buffer, timeouts, tree kill, error classification, exit codes, trace. Done when: all mock behaviors produce the documented class, exit code, and trace entry.
  - **2b Checkpoint and one real tool:** worktree checkpoint (N-06), aider adapter from spike findings, permission mapping (N-04). Done when: one real aider run completes on a scratch repo in the worktree (manual test, documented, not in the default suite).
  - **2c Failover:** (provider, model) cooldowns, hop cap, minimal handoff, default-deny allow-list (N-05), proposal output when approval is needed. Done when: mock A -> mock B failover test passes, and a manual real A -> B run is documented.

### N-13 Spike checklist and exit criteria in the plan (P1)

- Problem: Phase 0 says "R-09 for aider + one other" but the plan does not contain what a spike must produce, so "done" is subjective.
- Change: add to `PLAN.md` (Phase 0) that each `docs/adapters/<tool>.md` MUST record, for the exact installed version:
  - install command and version output
  - exact headless invocation, how to pass the task and files, how to select model/provider
  - flags to disable auto-commit and interactive prompts, and the flags that grant edit and shell permissions
  - exit codes observed for: success, rate limit, auth failure, bad model, no changes
  - where each error appears (stdout vs stderr) with a captured sample, and whether a structured/JSON mode exists
  - whether `Retry-After` or reset time is surfaced
  - whether it needs a TTY (and what happens with stdin closed)
  - decision: usable headless (yes/no). If no, the tool is out of scope
  - choose the second tool by this evidence, then record the decision in `PLAN.md`
- Acceptance: both docs exist with captured samples, and the second-tool decision is written down.

### N-10 Model list tooling is Windows-only and will go stale (P2)

- Problem: `config/models/check-free-models.ps1` only runs on Windows and parses YAML with regex, which conflicts with the cross-platform principle. Free model IDs change often. `aider-free-models.yml` has a BOM, and a list dated 2026-10-30 with specific IDs (not verifiable by the reviewer) is data, not code.
- Change:
  - MUST replace the script with a Node command (e.g. `air models check`) that reads the list with the `yaml` package and compares with the provider's model list. SHOULD keep the `.ps1` only if documented as optional.
  - MUST strip the BOM from `.yml` and `.md` files (keep it on `.ps1` only if Windows PowerShell 5.1 compatibility is needed). Add `.editorconfig` with `charset = utf-8`.
  - MUST treat model availability failures at runtime as `model_unavailable`, not `rate_limit` (R-04), and the router MUST skip unavailable models rather than cooling down the provider.
  - SHOULD NOT hard-code a default model in more than one place.
- Acceptance:
  - `air models check` works on Linux and Windows CI with network mocked.
  - Config loader test passes with and without a BOM in the YAML.

### N-14 Repo documentation hygiene (P2)

- Problem: `project_reviews/` holds two long reviews with different phase plans and overlapping IDs. A future implementing agent can follow the wrong document.
- Change:
  - MUST add a banner at the top of each review: "Historical input. `PLAN.md` is authoritative where they differ."
  - SHOULD move them to `docs/reviews/`.
  - MUST keep `PLAN.md` self-sufficient: every decision it adopts is written in the plan itself (the "Reviews applied" list is a summary, not a spec).
  - SHOULD keep the plan to current state plus decisions; remove duplicated sections (Implementation Notes repeats Architecture and Failover Flow).
- Acceptance: a reader who opens only `PLAN.md` can implement the next phase without opening `docs/reviews/`.

## 5. Remaining phases (replace the Revised Phases table)

| Phase | Scope | Done when |
|---|---|---|
| 0 Baseline and spikes | N-01, N-02, N-11, N-13; mock adapter + first tests (R-02); `docs/adapters/aider.md` + second tool; second-tool decision | CI green on Windows and Linux; mock covers success, rate-limit on stderr, rate-limit words in stdout (no failover), hang, exit 0 with no changes, auth error, model unavailable; both adapter docs exist |
| 1 Skeleton | cross-spawn runner (R-10), Zod config + trust boundary (N-03, N-09), paths module, logger with redaction, atomic health file + concurrency test (R-08), exit-code table (N-08) | build, typecheck, lint, test green on both OSes; trust-boundary and spawn-injection tests pass |
| 2a Single run | see N-12 | see N-12 |
| 2b Checkpoint + aider | see N-12; N-06, N-04 | see N-12 |
| 2c Failover | see N-12; N-05, N-07 | see N-12 |
| 3 Handoff and safety | durable task state (R-06), redaction hardening, full allow-list config, `route-test --explain` shows data destinations (R-07) | secret fixture never appears in handoff, state file, or trace; killing air mid-run leaves a readable state file |
| 4 MCP | async jobs, no stdin prompts, proposal/approve/cancel tools, stdout protocol only (R-08) | MCP-mode tests: limit hit returns a proposal and never reads stdin; job survives client timeout |
| 5 Expand | extra adapters (each with its own spike doc), verify hook (trusted repos only, N-03), classifier/scoring only if traces show misroutes | each addition has tests and a spike doc |

## 6. Definition of done for this round

- `PLAN.md` updated with N-03..N-14 decisions and the phase table in section 5.
- All of section 3 implemented; baseline commands green on a clean clone and in CI on both OSes.
- Every R-item and N-item is implemented with its acceptance test or marked deferred with a reason in `PLAN.md`.
- The built CLI runs from an unrelated directory (`node dist/bin/air.js --help`).
