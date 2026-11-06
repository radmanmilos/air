# Guardrails — What MGAI may and may not change

## CRITICAL: Never modify these files (breaks the system)
- `config.yaml` — Ollama URL, model routing, tool settings. Overwriting breaks everything.
- `src/core/ollama_client.py` — Ollama API wrapper.
- `src/core/router.py` — model routing.
- `src/core/agent_loop.py` — agent loop (only change with explicit user approval).
- `src/tools/builtin.py` — tool registration.
- `requirements.txt` — dependency list.
- `.gitignore`

## Never delete or empty
- `VISION.md`, `PLAN.md`, `METADATA.md`, `GUARDRAILS.md`, `HOW_TO_START.md`, `README.md`
- The `src/` package or any `__init__.py`

## Allowed to create/modify
- New tool modules under `src/tools/` (register in builtin.py only if asked).
- New tests under `tests/`.
- New docs under `docs/`.
- `METADATA.md` (identity updates only).
- `PLAN.md` checkboxes (mark progress, never delete sections).

## Safe workflow for self-modification
1. Always create a new git branch first (`self-improve/...`).
2. Make small, focused changes.
3. Run `pytest` — must pass before committing.
4. Never commit to `master` directly; merge via review.
5. Never install unknown packages without user approval.
6. Never run destructive shell commands (rm -rf, format, etc.).

## If unsure
Ask the user before changing anything not clearly allowed. When in doubt, do less.
