# grok_plan_review_2.md

## Document metadata

- **Target repository**: https://github.com/radmanmilos/air
- **Review date**: 2026-10-31
- **Supersedes**: `project_reviews/grok_plan_review.md` (G-01..G-12) for forward-looking implementation. Preserve the prior review as historical context; this document focuses on the next phase.
- **Instruction priority**: Safety & correctness > end-to-end functionality > maintainability > feature breadth.
- **How to use**:
  - Treat every `MUST` as a required change. `SHOULD` items are strongly recommended.
  - Reference IDs (`G2-xx`) in commit messages and `PLAN.md` updates.
  - Do not start a later phase until the acceptance criteria for the current phase pass with real tests (not stubs).
  - After implementing, update `PLAN.md` and `README.md` to reflect actual behavior, not planned behavior.

---

## 0. Current status assessment (as of review)

**Implemented and tested (good foundation):**

- Adapter contract (`src/adapters/adapter.ts`) with `AgentAdapter` interface.
- Conformance helper (`src/adapters/conformance.ts`) with evidence consistency checks.
- Mock adapter (`src/adapters/mock.ts`) and fixture harness.
- Secret redaction module (`src/security/redact.ts`) with token, bearer, and env patterns.
- Canonical error taxonomy and policy table (`src/types/errors.ts`).
- Result states (`src/types/result.ts`).
- Behavior spec (`docs/behavior-spec.md`) with a corresponding test.
- Basic test suite: `adapter-conformance.test.ts`, `redaction.test.ts`, `behavior-spec.test.ts`, `fixtures.test.ts`.

**Missing or still stubbed (blocking real use):**

- **Execution runner**: no shared process runner that streams output, enforces timeouts, performs tree-kill, and integrates redaction and error classification.
- **Router**: no priority-list routing, cooldown-aware candidate selection, or `route-test --explain` logic.
- **Health tracker**: no persisted health/cooldown state, no atomic writes.
- **Configuration system**: no Zod schema loading, precedence resolution, validation, or `config migrate`.
- **Context / handoff**: no git-state capture, dirty-tree policy enforcement, or checkpoint snapshot.
- **CLI command logic**: all commands in `bin/air.ts` print “Not implemented yet”; `status --json` returns empty arrays.
- **Real adapters**: no aider adapter, no second tool; `docs/adapters/` is empty.
- **MCP server**: no async job lifecycle or stdio server.
- **Observability**: no structured JSONL logs for routing decisions or tool launches.
- **Concurrency**: no per-config-dir lock or `maxConcurrentAgents` enforcement.

**Concrete code issues found during review (fix before or alongside new work):**

- `src/security/redact.ts`: the `allow` option is a no-op (`// no-op guard; allow is informational`). Allowlisted values are not actually protected from redaction.
- `src/security/redact.ts`: `API_KEY_FLAG_RE` matches only `--api-key value`, not `--api-key=value`. Many CLIs use the `=` form.
- `src/types/errors.ts`: `ERROR_POLICY: Record` is missing type parameters; use `Record<ErrorCategory, ErrorAction>`.
- `src/adapters/mock.ts`: `classifyError` returns `TASK_FAILURE` for `exitCode === 0`. While this is a mock, the semantic is misleading; exit 0 should normally map to success unless the mock is explicitly simulating a “task failure with exit 0” scenario (document that mode).
- Redaction is not yet wired into the output pipeline or handoff because the pipeline does not exist yet.

---

## 1. Prioritized requirements (G2 series)

### G2-01 — Shared execution runner (P0)

**Goal**: One process-runner module used by every adapter, with streaming, timeouts, cancellation, and safety guarantees.

