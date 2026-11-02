# grok_plan_review_3.md

## Document metadata

- **Target repository**: https://github.com/radmanmilos/air
- **Review date**: 2026-10-31
- **Supersedes**: `project_reviews/grok_plan_review_2.md` (G2-01..G2-12) for forward-looking implementation. Preserve prior reviews as historical context.
- **Status at review**: Phases 0–5 complete. 94 tests passing. CLI + MCP server functional. Core routing, health tracking, redaction, config, execution runner, and failover loop implemented.
- **Instruction priority**: Safety & correctness > real-tool functionality > operational governance > documentation accuracy.
- **How to use**:
  - `MUST` = required before declaring the next phase complete.
  - `SHOULD` = strongly recommended; may be deferred only with explicit justification in `PLAN.md`.
  - Reference IDs (`G3-xx`) in commit messages and `PLAN.md` updates.
  - Do not mark a phase complete if its acceptance criteria fail.

---

## 0. Current status assessment (evidence-based)

**Implemented and tested (excellent foundation):**

- Shared execution runner (`src/execution/runner.ts`) with cross-spawn, array args, bounded buffers, timeout, tree-kill, AbortSignal, and redaction integration.[reference:0]
- Health tracker with `(provider, model)` keying and atomic persistence via `atomicWriteJson`/`readJsonFile`.[reference:1]
- Config loader with precedence, strict repo-config validation, env overrides, and `migrateConfig` support.[reference:2]
- Zod config schema with versioning, strict mode, and defaults.[reference:3]
- Router with priority-list selection, exact skip reasons, and `--explain` formatting.[reference:4]
- Secret redaction with allowlist placeholders, `--api-key=value` support, Bearer tokens, env assignments, and idempotence.[reference:5]
- MCP server with async job lifecycle, approval tools, and no stdin prompting.[reference:6]
- Structured JSONL tracing (`src/observability/trace.ts`).[reference:7]
- Verify hook (`src/context/verify.ts`) with argument arrays and `shell: false`.[reference:8]
- Dirty-tree refusal, checkpoint snapshot, handoff context, provider allow-list, and failover loop with hop cap and revisit prevention.[reference:9]
- Config migration (`migrateConfig`) and `air config migrate` command wired.[reference:10]
- 94 tests covering adapter conformance, redaction, health, router, runner, config, failover, MCP, and verify.

**Critical gaps remaining (blocking production use):**

- **Adapter registration is incomplete**: `listAdapters()` returns only `[new MockAdapter(), new GooseAdapter()]` in both `bin/air.ts` and `src/mcp/server.ts`. The `AiderAdapter` is imported but never registered, despite aider being the primary target tool.[reference:11][reference:12]
- **Opencode and kilocode adapters do not exist** in `src/adapters/`. The README lists them as supported tools, which is inaccurate.
- **Concurrency governance is unimplemented**: `config.concurrency.maxConcurrentAgents` is parsed and stored, but no semaphore, lock, or process-count enforcement exists anywhere in `src/`. No lock module is present.
- **Production code depends on test code**: `MockAdapter` is imported from `tests/mock-adapter` in `bin/air.ts` and `src/mcp/server.ts`, creating a production→test dependency and inflating the bundle.
- **No aider-specific tests**: `tests/` contains `goose.test.ts` but no `aider.test.ts`, so the aider adapter is not exercised.

---

## 1. Prioritized requirements (G3 series)

### G3-01 — Register real adapters and remove mock from production (P0)

**Problem**: The default adapter list contains only the test mock and goose. The aider adapter exists but is never used. Opencode and kilocode are advertised but absent. Production imports `MockAdapter` from `tests/`.

**Change**:
- MUST register `AiderAdapter` in `listAdapters()` in both `bin/air.ts` and `src/mcp/server.ts`, conditionally including it when the `aider` binary is available on `PATH` (or always, with a clear runtime error if missing).
- MUST remove `MockAdapter` from production adapter lists. Inject the mock adapter only in test code or behind an explicit `AIR_USE_MOCK=1` environment flag.
- MUST move `MockAdapter` out of `tests/` into `src/adapters/mock.ts` (or a separate test package) so production code does not import from the test tree.
- MUST either implement `opencode` and `kilocode` adapters or update the README to reflect actual supported tools. Do not leave documentation claiming support for unimplemented tools.
- SHOULD implement adapter discovery: scan for known executables on `PATH` and register adapters dynamically, instead of hardcoding the list.

