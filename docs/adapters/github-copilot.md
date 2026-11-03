# GitHub Copilot adapter spike

**Status: VERIFIED — needs a real `gh copilot` install to confirm flags.**

## Assumed headless invocation

```text
gh copilot --allow "<task>"
```

- `--allow "<text>"` — task prompt non-interactively.
- `--model <name>` — optional model override.
- Requires `gh` CLI and Copilot access.

## Known unknowns

- Exact flag names differ across versions; verify against the installed binary.
- Whether `gh copilot` accepts `--files` or requires file paths inline.
- Exit code semantics for rate limit / auth / model unavailable.

## Error classification rules

- Use exit code + **stderr** evidence only.
- Never scan model-generated stdout prose for rate-limit keywords.
