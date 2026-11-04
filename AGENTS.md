# AIR — Working Rules (for this and future work)

These rules govern every task in this repository. They are mandatory and apply to all agents working on `air`.

## The six rules

1. **Always understand and plan execution of a task** before changing code. Read the relevant files, the task entry in `docs/reviews/tasks_air_6.md`, and the cited reviews. Write a short plan (steps + files + tests) before editing.
2. **Make sure all tests are green and all changes are covered with tests.** No task is complete without tests that prove the change. Run the full validation checklist.
3. **Upon task completion, update all relevant documentation** affected by the change (README, PLAN.md, docs/, in-code where needed).
4. **Update all forward-facing surfaces** so they represent the reality of the application state (CLI help, status, dashboard, MCP tool list, README tables, PLAN.md status, review claims).
5. **Commit and push when a task is completed**, always starting from a clean tree for a new task. One task = one commit (or a small coherent set). Never mix tasks in a commit.
6. **Do not stop until all tasks are implemented.** Work through `docs/reviews/tasks_air_6.md` in priority order. Be wary of looping and reasoning limits: if stuck, document the blocker in the task file and move to the next independent task rather than spinning.

## Validation checklist (run before every commit)
- `npm run typecheck`
- `npm run typecheck:test`
- `npm run lint`
- `npm test`
- `npm run build`
- `npm pack --dry-run`
- Documentation updated (README, PLAN.md, docs/)
- Committed and pushed

## Source of truth
- Task list: `docs/reviews/archive/tasks_air_6.md`
- Reviews: `docs/reviews/{chatGPT,claude,deepseek,grok}_plan_review_6.md`
- Canonical plan: `PLAN.md`
- All work in `E:\GitHub\air` only.

## Conventions
- All configuration, model lists, data live inside `air/`. No imports from other repos.
- Headless-only. No interactive TUI.
- Free-first routing by policy, not hope.
- Cross-platform (Windows, macOS, Linux).
- Never discard user changes, auto-commit, auto-push (except per rule 5), or rewrite history.
- Evidence over claims: results from workspace deltas, never model prose.