**Acceptance**:
- `air run "task"` with aider installed routes to aider (or goose as fallback) without mock in the list.
- `air status --json` shows aider, goose, and any other installed tools.
- No production file imports from `tests/`.
- README's adapter table matches `src/adapters/`.

---

### G3-02 — Enforce concurrency governance (P0)

**Problem**: `config.concurrency.maxConcurrentAgents` is parsed but never enforced. There is no lock, semaphore, or process-count check. Two simultaneous `air run` commands can spawn unbounded child processes and corrupt shared state.

**Change**:
- MUST implement a per-config-dir lock (`<config>/air.lock`) using an OS-level lock or atomic `mkdir` to serialize state mutations (health flush, task-state writes).
- MUST enforce `maxConcurrentAgents` via a semaphore or queue before spawning a child process. Default is 1; reject or queue additional attempts with a clear message.
- MUST detect stale locks (dead PID) and reclaim them safely.
- SHOULD add a test that starts two concurrent `air run` processes and verifies no corruption of `health.json` or task-state files.

**Acceptance**:
- Two simultaneous `air run` commands do not corrupt the health file.
- The second command either waits or fails gracefully with a “concurrent agent limit reached” message.
- `maxConcurrentAgents` is respected; no unbounded child-process spawning.

---

### G3-03 — Add aider adapter tests (P1)

**Problem**: `tests/` contains `goose.test.ts` but no `aider.test.ts`. The aider adapter's error classification and command building are untested.

**Change**:
- MUST add `tests/aider.test.ts` covering:
  - `buildCommand` produces the correct headless flags (`--message`, `--yes-always`, `--exit`).
  - `classifyError` maps exit codes and stderr evidence to the correct `ErrorCategory` (rate limit, auth, etc.).
  - Integration with the mock runner simulating aider output.
- MUST verify that aider's rate-limit detection uses stderr and exit code, never stdout prose.

**Acceptance**:
- `tests/aider.test.ts` exists and passes.
- Aider adapter passes conformance tests with simulated aider output.

---

### G3-04 — Remove production→test dependency (P1)

**Problem**: `MockAdapter` is imported from `tests/mock-adapter` in production files (`bin/air.ts`, `src/mcp/server.ts`).

**Change**:
- MUST relocate the mock adapter to `src/adapters/mock.ts` (or make it a dev-only export) so that production code does not depend on the `tests/` directory.
- MUST ensure the production build (`npm run build`) excludes test files and does not bundle `tests/`.
- SHOULD use dependency injection for the adapter list so tests can supply the mock without production importing it.

**Acceptance**:
- `grep -r "tests/mock-adapter" src bin` returns no results.
- `npm run build` produces a bundle that does not include test fixtures.

---

### G3-05 — MCP server must use real adapters (P1)

**Problem**: `src/mcp/server.ts` uses `MockAdapter` in its adapter list, so MCP clients may route to a mock instead of a real tool.

**Change**:
- MUST update `listAdapters()` in `src/mcp/server.ts` to use the same real adapter registration as `bin/air.ts` (G3-01).
- MUST ensure MCP jobs use the same routing, health, and failover logic as CLI runs.
- SHOULD add an MCP integration test that submits a task and verifies it is routed to a real adapter (or a properly injected mock in test mode).

**Acceptance**:
- An MCP client submitting a task is routed to aider/goose, not the mock.
- MCP tests pass with real-adapter injection.

---

### G3-06 — Documentation accuracy and adapter docs (P2)

**Problem**: README lists opencode and kilocode as supported tools, but no adapters exist. `docs/adapters/` is empty or missing.

**Change**:
- MUST update README to list only actually implemented adapters (aider, goose, mock-for-tests).
- MUST create `docs/adapters/aider.md` and `docs/adapters/goose.md` documenting exact invocation, flags, exit codes, and error behavior, as required by prior reviews.
- SHOULD add a “supported tools” table generated from the actual adapter registry to prevent drift.

