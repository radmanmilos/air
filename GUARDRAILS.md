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
- `PLAN.md` checkboxes (mark progress).

## Plan-document hygiene (PLAN.md / VISION.md / README.md)
- ALWAYS edit in place. Never append a new section at the end if the section already exists.
- Never duplicate a heading or a phase block. If it exists, update it where it is.
- Preserve the existing structure and ordering; insert new items into the correct existing section.
- Do not rewrite the whole file; make targeted edits.
- Mark progress by changing `[ ]` to `[x]`, never by adding a second copy.
- Add new ideas as sub-items under the relevant existing phase, not as new top-level phases.

## Safe workflow for self-modification
1. Always create a new git branch first (`self-improve/...`).
2. Make small, focused changes.
3. Run `pytest` — must pass before committing.
4. Never commit to `master` directly; merge via review.
5. Never install unknown packages without user approval.
6. Never run destructive shell commands (rm -rf, format, etc.).

## Cycle completion checklist (MANDATORY before saying "Done")
Every self-improvement cycle MUST end with ALL of these. Do not stop early:
1. Run the full test suite (`pytest`) — must pass. If not, fix or rollback.
2. Update `PLAN.md` checkboxes for anything completed this cycle (mark `[x]`).
3. Commit with a clear message referencing the cycle and what changed.
4. Verify no protected files were changed (`check_guardrails`).
5. Print a final report: what was done, commit hash, tests result, and what's next.
6. Print the `✓ Done. Ready for next prompt.` marker.
If any step cannot be completed, state explicitly why and ask the user before stopping. Never leave a cycle half-finished silently.

## If unsure
Ask the user before changing anything not clearly allowed. When in doubt, do less.
