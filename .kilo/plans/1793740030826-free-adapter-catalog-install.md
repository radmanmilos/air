# AIR — Unified Task Plan

**Status:** active  
**Generated:** 2026-11-03  
**Way of working (per session):**  
1. Pick the next unchecked task.  
2. Implement it.  
3. Add/update tests for it.  
4. Run `npm run typecheck`, `npm run typecheck:test`, `npm run lint`, `npm test`, `npm run build`.  
5. Update documentation (README, PLAN.md, docs/, in-code comments) affected by the change.  
6. Commit and push all changes for that task before starting the next task.  
Do not start the next task until the previous task is fully done (implemented, tested, documented, committed, pushed).

---

## Phase 0 — Remaining existing tasks (cleanup before new work)

Source files: `tasks_improvements.md`, `tasks_new.md` (to be retired after merge).

### P0-1 — Wire Orchestrator into CLI/MCP and remove duplicated run logic
**Source:** `tasks_improvements.md` (was unchecked)

**Details:**  
- The CLI (`bin/air.ts`) and MCP server (`src/mcp/server.ts`) both duplicate the failover/run loop: `selectCandidateFrom` → `runProcess` → health update → result delta → propose/approve failover.  
- The `Orchestrator` class (`src/orchestrator/orchestrator.ts`) already exists with `start`, `resume`, `list`, `get`, `cancel`, `waitForAll`. It is not yet wired into the CLI `run` action or MCP `run_task`.  
- Goal: make CLI `run` and MCP `run_task` delegate to `Orchestrator.start(...)` so there is one execution path, not two.

**Implementation notes:**  
- `Orchestrator.start` takes `{ id, task, cwd, adapter, mode, readOnly, files, maxConcurrentAgents }` and returns an `OrchestratorSession`.  
- CLI `runAction` currently builds `taskInput`, runs the failover loop inline, writes task state, traces, etc. Replace the loop body with `orchestrator.start(...)`.  
- MCP `run_task` similarly builds a `Job` and runs `runAttempt` inline. Replace with `orchestrator.start(...)`.  
- Keep exit codes and `--auto`/`--ask` behavior identical.  
- Do not break `air status`, `air route-test`, `air dashboard`, `air commands`, `air models`, `air verify`.

**Tests:** existing `tests/orchestrator.test.ts`, `tests/mcp-async.test.ts`, `tests/failover.test.ts`, `tests/router.test.ts` must still pass. Add a test verifying CLI and MCP produce identical results for the same task (mock adapter).

**Done when:**  
- `bin/air.ts` `run` delegates to `Orchestrator.start`.  
- `src/mcp/server.ts` `run_task` delegates to `Orchestrator.start`.  
- Duplicated failover loop code removed from CLI/MCP.  
- `npm test`, `npm run typecheck`, `npm run lint`, `npm run build` green.  
- Committed and pushed.

---

### P0-2 — Resume/retry sessions and cross-session context
**Source:** `tasks_improvements.md` (was unchecked; "Resume/retry sessions implemented in Orchestrator" is checked but wiring is not)

**Details:**  
- `Orchestrator.resume(runId, taskOverride?)` exists but is not exposed via CLI or MCP.  
- Expose `air resume <runId> [task]` CLI command and MCP `resume_task` tool.  
- Resume builds a handoff pack from the previous session's git state (existing `buildHandoffPack` in `src/context/handoff.ts`) and prepends it to the new task prompt.

**Tests:** add test for `air resume` and MCP `resume_task` producing a session with `parentRunId` set.

**Done when:**  
- `air resume <runId> [task]` CLI command works.  
- MCP `resume_task` tool works.  
- Resumed sessions carry `parentRunId` and handoff context.  
- All tests green.  
- Committed and pushed.

---

### P0-3 — Real-binary smoke tests in CI for verified adapters
**Source:** `tasks_improvements.md` (was unchecked)

