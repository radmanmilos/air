# AIR — E2E Test Redesign Task List

**Source:** `docs/reviews/archive/air_e2e_test_redesign.md` and `docs/reviews/air_e2e_verification_and_fixes.md`
**Generated:** 2026-11-05

## Work order (from redesign §10)

### T9-001 [DONE] — Harness core (sandbox, air-process, oracles, report)
- Files: tests/e2e/harness/*
- Status: Done — sandbox v2 (state outside repo), air-process cross-platform tree kill, oracles (incl. noOrphans), chat-driver, report, preflight, retry, mcp-client, known-gap.

### T9-002 [DONE] — Fake executors (rate limit, crash, hang, long run, edit file, print secret, free/paid labels)
- Files: tests/e2e/harness/fake-executors/
- Details: Shared fake-executor.mjs with env-controlled behavior (FAKE_BEHAVIOR, FAKE_DELAY_MS, FAKE_EXIT_CODE, FAKE_TOOL). .cmd shims for aider, goose, kilo, opencode, ollama, codex, github-copilot.

### T9-003 [PARTIAL] — Oracles with unit tests (positive and negative)
- Files: tests/e2e/harness/oracles.ts, tests/e2e/harness/oracles.test.ts
- Details: gitClean, gitChangedFiles, fileExists, fileContains, voiceCheck, noOrphans implemented. Missing: branchesAndWorktrees, dotnetTest, acceptance, conversation, taskStates, traces, secretsAbsent, groundedFiles, structure, latency, sentinelAbsent.

### T9-004 [PARTIAL] — Fixture: TaskBoard project, fixture.lock
- Files: tests/e2e/fixtures/taskboard/, tests/e2e/fixtures/fixture.lock
- Details: fixture.lock created (baseline_commit + fixture_sha256). TaskBoard lives inside the air repo (not radmanmilos/test); no git tag baseline-v1, no fixture.lock hash enforcement failure path beyond warning, no hidden acceptance tests, BUG-n comments not yet removed from source.

### T9-005 [PARTIAL] — P0 deterministic scenarios with teeth
- Files: tests/e2e/scenarios/real-jobs.test.ts (new), existing scenarios/*.test.ts
- Details: real-jobs.test.ts covers P-01 (injection), P-02 (immediate Started job), P-03 (cancel kills worker + no orphans), P-04 (responsive chat during slow brain), P-05 (brainstorm no side effects), H-01 (injection sentinel). Existing scenarios are largely vacuous smoke tests and still need replacement per review §5.3.

### T9-006 [DONE] — Mutation check of AIR (deliberately broken builds)
- Files: scripts/mutation-check.mjs
- Details: Rewritten to mutate AIR source (shell in brain, cancel print-only, sync brain) and require the named scenario to fail.

### T9-007 [PARTIAL] — Live suite
- Files: vitest.live.config.ts
- Details: Separate live config created. No live scenarios implemented; `e2e:live` equals a separate config but runs no real-tool scenarios yet.

### T9-008 [TODO] — P1/P2 scenarios, soak group M, MCP groups, docs rewrite
- Details: Remaining scenarios, stress tests, docs/testing.md updated to state only what exists.

### T9-009 [DONE] — Remove old logs from fixture repo, add results/ to .gitignore
- Details: results/ added to .gitignore.
