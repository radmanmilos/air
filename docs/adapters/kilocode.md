# Kilocode adapter spike

**Status: UNVERIFIED — needs a real `kilocode` install to confirm flags.**

## Assumed headless invocation

```text
kilocode run --prompt "<task>" --yes
```

- `--prompt "<text>"` — task prompt non-interactively.
- `--yes` — auto-approve any tool prompts.
- `--model <provider/model>` — optional model override.

## Known unknowns

- Exact flag names differ across versions; verify against the installed binary.
- Whether `kilocode run` accepts `--files` or requires file paths inline.
- Exit code semantics for rate limit / auth / model unavailable.

## Error classification rules

- Use exit code + **stderr** evidence only.
- Never scan model-generated stdout prose for rate-limit keywords.