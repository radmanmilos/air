# AIR — Consolidated Implementation Plan (ARCHIVED — COMPLETE)

**Status:** ALL TASKS COMPLETE  
**Generated:** 2026-11-03  
**Source files merged:** `tasks_improvements.md`, `tasks_new.md`, and plan `.kilo\plans\1793740030826-free-adapter-catalog-install.md`

This plan is archived. Every task in Phase 0 and Phase 1 has been implemented, tested, documented, and validated. No remaining tasks exist in this plan. New work should start from a fresh plan.

---

## Validation Results (final, all green)

| Check | Result |
|---|---|
| `npm run typecheck` | pass |
| `npm run typecheck:test` | pass |
| `npm run lint` | 0 errors |
| `npm test` | **217 passed, 5 skipped** (38 test files) |
| `npm run build` | pass |
| `npm pack --dry-run` | pass (140 files) |

---

## Phase 0 — COMPLETE (all tasks done)

| Task | Status | Summary |
|---|---|---|
| P0-1 Wire Orchestrator into CLI/MCP | complete | `bin/air.ts run` and `src/mcp/server.ts run_task` now delegate to `Orchestrator.start(...)`. Duplicated failover loop removed. |
| P0-2 Resume/retry sessions | complete | `air resume <runId> [task]` CLI command + MCP `resume_task` tool with handoff context and `parentRunId`. |
| P0-3 Real-binary smoke tests | complete | `tests/smoke-real-binary.test.ts` gated by `AIR_SMOKE_TEST=1` (skips by default). |
| P0-4 MCP signal handling / CANCELLED | complete | `cancel_task` aborts process; state → CANCELLED; `get_task_output` works for cancelled jobs. |
| P0-5 Adapter verification gating | complete | `META` set `verified: false` for opencode/kilocode/codex/github-copilot. Only aider/goose verified. `availableAdapters()` excludes unverified. |

## Phase 1 — COMPLETE (all tasks done)

| Task | Status | Summary |
|---|---|---|
| P1-1 `catalog` config schema | complete | `catalog.remoteUrl` + `catalog.autoInstall` added to Zod schema + defaults. |
| P1-2 `config/catalog.json` | complete | Bundled catalog with 6 adapters (aider, goose, opencode, kilocode, codex, github-copilot). |
| P1-3 Catalog loader | complete | `src/config/catalog.ts` — bundled + remote override, network fallback, TTL cache. |
| P1-4 Install status persistence | complete | `src/installer/status.ts` — atomic `installs.json`, live PATH check, `installed`/`version`/`installStatus`. |
| P1-5 Installer | complete | `src/installer/installer.ts` — package-manager + direct-download install/upgrade/uninstall. |
| P1-6 Refresh availability | complete | `refreshAdapterAvailability()` in registry; newly installed adapters picked up without restart. |
| P1-7 `air status` install column | complete | Table shows `installed vX.Y.Z` / `not-installed` per adapter; `--json` includes fields. |
| P1-8 `air adapters` command group | complete | `list`, `install <id>`, `upgrade <id>`, `uninstall <id>`, `status <id>` with `--yes`/confirmation. |
| P1-9 MCP adapter tools | complete | `list_adapters`, `install_adapter`, `upgrade_adapter`, `uninstall_adapter` (write ops require `confirm: true`). |
| P1-10 Dashboard connected adapters | complete | `air dashboard` shows per-adapter install status section. |
| P1-11 Documentation | complete | README (motto banner, catalog section, commands), PLAN.md (Phase 1.5, file structure), `docs/adapters/catalog.md`. |
| P1-12 Integration test + validation | complete | `tests/adapter-catalog.integration.test.ts` (5 tests). All validation green. |

---

## Motto

`"AIR is free and so are we"` — shown as a banner at CLI startup and in the README header.

## New files created

- `.kilo/archive/CONSOLIDATED-PLAN-ARCHIVED.md` (this file — archived)
- `config/catalog.json`
- `src/config/catalog.ts`
- `src/installer/status.ts`
- `src/installer/installer.ts`
- `tests/smoke-real-binary.test.ts`
- `tests/adapter-catalog.integration.test.ts`
- `docs/adapters/catalog.md`

## Modified files

- `bin/air.ts` — Orchestrator wiring, `resume`, `adapters` command group, status install column, dashboard adapters section, motto banner
- `src/mcp/server.ts` — Orchestrator delegation, `resume_task`, adapter management tools, `runTaskInBackground`
- `src/orchestrator/orchestrator.ts` — full failover loop, `resumeAfterApproval`, continuation state, `model_selected`/`session_started`/`session_completed` events
- `src/adapters/registry.ts` — install status in `AdapterInfo`/`adapterStatus()`, `verified: false` for 4 adapters, `refreshAdapterAvailability()`
- `src/config/schema.ts` — `catalog` section
- `src/config/loader.ts` — catalog defaults + merge
- `README.md` — motto, catalog section, commands, adapter verification table
- `PLAN.md` — Phase 1.5, catalog file structure, MCP adapter tools, adapter verification tables

## Retired source files

`tasks_improvements.md` and `tasks_new.md` are superseded by this plan. All their tasks are complete.
