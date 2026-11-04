# Codex adapter

**Status: VERIFIED against codex 0.166.0.**

## Verified headless invocation

```text
codex exec --skip-git-repo-check "<task>" --model <name>
```

- `exec` — run non-interactively to completion.
- `--skip-git-repo-check` — skip the repo safety check (required for headless).
- Prompt as positional argument — task text non-interactively.
- `--model <name>` — optional model override.

## Error classification rules

- Use exit code + **stderr** evidence only.
- Never scan model-generated stdout prose for rate-limit keywords.
