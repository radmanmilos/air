# Plan: air - Unified AI Tool Orchestrator

**Name:** air
**Location (new repo):** E:\GitHub\air (new repo to be pushed to https://github.com/radmanmilos/air)
**Runtime:** Node/TypeScript
**Interfaces:** CLI + MCP server (both)
**Initial tools:** aider + one other (TBD after spike)
**Failover:** Ask before switching by default, with option to enable auto-switch
**Development rule:** Develop and test entirely in E:\GitHub\air. No changes to existing projects until integration is ready.

## Reviews applied

This plan was updated after external reviews (see `project_reviews/`). Conflicts were resolved as follows:

- **Phase order:** Adopt the vertical-slice-first order from the Claude review (spikes + mock adapter before abstractions). ChatGPT's foundation-first order was rejected.
- **TUI vs headless:** Adopt Claude's position: air is headless-only. Interactive TUI use is out of scope. Remove or reword the TUI principle.
- **Cooldown keys:** Both agree provider/model level; Claude is explicit about shared provider limits. Adopt (provider, model) keys.
- **Error classification:** Claude requires exit code + stderr + structured, never stdout prose. Adopt.
- **Handoff:** Claude says mechanical from git state (don't depend on failed model summary). Adopt.
- **MCP:** Claude requires async jobs and no prompting in MCP mode. Adopt.
- **Initial scope:** Claude says reduce to aider + one, drop kilocode until headless confirmed. Adopt.
- **Process spawning:** Claude requires cross-spawn, array args, no shell, tree kill. Adopt.
- **Delta review 2 (R2-01..R2-12):** Phase-order gate, dirty-tree policy, unified error taxonomy, result states, reproducible package metadata, test packaging, status/health semantics, platform paths, untrusted repo config, MCP lifecycle/consent, crash-safe persistence, script portability.

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
2. **Config** - Zod schema is the single source of truth. Platform-appropriate global config + optional repo .airrc.yaml. Precedence: CLI > env > repo > global > defaults. Repo config is untrusted by default.
3. **Task Classifier** - Deferred until after vertical slice; start with ordered priority list
4. **Router** - Priority list first, scoring later if needed. Cooldowns keyed by (provider, model)
5. **Adapters** - Per-tool connector implementing IAirAdapter: detect, getCapabilities, buildCommand, parseOutput, classifyError
6. **Context Packer** - Build handoff from git state (not model summary)
7. **Health Tracker** - Keyed by (provider, model), persisted to platform cache dir with atomic writes
8. **MCP Server** - Async jobs, stdio, no prompting in MCP mode
9. **Execution** - Shared process runner with cross-spawn, timeouts, tree kill
10. **Security** - Redaction, provider allow-list, secret scanning

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