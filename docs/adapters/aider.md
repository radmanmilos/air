# Aider adapter spike

Verified against the **installed** CLI. Do not assume other versions match.

## Observed facts

| Property | Value |
|---|---|
| Executable | `aider` (aider.exe on Windows) |
| Installed version | 0.86.2 |
| Headless capable | Yes |

## Headless invocation

```text
aider --message "<task>" --yes-always --no-auto-commits --no-pretty --no-stream --exit
```

- `--message "<task>"` — passes the task prompt non-interactively.
- `--message-file <path>` — alternative for long prompts.
- `--yes-always` — auto-accepts edits without prompting. **Verified flag name** (older docs sometimes say `--yes`; 0.86.2 uses `--yes-always`).
- `--no-auto-commits` — disables aider's default auto-commit behavior.
- `--no-pretty` — disables colorized TUI output.
- `--no-stream` — disables streaming responses (use `--stream` for streaming).
- `--exit` — exit after processing the message rather than dropping into REPL.

## Model / provider selection

- `--model <model>` — sets the main model, e.g. `--model openrouter/gemma-4-31b-it:free`.
- `--api-key PROVIDER=KEY` — sets a key for a provider, e.g. `--api-key openrouter=$OPENROUTER_API_KEY`.
- `--openai-api-key`, `--anthropic-api-key` — provider-specific shortcuts.
- `--list-models <pattern>` — lists available models (network call).

## File passing

Aider accepts files as positional arguments before flags:

```text
aider <file1> <file2> --message "<task>" --yes-always ...
```

## Output behavior

- Default output is colorized TUI prose on stdout. Use `--no-pretty` for plain text.
- `--stream` streams tokens as they arrive; `--no-stream` waits for the full response.
- Structured output: **not available** in 0.86.2. All output is free-form prose.
- Errors and warnings go to stderr.

## Exit codes (observed)

| Scenario | Exit code | Evidence |
|---|---|---|
| Success with edits | 0 | process completes normally |
| Success, no edits | 0 | process completes normally |
| Rate limit | non-zero | stderr contains provider error |
| Auth failure | non-zero | stderr contains 401 / invalid key |
| Model unavailable | non-zero | stderr contains provider error |
| Timeout | killed by AIR | no exit code; signal-based termination |

**Note:** Aider may exit 0 even when it made no changes. Exit 0 alone is **not** proof of success; check the working-tree diff.

## Error classification rules for this adapter

- Use exit code + **stderr** evidence only.
- Never scan model-generated stdout prose for rate-limit keywords.
- Aider's own messages on stdout are model prose, not provider errors.

## Known limitations

- No structured output mode — parsing is limited to exit code + stderr patterns.
- Auto-commit is on by default; must be disabled with `--no-auto-commits`.
- Interactive prompts are suppressed by `--yes-always`, but verify per-version.
- `--allow-dirty` semantics: AIR must refuse dirty write tasks by default.

## Environment variables

- `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `OPENROUTER_API_KEY` — read from env by default.
- `AIDER_MODEL`, `AIDER_STREAM` — override flags via env.