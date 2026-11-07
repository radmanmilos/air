# Guardrails — What MGAI may and may not change

## CRITICAL: Never touch these paths (read-only zones)
Do NOT create, modify, delete, or rename ANY file under these paths — even new files:
- `config.yaml`
- `src/core/` (entire directory)
- `src/tools/registry.py`
- `src/tools/builtin.py`
- `src/tools/guardrail_tools.py`
- `requirements.txt`
- `.gitignore`
- `VISION.md`, `PLAN.md`, `METADATA.md`, `GUARDRAILS.md`, `HOW_TO_START.md`, `README.md`

If a task seems to require changing one of these, STOP and ask the user first. Never work around this by creating a parallel file in a protected directory.

## Never delete or empty
- Any file in the protected list above
- The `src/` package or any `__init__.py`
- The `tests/` directory or existing test files (only add new ones)

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

## Cycle completion checklist (MANDATORY — do INCREMENTALLY, not at the end)
Do not batch all bookkeeping at the end of a cycle. Sessions get truncated. Follow this order:
1. **Before starting:** Create the feature branch first.
2. **After each meaningful change:** Run `pytest` immediately. If it fails, fix or rollback before continuing.
3. **After verification passes:** Commit immediately (small, focused commits). Do not wait until the end.
4. **After commit:** Update `PLAN.md` checkbox right away (edit in place).
5. **Verify guardrails:** Run `check_guardrails`. If protected files changed, revert them.
6. **Final step only:** Print the cycle report + `✓ Done. Ready for next prompt.` marker.

Rules:
- Never leave a cycle with uncommitted changes if tests pass.
- Never end a session without printing the `✓ Done.` marker.
- If the session is running long, commit and report at the current milestone, then ask before continuing.
- If truncated, the next session should resume from the last commit, not re-do work.

## If unsure
Ask the user before changing anything not clearly allowed. When in doubt, do less.
