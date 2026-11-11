# air-local

Internal Python worker for [AIR](../../README.md). It gives AIR one local
execution path: an Ollama model plus a small, audited tool set.

**This package is not a user interface.** Users run `air`; AIR provisions and
invokes this worker. There is no `mgai` command and no separate install step.

## What it does

- `air_local.ollama` — Ollama HTTP transport (chat, streaming, embeddings).
- `air_local.loop` — headless ReAct loop (think → tool → observe).
- `air_local.models` — capability → local model selection.
- `air_local.policy` — the single permission layer: job-root jail, read-only
  mode, protected files, shell and network gates.
- `air_local.tools` — file, shell, web, git, Ollama, code-analysis tools.
- `air_local.scaffold` — project templates, doc generation, test generation.

## Safety model

| Control | Behaviour |
|---|---|
| Job root | Every path resolves inside the root; escapes are refused. |
| Read-only | Writes return an error and change nothing. |
| Shell | Disabled by default. When enabled: argv only (no shell), allowlisted binaries, no metacharacters, cwd inside the root. |
| Protected files | `.git`, `config.yaml`, `AGENTS.md`, `PLAN.md`, `*.pem`, `*.key` are never written. |
| Network | Enabled by default; can be disabled per job. |

## Development

```bash
cd packages/local-worker
python -m pip install -e ".[dev]"
python -m pytest
ruff check .
mypy air_local
```

Configuration lives in `config.yaml`; override the path with
`AIR_LOCAL_CONFIG`. Capability flags can also come from the environment
(`AIR_LOCAL_ALLOW_WRITE`, `AIR_LOCAL_ALLOW_SHELL`, `AIR_LOCAL_ALLOW_NETWORK`),
but AIR sets them explicitly per job.