**Details:**  
- Currently all tests use the mock adapter (`tests/fixtures/mock-tool.js`, `tests/mock-adapter.ts`). No CI test runs against real `aider`/`goose` binaries.  
- Add a CI smoke test (GitHub Actions workflow or test file gated by env var) that runs `air run` against a real installed adapter binary when available, skipped otherwise.  
- Do not require real binaries for the default `npm test` run.

**Tests:** new test file `tests/smoke-real-binary.test.ts` gated by `AIR_SMOKE_TEST=1` (skips when binary not on PATH).

**Done when:**  
- CI (or test file) can run real-binary smoke tests when adapters are installed.  
- Default `npm test` unaffected (skips when binaries missing).  
- Committed and pushed.

---

### P0-4 — MCP signal handling and CANCELLED propagation
**Source:** `tasks_improvements.md` (was unchecked; "MCP signal handling implemented" is checked but propagation needs verification)

**Details:**  
- `src/mcp/server.ts` has `abortAll` on SIGINT/SIGTERM that sets job state to CANCELLED.  
- Verify `cancel_task` MCP tool properly aborts the running child process and propagates `CANCELLED` to `get_task_status`.  
- Verify `get_task_output` returns output for a cancelled job.

**Tests:** add `tests/mcp-cancel.test.ts` covering cancel → status CANCELLED → output retrieval.

**Done when:**  
- `cancel_task` aborts process and state becomes CANCELLED.  
- `get_task_status` returns CANCELLED after cancel.  
- `get_task_output` works for cancelled jobs.  
- Committed and pushed.

---

### P0-5 — Keep adapter verification gated on CI smoke tests
**Source:** `tasks_improvements.md` (was unchecked)

**Details:**  
- `src/adapters/registry.ts` `META` marks all 6 adapters as `verified: true`, but only aider/goose are truly verified against real CLIs. opencode/kilocode/codex/github-copilot are UNVERIFIED spikes per `PLAN.md`.  
- The registry comment says "Only verified + enabled adapters are routed by default" but `META` sets all to verified.  
- Gate `verified: true` in `META` behind CI smoke test confirmation: an adapter is marked verified only after its real-binary smoke test passes in CI.

**Tests:** none new; this is a config/data gating decision. Add a test asserting `availableAdapters()` excludes adapters whose `meta.verified` is false.

**Done when:**  
- `META` verified flags reflect actual CI-confirmed status.  
- `availableAdapters()` excludes unverified adapters.  
- Committed and pushed.

---

### P0-6 — Verify flags against real binaries (requires installs)
**Source:** `tasks_new.md` (was unchecked)

**Details:**  
- opencode, kilocode, codex, github-copilot adapter classes exist but flags are unverified against real installed binaries.  
- When the real binary is installed, run `air route-test --explain` and a real `air run` smoke test to confirm headless flags work.  
- Update `docs/adapters/<adapter>.md` with confirmed flags and versions.

**Tests:** smoke tests gated by binary presence (see P0-3).

**Done when:**  
- Each of opencode, kilocode, codex, github-copilot has confirmed headless flags in `docs/adapters/`.  
- `META` verification updated after confirmation (see P0-5).  
- Committed and pushed.

---

### P0-7 — Enable verified status when confirmed
**Source:** `tasks_new.md` (was unchecked)

**Details:**  
- After P0-6 confirms flags, set `verified: true` in `META` for each confirmed adapter in `src/adapters/registry.ts`.  
- Update `PLAN.md` adapters table and `README.md` adapters table.

**Done when:**  
- `META` verified flags match confirmed adapters.  
- `PLAN.md` and `README.md` adapters tables updated.  
- Committed and pushed.

---

## Phase 1 — Free AI Adapter Catalog + Background Install

**Source:** plan at `.kilo\plans\1793740030826-free-adapter-catalog-install.md` (all design decisions resolved)

**Goal:** Add a collection of free, no-login, no-license AI tools that AIR can install in the background. User sees one clean AI experience; dashboard shows which adapters are connected/installed.