**Requirements**:
- MUST implement `src/execution/runner.ts` exporting a `runProcess` function that accepts a `CommandSpec` and options (`timeoutMs`, `signal`, `onStdout`, `onStderr`).
- MUST use `cross-spawn` with an argument array and **never** `shell: true`.
- MUST set `stdio: ['ignore', 'pipe', 'pipe']` (close or ignore stdin for non-interactive tools).
- MUST stream stdout/stderr to the caller in real time while keeping a bounded rolling buffer (e.g., max 1 MB, with truncation metadata).
- MUST support per-tool timeout; on timeout, tree-kill the process (`taskkill /T /F` on Windows, process-group kill on Unix).
- MUST support external cancellation via `AbortSignal`; cancellation must also tree-kill and must not be treated as failover-worthy.
- MUST record: exit code, signal, spawn error (if any), start/end timestamps, and duration.
- MUST run all captured stdout/stderr through `redact()` before passing to logs or context handoff.
- MUST classify errors via the adapter’s `classifyError` (or the conformance helper) using exit code + stderr + structured evidence; **never** scan model-generated stdout prose.
- SHOULD handle `SIGINT` gracefully: stop the child, persist task state, exit with a distinct code.

**Acceptance**:
- Injection test: task text containing quotes, `&`, `|`, `$()` reaches the child unmodified.
- Timeout test: a hanging mock process is killed and leaves no orphan processes.
- Cancellation test: abort signal stops the child and returns `CANCELLED` state.
- Redaction test: a mock tool that prints a fake API key does not leak it in captured output or logs.

---

### G2-02 — Health tracking and cooldown persistence (P0)

**Goal**: Track per-(provider, model) health and cooldowns in a crash-safe way, and expose it via `air status --json`.

**Requirements**:
- MUST implement `src/health/tracker.ts` with a `HealthTracker` class.
- MUST key cooldowns by `(provider, model)` (already decided in prior reviews).
- MUST persist state to the platform cache directory (`<cache>/air/health.json` or similar) using **atomic writes** (write temp file, then rename).
- MUST load persisted state on startup; corrupt or missing state must degrade gracefully (start empty, log warning).
- MUST provide methods: `setCooldown(provider, model, untilMs, reason)`, `isCoolingDown(provider, model)`, `getCooldowns()`, `recordSuccess(provider, model)`, `recordFailure(provider, model, category)`.
- MUST integrate with the error policy: `RATE_LIMIT` and `QUOTA_EXCEEDED` → set cooldown; `AUTH_ERROR` / `PERMISSION_DENIED` → stop and ask user (no cooldown, no retry against same credentials).
- MUST ensure `air status --json` returns a machine-readable object with: `tools`, `providers`, `models`, `cooldowns` (array of `{provider, model, until, reason}`), and `health` (recent failures/successes).
- MUST ensure concurrent writes do not corrupt the file (see G2-12).

**Acceptance**:
- After a simulated rate-limit failure, the cooldown appears in `air status --json`.
- After cooldown expiry, the candidate is eligible again.
- Killing the process mid-write does not corrupt the health file (atomic rename).
- Two concurrent `air run` processes do not corrupt the health file.

---

### G2-03 — Configuration system (P0)

**Goal**: Load, validate, merge, and migrate configuration from platform-appropriate paths.

**Requirements**:
- MUST implement `src/config/schema.ts` using Zod as the single source of truth. Include `version: 1` and fields for tools, providers, models, timeouts, `maxConcurrentAgents`, and redaction options.
- MUST implement `src/config/loader.ts` that resolves the effective config with precedence: **CLI > env > repo `.airrc.yaml` > global `config.yaml` > defaults**.
- MUST use a central path resolver (`src/config/paths.ts`) implementing the platform table from `PLAN.md` (XDG, macOS Application Support, Windows APPDATA).
- MUST treat repo `.airrc.yaml` as **untrusted by default**: validate it strictly; reject unknown top-level keys unless `--allow-unknown` is explicitly passed. Do not execute `verify.command` from repo config by default.
- MUST implement `air config --validate` to report schema errors with file and key names, never printing secret values.
- MUST implement `air config migrate` to upgrade older config versions to the current schema (start with v1 → current; structure the migrator for future versions).
- MUST NOT store raw secrets in version-controlled examples; document that secrets belong in environment variables or an OS keychain. Provide `.env.example` patterns.

**Acceptance**:
- Loading a config with an unknown key fails with a clear error unless `--allow-unknown` is used.
- Precedence test: CLI value overrides env, env overrides repo, repo overrides global.
- `air config migrate` upgrades a v1 config and validates the result.
- `air config --validate` never prints a secret value.

