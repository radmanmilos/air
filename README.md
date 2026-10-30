# air

**Status:** Early development - scaffold only. Commands below are planned, not implemented.

Unified AI tool orchestrator with smart routing and failover. One CLI + MCP server to route tasks across aider, goose, opencode, and kilocode with automatic failover on rate limits.

## Features (planned)

- **Smart routing** - Classifies tasks and picks the best tool/model
- **Failover with control** - Asks before switching by default, optional auto-switch
- **Stream + buffer** - Live output while parsing for rate limits
- **Context handoff** - Preserves goal, files, git state when switching tools
- **MCP server** - Expose routing to other agents
- **Self-contained** - All configs and model lists bundled

## Quick Start

```bash
npm install
npm run build
npm link
air --help
```

## Commands (planned)

- `air run "<task>"` - Route and run task
- `air status` / `air health` - Show tools, cooldowns, and health history (merged, see PLAN.md R-14)
- `air route-test "<task>" --explain` - Test routing without executing
- `air config --validate` - Show/edit config
- `air mcp` - Start MCP server (stdio)

## Configuration

Global config: `~/.config/air/config.yaml`  
Repo config: `.airrc.yaml`  
Cache: `~/.cache/air/`

## Development

```bash
npm run dev
```