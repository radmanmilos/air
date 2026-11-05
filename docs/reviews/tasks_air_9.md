# AIR — E2E Test Redesign Task List

**Source:** `docs/reviews/archive/air_e2e_test_redesign.md`
**Generated:** 2026-11-05

## Work order (from redesign §10)

### T9-001 [DONE] — Harness core (sandbox, air-process, oracles, report)
- Files: tests/e2e/harness/*
- Status: Done (sandbox, air-process, oracles, basic scenario A-01)

### T9-002 [DONE] — Fake executors (rate limit, crash, hang, long run, edit file, print secret, free/paid labels)
- Files: tests/e2e/harness/fake-executors/
- Details: Shared fake-executor.mjs with env-controlled behavior. .cmd shims for each tool name.

### T9-003 [DONE] — Oracles with unit tests (positive and negative)
- Files: tests/e2e/harness/oracles.ts, tests/e2e/harness/oracles.test.ts
- Details: gitClean, gitChangedFiles, branchesAndWorktrees, dotnetTest, acceptance, conversation, taskStates, traces, noOrphans, secretsAbsent, voice, groundedFiles, structure, latency, sentinelAbsent.

### T9-004 [DONE] — Fixture: TaskBoard project, tag baseline-v1, fixture.lock, hidden acceptance tests
- Files: tests/e2e/fixtures/taskboard/, fixtures/acceptance/
- Details: C# .NET 8 project with seeded bugs (BUG-1..4) and features (FEAT-1..4). 14 passing + 3 failing tests baseline.

### T9-005 [TODO] — P0 deterministic scenarios (A-01, B-01..B-03, C-01, C-02, E-01..E-03, F-01, G-01s..G-03s, G-07s, H-01..H-04, I-01..I-03, J-01, K-01, K-02, L-01)
- Files: tests/e2e/scenarios/*.test.ts

### T9-006 [TODO] — Mutation check of tests (deliberately broken AIR builds)
- Details: Run suite against broken builds to verify tests catch regressions.

### T9-007 [TODO] — Live suite (A-02, B-04/B-05, C-03, D-01..D-05, H-02/H-03)
- Details: Real tools against radmanmilos/test fixture.

### T9-008 [TODO] — P1/P2 scenarios, soak group M, MCP groups, docs rewrite
- Details: Remaining scenarios, stress tests, docs/testing.md update.

### T9-009 [TODO] — Remove old logs from fixture repo, add results/ to .gitignore
- Details: Clean up test_log.md, detailed_test_log.md from test repo.
