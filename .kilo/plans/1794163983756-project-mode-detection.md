# Plan: Project vs Self-Improvement Mode Detection

## Problem

MGAI's agent loop (`src/core/agent_loop.py`) loads `METADATA.md` and `GUARDRAILS.md` into every session's system prompt unconditionally (`agent_loop.py:29-38`). This frames every `run` task as self-improvement on MGAI's own codebase. When the user points MGAI at an external folder (`E:\GitHub\testproject1`), it still applies self-improvement cycle discipline (branch → test → commit → update PLAN.md), reads its own docs, and never writes application code.

## Goal

Make MGAI distinguish **new-project work** (build deliverables in an external folder) from **self-improvement work** (modify MGAI's own codebase), so it behaves appropriately in each mode.

## Decisions

1. **Detection**: Automatic path-based. If any file path mentioned in the goal is outside the MGAI repo root (`E:\GitHub\MakeingGoodAIs`), enter **project mode**. Otherwise, default to self-improvement mode (current behavior).
2. **Override**: Add optional `--project` / `--self-improve` flags to `python -m src.main run` to force a mode.
3. **Project mode behavior**:
   - Do not load `METADATA.md`/`GUARDRAILS.md` self-improvement framing into system prompt.
   - No auto-branching, committing, or `PLAN.md` updates.
   - Just build and deliver in the target folder.
   - Still run `pytest` if tests exist in the target folder, but not the self-improvement cycle.
4. **Self-improve mode behavior**: Unchanged — current cycle discipline applies.

## Files to change

- `src/core/agent_loop.py` — `build_system_prompt()` and `Agent.__init__()` / `Agent.run()` / `Agent.chat()`:
  - Accept a `project_mode: bool = False` parameter.
  - In project mode, skip loading METADATA.md/GUARDRAILS.md; use a lean system prompt focused on delivering in the target folder.
- `src/main.py` — `run` command:
  - Add `--project` / `--self-improve` typer options.
  - Detect external paths from the goal string and auto-set project mode.
  - Pass `project_mode` to the `Agent`.

## Validation

- Run `python -m pytest -q` — must pass (0 failures).
- Run `python -m src.main run "build app in E:\GitHub\testproject1"` — should create files in testproject1 without branching/committing.
- Run `python -m src.main run "fix bug in src/core/agent_loop.py" --self-improve` — should apply self-improvement cycle discipline.
- Verify `check_guardrails` passes for self-improvement mode.

## Out of scope

- Actually building the file search app in testproject1 (that's a separate implementation task after this plan is approved).
- Voice mode, memory, or other feature work.

## Open question (recommended answer)

**Should path detection be automatic, or should the user always pass an explicit flag?** → Recommend automatic path detection with optional flag override. The user already specified the path in the goal; requiring an extra flag adds friction.

---

Ready to implement. Switch to an implementation-capable agent to execute this plan.