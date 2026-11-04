# GitHub Copilot adapter

**Status: VERIFIED against github-copilot (gh) 2.102.0.**

## Verified headless invocation

```text
gh copilot -- -p "<task>" --allow-all-tools --model <name>
```

- `copilot` — GitHub Copilot CLI subcommand.
- `--` — separator before copilot-specific flags.
- `-p "<task>"` — task prompt non-interactively.
- `--allow-all-tools` — allow all tools without prompting.
- `--model <name>` — optional model override.
- Requires `gh` CLI and Copilot access.

## Error classification rules

- Use exit code + **stderr** evidence only.
- Never scan model-generated stdout prose for rate-limit keywords.
