# air

**Status:** Phases 0-5 complete. 94 tests passing. CLI + MCP server functional.

Unified AI tool orchestrator with smart routing and failover. One CLI + MCP server to route tasks across aider, goose, opencode, and kilocode with automatic failover on rate limits.

## Features

- **Smart routing** - Priority-list candidate selection with exact skip reasons (cooldown_active, capability_mismatch, cannot_handle, tool_not_registered)
- **Failover with control** - Asks before switching by default, optional auto-switch (`--auto`)
- **Stream + buffer** - Live output while parsing for rate limits; bounded rolling buffer with truncation metadata
- **Context handoff** - Builds handoff from git state (never model summary); redacts secrets
- **MCP server** - Expose routing to other agents via stdio JSON-RPC
- **Self-contained** - All configs and model lists bundled
- **Safety** - Dirty-tree refusal by default (`--allow-dirty` opt-in); provider allow-list; hop cap; revisit prevention

## Quick Start

```bash
npm install
npm run dev
air --help
```

## Commands

- `air run "<task>"` - Route and run task (`-f, --files`, `--auto`, `--allow-dirty`, `--read-only`)
- `air status` / `air health` - Show tools, providers, models, and active cooldowns (health is a true alias; `--json`)
- `air route-test "<task>" --explain` - Test routing without executing (`--json`)
- `air config --validate` - Validate config against the Zod schema
- `air config migrate` - Upgrade config to the current schema version
- `air verify -- <cmd...>` - Run an approved verification command (array args, no shell)
- `air mcp` - Start MCP server (stdio)

## Configuration

Configuration lives in a platform-appropriate directory, resolved by a single
central path module:

| Platform | Config | Cache/State |
|---|---|---|
| Linux | `$XDG_CONFIG_HOME/air` (fallback `~/.config/air`) | `$XDG_CACHE_HOME/air` (fallback `~/.cache/air`) |
| macOS | `~/Library/Application Support/air` | `~/Library/Caches/air` |
| Windows | `%APPDATA%/air` | `%LOCALAPPDATA%/air` |

Global config: platform config directory / `config.yaml`  
Repo config: `.airrc.yaml` (untrusted by default; validation required)  
Cache: platform cache directory / `air/`

Precedence: CLI > env > repo `.airrc.yaml` > global > defaults.

## Development

```bash
npm run typecheck      # app typecheck
npm run typecheck:test # test typecheck
npm test               # vitest
npm run build          # tsc
npm run dev            # tsx bin/air.ts
```

## Adapters

| Adapter | Executable | Headless | Verified |
|---|---|---|---|
| aider | `aider` | `--message`, `--yes-always`, `--exit` | 0.86.2 |
| goose | `goose` | `goose run --text` | 1.57.0 |
| mock (test-only) | `node tests/fixtures/mock-tool.js` | env-controlled | n/a |