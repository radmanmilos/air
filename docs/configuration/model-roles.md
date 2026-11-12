# Model roles and local provider configuration

**Config schema:** version 2  
**Implementation status:** schema, migration and role resolution are implemented on the local-first feature branch. The coordinator, CLI/MCP chat path, provider registry and worker role propagation are not yet wired.

## Where this configuration lives

Model/provider settings belong only in the user's global AIR config at the path reported by AIR's config path resolver:

- Windows: %APPDATA%/air/config.yaml
- macOS: ~/Library/Application Support/air/config.yaml
- Linux: $XDG_CONFIG_HOME/air/config.yaml (fallback ~/.config/air/config.yaml)

A repository .airrc.yaml cannot select the user's model, provider, endpoint or external egress policy. The loader strips the entire models section from repo config and reports a warning. Do not put credentials in YAML.

## Version 2 defaults

AIR currently defaults to local Ollama and one active generative model. The role assignments are initial defaults, not benchmark recommendations:

| Role | Default model |
|---|---|
| coordinator | qwen3.5:4b |
| planner | qwen3.5:4b |
| coder | qwen2.5-coder:7b |
| reviewer | qwen3.5:4b |
| reasoner | deepseek-r1:1.5b |
| summarizer | qwen3.5:4b |
| embeddings | nomic-embed-text:latest |

The user may change any role independently. Roles are logical responsibilities; several roles may share one model. A role assignment does not guarantee the model is installed or that the model supports every capability. AIR must probe the provider and verify capability before use.

## Example global config

~~~yaml
version: 2
models:
  localFirst: true
  maxConcurrentGenerative: 1
  keepAlive: 5m
  providers:
    ollama:
      enabled: true
      baseUrl: http://127.0.0.1:11434
  roles:
    coordinator:
      provider: ollama
      model: qwen3.5:4b
    planner:
      provider: ollama
      model: qwen3.5:4b
    coder:
      provider: ollama
      model: qwen2.5-coder:7b
    reviewer:
      provider: ollama
      model: qwen3.5:4b
    reasoner:
      provider: ollama
      model: deepseek-r1:1.5b
    summarizer:
      provider: ollama
      model: qwen3.5:4b
    embeddings:
      provider: ollama
      model: nomic-embed-text:latest
~~~

A partial roles object is valid; omitted roles retain their defaults. Current schema only accepts Ollama as a provider. Hosted providers are deliberately not configurable until their implementation, secret handling, egress disclosure and consent policy are ready.

## Migration

Run:

~~~bash
air config migrate
~~~

The v1-to-v2 migration:
- validates the existing v1 settings before writing;
- adds default model/provider settings only when the models section is absent;
- updates the version to 2;
- preserves existing settings and YAML comments;
- writes to a temporary file and renames it into place;
- preserves the existing file's permission bits;
- is idempotent and refuses unsupported future versions;
- never downloads or starts a model/provider.

If no global config exists, AIR keeps using v2 defaults and does not create a file.

## Safety and runtime boundaries

- Repo configuration cannot choose models/providers or enable network egress.
- The current schema does not accept hosted provider IDs.
- No model is pulled automatically. Missing models must be reported and installation requires a separate explicit action.
- Model output and tool calls are untrusted; deterministic AIR code validates actions and enforces permissions.
- The model provider does not select execution adapters, start jobs, invoke shell commands, grant permissions or determine task success.
- One active generative model is the default resource policy; maxConcurrentGenerative is configuration intent until the resource manager enforces it.
- The Python worker still has its existing worker-local model slots. Canonical role/model propagation into the worker requires a later versioned contract and compatibility tests.

## Current implementation modules

- src/config/schema.ts — strict version-2 schema and role defaults.
- src/config/loader.ts — global-only model section, safe config merge and v1 migration.
- src/models/role-resolver.ts — logical role to configured provider/model assignment; no silent fallback.
- src/models/providers/ollama.ts — Ollama provider transport; it does not consume this config directly yet.