**Design decisions (all resolved):**
- Catalog source: bundled `config/catalog.json` + optional `catalog.remoteUrl` config override
- Install mechanism: package manager preferred, direct-download fallback (per catalog entry)
- Catalog entry format: rich + per-platform (id, name, executable, provider, model, capabilities, description, install.method, install.commands/urls per platform, install.verify)
- Install status: version pinning + upgrade + uninstall, persisted in cache dir (`installs.json`) + live PATH check
- CLI: extend `air status` with install status column; new `air adapters` command group (`list`, `install <id>`, `upgrade <id>`, `uninstall <id>`, `status`)
- MCP: `list_adapters`, `install_adapter`, `upgrade_adapter`, `uninstall_adapter` tools (write ops need explicit consent)
- Adapter mapping: catalog entries reference `adapterId` in existing registry; no dynamic factory loading in Phase 1

---

### P1-1 — Add `catalog` section to Zod config schema
**File:** `src/config/schema.ts`

**Details:**  
- Add `catalog` object to `ConfigSchema`: `{ remoteUrl?: string; autoInstall?: boolean }` with defaults (`remoteUrl: undefined`, `autoInstall: false`).  
- Add to `DEFAULT_CONFIG`.  
- Strict schema (`StrictConfigSchema`) must still reject unknown top-level keys.

**Tests:** `tests/config.test.ts` — parse config with `catalog` section; verify defaults; verify strict mode rejects unknown keys.

**Done when:**  
- `ConfigSchema` includes `catalog`.  
- `parseConfig({ catalog: { remoteUrl: '...' } })` works.  
- Defaults applied when absent.  
- All tests green.  
- Committed and pushed.

---

### P1-2 — Create bundled default catalog `config/catalog.json`
**File:** `config/catalog.json` (new)

**Details:**  
- Bundled JSON catalog of installable free AI tools.  
- Include entries for the 6 existing adapters (aider, goose, opencode, kilocode, codex, github-copilot) plus additional free tools (e.g., whatever free terminal AI tools are appropriate).  
- Each entry: `id`, `name`, `adapterId` (maps to registry), `executable`, `provider`, `model`, `capabilities`, `description`, `tags[]`, `install.method` (`package-manager` | `direct-download`), `install.commands` (per platform), `install.urls` (per platform/arch for direct-download), `install.verify` (command to confirm install), `version` (catalog version pin).

**Example entry shape:**
```json
{
  "id": "aider",
  "name": "Aider",
  "adapterId": "aider",
  "executable": "aider",
  "provider": "openrouter",
  "model": "gemma-4-31b-it:free",
  "capabilities": { "headlessExecution": true, "fileEditing": true, ... },
  "description": "...",
  "tags": ["coding", "free"],
  "install": {
    "method": "package-manager",
    "commands": { "win32": "winget install aider.aider", "darwin": "brew install aider", "linux": "npm install -g aider" },
    "verify": "aider --version",
    "version": "0.86.2"
  }
}
```

**Tests:** `tests/catalog.test.ts` — load catalog JSON, validate each entry has required fields, `adapterId` exists in registry.

**Done when:**  
- `config/catalog.json` exists and is valid JSON.  
- Every entry has `id`, `adapterId`, `executable`, `install.method`, `install.verify`.  
- Every `adapterId` maps to an existing registry adapter.  
- Committed and pushed.

---

### P1-3 — Catalog loader: bundled + remote override
**File:** `src/config/catalog.ts` (new)

**Details:**  
- `loadCatalog()`: read `config/catalog.json` (bundled).  
- If config has `catalog.remoteUrl`, fetch and merge/override entries (remote entries with same `id` replace bundled).  
- Handle network failure gracefully: fall back to bundled, warn to stderr (not stdout, protects MCP protocol).  
- Cache remote catalog to cache dir with TTL.

**Tests:** `tests/catalog-loader.test.ts` — bundled load, remote merge, remote failure fallback, TTL cache.

