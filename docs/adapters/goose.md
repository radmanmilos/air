# Goose adapter spike

Verified against the **installed** CLI. Do not assume other versions match.

## Observed facts

| Property | Value |
|---|---|
| Executable | `goose` (goose.exe on Windows) |
| Installed version | 1.57.0 |
| Headless capable | Yes — `goose run` |

## Headless invocation

```text
goose run --text "<task>"
```

- `--text "<text>"` — passes the task prompt non-interactively.
- `-i, --instructions <FILE>` — alternative: path to an instruction file. Use `-` for stdin.
- `--recipe <NAME|PATH>` — selects a recipe (custom agent config). Omit for default.
- `--system "<text>"` — additional system instructions.
- `--params <KEY=VALUE>` — recipe parameters; repeatable.

## Model / provider selection

- Model/provider is configured via the active recipe and environment, not via CLI flags on `goose run`.
- Recipes are YAML files; the default recipe selects the provider/model.
- To override, provide a custom recipe or set provider env vars (e.g. `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`).

## File passing

Goose does not accept files as positional arguments. Pass file contents via:
- `--text "<task> --- file: path"` inline, or
- `--instructions <file>` containing the full prompt.

## Output behavior

- `goose run` runs to completion and prints the session transcript to stdout.
- Structured output: **not available** in 1.57.0 by default. Some recipes may emit structured events; verify per recipe.
- Errors go to stderr.

## Exit codes (observed)

| Scenario | Exit code | Evidence |
|---|---|---|
| Success | 0 | process completes normally |
| Rate limit | non-zero | stderr contains provider error |
| Auth failure | non-zero | stderr contains 401 / invalid key |
| Model unavailable | non-zero | stderr contains provider error |
| Timeout | killed by AIR | no exit code; signal-based termination |

**Note:** Exit 0 alone is not proof of success; check the working-tree diff.

## Error classification rules for this adapter

- Use exit code + **stderr** evidence only.
- Never scan model-generated stdout prose for rate-limit keywords.

## Known limitations

- No CLI model/provider override; must be set via recipe or env.
- No structured output mode by default.
- Recipe selection is required for non-default behavior; `--explain` can inspect a recipe.

## Environment variables

- `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, etc. — read by the recipe's provider backend.