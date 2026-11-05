# AIR — Task List from air_e2e_verification_and_fixes.md

**Source:** `docs/reviews/air_e2e_verification_and_fixes.md`
**Generated:** 2026-11-05

## P0 — Product bugs (fix first)

### T10-001 [TODO] — P-01: Remove shell: true from brain (command injection)
- Priority: P0
- Files: src/brain/index.ts
- Details: Remove shell: true from all execFileSync calls. Use cross-spawn or proper arg passing. Never interpret user text as shell.
- Acceptance: brainAnswer('what is this; touch PWN') does not create PWN file.

### T10-002 [TODO] — P-02: Print "Started job <id>" immediately (non-blocking)
- Priority: P0
- Files: bin/air.ts, src/orchestrator/orchestrator.ts
- Details: Return job handle immediately, print Started job before worker runs.

### T10-003 [TODO] — P-03: Wire /cancel to job manager (real cancellation)
- Priority: P0
- Files: bin/air.ts, src/orchestrator/orchestrator.ts, src/mcp/server.ts
- Details: /cancel calls orchestrator cancel, kills worker tree, updates state.

### T10-004 [TODO] — P-04: Async brain (don't block chat loop)
- Priority: P0
- Files: bin/air.ts, src/brain/index.ts
- Details: Make brainAnswer async, show progress, don't block /status.

### T10-005 [TODO] — P-05: Intent routing (questions don't spawn write jobs)
- Priority: P0
- Files: src/conversation/decide.ts
- Details: "How would you add..." should not spawn a job. Fix keyword detection.

### T10-006 [TODO] — P-06: Brain context (history + job awareness)
- Priority: P0
- Files: src/brain/index.ts, src/conversation/decide.ts, bin/air.ts
- Details: Pass conversation history to brain. Brain knows about active jobs.

## P1 — Harness defects

### T10-007 [TODO] — H1: Implement noOrphans
### T10-008 [TODO] — H2: Cross-platform tree kill in air-process.ts
### T10-009 [TODO] — H3: airOnce only for non-interactive; chat uses airSpawn
### T10-010 [TODO] — H4: Sandbox v2 (state outside repo)
### T10-011 [TODO] — H5: Fixture from tagged baseline
### T10-012 [TODO] — H6: Build report.ts, preflight.ts, retry.ts, chat-driver.ts, mcp-client.ts
### T10-013 [TODO] — H7: knownGap helper with XPASS
### T10-014 [TODO] — H8: Separate live config
### T10-015 [TODO] — H9: Fix scenario IDs
### T10-016 [TODO] — H10: Fix docs/testing.md
### T10-017 [TODO] — H11: Replace mutation-check.mjs with AIR mutations
### T10-018 [TODO] — H12: Emit notice_printed and command_handled events

## P2 — Replace vacuous tests
### T10-019 [TODO] — Replace H-01, B-01, B-03, C-03, E-03, E-02, E-01, F-01, A-01, G-01s, H-02, K-01, L-01 with real tests

## P3 — Fixture work
### T10-020 [TODO] — TaskBoard in dedicated repo, tag baseline-v1, fixture.lock
### T10-021 [TODO] — Remove BUG-n comments
### T10-022 [TODO] — Hidden acceptance tests for FEAT-1..4

## P4 — Documentation
### T10-023 [TODO] — Rewrite docs/testing.md
### T10-024 [TODO] — Update tasks_air files (reopen incomplete tasks)