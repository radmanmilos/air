# OpenCode adapter

**Status: VERIFIED against opencode 2.2.5.**

## Verified headless invocation

```text
opencode run "<task>" --auto --model <provider/model>
```

- `run` — run non-interactively to completion.
- Prompt as positional argument — task text non-interactively.
- `--auto` — auto-approve any tool prompts.
- `--model <provider/model>` — optional model override.

## Error classification rules

- Use exit code + **stderr** evidence only.
- Never scan model-generated stdout prose for rate-limit keywords.
