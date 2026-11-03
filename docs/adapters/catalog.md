# Free AI Adapter Catalog

AIR bundles a catalog of free, no-login, no-license AI tools that can be installed in the background through `air adapters install <id>`.

## Catalog file

The bundled default catalog lives at `config/catalog.json`. It can be overridden by setting `catalog.remoteUrl` in the air config to point at an operator-maintained remote catalog. AIR loads the bundled catalog, then merges/overrides entries from the remote URL (entries with the same `id` replace bundled entries). Network failures fall back to the bundled catalog with a stderr warning.

## Catalog entry format

Each entry is a JSON object:

| Field | Type | Description |
|---|---|---|
| `id` | string | Unique adapter id (maps to an adapter class in the registry) |
| `name` | string | Human-readable name |
| `adapterId` | string | Adapter class id in the registry (must exist) |
| `executable` | string | Binary name on PATH after install |
| `provider` | string | AI provider (e.g. openrouter, openai, github, local) |
| `model` | string | Default model |
| `capabilities` | object | Adapter capabilities (headlessExecution, fileEditing, etc.) |
| `description` | string | Human-readable description |
| `tags` | string[] | Search tags |
| `install.method` | string | `package-manager` or `direct-download` |
| `install.commands` | object | Per-platform shell command for package-manager installs (`win32`, `darwin`, `linux`) |
| `install.urls` | object | Per-platform/arch download URLs for direct-download installs |
| `install.verify` | string | Command to confirm installation succeeded |
| `install.version` | string | Catalog version pin |

### Example entry

```json
{
  "id": "aider",
  "name": "Aider",
  "adapterId": "aider",
  "executable": "aider",
  "provider": "openrouter",
  "model": "gemma-4-31b-it:free",
  "capabilities": {
    "headlessExecution": true,
    "fileEditing": true,
    "multipleFiles": true,
    "gitIntegration": true,
    "readOnly": true
  },
  "description": "AI pair programming in your terminal. Free via OpenRouter.",
  "tags": ["coding", "free", "openrouter"],
  "install": {
    "method": "package-manager",
    "commands": {
      "win32": "winget install aider.aider",
      "darwin": "brew install aider",
      "linux": "npm install -g aider"
    },
    "verify": "aider --version",
    "version": "0.86.2"
  }
}
```

## Install methods

### package-manager

Runs the per-platform command via cross-spawn (array args, no shell). After install, runs `install.verify` to confirm and parse the version.

### direct-download

Downloads the per-platform/arch URL, places the binary in the cache bin dir, makes it executable (Unix), then runs `install.verify`.

## Install status

Install status is persisted atomically in the cache dir (`installs.json`):

- `installed`: binary is on PATH
- `version`: parsed from `install.verify` output
- `installStatus`: `installed` \| `outdated` \| `failed` \| `not-installed`
- `installAttempts`: number of install attempts

Status is shown in `air status`, `air adapters list`, `air adapters status <id>`, and `air dashboard`.

## CLI commands

| Command | Description |
|---|---|
| `air adapters list` | List all catalog entries with install status |
| `air adapters install <id>` | Install a free AI adapter (requires `--yes` or interactive confirmation) |
| `air adapters upgrade <id>` | Upgrade to catalog version if outdated |
| `air adapters uninstall <id>` | Uninstall an adapter |
| `air adapters status <id>` | Detailed install status for one adapter |

## MCP tools

| Tool | Description |
|---|---|
| `list_adapters` | Read-only: return all catalog entries with install status |
| `install_adapter` | Install an adapter (requires `confirm: true`) |
| `upgrade_adapter` | Upgrade an adapter (requires `confirm: true`) |
| `uninstall_adapter` | Uninstall an adapter (requires `confirm: true`) |

## Adding new tools

1. Add an entry to `config/catalog.json` with a unique `id` and an `adapterId` that maps to an existing adapter class in `src/adapters/registry.ts`.
2. If the tool needs a new adapter class, implement `AgentAdapter` (`src/adapters/adapter.ts`) and register it in `src/adapters/registry.ts`.
3. Set `install.method` to `package-manager` (with per-platform commands) or `direct-download` (with per-platform/arch URLs).
4. Set `install.verify` to a command that prints the version.
5. Run `npm test`, `npm run typecheck`, `npm run lint`, `npm run build` to verify.
6. Commit and push.
