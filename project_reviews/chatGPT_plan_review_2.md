# AIR Follow-up Plan Review (Delta Review 2)

> **Target repository:** https://github.com/radmanmilos/air  
> **Branch reviewed:** `main`  
> **Review snapshot:** 2026-10-31  
> **Reviewed commit:** `22522d88e7e677cbc5b334f548fdb4aa58a6499c`  
> **Scope:** Re-review of the revised `PLAN.md` and current scaffold after the first ChatGPT/Claude reviews were incorporated. This document is a delta review; it does not replace the existing reviews.

## 0. Instructions to the implementation agent

1. Read this document together with the current `PLAN.md` and `project_reviews/` documents.
2. Apply only the remaining corrections below. Do not redesign the product or restart the architecture review.
3. Update `PLAN.md` first so it is the single, internally consistent source of implementation order and acceptance criteria.
4. Keep the project buildable. Regenerate and commit `package-lock.json` whenever `package.json` changes.
5. Do not claim that Phase 0 or any later phase is complete until its actual artifacts and tests exist and pass.
6. Do not implement real cross-agent continuation until the safe handoff requirements and tests are implemented.

Priority meanings:
- **P0:** Must resolve before implementing the affected feature or before relying on a clean install.
- **P1:** Must resolve before the corresponding phase is considered complete.
- **P2:** Cleanup or clarity improvement; do not let it block unrelated work.

---

## 1. Overall assessment

The revised architecture is materially better and should be retained. In particular, keep:

- Headless-only operation.
- Vertical-slice-first development.
- Initial scope limited to Aider plus one verified second agent.
- Provider/model-level cooldowns.
- Structured error classification.
- Mechanical Git-state handoff rather than relying on a failed model's summary.
- Asynchronous MCP jobs with no terminal prompt in MCP mode.
- Explicit safety and provider-destination controls.

The remaining work is mainly to remove contradictions, lock down Git-state policy, and make the package reproducible from a clean clone.

## 2. Required corrections

### R2-01 — Fix the phase-order contradiction (P0)

**Observed issue**

The `Revised Phases` table currently puts all of the following in Phase 2:

- Aider adapter and `air run`.
- Checkpointing.
- Failover to a second agent.
- A forced-failover test against a real tool.

But Phase 3 is where the plan adds durable task state, mechanical handoff, redaction, and provider allow-list enforcement. A real replacement agent cannot safely continue partial work before the handoff and safety behavior exists.

The lower-level revised phases also say Phase 3 is the handoff phase, while the acceptance criterion for Phase 2 already implies live failover. These definitions conflict.

**Required change**

Restructure the phase table so that:

- **Phase 0:** Verify Aider and one candidate second agent; create adapter spike documents and the mock executable.
- **Phase 1:** Complete package/config/process foundation and mock-process tests.
- **Phase 2:** Complete one-agent execution with Aider: spawn, stream, bounded buffering, cancellation, timeout, error classification, run IDs, and observable result states. Test proposed failover decisions with mocks, but do not yet start a second real agent with partial workspace state.
- **Phase 3:** Add the second real adapter, durable task state, mechanical handoff, provider consent/allow-list, and safe failover approval. This is the first phase allowed to perform real agent-to-agent continuation.
- **Phase 4+:** MCP and remaining adapters as already planned.

If the team prefers to keep the current phase numbering, the same dependency rule still applies: **no real cross-agent continuation before handoff and safety acceptance tests pass.**

**Acceptance criteria**

- The phase table and detailed phase descriptions agree.
- A real second agent is not launched by the failover path until handoff, redaction, and provider-destination checks are implemented.
- Phase 3 has an end-to-end test where agent A makes partial edits, fails, and agent B safely continues from that state.

### R2-02 — Define the dirty-working-tree and checkpoint policy (P0)

**Observed issue**

The plan says to checkpoint Git state before each attempt, but it does not define the exact strategy or the behavior when the user already has staged, unstaged, or untracked changes. A Git status/diff snapshot alone cannot reliably distinguish pre-existing edits from edits made by AIR when both agents edit the same file.

