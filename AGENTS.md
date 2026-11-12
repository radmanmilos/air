# AIR — Working Rules (for this and future work)

These rules govern every task in this repository. They are mandatory and apply to all agents working on `air`.

## The six rules

1. **Always understand and plan execution of a task** before changing code. Read the relevant files, the active work package in `docs/reviews/tasks_air_13.md` (for the local-first intelligence milestone), the applicable blueprint, and cited reviews. Write a short plan (steps + files + tests) before editing.
2. **Make sure all tests are green and all changes are covered with tests.** No task is complete without tests that prove the change. Run the full validation checklist.
3. **Upon task completion, update all relevant documentation** affected by the change (README, PLAN.md, docs/, in-code where needed).
4. **Update all forward-facing surfaces** so they represent the reality of the application state (CLI help, status, dashboard, MCP tool list, README tables, PLAN.md status, review claims).
5. **Commit and push when a task is completed**, always starting from a clean tree for a new task. One task = one commit (or a small coherent set). Never mix tasks in a commit.
6. **Do not stop until all tasks are implemented.** Work through the active task ledger identified in the Source of truth section in priority order. Be wary of looping and reasoning limits: if stuck, document the blocker in the task file and move to the next independent task rather than spinning.

## Validation checklist (run before every commit)
- `npm run typecheck`
- `npm run typecheck:test`
- `npm run lint`
- `npm test`
- `npm run build`
- `npm pack --dry-run`
- `cd packages/local-worker && python -m ruff check .`
- `cd packages/local-worker && python -m mypy air_local`
- `cd packages/local-worker && python -m pytest -q`
- Documentation updated (README, PLAN.md, docs/)
- Committed and pushed

## Source of truth
- Active local-first intelligence ledger: `docs/reviews/tasks_air_13.md`
- Local-first architecture blueprint: `docs/architecture/local-first-ai-plan.md`
- Previous completed task ledger: `docs/reviews/tasks_air_12.md`
- Historical reviews: `docs/reviews/archive/`
- Canonical product plan: `PLAN.md`
- All work in `E:\GitHub\air` only.

## Repository layout
- `bin/`, `src/`, `tests/` — the AIR TypeScript control plane (CLI + MCP).
- `packages/local-worker/` — internal Python worker (Ollama transport, tools,
  scaffolding). `air` is its only entrypoint; there is no `mgai` command.

## Conventions
- All configuration, model lists, data live inside `air/`. No imports from other repos.
- Headless-only. No interactive TUI.
- Free-first routing by policy, not hope.
- Cross-platform (Windows, macOS, Linux).
- Never discard user changes, auto-commit, auto-push (except per rule 5), or rewrite history.
- Evidence over claims: results from workspace deltas, never model prose.