---

### G2-04 — Router logic (P0)

**Goal**: Select the best candidate from a priority list, respecting cooldowns and capabilities, with explainable output.

**Requirements**:
- MUST implement `src/router/router.ts` with `route(task, adapters, healthTracker)` returning a selected adapter or a list of candidates with skip reasons.
- MUST start with an **ordered priority list** (no keyword classifier, no scoring) — this aligns with the YAGNI principle and the phase plan.
- MUST skip candidates that are:
  - cooling down (`RATE_LIMIT` / `QUOTA_EXCEEDED`),
  - incapable for the task (`canHandle` returns false),
  - missing required capabilities (e.g., file editing for a write task).
- MUST record structured skip reasons: `cooldown_active`, `capability_mismatch`, `tool_not_installed`, `auth_error`, etc.
- MUST implement `air route-test --explain` to print: classification (for now, “priority-list”), candidates considered, skip reasons, chosen candidate, and alternatives.
- SHOULD expose `air route-test --json` for machine-readable output (consistent with `status --json`).
- MUST NOT implement a keyword-based task classifier or LLM-based scoring until the vertical slice is complete and real misroutes are observed.

**Acceptance**:
- Given three adapters where the first is cooling down and the second cannot handle the task, the third is selected.
- `air route-test --explain` clearly shows why each candidate was skipped.
- If no candidate is available, the router returns a structured `NO_CANDIDATE` result with reasons (and the CLI asks the user to install or authenticate a tool).

---

### G2-05 — Context handoff and dirty-tree policy (P0)

**Goal**: Capture mechanical git state for handoff, enforce a safe dirty-tree default, and create a checkpoint snapshot.

**Requirements**:
- MUST implement `src/context/git.ts` to capture: current branch, HEAD commit, staged diff, unstaged diff, untracked files, and a summary of changed files.
- MUST implement the dirty-tree policy:
  - Default for write-capable tasks: **refuse** to run on a dirty working tree and print exactly what is dirty.
  - `--allow-dirty` is the only escape hatch; it must be non-destructive and must never auto-reset, stash, checkout, clean, or revert.
- MUST implement a checkpoint mechanism for MVP: read-only snapshot of `git diff` and `git status` recorded in the task state before execution. Worktree-based checkpoints are out of scope for now.
- MUST build handoff context from git state, **not** from a failed model’s summary.
- MUST redact any secrets from the captured git state before persisting or handing off.

**Acceptance**:
- Clean tree → write task proceeds.
- Staged, unstaged, or untracked changes → write task refuses with a clear message.
- `--allow-dirty` proceeds and preserves the original dirty state (no commits, stashes, or resets).
- Handoff context contains a redacted git diff and status, not a model-generated summary.

---

### G2-06 — Implement CLI command logic (P0)

**Goal**: Replace all “Not implemented yet” stubs with real behavior.

**Requirements**:
- `air run "<task>"`:
  - Discover installed adapters (start with mock; then aider).
  - Route using G2-04.
  - Execute using G2-01.
  - Stream output (redacted) to the terminal.
  - On failure, classify and either set cooldown, propose failover (Phase 2 behavior), or stop and ask user.
  - Respect `--files`, `--auto`, `--allow-dirty`, `--read-only`.
- `air status` / `air health`:
  - Show real tool/provider/model availability and active cooldowns (G2-02).
  - `--json` returns machine-readable output validated against a documented schema.
- `air route-test "<task>" --explain`:
  - Use the real router (G2-04).
- `air config --validate` / `air config migrate`:
  - Use the real config loader (G2-03).
- `air mcp`:
  - Initially, start a minimal stdio server that advertises capabilities; full async job lifecycle in G2-08.

**Acceptance**:
- Running `air run "hello"` with the mock adapter produces a real result state (e.g., `SUCCEEDED_WITH_CHANGES` or `NO_CHANGES`) and exits with an appropriate code.
- `air status --json` returns non-empty tool/cooldown data after a simulated failure.
- `air route-test --explain` shows real skip reasons.
- No CLI command prints “Not implemented yet”.

---

### G2-07 — First real adapter: aider (P0)