**Required change**

Choose and document one safe first-release policy. Recommended MVP policy:

1. Before `air run`, inspect the repository and capture branch, HEAD, staged paths, unstaged paths, and untracked paths.
2. By default, refuse to start a write-capable task when the working tree is dirty. Explain exactly what is dirty. Do not modify it.
3. Add an explicit `--allow-dirty` escape hatch only if its limitations are documented. When used, AIR must preserve the initial state snapshot and must never automatically reset, stash, checkout, clean, or revert anything.
4. Do not claim that overlapping edits can be attributed perfectly when `--allow-dirty` is used. In ambiguous cases, require user intervention before risky recovery or rollback.
5. Do not auto-commit or push. A checkpoint may be a read-only snapshot/patch record in the MVP; a dedicated worktree can be a later opt-in design.

If a worktree-based policy is selected instead, specify exactly how pre-existing uncommitted changes are represented in that worktree and how results are returned without overwriting the user's original workspace.

**Acceptance criteria**

- Tests cover clean, staged-dirty, unstaged-dirty, and untracked-file states.
- Default dirty-tree behavior is deterministic and non-destructive.
- AIR never discards or silently relocates user changes.
- Handoff identifies uncertainty rather than pretending all diffs belong to AIR.

### R2-03 — Unify the canonical error taxonomy (P1)

**Observed issue**

The `ErrorCategory` TypeScript type currently lists:

`rate_limit | auth | context_length | model_unavailable | task_failure | timeout | unknown`

Later sections define a different taxonomy that additionally includes quota exhaustion, network errors, process crashes, missing executables, user cancellation, and permission denial. Names also vary (`auth` versus `AUTH_ERROR`, `rate_limit` versus `RATE_LIMIT`).

**Required change**

Define one canonical enum/type and use it consistently in adapters, run state, traces, CLI output, MCP results, and tests. At minimum include:

- `RATE_LIMIT`
- `QUOTA_EXCEEDED`
- `MODEL_UNAVAILABLE`
- `AUTH_ERROR`
- `NETWORK_ERROR`
- `PROCESS_CRASH`
- `TOOL_NOT_INSTALLED`
- `TIMEOUT`
- `USER_CANCELLED`
- `PERMISSION_DENIED`
- `CONTEXT_LENGTH`
- `TASK_FAILURE`
- `UNKNOWN`

Define a policy table mapping each category to allowed actions: retry same candidate, wait for cooldown, propose another candidate, or stop and ask the user. `USER_CANCELLED` must never trigger failover. Authentication and permission failures must not cause repeated retries against equivalent broken credentials.

Clarify output parsing: adapters may parse documented structured events on stdout, but must not classify ordinary model-generated stdout prose as a provider error. Use structured error fields first, then exit code and stderr evidence, then adapter-specific fallback patterns.

**Acceptance criteria**

- One canonical type is imported by all relevant modules.
- Every category has a documented action policy and tests.
- Structured stdout errors can be recognized without scanning ordinary stdout prose.

### R2-04 — Define task success and no-change behavior (P1)

**Observed issue**

The plan says `exit 0 + non-empty diff OR task-complete signal = success`, and `exit 0 + empty diff = no_changes`. It does not define what counts as a task-complete signal, whether free-form model text is trusted, or how read-only tasks work.

**Required change**

Define explicit result states, for example:

- `SUCCEEDED_WITH_CHANGES`
- `SUCCEEDED_READ_ONLY`
- `NO_CHANGES`
- `FAILED`
- `CANCELLED`
- `NEEDS_USER_REVIEW`

Do not treat a natural-language statement such as "Done" as a trustworthy completion signal. Prefer process exit status plus observed workspace state and optional verification. Read-only tasks should be explicitly declared by task metadata or a CLI/config option so that an empty diff can be a valid outcome. For write tasks, empty diff should remain `NO_CHANGES` unless the user explicitly accepts that result or a defined verifier proves the requested outcome.