**Done when:**  
- `loadCatalog()` returns merged catalog.  
- Remote override replaces same-id entries.  
- Network failure falls back to bundled without crashing.  
- Committed and pushed.

---

### P1-4 — Install status tracking with persistence
**Files:** `src/installer/status.ts` (new), extend `src/adapters/registry.ts`

**Details:**  
- Persisted install status in cache dir: `installs.json` — map of `adapterId` → `{ installed: boolean, version?: string, installedAt?: string, updatedAt?: string, status: 'installed'|'outdated'|'failed'|'not-installed', error?: string, installAttempts: number }`.  
- Atomic write (temp + rename).  
- `isInstalled(adapterId)`: live PATH check via existing `isOnPath`.  
- `getInstallStatus(adapterId)`: combine live PATH check + persisted status.  
- `recordInstall(adapterId, status, version?, error?)`: write to `installs.json`.  
- Extend `adapterStatus()` / `AdapterInfo` with `installed`, `version`, `installStatus` fields.

**Tests:** `tests/install-status.test.ts` — atomic write, read, live PATH check, record status, version pinning (installed != catalog → outdated).

**Done when:**  
- `installs.json` persisted atomically in cache dir.  
- `adapterStatus()` includes `installed`/`version`/`installStatus`.  
- Version mismatch detected as `outdated`.  
- All tests green.  
- Committed and pushed.

---

### P1-5 — Installer: install/upgrade/uninstall via package-manager or direct-download
**File:** `src/installer/installer.ts` (new)

**Details:**  
- `installAdapter(entry, platform)`:  
  - If `install.method === 'package-manager'`: run `install.commands[platform]` via cross-spawn (array args, no shell).  
  - If `install.method === 'direct-download'`: download `install.urls[platform][arch]`, extract if needed, place binary in a bin dir on PATH (or user-configurable install dir).  
  - After install, run `install.verify` command; parse version output.  
  - Record result in `installs.json`.  
- `upgradeAdapter(entry, platform)`: same as install but only if current version < catalog version.  
- `uninstallAdapter(entry, platform)`: remove binary, clear `installs.json` entry.  
- All output redacted before logging (use `src/security/redact`).

**Tests:** `tests/installer.test.ts` — mock package-manager command, mock download, verify command, failure handling, uninstall.

**Done when:**  
- `installAdapter` installs via package manager or direct download.  
- `upgradeAdapter` upgrades when outdated.  
- `uninstallAdapter` removes binary and clears status.  
- Install failures recorded, not crashing.  
- All tests green.  
- Committed and pushed.

---

### P1-6 — Refresh adapter registry availability after install
**File:** `src/adapters/registry.ts`

**Details:**  
- After install/upgrade/uninstall, re-check `isOnPath(EXE[id])` and update `available` flag.  
- `availableAdapters()` should pick up newly installed adapters without restart.  
- Expose `refreshAdapterAvailability(id)` function.

**Tests:** `tests/adapter-gate.test.ts` (extend) — install → `availableAdapters()` includes it; uninstall → excluded.

**Done when:**  
- Freshly installed adapter appears in `availableAdapters()`.  
- Uninstalled adapter removed.  
- Committed and pushed.

---

### P1-7 — CLI: extend `air status` with install status
**File:** `bin/air.ts`

**Details:**  
- `showStatus()` output (table + JSON) gains per-adapter install status: `installed`, `version`, `installStatus` (`installed`/`outdated`/`not-installed`/`failed`).  
- Table: `aider (installed, v0.86.2)`, `opencode (not-installed)`, etc.

**Tests:** `tests/status.test.ts` (or extend existing) — JSON output includes install status fields.

**Done when:**  
- `air status` shows install status per adapter.  
- `air status --json` includes `installed`/`version`/`installStatus`.  
- Committed and pushed.

---

### P1-8 — CLI: new `air adapters` command group
**File:** `bin/air.ts`

