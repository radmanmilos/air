# grok_plan_review.md

> **Document type:** AI-agent implementation feedback and correction list  
> **Target repository:** https://github.com/radmanmilos/air  
> **Reviewed artifacts:** PLAN.md, README.md, package.json, bin/air.ts, src/index.ts, tests/, project_reviews/*, current tree  
> **Review date:** 2026-10-31  
> **Instruction priority:** Safety and correctness > reliable execution > maintainability > feature breadth  
> **How to use:** Treat every item as a concrete change request. Update PLAN.md first where noted, then implement. Reference IDs (G-xx) in commits. Do not mark a phase complete until its acceptance criteria pass with real tests.

---

## 0. Instructions to the implementation agent

1. Read this document together with the current `PLAN.md` and the existing `project_reviews/` documents (Claude + ChatGPT delta reviews). This is a third-party review; it does not replace them.
2. Inspect the live repository state before changing anything. Do not assume this document is perfectly synchronized with the latest commit.
3. Keep the project buildable and testable after every change. Prefer small, verifiable increments.
4. Do not create placeholder or stub implementations and report them as complete. A feature is complete only when behavior works and automated tests cover success + failure paths.
5. Work only inside the `air` repository. Do not modify other projects.
6. Never discard user changes, auto-commit, auto-push, or rewrite git history unless the user explicitly requests it.
7. When tool CLI behavior is required (flags, exit codes, error location), verify against the installed version and record findings in `docs/adapters/<tool>.md`. Do not guess.
8. When a requirement is ambiguous, choose the safest reversible default, document the assumption in PLAN.md or a comment, and continue. Ask the user only when the decision is consequential and cannot be safely defaulted.

### Definition of done (any phase)

- Code is implemented, not stubbed.
- Automated tests cover normal and failure paths for that phase.
- `npm run build`, `npm run typecheck`, `npm run typecheck:test`, and `npm test` pass.
- User-facing docs (README, CLI help) describe actual behavior, not planned behavior.
- Failure messages are actionable and never leak secrets.

---

## 1. Overall assessment

**Verdict: The plan is strong and should be retained.** Prior reviews (Claude + ChatGPT R2) correctly fixed the most dangerous issues. The architecture, safety posture, and vertical-slice phase order are sound.

**Current repo state (as of review):** Early scaffold + partial Phase 0 progress.

| Area | Status |
|------|--------|
| Concept (orchestrate existing CLIs, route, controlled failover) | Sound |
| PLAN.md after prior reviews | Mostly consistent and high-quality |
| Vertical-slice order | Correctly adopted |
| Headless-only | Correctly adopted |
| Provider/model cooldowns | Correctly adopted |
| Mechanical git-state handoff | Correctly adopted |
| Error taxonomy | Unified in PLAN; not yet in code |
| Dirty-tree policy | Defined in PLAN; not yet enforced |
| Package/lockfile reproducibility | Improved but verify with `npm ci` |
| Mock fixture + basic tests | Present (`tests/fixtures/mock-tool.js` + `fixtures.test.ts`) |
| Real adapters / docs/adapters/ | Missing |
| Core modules (config, router, execution, health, context, security, mcp) | Missing or empty |
| CLI commands | All print "Not implemented yet" |
| Phase 0 complete? | **No** — spikes and adapter docs missing |

**Biggest remaining risks:**

1. Implementing real cross-agent continuation before handoff + redaction + allow-list are solid (already gated by R2-01; enforce it).
2. False-positive rate-limit detection if adapters ever scan model stdout prose.
3. Git-state ambiguity under `--allow-dirty`.
4. Package/CLI packaging details that still prevent a clean `npm ci` + `npx air` experience.

---

## 2. Strengths to preserve (do not regress)

- Headless-only design. Interactive TUI use remains out of scope.
- Vertical-slice-first phases (spikes → skeleton → one-agent → handoff/safety → MCP → expand).
- Initial scope limited to aider + one verified second tool. Do not add kilocode or others until headless mode is confirmed and documented.
- Cooldowns keyed by `(provider, model)`.
- Error classification from exit code + stderr + structured fields only. Never scan model-generated stdout prose.
- Mechanical handoff built from git state (status, diff, changed files), not from a failed model's summary.
- MCP: async jobs, no prompting on stdio, approval exposed as task-state transition.
- Dirty working tree default: refuse write tasks; `--allow-dirty` is explicit and non-destructive.
- Process runner: `cross-spawn`, argument arrays, `shell: false`, tree-kill, per-tool timeouts.
- Provider allow-list and one-task consent model for destination changes.
- Crash-safe persistence (temp + rename or event log) and atomic health/cooldown writes.
- Result states that distinguish `SUCCEEDED_WITH_CHANGES`, `SUCCEEDED_READ_ONLY`, `NO_CHANGES`, etc.
- Central platform path resolver (XDG / macOS Application Support / Windows APPDATA).

---

## 3. Required corrections and improvements

### G-01 — Complete Phase 0 before claiming progress (P0)

**Observed:** Mock tool and basic fixture tests exist. `docs/adapters/` and real CLI spike documents do not. No aider (or second-tool) verification of flags, exit codes, error streams, or headless invocation.

**Required:**

1. Install the target tools (or document exact versions used for spikes).
2. For each tool write `docs/adapters/<tool>.md` containing:
   - Exact headless invocation (executable + required flags).
   - How to pass the task prompt and optional file list.
   - How to select model/provider.
   - How to disable auto-commit / auto-approve / interactive prompts.
   - Observed exit codes and whether errors appear on stderr vs stdout for: success, rate limit, auth failure, model unavailable, timeout.
   - Any structured output mode.
3. Keep the mock tool as the primary test double. Expand modes only if needed for new error categories.
4. Do not mark Phase 0 done until both adapter docs exist and `npm test` still passes with zero network / zero real tools.

**Acceptance:**

- `docs/adapters/aider.md` and one additional adapter doc exist and match installed CLI behavior.
- Mock covers at least: succeed, rate_limit (stderr + non-zero), auth, false_positive (stdout prose + exit 0), no_changes, crash, hang, stdout_prose_limit.
- Phase 0 "Done when" criteria in PLAN.md are satisfied by real artifacts.

### G-02 — Enforce the Phase 2 / Phase 3 gate (P0)

**Observed:** PLAN correctly states that real second-agent continuation belongs in Phase 3. The gate language must stay unambiguous.

**Required:**

- Phase 2 may *propose* failover (with reasoning, cooldowns, alternatives) and must test the proposal path with mocks.
- Phase 2 must **not** launch a second real agent against a partially edited workspace.
- Phase 3 is the first phase allowed to perform real agent-to-agent continuation, and only after:
  - mechanical handoff,
  - secret redaction,
  - provider allow-list / consent checks,
  - durable task state,
  - corresponding tests.

**Acceptance:**

- Code path that starts a second real agent is behind a clear feature/phase boundary or is absent until Phase 3.
- End-to-end test in Phase 3: agent A makes partial edits → fails with RATE_LIMIT → handoff is built → agent B continues from the actual working-tree state.

### G-03 — Canonical error taxonomy must live in one place (P0)

**Observed:** PLAN defines a good taxonomy. Code does not yet expose it. Prior reviews already unified names; keep them.

**Required:**

- Create `src/types/errors.ts` (or equivalent) exporting exactly:

```ts
export type ErrorCategory =
  | 'RATE_LIMIT'
  | 'QUOTA_EXCEEDED'
  | 'MODEL_UNAVAILABLE'
  | 'AUTH_ERROR'
  | 'NETWORK_ERROR'
  | 'PROCESS_CRASH'
  | 'TOOL_NOT_INSTALLED'
  | 'TIMEOUT'
  | 'USER_CANCELLED'
  | 'PERMISSION_DENIED'
  | 'CONTEXT_LENGTH'
  | 'TASK_FAILURE'
  | 'UNKNOWN';
```

- One policy table mapping each category → action: `retry_same | wait_cooldown | propose_switch | stop_ask_user`.
- `USER_CANCELLED` never triggers failover.
- Auth / permission failures never cause repeated retries against the same broken credentials.
- Adapters implement `classifyError` using: structured fields first, then exit code + stderr evidence, then adapter-specific patterns. Never scan model stdout prose.

**Acceptance:**

- All modules import the single type.
- Unit tests for each category's policy.
- Mock false-positive modes never produce RATE_LIMIT.

### G-04 — Result states and success definition (P0)

**Required:** Implement the PLAN result states as a shared type and use them in CLI + MCP responses:

- `SUCCEEDED_WITH_CHANGES`
- `SUCCEEDED_READ_ONLY`
- `NO_CHANGES`
- `FAILED`
- `CANCELLED`
- `NEEDS_USER_REVIEW`

Rules:

- Natural-language model output alone is never proof of success.
- Write tasks: exit 0 + empty diff → `NO_CHANGES`.
- Read-only tasks must be explicitly declared (CLI flag or task metadata) so empty diff is valid.
- Optional `verify.command` (when trusted) can upgrade or downgrade the final state; default is not to run repo-config verify commands.

**Acceptance:** Tests for write-with-changes, write-no-changes, read-only-no-changes, failing verifier, and cancelled run.

### G-05 — Dirty-tree and checkpoint policy (already in PLAN — implement exactly) (P0)

Follow the policy already written under "Dirty working tree (R2-02)":

1. Capture branch, HEAD, staged, unstaged, untracked before start.
2. Default: refuse write-capable tasks on dirty tree; print exactly what is dirty; do not modify.
3. `--allow-dirty` is the only escape hatch; never auto-reset/stash/checkout/clean/revert.
4. Checkpoint = read-only snapshot/patch record in MVP. Worktree is later opt-in.
5. Never auto-commit or push.

**Acceptance:** Tests for clean, staged-dirty, unstaged-dirty, untracked; default refusal; `--allow-dirty` preserves original state.

### G-06 — Process runner requirements (P0)

Implement one shared runner used by every adapter:

- `cross-spawn` + argument array, never `shell: true`.
- `stdio: ['pipe','pipe','pipe']`, close or ignore child stdin.
- Stream stdout/stderr to the user in real time while keeping a bounded rolling buffer.
- Per-tool configurable timeout; tree-kill on timeout or cancel (`taskkill /T /F` on Windows, process group on Unix).
- Record exit code, signal, spawn error, start/end timestamps.
- Handle Ctrl+C: stop child, persist task state, exit with distinct code.
- Hard size limits + truncation metadata on output buffers.

**Acceptance:**

- Injection test: task text containing quotes, `&`, `|`, `$()` reaches the child unmodified.
- Cancel / timeout leaves no orphan processes.
- Concurrent CLI + MCP processes do not corrupt health/cooldown files (atomic write or lock).

### G-07 — Config and paths (P1)

- Zod schema is the single source of truth. Precedence: CLI > env > repo `.airrc.yaml` > global > defaults.
- Repo config is untrusted until explicitly validated/trusted. Must not inject shell fragments, change executable paths, or broaden permissions.
- Do not execute `verify.command` from repo config by default.
- One central path module for config, cache, task state, logs, health. Never hard-code `~/.config` or `~/.cache`.
- Platform table already in PLAN — implement exactly.

**Acceptance:** Path resolver unit tests on mocked `process.platform` + env vars; untrusted repo config cannot escalate.

### G-08 — Handoff and security (P1 — Phase 3 gate)

- Handoff contents: goal, repo root, branch, `git status`, size-capped `git diff`, changed file list, last N KB of output, error category + summary. Built only from data AIR already has.
- Redact secrets (env values, token-like strings, `.env` contents) from handoff and logs.
- Provider allow-list: default to first-attempt provider only when no allow-list is configured. Auto failover must never bypass the allow-list. One-task exception requires explicit consent that discloses the new provider/model and what data will be sent.
- Task state: `.air/tasks/<id>.json` (or event log + snapshot). Atomic writes. Multiple tasks cannot overwrite each other. Stale RUNNING tasks after crash are marked interrupted; never auto-restarted.

**Acceptance:** Secret fixture never appears in handoff; allow-list test; crash leaves readable task file; recovery path does not restart the agent.

### G-09 — MCP semantics (P1)

- Shared lifecycle states: at least `QUEUED`, `RUNNING`, `FAILURE_DETECTED`, `AWAITING_APPROVAL`, `SWITCHING`, `COMPLETED`, `FAILED`, `CANCELLED`.
- MCP tools (typed): `run_task`, `get_task_status`, `get_task_output`, `approve_failover`, `cancel_task`, `get_status`.
- No prompting on stdio. Approval is a state transition.
- stdout = protocol messages only; diagnostics go to stderr / log files.
- Async jobs because long runs exceed typical MCP call timeouts.

**Acceptance:** MCP-mode limit hit returns a proposal object and never reads stdin; approval tool advances state correctly.

### G-10 — Package, CLI, and test packaging hygiene (P1)

Current package.json is improved (engines, files, vitest, cross-spawn, zod, pinned MCP SDK). Still verify:

1. `npm ci` succeeds on a clean clone.
2. `npm run build`, `typecheck`, `typecheck:test`, `test` all succeed.
3. Emitted `dist/bin/air.js` retains a usable shebang / package bin behavior on Unix and Windows.
4. `tsconfig.json` excludes tests; `tsconfig.test.json` type-checks tests + vitest config.
5. No unused dependencies (e.g. leftover Ajv or inquirer if not used). Prefer `@inquirer/prompts` or readline only if CLI approval actually needs it; MCP must never prompt.
6. README and CLI help mark unimplemented commands as planned or remove the "Not implemented yet" once the phase lands.
7. `status` is canonical; `health` is a true alias showing the identical report (current bin/air.ts comments already lean this way — keep them consistent with PLAN and help text).

**Acceptance:** Clean-clone install + build + test + `npx air --help` works on supported platforms.

### G-11 — Observability and explainability (P2)

- Per-run JSONL trace (classification/routing inputs, candidates + skip reasons, chosen candidate, error class + matched pattern, failover decisions, final result state/exit code).
- `air route-test "<task>" --explain` prints the same reasoning without executing.
- Logs never contain secrets.

**Acceptance:** Failover run produces a trace containing every decision; route-test matches the trace content for the same input.

### G-12 — Router simplicity until evidence (P2)

- Start with an ordered priority list + capability flags + cooldown filtering + allow-list filtering.
- Defer keyword/file-pattern classifier and scoring until real misroutes are observed in practice.
- Hop cap default 3; never revisit a (tool, provider, model) already tried for the same task while still in cooldown.
- When all candidates are exhausted, return a distinct exit code and a message listing each skip reason + earliest cooldown end.

**Acceptance:** Ping-pong A→B→A is impossible; all-exhausted path is tested.

---

## 4. Phase checklist (authoritative)

Use this as the gate list. Do not reorder.

| Phase | Must produce | Exit criteria |
|-------|--------------|---------------|
| **0 Spikes** | `docs/adapters/aider.md` + one other; mock tool covering required modes; vitest green | Artifacts exist; `npm test` passes offline |
| **1 Skeleton** | Package fixes, central paths, Zod config, shared process runner, logger+redaction, atomic health file, unit tests | `npm ci`, build, typecheck, typecheck:test, test all green |
| **2 One-agent** | Aider adapter, `air run`, stream+buffer, error classification, run IDs, result states, dirty-tree check, checkpoint snapshot, **failover proposal only** (mocked) | Single-agent path works with mock + real aider; proposal path tested; no real second agent launched |
| **3 Handoff + safety** | Second adapter, durable task state, mechanical handoff, redaction, provider allow-list/consent, real cross-agent continuation | Redaction + allow-list tests pass; e2e A→partial→fail→B continues safely |
| **4 MCP** | Async jobs, typed tools, no stdio prompts, approval as state transition | MCP tests pass; concurrent CLI+MCP safe |
| **5 Expand** | Additional adapters only after verification; scoring only if misroutes observed; optional verify hook | Tests pass; no scope creep |

---

## 5. Explicit non-goals (do not implement now)

- Interactive TUI replacement or embedding.
- Auto-commit / auto-push.
- Trusting model-generated "Done" text as success.
- Scanning model stdout prose for rate-limit keywords.
- Importing model lists or rules from other repositories.
- Broad agent permissions by default.
- Real multi-agent continuation before Phase 3 safety gates.
- Complex classifier/scoring before vertical slice is proven.

---

## 6. Suggested immediate next actions (ordered)

1. Finish Phase 0: write the two adapter spike docs from real CLI experiments; keep mock tests green.
2. Land the shared types (`ErrorCategory`, result states, `ToolCapabilities`, `CommandSpec`, etc.) in `src/types/`.
3. Implement central path resolver + Zod config loader with untrusted-repo handling.
4. Implement the shared process runner with the injection, timeout, and tree-kill tests.
5. Only then wire the first real adapter (aider) behind `air run` and the mock-driven classification tests.
6. Keep PLAN.md as the single source of truth; update it when any of the above decisions are refined.

---

## 7. Review summary for the human

The plan is already in good shape after the previous external reviews. The main value of this document is to:

- Confirm the architecture and safety decisions should stay.
- Make the Phase 2 vs Phase 3 gate impossible to miss.
- Force Phase 0 artifacts (adapter docs) to exist before more code is written.
- Lock the error taxonomy, result states, and process-runner requirements into concrete types and tests.
- Keep the implementation agent from drifting into stubs, premature abstractions, or unsafe failover.

If the implementation agent follows the phase gates and the acceptance criteria above, the resulting system will be safe, explainable, and actually usable.