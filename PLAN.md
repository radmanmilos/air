# Plan: air - Unified AI Tool Orchestrator

**Name:** air
**Location (new repo):** E:\GitHub\air (new repo to be pushed to https://github.com/radmanmilos/air)
**Runtime:** Node/TypeScript
**Interfaces:** CLI + MCP server (both)
**Initial tools:** aider + one other (TBD after spike)
**Failover:** Ask before switching by default, with option to enable auto-switch
**Development rule:** Develop and test entirely in E:\GitHub\air. No changes to existing projects until integration is ready.

## Reviews applied

This plan was updated after external reviews (see `docs/reviews/`). Conflicts were resolved as follows:

- **Phase order:** Adopt the vertical-slice-first order from the Claude review (spikes + mock adapter before abstractions). ChatGPT's foundation-first order was rejected.
- **TUI vs headless:** Adopt Claude's position: air is headless-only. Interactive TUI use is out of scope. Remove or reword the TUI principle.
- **Cooldown keys:** Both agree provider/model level; Claude is explicit about shared provider limits. Adopt (provider, model) keys.
- **Error classification:** Claude requires exit code + stderr + structured, never stdout prose. Adopt.
- **Handoff:** Claude says mechanical from git state (don't depend on failed model summary). Adopt.
- **MCP:** Claude requires async jobs and no prompting in MCP mode. Adopt.
- **Initial scope:** Claude says reduce to aider + one, drop kilocode until headless confirmed. Adopt.
- **Process spawning:** Claude requires cross-spawn, array args, no shell, tree kill. Adopt.
- **Delta review 2 (R2-01..R2-12):** Phase-order gate, dirty-tree policy, unified error taxonomy, result states, reproducible package metadata, test packaging, status/health semantics, platform paths, untrusted repo config, MCP lifecycle/consent, crash-safe persistence, script portability.
- **DeepSeek review (G-01..G-06):** Secret redaction layer, structured JSONL observability, formal `AgentAdapter` contract + conformance suite, concurrency/resource governance, executable `docs/behavior-spec.md`, config schema versioning + `air config migrate`.
- **Grok review (G-01..G-12):** Phase 0 adapter spike docs, Phase 2/3 gate enforcement, canonical error taxonomy in `src/types/errors.ts`, result states in `src/types/result.ts`, dirty-tree policy, process runner requirements, config/paths, handoff/security, MCP semantics, package/test hygiene, observability, router simplicity.
- **Grok delta 2 (G2-01..G2-12):** Shared execution runner, health tracker with atomic persistence, Zod config loader, router priority-list, context/dirty-tree handoff, CLI command logic, aider adapter, MCP server, redaction hardening, structured observability, second adapter, concurrency lock.
- **ChatGPT delta 3 (R3-01..R3-08):** Phase 0 spike evidence, `package.json` `main` path fix, CLI shebang, unified error action policy, `ProcessOutcome` evidence, redaction determinism/quoted-secrets, CLI/behavior-spec alignment, test-only mock kept out of published package.

## Canonical types

- `ErrorCategory` + `ERROR_POLICY` (the single action authority) — `src/types/errors.ts`.
- `ResultState` — `src/types/result.ts`.
- `ProcessOutcome` (timedOut, cancelled, spawnError, signal) — `src/types/outcome.ts`.
- Shared domain types (`TaskInput`, `CommandSpec`, `ToolCapabilities`, `ExecutionCandidate`, `ParsedEvent`) — `src/types/index.ts`.

## Adapter contract

`AgentAdapter` (`src/adapters/adapter.ts`) is the only surface the router may depend on:
`id`, `provider`, `model`, `capabilities`, `canHandle`, `buildCommand`, `parseOutput`, `classifyError`.
A conformance suite (`src/adapters/conformance.ts`) must pass before an adapter is registered.
Test-only mock adapter lives under `tests/` (not in the published package).

## Redaction

`src/security/redact.ts` is the single choke point for all outbound text (terminal, log, trace, handoff).
Redaction is idempotent and deterministic. The `allow` option protects allowlisted values.
`--api-key=value` and quoted `.env` values are handled.

## Config schema

Zod is the single source of truth. Config is versioned (`version: 1`); `air config migrate` upgrades older versions.
Precedence: CLI > env > repo `.airrc.yaml` > global > defaults. Repo config is untrusted by default.

## File Structure

```
air/
├── bin/air.ts
├── src/
│   ├── adapters/         # adapter.ts (contract), conformance.ts
│   ├── config/           # schema.ts, loader.ts, paths.ts (planned)
│   ├── execution/        # runner.ts (planned)
│   ├── health/           # tracker.ts (planned)
│   ├── mcp/              # server.ts (planned)
│   ├── router/           # router.ts (planned)
│   ├── security/         # redact.ts
│   ├── types/            # errors.ts, result.ts, outcome.ts, index.ts
│   └── utils/
├── config/
│   └── models/
├── docs/
│   ├── behavior-spec.md
│   └── adapters/         # aider.md, goose.md
├── tests/
│   ├── fixtures/         # mock-tool.js
│   ├── mock-adapter.ts
│   └── *.test.ts
├── package.json
├── tsconfig.json
├── tsconfig.test.json
├── vitest.config.ts
└── README.md
```

## Goal

Create a single terminal entrypoint that routes tasks to the best available tool/model, detects rate limits/quota issues, and proposes/switches to the next suitable tool with context preserved so work continues.

## Design Principles

- **Headless-only** - Air operates headless-only. Interactive TUI use is out of scope.
- Graceful degradation with explicit user control
- Reusable across projects via global config + env (self-contained)
- Extensible: easy to add new connectors
- Observability: health tracking, cooldowns, logs
- Respect project rules (YAGNI, surgical, git safety)
- **Self-contained** - All configuration, model lists, and data live inside air/. No imports from other repos.
- **Safety first** - Never discard user changes, preserve work, separate routing approval from permissions
- **Cross-platform** - Windows, macOS, Linux

## Architecture

### Components

1. **CLI (air)** - bin/air.ts with commands: run, status (canonical), health (alias), route-test, config, mcp
2. **Config** - Zod schema is the single source of truth. Versioned (`version: 1`); `air config migrate` upgrades older configs. Platform-appropriate global config + optional repo .airrc.yaml. Precedence: CLI > env > repo > global > defaults. Repo config is untrusted by default.
3. **Task Classifier** - Deferred until after vertical slice; start with ordered priority list
4. **Router** - Priority list first, scoring later if needed. Cooldowns keyed by (provider, model)
5. **Adapters** - Per-tool connector implementing `AgentAdapter` (src/adapters/adapter.ts): id, provider, model, capabilities, canHandle, buildCommand, parseOutput, classifyError. Conformance suite in src/adapters/conformance.ts gates registration.
6. **Context Packer** - Build handoff from git state (not model summary)
7. **Health Tracker** - Keyed by (provider, model), persisted to platform cache dir with atomic writes
8. **MCP Server** - Async jobs, stdio, no prompting in MCP mode
9. **Execution** - Shared process runner with cross-spawn, timeouts, tree kill
10. **Security** - Redaction (src/security/redact.ts), provider allow-list, secret scanning
11. **Observability** - Structured JSONL traces; `air status --json`; `air route-test --explain`
12. **Concurrency** - Per-config-dir lock/semaphore; `maxConcurrentAgents` (default 1); atomic health/cooldown writes

### Types

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
export interface ToolCapabilities { headlessExecution: boolean; structuredOutput: boolean; fileEditing: boolean; shellAccess: boolean; imageInput: boolean; supportsCancellation: boolean; }
```

### Error Classification

Canonical taxonomy above, used by adapters, run state, traces, CLI output, MCP results, and tests.

- Structured error fields first, then exit code + stderr evidence, then adapter-specific fallback patterns.
- Never scan model-generated stdout prose for provider errors.
- Policy table maps each category to an action: retry same candidate, wait for cooldown, propose another candidate, or stop and ask the user.
- USER_CANCELLED must never trigger failover. Auth/permission failures must not cause repeated retries against broken credentials.

### Result States

- `SUCCEEDED_WITH_CHANGES` - exit 0 with non-empty diff
- `SUCCEEDED_READ_ONLY` - read-only task, empty diff is valid
- `NO_CHANGES` - write task, exit 0 with empty diff
- `FAILED` - task failure
- `CANCELLED` - user cancelled
- `NEEDS_USER_REVIEW` - ambiguous state

Natural-language model output alone is never proof of success. Read-only tasks are declared explicitly via task metadata or CLI/config option.

### Connector I/O

- Use cross-spawn with array args, no shell: true
- stdio: ['pipe','pipe','pipe'], close stdin
- Stream to terminal + rolling buffer
- Tree kill on cancel/timeout (taskkill /T /F on Windows, process group on Unix)
- Per-tool timeouts

### Failover Flow

1. Checkpoint (git branch/worktree) before attempt
2. Spawn tool headlessly
3. Classify errors
4. If switch warranted and approval needed (and not in MCP) -> propose with reasoning, cooldowns, alternatives
5. If approved and provider in allow-list -> build handoff from git state, spawn next tool
6. Enforce hop cap (max 3), prevent revisits, update (provider,model) cooldowns

**Gate:** No real second-agent continuation before handoff, redaction, and provider-destination checks pass.

## File Structure

```
air/
├── bin/air.ts
├── src/
│   ├── adapters/
│   ├── config/
│   ├── context/
│   ├── execution/
│   ├── health/
│   ├── mcp/
│   ├── router/
│   ├── security/
│   ├── types/
│   └── utils/
├── config/
│   ├── default.yaml
│   └── models/
├── docs/adapters/
├── tests/unit/ tests/integration/
├── package.json
├── tsconfig.json
├── tsconfig.test.json
└── vitest.config.ts
```

## Revised Phases

| Phase | Scope | Done when |
|---|---|---|
| 0 Spikes | R-09 for aider + one other; mock adapter (R-02); vitest setup | docs/adapters/*.md exist; mock covers success/limit/hang/false-positive/exit0-no-changes |
| 1 Skeleton | Package fixes, cross-spawn, zod config, paths, logger+redaction, atomic health file, tests | npm test, npm run build, npm run typecheck pass |
| 2 One-agent execution | aider adapter, air run, stream+buffer, error classification (R-04), checkpoint (R-05), run IDs, result states | Single-agent execution passes with mock; failover *proposed* but not executed |
| 3 Handoff and safety | Second adapter, task state .air/tasks/, mechanical handoff, redaction (R-06), provider allow-list (R-07) | Redaction and allow-list tests pass; real cross-agent continuation works |
| 4 MCP | Async jobs, no-prompt in MCP, approval/cancel tools (R-08) | MCP tests pass |
| 5 Expand | Additional adapters after verification, verify hook, scoring only if misroutes observed | Tests pass |

## Implementation Notes

- **Spawning:** cross-spawn, array args, no shell
- **Cooldowns:** Keyed by (provider, model), respect Retry-After
- **Handoff:** From git state only, redact secrets
- **Checkpoints:** Before each attempt, don't auto-commit by default
- **MCP:** Async jobs, stdout protocol only, stderr for logs
- **Privacy:** Provider allow-list, default to first-attempt provider only
- **Success:** Exit 0 with non-empty diff or task-complete signal; exit 0 empty diff = no_changes

## Testing

- vitest, no network/real tools
- Mock binary with env-controlled behavior
- Temp git repos, fake clocks
- Windows process tests

## Risks

- TUI-only tools out of scope unless headless confirmed
- False positives mitigated by classification rules
- Shared provider limits handled by (provider,model) keys

## Policy Details

### Dirty working tree (R2-02)

1. Before `air run`, capture branch, HEAD, staged paths, unstaged paths, and untracked paths.
2. **Default:** refuse to start a write-capable task when the working tree is dirty. Explain exactly what is dirty. Do not modify it.
3. `--allow-dirty` is an explicit escape hatch. When used, AIR preserves the initial state snapshot and never automatically resets, stash, checkout, clean, or revert anything.
4. Do not claim overlapping edits can be attributed perfectly with `--allow-dirty`. In ambiguous cases, require user intervention before risky recovery or rollback.
5. Do not auto-commit or push. A checkpoint is a read-only snapshot/patch record in the MVP; a dedicated worktree is a later opt-in design.

### Platform config/cache paths (R2-08)

One central path resolver is used by config, cache, task state, logs, and health state. No feature independently constructs `~/.config` or `~/.cache` paths.

| Platform | Config | Cache/State |
|---|---|---|
| Linux | `$XDG_CONFIG_HOME/air` (fallback `~/.config/air`) | `$XDG_CACHE_HOME/air` (fallback `~/.cache/air`) |
| macOS | `~/Library/Application Support/air` | `~/Library/Caches/air` |
| Windows | `%APPDATA%/air` | `%LOCALAPPDATA%/air` |

Respect `XDG_CONFIG_HOME` and `XDG_CACHE_HOME` on Unix-like systems where applicable.

### MCP lifecycle and provider consent (R2-10)

Shared lifecycle used by CLI and MCP, with states at least: `QUEUED`, `RUNNING`, `FAILURE_DETECTED`, `AWAITING_APPROVAL`, `SWITCHING`, `COMPLETED`, `FAILED`, `CANCELLED`.

MCP tools (typed inputs/outputs): `run_task`, `get_task_status`, `get_task_output`, `approve_failover`, `cancel_task`, `get_status`.

When a proposed replacement changes provider, the approval response must disclose the new provider/model and what task/context/diff data will be sent. An approval may grant a one-task exception to the provider allow-list only with explicit user consent. `auto` failover must never bypass provider restrictions. MCP must expose approval as a task-state transition and never prompt on stdio. MCP stdout contains protocol messages only; diagnostics use stderr/log files.

### Persistence (R2-11)

- Task state in `.air/tasks/<id>.json` via temp-file-plus-rename or an append-only event log with a recoverable snapshot.
- Output/event buffers have hard size limits and truncation metadata.
- Multiple tasks cannot overwrite one another's task files.
- Stale-running-task recovery after unexpected AIR exit: mark the run interrupted; do not automatically restart the agent. Allow status/recovery inspection.
- Atomic writes/locking for shared health/cooldown state across concurrent CLI and MCP processes.

### Untrusted repository config (R2-09)

- `.airrc.yaml` is untrusted until validated and trusted by the user.
- Repo config must not be able to inject shell fragments, silently change executable paths, or enable broad agent permissions.
- Do not execute `verify.command` from repo config by default. Require an explicit user trust decision or global policy first.
- Execute approved commands with argument arrays and `shell: false`; never concatenate user-controlled strings into shell commands.
- `air route-test` and `air run` disclose when a verification command will execute.

### Secrets and redaction (G-01)

- A redaction layer runs on all captured stdout/stderr before it is written to logs, displayed, or used for context handoff (src/security/redact.ts).
- Config files never contain raw secrets in version-controlled examples. Use `.env.example` and put secrets in environment variables or an OS keychain.
- Error messages and debug logs never include full command lines that may contain `--api-key` flags.
- `air status` (including `--json`) and `air config` never print secret values.

### Observability (G-02, G-11)

- Structured JSONL traces for every routing decision, tool launch, failure classification, and failover event.
- `air status --json` returns machine-readable health/cooldown state.
- Skip reasons are logged exactly (e.g. `cooldown_active`, `capability_mismatch`), never a generic "not available".

### Adapter contract (G-03)

Every adapter implements `AgentAdapter` (src/adapters/adapter.ts):
- `id`, `provider`, `model`, `capabilities`
- `canHandle(task)`, `buildCommand(task)`, `parseOutput(chunk)`, `classifyError(exitCode, stderr, structured?)`
- A conformance suite (src/adapters/conformance.ts) must pass before an adapter is registered.

### Concurrency and resource governance (G-04)

- Global lock/semaphore per config directory prevents concurrent mutation of shared cooldown/health state.
- `maxConcurrentAgents` (default 1) bounds child processes.
- Cooldown state is persisted atomically (write-temp-then-rename).

### Config schema evolution (G-06)

- Config is versioned (`version: 1` in `config.yaml`).
- `air config migrate` upgrades older configs to the current schema.
- Repo `.airrc.yaml` is validated against the same schema and rejects unknown top-level keys by default (`--allow-unknown` escape hatch).

### Executable documentation (G-05)

- `docs/behavior-spec.md` is the authoritative spec in Given/When/Then format.
- A test validates `air --help` output against the commands documented there.

## Reviews applied (round 3, 2026-10-31)

Four independent reviews (ChatGPT, Claude v2, DeepSeek, Grok v3) were read and
applied. Conflicts were resolved as follows:

- **Adapter registration (G3-01):** Aider is now registered in CLI and MCP
  adapter lists. Adapters are discovered from PATH at runtime; missing binaries
  produce a precise `TOOL_NOT_INSTALLED` skip reason. The mock adapter is
  test-only and is never reachable from production code.
- **Production→test isolation (G3-08):** `MockAdapter` moved from
  `tests/mock-adapter.ts` to `src/adapters/mock.ts`. Test files re-export it.
  `grep -r "tests/" src bin` returns no results.
- **Git-based result detection (G3-03):** Success/NO_CHANGES is computed from
  the actual workspace delta (`git status --porcelain` + `git diff HEAD`),
  not stdout length. Exit 0 with no file changes on a write task is
  `NO_CHANGES`; read-only tasks with empty diff are `SUCCEEDED_READ_ONLY`.
- **Process facts precedence (R4-03):** Timeout, cancellation, and spawn
  errors take precedence over stderr matching in every adapter's
  `classifyError`. Process facts are passed as the `structured` argument.
- **Mechanical handoff (G3-04):** `src/context/handoff.ts` builds a handoff
  pack from branch, HEAD, `git status --porcelain`, size-capped `git diff`,
  changed file list, error category, and the last N KB of redacted output.
  Never includes model-generated prose as evidence.
- **Process-group spawn (G3-05):** The runner now spawns with
  `detached: true` on Unix so `process.kill(-pid, ...)` reliably kills the
  full process tree. Windows uses `taskkill /T /F`.
- **Streaming redaction (R4-08):** `src/security/streaming-redact.ts` retains
  a 128-byte overlap between chunks so token patterns spanning OS output
  boundaries are detected before the chunk is emitted.
- **Failover hardening (G3-06):** Visited set prevents A→B→A ping-pong.
  Health updates (cooldown writes) happen before the next routing decision.
  Handoff text is injected into the next run's task prompt. Hop cap and
  allow-list blocks exit with `ALL_EXHAUSTED` (2) and list skip reasons.
- **Exit code table (G3-13):** `src/types/exit-codes.ts` is the single source
  of truth. 0=success, 1=task failure, 2=all exhausted, 3=cancel, 4=config/
  dirty, 5=no changes, 6=timeout.
- **Redaction choke point (G3-14):** `containsSecret` uses non-global
  detection copies so it has no `lastIndex` state across calls. `--api-key`
  and `--api-key=value` forms are both handled.
- **MCP async (G3-12):** `run_task` starts a background job and returns the
  runId immediately. Poll via `get_task_status` / `get_task_output`.
- **Verify trust gate (G3-11):** `checkVerifyTrust` refuses repo-config
  `verify.command` unless the repo path is in the global trusted-repos list.
  CLI-supplied commands are always trusted.
- **README honesty (G3-15):** README lists only implemented adapters (aider,
  goose, mock-for-tests) and documents known limitations.

## Current state (2026-10-31)

- 21 test files, 115 tests passing.
- `npm run typecheck`, `npm run typecheck:test`, `npm test` all green.
- CLI verified: `air run`, `route-test --explain`, `status --json`, `verify`,
  `air mcp` (initialize + get_status tool).
- Pushed to `radmanmilos/air` on `main`.