Define how `verify.command` is invoked and how its exit code changes the final task state.

**Acceptance criteria**

- Tests cover a write task with no diff, a read-only task with no diff, a write task with changes, and a failing verifier.
- Natural-language model output alone cannot mark a task successful.
- CLI and MCP return the same normalized result state.

### R2-05 — Make package metadata and lockfile reproducible (P0)

**Observed issue in the reviewed commit**

`package.json` declares `vitest` and a `lint` script, but the committed `package-lock.json` root metadata is still from the earlier manifest:

- The lockfile root does not list `vitest`.
- There is no `node_modules/vitest` entry in the lockfile.
- `lint` invokes `eslint`, but ESLint is not declared in `package.json` and no ESLint configuration is present in the tree.
- The plan calls for direct use of `cross-spawn` and Zod, but neither is declared as a direct dependency in `package.json`.
- The plan says the configuration source of truth is Zod, while the manifest still declares Ajv and the file tree still lists a hand-maintained `config/schema.json`.

**Required change**

1. Pick one schema strategy:
   - **Option A (recommended to match the current plan):** Zod is the source of truth; declare Zod as a direct dependency; remove Ajv if unused; generate JSON Schema only when needed rather than maintaining duplicate schemas.
   - **Option B:** Keep Ajv and a JSON Schema as the only source of truth; change the plan to remove the Zod requirement and generate TypeScript types or validators from the schema.
2. Declare `cross-spawn` as a direct dependency if the process runner imports it.
3. Add `vitest` to the lockfile by regenerating `package-lock.json` after manifest changes.
4. Either add ESLint and a valid configuration or remove the `lint` script until linting is actually configured.
5. Pin the MCP SDK to the explicitly tested version as required by the plan; do not leave a broad range if reproducibility is a requirement.
6. Check whether `inquirer` is still needed. Keep it only if the CLI approval flow uses it; MCP must never prompt on stdin.

**Acceptance criteria**

- `npm ci` succeeds on a clean clone.
- `npm run build`, `npm run typecheck`, and `npm test` succeed from that clean install.
- `npm run lint` either succeeds with declared tooling/configuration or is removed.
- Direct imports are declared as direct dependencies, not accidental transitive dependencies.

### R2-06 — Complete executable and test packaging details (P1)

**Observed issue**

- `bin/air.ts` has no `#!/usr/bin/env node` shebang, despite being exposed as the package `bin` executable.
- `tsconfig.json` includes only `bin/**/*` and `src/**/*`; test files and `vitest.config.ts` are not type-checked by `npm run typecheck`.
- The repository currently has `tests/README.md` but no actual test files, mock executable, adapter spike docs, or `docs/adapters/` directory. This is acceptable while Phase 0 is pending, but Phase 0 must not be marked complete.

**Required change**

- Add the Node shebang to the emitted CLI entrypoint and verify executable permissions/package behavior on Unix and Windows.
- Add a separate `tsconfig.test.json` (or equivalent) to type-check tests and Vitest configuration without polluting the production build.
- Create the mock executable and actual tests as Phase 0 deliverables.
- Create `docs/adapters/aider.md` and the selected second agent's spike document only after testing the installed CLI versions.

**Acceptance criteria**

- `npx air --help` works after local/global installation on supported platforms.
- CI type-checks both application code and test code.
- Phase 0 artifacts actually exist and the tests run without network or installed AI agents.

### R2-07 — Resolve `status` versus `health` semantics (P1)

**Observed issue**

The plan says status and health are merged under R-14, but the CLI currently registers both commands with the same `showStatus` handler. The `health` description says it shows failure history and summary statistics, while also calling itself an alias for `air status`. The plan's summary line also describes different views for status and health.

**Required change**

Honor the decision to merge them:

- Make `air status` the canonical command.
- Have it show current agent/provider/model availability, active cooldowns, and a concise recent health/failure summary in clearly labeled sections.
- Either remove `air health` completely or keep it as a true alias that displays exactly the same report. Do not describe it as a distinct failure-history view if it is only an alias.