**Goal**: Implement and validate the aider adapter with headless invocation.

**Requirements**:
- Before writing adapter code, **spike** the aider CLI: install the target version, record exact flags for headless execution, model/provider selection, disabling auto-commit/interactive prompts, and error behavior (stdout vs stderr, exit codes).
- Write `docs/adapters/aider.md` containing: exact invocation, flag meanings, exit codes, error stream behavior, and any known limitations.
- Implement `src/adapters/aider.ts` conforming to `AgentAdapter`.
- Pass the conformance test suite and add integration tests using the mock runner that simulates aider’s output and errors.
- The adapter’s `classifyError` must use exit code + stderr evidence, not stdout prose.
- Add aider to the default priority list only after the adapter is validated.

**Acceptance**:
- `docs/adapters/aider.md` exists and matches the installed CLI.
- Aider adapter passes conformance and integration tests.
- `air run` successfully routes to aider for a simple task (in a test environment or with a mock substitution).
- Aider’s rate-limit / auth errors are classified correctly.

---

### G2-08 — MCP server (P1)

**Goal**: Expose routing and task execution over MCP with async jobs and no interactive prompting.

**Requirements**:
- Implement `src/mcp/server.ts` using `@modelcontextprotocol/sdk`.
- MUST support async job lifecycle: `createTask`, `getTaskStatus`, `cancelTask`, `getTaskResult`.
- MUST NOT prompt on stdin in MCP mode. Approval is a task-state transition (e.g., `PENDING_APPROVAL`).
- MUST integrate with the router and execution runner; jobs should use the same safety guarantees (redaction, timeouts, tree-kill).
- MUST persist job state durably (crash-safe) so that a reconnect can query status.
- SHOULD provide a `docs/mcp.md` describing tool schemas and lifecycle.

**Acceptance**:
- An MCP client can submit a task, poll for status, and retrieve a result.
- No prompts appear on stdio during MCP operation.
- Killing and restarting the server does not lose task state (job can be resumed or reported as failed).
- Secrets are redacted in MCP responses.

---

### G2-09 — Fix redaction gaps (P0)

**Goal**: Close the concrete security issues found in `src/security/redact.ts`.

**Requirements**:
- Fix `API_KEY_FLAG_RE` to match both `--api-key value` and `--api-key=value`.
- Implement the `allow` option correctly: allowlisted patterns must **prevent** redaction of matching values, not act as a no-op.
- Add tests for:
  - `--api-key=sk-...` is redacted.
  - `--api-key sk-...` is redacted.
  - An allowlisted test fixture token is **not** redacted.
- Ensure redaction is applied to all stdout/stderr before logging, display, and handoff (integration with G2-01).

**Acceptance**:
- The new tests pass.
- A grep of the codebase shows no code path that writes raw stdout/stderr without redaction (once the execution runner exists).

---

### G2-10 — Structured observability (P1)

**Goal**: Emit JSONL traces for routing decisions, tool launches, failures, and failovers.

**Requirements**:
- Implement `src/observability/tracer.ts` that writes JSONL to the platform cache directory (`<cache>/air/traces/`).
- Each event MUST include: `timestamp`, `event`, `task_id`, `selected_tool`, `provider`, `model`, `reason`, `error_category` (if any), `duration_ms`.
- Events MUST be written atomically (append to file, rotate when large) and MUST be redacted.
- `air status --json` SHOULD optionally include a summary of recent traces (or provide `air trace --last N`).
- `air route-test --explain` SHOULD emit a trace event for the routing decision.

**Acceptance**:
- Running a task that triggers a failover produces a trace stream showing: attempt 1 → error category → cooldown set → attempt 2.
- No secrets appear in trace files.
- Trace files are valid JSONL and can be parsed line-by-line.

---

### G2-11 — Second real adapter (P1)

**Goal**: Add a second verified adapter (e.g., goose) after aider is stable.

**Requirements**:
- Repeat the spike → docs → adapter → conformance → integration test process from G2-07.
- Do not add a tool until headless mode is confirmed and documented.
- Add it to the priority list only after passing all tests.

