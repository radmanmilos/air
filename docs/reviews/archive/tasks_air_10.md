# AIR — Task List from air_e2e_verification_and_fixes.md

**Source:** `docs/reviews/air_e2e_verification_and_fixes.md`
**Generated:** 2026-11-05
**Last updated:** 2026-11-06 (L-01 timeout resolved: kilocode fake shim was misnamed `kilo`; renamed to `kilocode`/`kilocode.cmd` so the adapter uses the fake executor; orchestrator process-crash handling added; real-jobs timeouts bumped)

## P0 — Product bugs (fix first)

### T10-001 [DONE] — P-01: Remove shell: true from brain (command injection)
- Priority: P0
- Files: src/brain/index.ts
- Details: Removed shell: true; uses cross-spawn with arg arrays. Never interprets user text as shell.
- Acceptance: brainAnswer('what is this; touch PWN') does not create PWN file. Verified by H-01 real scenario.

### T10-002 [DONE] — P-02: Print "Started job <id>" immediately (non-blocking)
- Priority: P0
- Files: bin/air.ts, src/orchestrator/orchestrator.ts
- Details: Orchestrator.start now returns an initial RUNNING session immediately and runs the job in a background promise (waitFor). Chat prints "Started job <id>" before the worker runs.
- Acceptance: Verified by real-jobs P-02 scenario (Started job within 5 s).

### T10-003 [DONE] — P-03: Wire /cancel to job manager (real cancellation)
- Priority: P0
- Files: bin/air.ts, src/orchestrator/orchestrator.ts, src/mcp/server.ts
- Details: /cancel calls orchestrator.cancel (kills worker tree via AbortController), updates state. cancel_job decision also wired.
- Acceptance: Verified by real-jobs P-03 scenario (no orphans after cancel).

### T10-004 [DONE] — P-04: Async brain (don't block chat loop)
- Priority: P0
- Files: bin/air.ts, src/brain/index.ts
- Details: brainAnswer called in fire-and-forget async block; /status answers within 2 s during a slow brain call.
- Acceptance: Verified by real-jobs P-04 scenario.

### T10-005 [DONE] — P-05: Intent routing (questions don't spawn write jobs)
- Priority: P0
- Files: src/conversation/decide.ts
- Details: Brainstorm questions ("How would you add...") return answer actions; write verbs spawn jobs; questions never spawn write jobs.
- Acceptance: Verified by real-jobs P-05 scenario.

### T10-006 [DONE] — P-06: Brain context (history + job awareness)
- Priority: P0
- Files: src/brain/index.ts, src/conversation/decide.ts, bin/air.ts
- Details: brainAnswer accepts BrainContext {history, jobs}; chat passes conv.messages and activeWorkIds.

## P1 — Harness defects

### T10-007 [DONE] — H1: Implement noOrphans
- Files: tests/e2e/harness/oracles.ts
- Details: Cross-platform process scan (PowerShell Get-CimInstance on Windows; /proc cmdline+environ on Unix).

### T10-008 [DONE] — H2: Cross-platform tree kill in air-process.ts
- Files: tests/e2e/harness/air-process.ts, chat-driver.ts
- Details: killTree uses taskkill /T /F on Windows, process-group kill on Unix; detached spawn.

### T10-009 [DONE] — H3: airOnce only for non-interactive; chat uses airSpawn
- Files: tests/e2e/harness/air-process.ts
- Details: airOnce uses stdin 'ignore' (non-interactive). chat uses airSpawn/startChat with pipe.

### T10-010 [DONE] — H4: Sandbox v2 (state outside repo)
- Files: tests/e2e/harness/sandbox.ts
- Details: repo/ and state/ are siblings under a temp root; AIR_CACHE_DIR/AIR_CONFIG_DIR/AIR_EVENT_LOG point at state/.

### T10-011 [DONE] — H5: Fixture from tagged baseline
- Files: tests/e2e/fixtures/taskboard/, tests/e2e/fixtures/fixture.lock
- Details: fixture.lock (baseline_commit + fixture_sha256) created; sandbox verifies hash; git tag baseline-v1 created.