**Details:**  
- `air adapters list` — list all catalog entries with install status (detailed).  
- `air adapters install <id>` — install a specific adapter (background, with progress).  
- `air adapters upgrade <id>` — upgrade to catalog version if outdated.  
- `air adapters uninstall <id>` — uninstall.  
- `air adapters status <id>` — detailed status for one adapter.  
- Install/upgrade/uninstall require confirmation unless `--yes` or `--auto` (respect permission mode from config).

**Tests:** `tests/adapters-cli.test.ts` — list/install/upgrade/uninstall/status commands (mock installer).

**Done when:**  
- All 5 subcommands work.  
- Install/upgrade/uninstall respect `--yes`/`--auto` and permission mode.  
- Committed and pushed.

---

### P1-9 — MCP: adapter management tools
**File:** `src/mcp/server.ts`

**Details:**  
- `list_adapters` — read-only, returns all catalog entries with install status.  
- `install_adapter` — install an adapter (write op, requires explicit consent via `approve_install_adapter` or `consent` param).  
- `upgrade_adapter` — upgrade (same consent model).  
- `uninstall_adapter` — uninstall (same consent model).  
- Write tools must not auto-execute; they return a pending-consent state or require a consent token.  
- MCP stdout = protocol only; diagnostics to stderr/logs.

**Tests:** `tests/mcp-adapters.test.ts` — list_adapters read-only; install_adapter requires consent; install after consent.

**Done when:**  
- All 4 MCP tools registered and functional.  
- Write ops require explicit consent.  
- Committed and pushed.

---

### P1-10 — Dashboard: show connected adapters
**File:** `bin/air.ts` `dashboard` command (+ MCP if applicable)

**Details:**  
- `air dashboard` already reads `orchestrator.json` from cache dir.  
- Add a section showing connected/adapters status: which adapters are installed, which were used in sessions, current cooldowns.  
- Reuse `adapterStatus()` + install status.

**Tests:** manual verification (dashboard reads orchestrator log + adapter status).

**Done when:**  
- `air dashboard` shows connected adapters section.  
- Committed and pushed.

---

### P1-11 — Documentation updates
**Files:** `README.md`, `PLAN.md`, `docs/` (new adapter catalog docs)

**Details:**  
- `README.md`: add "Free AI Adapter Catalog" section; document `air adapters` commands; document `catalog.remoteUrl` config; update adapters table with install status note.  
- `PLAN.md`: add Phase 1 section; update adapters table; add catalog file structure.  
- `docs/adapters/catalog.md` (new): catalog entry format, install methods, how to add tools.  
- `docs/behavior-spec.md` (if exists): add Given/When/Then for adapter install/upgrade/uninstall.

**Tests:** `tests/behavior-spec.test.ts` — validate `air --help` / `air adapters --help` against documented commands (if behavior-spec test exists).

**Done when:**  
- README, PLAN.md, docs updated.  
- Committed and pushed.

---

### P1-12 — Full integration test + final validation
**Files:** `tests/adapter-catalog.integration.test.ts` (new)

**Details:**  
- End-to-end test (mocked installer + mock adapter): load catalog → install adapter → verify appears in `air status` → upgrade → uninstall → verify removed.  
- Run full suite: `npm run typecheck`, `npm run typecheck:test`, `npm run lint`, `npm test`, `npm run build`.  
- `npm pack --dry-run` green.

**Done when:**  
- Integration test passes.  
- All validation commands green.  
- Committed and pushed.

---

## Retired source files
After Phase 0 tasks are complete, `tasks_improvements.md` and `tasks_new.md` can be retired (their remaining tasks are now in this plan). This plan file is the single source of remaining work.

## Validation checklist (run before every commit)
- [ ] `npm run typecheck`
- [ ] `npm run typecheck:test`
- [ ] `npm run lint`
- [ ] `npm test`
- [ ] `npm run build`
- [ ] Documentation updated (README, PLAN.md, docs/)
- [ ] Committed and pushed
