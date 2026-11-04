# AIR — Task List from claude_review_v7.md

**Generated:** 2026-11-04
**Source:** `docs/reviews/claude_review_v7.md` (K-01..K-14, C-01..C-08, phases 0-6)
**Previous tasks archived:** `docs/reviews/archive/tasks_air_7.md`

## Validation checklist
- `npm run typecheck`
- `npm run typecheck:test`
- `npm run lint`
- `npm test`
- `npm run build`
- `npm pack --dry-run`
- Documentation updated

## Tasks

### Phase 0 — Make what exists real

#### T8-001 [IN_PROGRESS] — Fix packaging: NodeNext + explicit import specifiers, remove fix-imports
- Priority: P0
- Review refs: K-01, C-01
- Files: tsconfig.json, src/**/*.ts, bin/air.ts, scripts/fix-imports.mjs, scripts/check-dist-imports.mjs
- Details: Switch to "module": "NodeNext", write explicit .js / /index.js specifiers in all source imports. Delete fix-imports or make it resolve directories. Add scripts/check-dist-imports.mjs and run in CI after build.
- Acceptance: scan reports 0 unresolved; node dist/bin/air.js chat starts; import('dist/src/index.js') succeeds.

#### T8-002 [TODO] — Built-binary test per command and MCP tool
- Priority: P0
- Review refs: K-01
- Details: Add tests that run the built binary for every CLI command and MCP tool (chat, chat_send, get_conversation, resume_task, approve_failover, cancel_task).

#### T8-003 [TODO] — Fix MCP stdout purity and run-id consistency
- Priority: P0
- Review refs: K-02
- Details: Orchestrator must not write to stdout; one run id created by job manager used everywhere. Add stdio conformance test.

#### T8-004 [TODO] — Fix chat data loss and /status
- Priority: P0
- Review refs: C-04
- Details: Single conversation write path (append under lock, atomic), loadConversation before every read.

#### T8-005 [TODO] — Explain failures and fix --allow-paid/--free-only options
- Priority: P0
- Review refs: K-05, C-07
- Details: Print plain-language result with category, skipped candidates, reason, exact command. Align options with policy model.

#### T8-006 [TODO] — Honest docs
- Priority: P0
- Review refs: K-09
- Details: Mark unwired modules; correct README claims; reduce PLAN.md.

#### T8-007 [TODO] — Dead-code CI check
- Priority: P0
- Review refs: K-04
- Details: Add knip/ts-prune; fail on unused exports.

### Phase 1 — Job runtime (placeholder)
### Phase 2 — Front agent (placeholder)
### Phase 3 — Routing/models (placeholder)
### Phase 4 — Isolation (placeholder)
### Phase 5 — Daemon (placeholder)
### Phase 6 — Hardening (placeholder)
filePath">
E:\GitHub\air\docs\reviews\tasks_air_8.md