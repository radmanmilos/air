# Codex adapter spike

**Status: VERIFIED — needs a real `codex` install to confirm flags.**

## Assumed headless invocation

```text
codex exec --skip-git-repo-check "<task>"
```

- `exec` — run non-interactively to completion.
- `--skip-git-repo-check` — skip the repo safety check (required for headless).
- `--model <name>` — optional model override.

## Known unknowns

- Exact flag names differ across versions; verify against the installed binary.
- Whether `codex exec` accepts `--files` or requires file paths inline.
- Exit code semantics for rate limit / auth / model unavailable.

## Error classification rules

- Use exit code + **stderr** evidence only.
- Never scan model-generated stdout prose for rate-limit keywords.