Update `PLAN.md`, README, and CLI help together.

**Acceptance criteria**

- Command behavior, help text, README, and plan use the same definition.
- No duplicate command is maintained with a misleading description.

### R2-08 — Make platform-specific config/cache paths explicit (P1)

**Observed issue**

The plan now requires platform-appropriate paths, but README and parts of the plan still show only `~/.config/air/` and `~/.cache/air/`. Those are not a complete Windows/macOS/Linux path policy.

**Required change**

Document and implement one resolver for:

- Linux: XDG config/cache directories, with standard fallbacks.
- macOS: user Library Application Support and Caches conventions, or a deliberately documented XDG-compatible policy.
- Windows: `%APPDATA%` for config and `%LOCALAPPDATA%` for cache/state.

Respect `XDG_CONFIG_HOME` and `XDG_CACHE_HOME` on Unix-like systems where applicable. Ensure task state, health state, logs, and config all use the same central path-resolution module. Update README examples to be platform-neutral (for example, say "platform config directory" and show concrete examples in a table).

**Acceptance criteria**

- Unit tests cover environment-variable overrides and each platform's path mapping.
- No feature independently constructs `~/.config` or `~/.cache` paths.

### R2-09 — Treat repository config and verification commands as untrusted (P1)

**Observed issue**

The plan says `.airrc.yaml` is optional and includes a verify hook, but it does not fully specify how an untrusted repository can influence command execution. A repo-controlled `verify.command` can execute arbitrary code if AIR runs it automatically.

**Required change**

- Treat `.airrc.yaml` as untrusted until validated and trusted by the user.
- Repo config must not be able to inject shell fragments, silently change executable paths, or enable broad agent permissions.
- Do not execute `verify.command` from repo config by default.
- Require an explicit user trust decision or a global policy before running repository-provided verification commands.
- Execute approved commands with argument arrays and `shell: false`; do not concatenate user-controlled strings into shell commands.
- Make the `air route-test` and `air run` output disclose when a verification command will execute.

**Acceptance criteria**

- Tests prove untrusted repo config cannot execute commands or weaken safety defaults.
- Verification commands are skipped unless trusted/explicitly enabled.
- Command construction is injection-safe.

### R2-10 — Specify MCP task states and provider consent (P1)

**Observed issue**

The plan correctly requires asynchronous jobs and no prompts in MCP mode, but it does not define a canonical task-state model or the precise approval contract. The privacy policy says the default allowed provider is the first-attempt provider only; a failover to another provider therefore needs an explicit and visible consent path.

**Required change**

Define a shared lifecycle, used by CLI and MCP, with states at least:

- `QUEUED`
- `RUNNING`
- `FAILURE_DETECTED`
- `AWAITING_APPROVAL`
- `SWITCHING`
- `COMPLETED`
- `FAILED`
- `CANCELLED`

Define MCP tools and typed inputs/outputs, at minimum:

- `run_task`
- `get_task_status`
- `get_task_output`
- `approve_failover`
- `cancel_task`
- `get_status`

When a proposed replacement changes provider, the approval response must disclose the new provider/model and what task/context/diff data will be sent. An approval may grant a one-task exception to the provider allow-list only if the user explicitly consents. `auto` failover must never bypass provider restrictions. MCP must expose approval as a task-state transition and never prompt on stdio.

**Acceptance criteria**

- CLI and MCP use the same lifecycle transitions.
- A provider change cannot happen without explicit consent or an existing allow-list entry.
- MCP stdout contains protocol messages only; diagnostics use stderr/log files.
- Tests cover pending approval, provider mismatch, rejection, approval, cancellation, and client disconnect.

### R2-11 — Make task-state persistence crash-safe (P1)

**Observed issue**

The plan requires durable `.air/tasks/<id>.json` state and atomic health writes, but it does not explicitly require atomic task-state writes or define recovery from a partially written task record.

**Required change**