**Acceptance**:
- README's adapter list matches `src/adapters/`.
- `docs/adapters/aider.md` and `docs/adapters/goose.md` exist and match installed CLI behavior.

---

### G3-07 — Observability log rotation (P2)

**Problem**: `trace.ts` uses `appendFileSync` to a single log file without rotation. Long-running usage will produce unbounded log growth.

**Change**:
- MUST implement size-based rotation (e.g., rotate when file exceeds 10 MB, keep N backups).
- SHOULD make rotation limits configurable in the Zod schema.
- MUST ensure redaction still applies after rotation.

**Acceptance**:
- A test verifies that the log file rotates and old entries are preserved in a backup.
- No secrets appear in any rotated file.

---

### G3-08 — Runner kill-path non-blocking (P2)

**Problem**: `runner.ts` uses `execSync` for `taskkill` on Windows, which blocks the event loop. While `taskkill` is usually fast, it can hang in pathological cases.

**Change**:
- SHOULD replace `execSync` with an async `execFile`/`spawn` call, or use `process.kill` with a fallback timeout.
- MUST ensure tree-kill still works on both Windows and Unix after the change.

**Acceptance**:
- Timeout and cancellation tests still pass.
- The runner does not block the event loop during tree-kill.

---

## 2. Revised phase order (gated)

| Phase | Scope | Gate / acceptance |
|-------|-------|-------------------|
| **G** (current) | Adapter registration (G3-01), concurrency governance (G3-02) | Aider is in the default list; mock removed from production; `maxConcurrentAgents` enforced; two concurrent runs do not corrupt state |
| **H** | Aider tests (G3-03), production→test dependency removal (G3-04), MCP real adapters (G3-05) | `aider.test.ts` passes; no `tests/` imports in production; MCP routes to real adapters |
| **I** | Documentation accuracy (G3-06), log rotation (G3-07), non-blocking kill (G3-08) | README matches adapters; adapter docs exist; trace rotates; runner does not block |
| **J** | Optional: dynamic adapter discovery, scoring, opencode/kilocode only if explicitly in scope | Only after Phases G–I pass |

**Do not start Phase J until Phases G–I are complete and verified with real tests.**

---

## 3. Anti-patterns to avoid

The implementation agent MUST NOT:

- Leave `MockAdapter` in the default adapter list for production builds.
- Claim support for opencode or kilocode in documentation without an implementation.
- Treat `maxConcurrentAgents` as a cosmetic config field; it must be enforced.
- Import from `tests/` in production code.
- Mark Phase G complete while aider is absent from `listAdapters()`.
- Add features (scoring, classifier) before the real adapter path is exercised end-to-end.

---

## 4. Definition of done (reinforced)

A feature is complete only when:

1. Code is implemented (no stubs, no test-only imports in production).
2. Automated tests cover normal operation and failure modes, including real-tool simulation.
3. `npm run build`, `npm run typecheck`, `npm run typecheck:test`, and `npm test` pass.
4. Behavior is documented in `docs/behavior-spec.md` and matches implementation.
5. Logs, traces, error messages, and handoff context contain no secrets.
6. `README.md` and `PLAN.md` describe actual behavior, not planned behavior.
7. The change references the relevant review ID (e.g., `G3-01`) in `PLAN.md` and the commit message.

---

## 5. Immediate next action

Implement **Phase G** in this order:

1. **G3-01**: Update `listAdapters()` in `bin/air.ts` and `src/mcp/server.ts` to register `AiderAdapter` (conditionally on binary availability) and remove `MockAdapter` from production lists. Move `MockAdapter` to `src/adapters/mock.ts` or a dev-only entry point.
2. **G3-02**: Implement a per-config-dir lock and a semaphore that enforces `maxConcurrentAgents`. Add tests for concurrent `air run` invocations.

After Phase G passes, proceed to Phase H (aider tests, dependency cleanup, MCP real adapters).

---

*End of document. Append future findings with incremented IDs (G3-09, G3-10, …).*