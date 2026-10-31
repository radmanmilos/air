# claude_plan_review.md

## 0. How to use this document

- This is an external review of `PLAN.md` for the `air` repo (CLI + MCP orchestrator that routes tasks across aider, goose, opencode, kilocode with failover on rate limits).
- Treat every item below as a change request against `PLAN.md` and the implementation.
- Work in the order of section 3 (Revised phase order). Do not start a later phase until the earlier phase's acceptance checks pass.
- Each item has an ID (`R-01`...). Reference IDs in commit messages.
- Keywords: MUST = required. SHOULD = do unless there is a documented reason not to. MAY = optional.
- First action: update `PLAN.md` to reflect sections 3 and 4, then implement.

### Review scope and limits

- Reviewed: `PLAN.md`, `README.md`, `package.json`. Repo had 1 commit and no visible `src/`.
- NOT reviewed: contents of `bin/` and `config/models/` (not accessible to reviewer).
- CLI flags in this document are from reviewer knowledge and MUST be verified against installed versions (see R-09).

## 1. Summary of findings

| Area | Verdict |
|---|---|
| Concept (spawn existing CLIs, route, failover) | Sound |
| Phase order | Wrong: abstractions built before any adapter works (R-01) |
| Rate-limit detection | Unreliable: false positives, no error classification (R-04) |
| Cooldown model | Wrong key: per tool instead of per provider+model (R-03) |
| Failover repo state | Undefined: partial edits, auto-commits (R-05) |
| Handoff | Depends on the failed model; privacy not considered (R-06, R-07) |
| I/O vs MCP | Contradictions: TUI principle vs piped stdio; prompts vs MCP stdin (R-08) |
| Cross-platform | Windows spawn issues unaddressed (R-10) |

## 2. Requirements

### R-01 Build a vertical slice first (priority: P0)

- Problem: Phase 2 builds classifier, router, health tracker, context packer before any adapter exists. This is abstraction without evidence.
- Change:
  - MUST implement one adapter (aider) end to end first: `air run` -> spawn -> stream -> detect limit -> failover to a second tool.
  - MUST start routing as a plain ordered priority list with capability flags.
  - SHOULD defer keyword/file-pattern classifier and scoring until the slice works and real misroutes are observed.
- Acceptance:
  - `air run "<task>"` completes against a mock adapter (R-02) with forced failover from tool A to tool B.
  - No classifier code exists before this passes.

### R-02 Mock adapter and runnable acceptance checks (P0)

- Change:
  - MUST add a mock tool: a script (`test/fixtures/mock-tool`) with configurable behavior via env/args: succeed, print rate-limit text on stderr and exit non-zero, hang, print rate-limit words in normal output, exit 0 with no changes.
  - MUST add a test runner (`vitest`) and an `npm test` script.
  - MUST write each phase's "done" as an automated test.
- Acceptance:
  - `npm test` passes without network access or real tool installs.
  - Tests cover: normal success, true rate limit -> failover, false-positive text in stdout (no failover), hang -> timeout, all tools in cooldown.

### R-03 Cooldown and health keyed by provider + model (P0)

- Problem: Rate limits are enforced by providers/models. Two tools using the same provider key share one limit. Switching between them does not help.
- Change:
  - MUST define a key `(provider, model)` for health and cooldown state.
  - MUST make each adapter report the provider and model it is configured to use.
  - MUST skip failover candidates whose `(provider, model)` is in cooldown, including candidates sharing the exhausted provider.
  - SHOULD honor a `Retry-After` value when present; otherwise use `failover.cooldown_minutes`.
- Acceptance:
  - Test: tool A and tool B share provider P. A hits a limit on P. Router does not propose B.
  - Test: tool C on provider Q is proposed.

### R-04 Reliable rate-limit detection and error classification (P0)

- Problem: Regex over stdout produces false positives (e.g. task is "fix the rate limiter", normal output contains "429" or "rate limit"). The plan also lumps "model not available" in with rate limits.
- Change:
  - MUST classify failures into: `rate_limit`, `auth`, `context_length`, `model_unavailable`, `task_failure`, `timeout`, `unknown`. Each class maps to an action (wait/retry same, switch, abort with message).
  - MUST base detection on exit code plus stderr and structured error lines. MUST NOT scan model-generated prose or file content for limit keywords.
  - SHOULD use a tool's JSON/structured output mode where one exists.
  - MUST keep patterns configurable per adapter (global defaults + overrides).
  - MUST log which pattern matched, on which stream, and the surrounding line.
- Acceptance:
  - Test: mock prints "429 rate limit" in stdout as normal output, exits 0 -> no failover.
  - Test: mock prints a limit error on stderr, exits non-zero -> class `rate_limit`.
  - Test: each class maps to its configured action.

### R-05 Define repo state at failover (P0)