- Persist task state through temp-file-plus-rename or an append-only event log with a recoverable snapshot.
- Ensure output/event buffers have hard size limits and truncation metadata.
- Ensure multiple tasks cannot overwrite one another's task files.
- Define a stale-running-task recovery rule after AIR exits unexpectedly. Do not automatically restart the agent; mark the run interrupted and allow status/recovery inspection.
- Use atomic writes/locking for shared health/cooldown state across concurrent CLI and MCP processes.

**Acceptance criteria**

- Kill AIR during a mock run and verify the task can still be inspected as interrupted.
- Run concurrent mock tasks and verify task records and health state are not corrupted.
- Oversized output stays within configured memory/disk limits.

### R2-12 — Fix the model-checking script's remaining portability issues (P2)

**Observed issue**

`check-free-models.ps1` now resolves the YAML file relative to the script, but `.env` is still resolved relative to the current working directory and `$Tool` is still unused. Running the script from another directory can therefore find the YAML but fail to find the repository `.env` file.

**Required change**

- Resolve the repository root and `.env` from `$PSScriptRoot`, not the caller's current directory.
- Remove `$Tool` if it is not supported, or implement the documented behavior.
- Fail early with a clear error when `OPENROUTER_API_KEY` is missing; do not make an unauthenticated request and report a vague API error.
- Keep the script read-only; do not modify model lists automatically.

**Acceptance criteria**

- Run the script from the repo root and from an unrelated working directory; both resolve the same model file and env file.
- Missing API key produces a clear non-zero exit.

---

## 3. Required `PLAN.md` consistency decisions

Before implementation proceeds, update `PLAN.md` so these decisions are unambiguous:

| Topic | Required single source of truth |
|---|---|
| Phase ordering | No real second-agent continuation until safe handoff is implemented and tested. |
| Dirty Git state | Explicit default policy; recommended: refuse dirty write tasks unless `--allow-dirty`. |
| Checkpoint | Specify whether it is a snapshot, patch, branch, or worktree. Do not leave the word undefined. |
| Error categories | One canonical enum and one action mapping. |
| Success | Explicit result states; no free-form model prose as proof of success. |
| Config schema | Choose Zod or Ajv/JSON Schema; do not maintain competing sources. |
| Status/health | One canonical report or a true identical alias. |
| Global paths | One cross-platform path resolver. |
| Repo config | Untrusted by default; verification commands require trust/approval. |
| MCP | Typed task lifecycle and explicit provider-destination consent. |
| Persistence | Atomic task state, health state, and recoverable interrupted runs. |

Remove stale/contradictory statements after deciding; do not merely append another note that leaves the old text in place.

## 4. Recommended order of work

1. **First:** Resolve R2-01 through R2-05 in `PLAN.md` and `package.json`/lockfile. These directly affect implementation order and clean installation.
2. **Next:** Resolve R2-06 through R2-11 before the corresponding feature phases begin.
3. **Finally:** Fix R2-12 and update README/CLI help.
4. Implement the revised plan phase by phase. Do not add the four adapters or MCP in one large implementation step.

## 5. Verification checklist for the coding agent

Before reporting this follow-up review as addressed, provide:

- [ ] Updated `PLAN.md` with contradictions removed.
- [ ] `package.json` and `package-lock.json` synchronized.
- [ ] Clean-clone `npm ci` result.
- [ ] `npm run build` result.
- [ ] `npm run typecheck` result, including test-code type checking.
- [ ] `npm test` result.
- [ ] `npm run lint` result, or removal of the unconfigured lint script.
- [ ] Explicit dirty-tree policy and tests.
- [ ] Unified error taxonomy and result states.
- [ ] Phase gates that prevent real failover before safe handoff.
- [ ] Documented MCP lifecycle and provider-consent semantics.
- [ ] Cross-platform config/cache path tests.
- [ ] Confirmation that untrusted repo config cannot auto-execute verification commands.

**Important review limitation:** This review inspects the GitHub repository contents and metadata. It does not claim to have run `npm ci`, build, lint, or tests in a local checkout. The implementation agent must run those commands and report their actual results.
