# Plan: air - Unified AI Tool Orchestrator

**Name:** `air`  
**Location (new repo):** `E:\GitHub\air` (new repo to be pushed to `https://github.com/radmanmilos/air`)  
**Runtime:** Node/TypeScript  
**Interfaces:** CLI + MCP server (both)  
**Initial tools:** aider, goose, opencode, kilocode  
**Failover:** Ask before switching by default, with option to enable auto-switch  
**Development rule:** Develop and test entirely in `E:\GitHub\air`. No changes to existing projects until integration is ready.

## Goal
Create a single terminal entrypoint that routes tasks to the best available tool/model, detects rate limits/quota issues, and proposes/switches to the next suitable tool with context preserved so work continues.

## Design Principles
- Don't replace TUIs - spawn existing CLIs
- Graceful degradation with explicit user control
- Reusable across projects via global config + env
- Extensible: easy to add new connectors
- Observability: health tracking, cooldowns, logs
- Respect project rules (YAGNI, surgical, git safety)

## Architecture

### Components
1. **CLI (`air`)** - `bin/air.ts` with commands: `run`, `status`, `route-test`, `mcp`, `config`, `health`
2. **Config** - `~/.config/air/config.yaml` (global) + optional repo `.airrc.yaml`. Schema validated. Imports from existing sources.
3. **Task Classifier** - Keyword + file pattern based routing (small-edit, multi-file, debug, ui/css, screenshot, tests, docs)
4. **Router** - Scores tools by fit, availability, health, cooldown. Respects user preference (ask vs auto)
5. **Adapters** - Per-tool connector: spawn CLI, pass context/files, parse output for rate limits/errors
6. **Context Packer** - Build minimal handoff (goal, changed files, git diff, relevant rules) on failover
7. **Health Tracker** - Success/fail/rate-limit counts, cooldown timers (persisted to `~/.cache/air/`)
8. **MCP Server** - Expose `route_task`, `get_status`, `propose_switch`, `switch_tool` for other agents

### Tool Adapters (initial)
| Tool | Invocation | Rate limit detection | Notes |
|------|-------------|---------------------|-------|
| aider | `aider --model ... --yes --message "..." [files]` | "rate limit", "429", "quota", "overloaded", "model not available" | Headless capable. Stream + buffer. |
| goose | `goose run --recipe ...` or build prompt file | Similar patterns + provider errors | May need recipe/prompt file. Stream + buffer. |
| opencode | `opencode run ...` or TUI wrapper (check flags) | Parse stderr/stdout | Prefer non-interactive if available. Stream + buffer. |
| kilocode | Check CLI availability; prefer VSCode extension fallback if no headless mode | TBD | May need different approach; mark CLI-limited if no headless. Stream + buffer where possible. |

### Failover Flow
1. User: `air run "fix mobile nav"`
2. Classify -> UI/single-file -> prefer aider
3. Spawn aider with context
4. If rate limit detected -> show proposal: "aider hit rate limit. Switch to goose (Nemotron)?" [y/N/auto]
5. If user agrees (or auto enabled) -> pack context, spawn goose, resume
6. Update health/cooldown

## File Structure (new repo)
```
air/
├── bin/air.ts           # CLI entry
├── src/
│   ├── adapters/        # tool connectors
│   ├── classifier/      # task routing
│   ├── config/          # schema + loader
│   ├── mcp/             # MCP server
│   ├── router/          # routing logic
│   ├── context/         # handoff packing
│   └── utils/           # spawn, parse, health
├── config/
│   ├── schema.json
│   └── default.yaml
├── package.json
├── tsconfig.json
└── README.md
```

## Config Schema (key parts)
```yaml
failover:
  mode: ask  # ask | auto
  cooldown_minutes: 30
tools:
  aider:
    enabled: true
    priority: 1
    models: [from tools/aider-free-models.yml]
  ...
routing:
  rules:
    - match: {files: ["*.css", "*.html"], count: 1} -> prefer: [aider, goose]
    - match: {paths: ["game/shared/**"]} -> prefer: [opencode, kilocode]
```

## Implementation Steps

### Phase 1: Setup (separate repo - E:\GitHub\air)
1. Initialize git repo in `E:\GitHub\air` (if not already)
2. Initialize package.json, tsconfig, basic structure
3. Add CLI scaffold with commander/yargs
4. Add config loader with schema validation
5. Set up remote to `https://github.com/radmanmilos/air` (create repo on GitHub when ready, but don't push existing projects)

### Phase 2: Core
1. Task classifier
2. Health tracker (JSON in cache)
3. Context packer
4. Router logic

### Phase 3: Adapters
1. Implement aider adapter (test first)
2. Implement goose adapter
3. Implement opencode adapter
4. Implement kilocode adapter (may be limited)

### Phase 4: Failover + MCP
1. Rate limit detection + proposal flow
2. Context handoff
3. MCP server implementation
4. Integration tests

### Phase 5: Polish
1. Import existing model lists from Games for kids
2. Documentation
3. Global install instructions

## Implementation Notes
- **I/O:** Use `child_process.spawn` with `stdio: ['pipe','pipe','pipe']`, pipe stdout/stderr to process.stdout/stderr in real-time and also collect into buffers for parsing
- **Rate limit detection:** Configurable regex patterns per adapter + global patterns; mark tool/model in cooldown on detection
- **Failover UX:** Show clear proposal with reasoning (why switching, next tool/model), ask for confirmation unless `failover.mode: auto`
- **Context handoff:** Include goal, repo root, git branch/status, changed files, last N KB of output, relevant AGENTS.md snippets, error summary
- **MCP:** Run as stdio server by default; expose tools for routing/status/switching
- **Extensibility:** Adapter interface `IAirAdapter` with `canRun()`, `run()`, `detectRateLimit()`, `getHealth()`

## Risks & Mitigations
- **TUI-only tools**: Some may not have headless mode -> mark as CLI-limited, skip auto-routing
- **Context loss**: Mitigate with detailed handoff summary
- **Auth issues**: Tools handle their own auth; air just spawns them
- **Rate limit detection varies**: Make patterns configurable
- **Cross-platform**: Handle Windows/Unix differences in spawning
- **Repo isolation**: All development in `E:\GitHub\air` only, no changes to existing repos until explicitly integrated

## Open Questions (resolved)
- Name: air ✓
- Interfaces: CLI + MCP ✓  
- Runtime: Node/TypeScript ✓
- Failover: ask before switch with auto option ✓
- Initial tools: aider, goose, opencode, kilocode ✓
- Location: `E:\GitHub\air` (new repo) ✓
- I/O: Stream + buffer ✓
- Development: Separate repo only ✓