- Problem: Tool A may leave partial edits. aider auto-commits by default. Behavior on switch is undefined.
- Change:
  - MUST create a checkpoint before each attempt (commit on a dedicated branch, or a git worktree). Choose one and document it in `PLAN.md`.
  - MUST decide and document whether partial edits are kept or reverted when switching. Default: keep edits, and tell the next tool via the handoff what changed.
  - MUST pass aider the flag that disables auto-commits (verify name, R-09), or explicitly handle its commits in the checkpoint logic.
  - MUST refuse to start if the working tree is dirty, unless `--allow-dirty` is passed.
- Acceptance:
  - Test: after a failed attempt with partial edits, state is exactly as the documented policy says.
  - Test: user's pre-existing uncommitted work is never lost.

### R-06 Mechanical handoff and durable task state (P1)

- Problem: A rate-limited model cannot summarize its own progress. Handoff must not depend on it.
- Change:
  - MUST build the handoff from data air already has: goal, repo root, branch, `git status`, `git diff` (size-capped), changed file list, last N KB of output, error class and summary.
  - MUST write task state continuously to `.air/tasks/<id>.json` (goal, attempts, tools tried, checkpoints, status). Add `.air/` to `.gitignore`.
  - MUST redact secrets (env-var values, token-like strings, `.env` contents) from handoff and logs.
  - MAY include relevant `AGENTS.md` snippets, size-capped.
- Acceptance:
  - Test: killing air mid-run leaves a task file from which status can be read.
  - Test: a fixture secret in output does not appear in the handoff.

### R-07 Data-destination controls (P1)

- Problem: Failover sends diffs and context to a different provider. Free-tier models often log or train on inputs.
- Change:
  - MUST support a per-repo allow-list of providers in `.airrc.yaml` (`privacy.allowed_providers`). Default for repos without it: only the first-attempt provider.
  - MUST show in `air route-test` which providers would receive data.
  - MUST NOT fail over to a provider outside the allow-list, even in `auto` mode.
- Acceptance:
  - Test: candidate provider not in allow-list is never selected.

### R-08 Resolve I/O and MCP contradictions (P0)

- Problem: (a) Principle "don't replace TUIs" conflicts with `stdio: ['pipe','pipe','pipe']`, which runs tools headless. (b) The "ask before switching" prompt cannot work in MCP stdio mode because stdin is the MCP transport.
- Change:
  - MUST state in `PLAN.md`: air is headless-only. Interactive TUI use is out of scope. Remove or reword the TUI principle.
  - MUST close or manage child stdin so a tool waiting for input cannot hang.
  - MUST implement per-tool timeouts (config, with default) and kill on expiry.
  - In MCP mode, MUST NOT prompt. `run` returns a structured proposal; the caller uses `propose_switch` / `switch_tool`.
  - MUST define MCP semantics: either advisory (`route_task` only recommends) or executing. If executing, MUST use async jobs (job ID, `get_status` polling and/or progress notifications), because long tasks exceed MCP call timeouts.
  - MUST make health/cooldown file writes atomic (write temp + rename) or lock, since CLI and MCP server may run concurrently.
- Acceptance:
  - Test: MCP-mode run with a limit hit returns a proposal object and never reads stdin.
  - Test: hung mock tool is killed at timeout.
  - Test: two concurrent processes do not corrupt the health file.

### R-09 Verify tool CLIs before writing adapters (P1)

- Problem: The adapter table contains guesses ("check flags", "TBD"). Example: aider's auto-confirm flag in current versions is `--yes-always`, not `--yes` (verify).
- Change:
  - MUST add a spike task per tool: record, for the installed version, the exact headless invocation, how to pass files, how to select a model, how to disable auto-commit/auto-approve prompts, exit codes on success/limit/auth failure, and where errors are printed (stdout vs stderr).
  - MUST store findings in `docs/adapters/<tool>.md` and encode them in the adapter.
  - MUST reduce initial scope to two tools (aider + one of goose/opencode). Add the others only after failover works.
  - kilocode: MUST drop from initial scope unless a real headless mode is confirmed. "CLI-limited, skip auto-routing" is not support.
- Acceptance:
  - `docs/adapters/aider.md` and one more exist with recorded commands and observed outputs.
  - Adapters reference those findings.

### R-10 Windows-safe process spawning (P1)

- Problem: Development path is `E:\GitHub\air` (Windows). npm-installed CLIs are `.cmd` shims, so plain `spawn` fails. Task text containing quotes is an injection risk if passed through a shell.
- Change:
  - MUST use `cross-spawn` (or equivalent) and pass arguments as an array. MUST NOT build shell command strings from task text.
  - MUST kill the whole process tree on cancel/timeout (`taskkill /T /F` on Windows, process group on Unix).
  - MUST handle Ctrl+C: stop child, write task state, exit with a distinct code.
