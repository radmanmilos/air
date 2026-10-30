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

1. **CLI (air)** - bin/air.ts with commands: run, status, route-test, mcp, config, health
2. **Config** - Platform-appropriate global config + optional repo .airrc.yaml. Zod schema validation. Precedence: CLI > env > repo > global > defaults
3. **Task Classifier** - Deferred until after vertical slice; start with ordered priority list
4. **Router** - Priority list first, scoring later if needed. Cooldowns keyed by (provider, model)
5. **Adapters** - Per-tool connector implementing IAirAdapter: detect, getCapabilities, buildCommand, parseOutput, classifyError
6. **Context Packer** - Build handoff from git state (not model summary)
7. **Health Tracker** - Keyed by (provider, model), persisted to ~/.cache/air/ with atomic writes
8. **MCP Server** - Async jobs, stdio, no prompting in MCP mode
9. **Execution** - Shared process runner with cross-spawn, timeouts, tree kill
10. **Security** - Redaction, provider allow-list, secret scanning

### Types

```ts
export type ErrorCategory = 'rate_limit' | 'auth' | 'context_length' | 'model_unavailable' | 'task_failure' | 'timeout' | 'unknown';
export interface ToolCapabilities { headlessExecution: boolean; structuredOutput: boolean; fileEditing: boolean; shellAccess: boolean; imageInput: boolean; supportsCancellation: boolean; }
```

### Connector I/O

- Use cross-spawn with array args, no shell: true
- stdio: ['pipe','pipe','pipe'], close stdin
- Stream to terminal + rolling buffer
- Tree kill on cancel/timeout (taskkill /T /F on Windows, process group on Unix)
- Per-tool timeouts

### Error Classification

Based on exit code + stderr + structured output. Never scan stdout prose for rate limit keywords.

### Failover Flow

1. Checkpoint (git branch/worktree) before attempt
2. Spawn tool headlessly
3. Classify errors
4. If switch warranted and approval needed (and not in MCP) -> propose with reasoning, cooldowns, alternatives
5. If approved and provider in allow-list -> build handoff from git state, spawn next tool
6. Enforce hop cap (max 3), prevent revisits, update (provider,model) cooldowns

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
│   └── schema.json
├── docs/adapters/
├── tests/unit/ tests/integration/
├── package.json
├── tsconfig.json
└── README.md
```

## Revised Phases

| Phase | Scope | Done when |
|---|---|---|
| 0 Spikes | R-09 for aider + one other; mock adapter (R-02); vitest setup | docs/adapters/*.md exist; mock covers success/limit/hang/false-positive/exit0-no-changes |
| 1 Skeleton | Package fixes (main/index, engines, files), cross-spawn, zod config, paths, logger+redaction, atomic health file, tests | npm test, npm run build, npm run typecheck pass |
| 2 Vertical slice | aider adapter, air run, stream+buffer, error classification (R-04), checkpoint (R-05), failover to second with (provider,model) cooldowns (R-03), hop cap/exit codes (R-11), traces (R-13) | Forced-failover passes with mock and real tool |
| 3 Handoff and safety | task state .air/tasks/, mechanical handoff, redaction (R-06), provider allow-list (R-07) | Redaction and allow-list tests pass |
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