### T10-012 [DONE] — H6: Build report.ts, preflight.ts, retry.ts, chat-driver.ts, mcp-client.ts
- Files: tests/e2e/harness/{report,preflight,retry,chat-driver,mcp-client}.ts

### T10-013 [DONE] — H7: knownGap helper with XPASS
- Files: tests/e2e/harness/known-gap.ts
- Details: uses vitest it.fails; XPASS forces removal.

### T10-014 [DONE] — H8: Separate live config
- Files: vitest.live.config.ts, package.json
- Details: e2e:live uses vitest.live.config.ts; e2e:det uses default config.

### T10-015 [DONE] — H9: Fix scenario IDs
- Files: tests/e2e/scenarios/*.test.ts
- Details: real-jobs.test.ts adds 11 with-teeth scenarios (P-01..P-05, H-01, A-01, F-01, H-02, L-01). Vacuous smoke tests in adapters/basic/mcp/onboarding/run-tasks/security/soak/voice renamed to SMOKE-* to drop false catalog IDs.

### T10-016 [DONE] — H10: Fix docs/testing.md
- Files: docs/testing.md
- Details: Rewritten to state only what exists; no false claims.

### T10-017 [DONE] — H11: Replace mutation-check.mjs with AIR mutations
- Files: scripts/mutation-check.mjs
- Details: Now mutates AIR source (shell in brain, cancel print-only, sync brain) and requires named scenario to fail.

### T10-018 [DONE] — H12: Emit notice_printed and command_handled events
- Files: bin/air.ts
- Details: logEvent('command_handled', ...) on every input; logEvent('notice_printed', ...) on "Started job".

## P2 — Replace vacuous tests
### T10-019 [PARTIAL] — Replace vacuous tests with real with-teeth tests
- Files: tests/e2e/scenarios/real-jobs.test.ts
- Details: 11 real scenarios in real-jobs.test.ts (P-01..P-05, H-01, A-01, F-01, H-02, L-01) pass individually. Remaining vacuous smoke tests (adapters/basic/mcp/onboarding/run-tasks/security/soak/voice) still smoke-level; full with-teeth replacement (B-03, C-03/E-00, E-01, E-02, E-03, G-01s, K-01) deferred — requires stable fixture + MCP driver harness work.

## P3 — Fixture work
### T10-020 [PARTIAL] — TaskBoard in dedicated repo, tag baseline-v1, fixture.lock
- Files: tests/e2e/fixtures/taskboard/, tests/e2e/fixtures/fixture.lock
- Details: TaskBoard lives inside the air repo (not a dedicated repo); git tag baseline-v1 created in air repo; fixture.lock hash enforced by sandbox. Dedicated-repo split not done (requires external repo + CI wiring).

### T10-021 [DONE] — Remove BUG-n comments
- Files: tests/e2e/fixtures/taskboard/src/*
- Details: All // BUG-n comments removed; seeded bugs preserved in code.

### T10-022 [PARTIAL] — Hidden acceptance tests for FEAT-1..4
- Files: tests/e2e/fixtures/taskboard/tests/
- Details: No FEAT-1..4 features or hidden acceptance tests exist; TaskBoard only has BUG-1..4 seeded bugs and 17 passing tests. Implementing FEAT-1..4 + hidden acceptance tests requires product feature work beyond current scope.

## P4 — Documentation
### T10-023 [DONE] — Rewrite docs/testing.md
- Files: docs/testing.md
- Details: Rewritten; states only what exists.

### T10-024 [DONE] — Update tasks_air files
- Files: docs/reviews/archive/tasks_air_9.md, docs/reviews/tasks_air_10.md
- Details: Both task lists updated to honest DONE/PARTIAL/TODO status.

## Summary
- P0 product bugs: 6/6 DONE.
- P1 harness: 11/12 DONE, 1 PARTIAL (H9).
- P2 vacuous tests: PARTIAL (11 real scenarios added; old smoke tests remain).
- P3 fixture: 1 DONE, 2 PARTIAL (dedicated repo, FEAT acceptance tests).
- P4 docs: 2/2 DONE.
- Full suite: 278 passed, 5 skipped, 1 failed (L-01 resume timeout, being investigated). Typecheck, lint, build, check:dist, pack dry-run all green.