- Acceptance:
  - Test: task text with quotes, `&`, `|`, `$()` reaches the child unmodified and executes nothing extra.
  - Test: cancel leaves no orphan child processes.

### R-11 Failover loop control and success definition (P1)

- Change:
  - MUST cap failover hops per task (`failover.max_hops`, default 3).
  - MUST prevent revisiting a tool/model already tried for the same task unless its cooldown expired.
  - MUST define behavior and a distinct exit code when all candidates are in cooldown or disallowed (R-07), with a clear message listing each skip reason and when the earliest cooldown ends.
  - MUST define exit codes: success, task failure, all-exhausted, user abort, config error.
  - SHOULD support an optional verify hook (`verify.command`, e.g. tests). Exit code 0 from a tool does NOT prove success (aider may exit 0 after doing nothing). Default check: non-empty diff, unless the task is flagged read-only.
- Acceptance:
  - Test: A -> B -> A ping-pong does not occur.
  - Test: all-exhausted returns the documented exit code and message.
  - Test: exit 0 with empty diff is reported as `no_changes`, not success.

### R-12 Config hygiene and decoupling (P2)

- Problem: Example rule `game/shared/**` and the plan to import model lists from the "Games for kids" repo leak another project into a generic tool and contradict "self-contained".
- Change:
  - MUST remove project-specific paths/rules from defaults and docs. Put them in that project's own `.airrc.yaml`.
  - MUST make free-model lists user-editable data with a `air config refresh-models` (or documented manual edit) path. MUST NOT assume a baked-in list stays valid.
  - SHOULD use one schema source of truth (zod, generating JSON Schema if needed) instead of hand-maintained `schema.json` plus TS types.
- Acceptance:
  - Grep of `src/` and `config/` finds no reference to other repos or project-specific paths.
  - Config validation errors name the file and key.

### R-13 Observability (P2)

- Change:
  - MUST write a per-run JSONL trace to `~/.cache/air/runs/<id>.jsonl`: classification/routing inputs, matched rule, candidates considered and skip reasons, chosen tool/model, error class and matched pattern, failover decisions, exit code.
  - MUST add `air route-test "<task>" --explain` printing the same reasoning without executing.
- Acceptance:
  - Test: a failover run's trace contains every decision above.

### R-14 Repo and package fixes (P2)

- MUST merge `air status` and `air health` into one command (they overlap).
- MUST fix `package.json`: `main` points to `./dist/index.js` but no `src/index.ts` is planned. Create it or remove `main`. Confirm `tsconfig` `rootDir`/`outDir` produce `dist/bin/air.js` as `bin` expects.
- MUST add `vitest` and an `npm test` script (R-02), an `engines` field (Node version), and a `files` field.
- SHOULD replace `inquirer` with `@inquirer/prompts` or `readline`.
- SHOULD pin `@modelcontextprotocol/sdk` to a current version instead of `^1.0.0` and check its current API.
- MUST mark README features as "planned" until implemented.

## 3. Revised phase order

Replace Phases 1-5 in `PLAN.md` with the following. Each phase ends with passing automated tests.

| Phase | Scope | Done when |
|---|---|---|
| 0 Spikes | R-09 research for aider + one other tool; mock adapter (R-02) | `docs/adapters/*.md` exist; mock covers all behaviors |
| 1 Skeleton | package/tsconfig fixes (R-14), config loader (R-12), spawn util (R-10), health file with atomic writes | `npm test` green; spawn tests pass on Windows and Unix |
| 2 Vertical slice | aider adapter, `air run`, stream+buffer, error classification (R-04), checkpoint (R-05), failover to second tool with `(provider, model)` cooldowns (R-03), hop cap and exit codes (R-11), traces (R-13) | Forced-failover test passes with mock and with one real tool |
| 3 Handoff and safety | task state, mechanical handoff, redaction (R-06), provider allow-list (R-07) | Redaction and allow-list tests pass |
| 4 MCP | R-08 semantics, async jobs, no-prompt behavior | MCP-mode tests pass |
| 5 Expand | additional adapters, optional classifier/scoring (only if misroutes were observed in traces), verify hook | Each addition has its own tests |

## 4. Constraints (keep from original plan)

- Node/TypeScript, CLI + MCP, spawn existing tools, tools handle their own auth.
- Failover default is "ask"; `auto` is opt-in via config.
- Develop in the `air` repo only; do not modify other repos.
- Follow YAGNI, surgical changes, git safety.

## 5. Out of scope until Phase 5

- Keyword/file-pattern classifier and tool-fit scoring.
- kilocode adapter (unless headless confirmed in R-09).
- Cost/budget tracking.
- Interactive TUI wrapping.

## 6. Definition of done for this review

- `PLAN.md` updated with sections 3 and 4.
- Every R-item either implemented with its acceptance tests, or marked deferred with a reason in `PLAN.md`.
- `npm test` passes on a clean clone with no network and no real tools installed.