**Acceptance**:
- `docs/adapters/<tool>.md` exists and matches installed CLI behavior.
- Adapter passes conformance and integration tests.
- Router can fail over from aider to the second adapter (proposal path only in Phase 2; actual continuation is Phase 3+).

---

### G2-12 — Concurrency and resource governance (P1)

**Goal**: Prevent concurrent CLI/MCP processes from corrupting shared state and limit agent spawning.

**Requirements**:
- Implement a **per-config-dir lock** (e.g., `<config>/air.lock`) acquired before mutating health/cooldown state. Use an OS-level lock or atomic `mkdir` lock.
- Enforce `maxConcurrentAgents` (default 1) via a semaphore or queue.
- Ensure all persistence (health, job state, traces) uses atomic writes (temp + rename) or append-only logs.
- If a lock is held by a dead process, detect staleness and reclaim safely.

**Acceptance**:
- Two simultaneous `air run` commands do not corrupt the health file.
- The second command either waits or fails gracefully with a clear message.
- `maxConcurrentAgents` is respected; no unbounded child-process spawning.

---

## 2. Revised phase order (gated)

| Phase | Scope | Gate / acceptance |
|-------|-------|-------------------|
| **A** (current) | Execution runner (G2-01), health tracker (G2-02), config system (G2-03), redaction fixes (G2-09) | Unit + integration tests pass; `air status --json` returns real data; redaction tests cover `=` syntax |
| **B** | Router (G2-04), CLI `run`/`status`/`route-test`/`config` with mock adapter (G2-06) | End-to-end mock task: route → execute → classify → result state; `air route-test --explain` works |
| **C** | Context / dirty-tree policy (G2-05), aider adapter + docs (G2-07) | Aider adapter passes conformance; dirty-tree refusal test passes; handoff context is mechanical and redacted |
| **D** | MCP server (G2-08), observability (G2-10) | MCP client can submit and poll a job; JSONL traces are produced and redacted |
| **E** | Second real adapter (G2-11), concurrency lock (G2-12) | Second adapter passes conformance; concurrent processes do not corrupt state |
| **F** | Optional scoring / classifier only if real misroutes are observed | No work before Phase E is complete |

**Do not proceed to Phase D until Phases A–C are fully passing with real tests.**

---

## 3. Anti-patterns to avoid

The implementation agent MUST NOT:

- Build a keyword-based task classifier or LLM-based scoring before the vertical slice is complete.
- Use `console.log` for anything that needs to be parsed, audited, or redacted.
- Spawn child processes with `shell: true` or without tree-kill on timeout/cancel.
- Scan model-generated stdout prose for provider errors (use exit code + stderr + structured evidence).
- Store secrets in plain-text config files or examples.
- Assume different agent CLIs accept identical flags or produce identical error formats — verify and document.
- Auto-commit, auto-push, auto-stash, or rewrite git history.
- Mark a phase complete if its CLI commands still print “Not implemented yet”.
- Leave the `allow` option in redaction as a no-op.

---

## 4. Definition of done (reinforced)

A feature is complete only when:

1. Code is implemented (no stubs, no “Not implemented yet”).
2. Automated tests cover normal operation and failure modes (including timeout, cancellation, and auth failure).
3. `npm run build`, `npm run typecheck`, `npm run typecheck:test`, and `npm test` pass.
4. The behavior is documented in `docs/behavior-spec.md` and matches the implementation.
5. Logs, traces, error messages, and handoff context contain no secrets (verified by tests).
6. `README.md` and `PLAN.md` describe actual behavior, not planned behavior.
7. The change references the relevant review ID (e.g., `G2-01`) in `PLAN.md` and the commit message.

---

## 5. Immediate next action

Implement **Phase A** in this order:

1. Fix redaction gaps (G2-09) — quick, unblocks safe output.
2. Implement the execution runner (G2-01).
3. Implement health tracking and atomic persistence (G2-02).
4. Implement the config loader and Zod schema (G2-03).
5. Update `PLAN.md` to mark Phase A items and remove “Not implemented yet” from the roadmap where appropriate.

After Phase A passes, proceed to Phase B (router + CLI wiring with mock adapter).

---

*End of document. Append future findings with incremented IDs (G2-13, G2-14, …).*