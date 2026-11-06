# AIR — Task List from air_e2e_round3_check.md

**Source:** `docs/reviews/air_e2e_round3_check.md`
**Generated:** 2026-11-06

## P0 — Product bugs (fix first)

### T11-001 [TODO] — P-06: Brain gets conversation history
- Priority: P0
- Files: src/brain/index.ts, bin/air.ts, src/conversation
- Details: load conversation from disk (or update in-memory conv on every append); build brain prompt with history + job digest; use fresh data for status/activeWorkIds.

### T11-002 [TODO] — P-07: Destructive requests require confirmation
- Priority: P0
- Files: src/conversation/decide.ts, bin/air.ts
- Details: delete/remove all/drop/wipe require confirmation before spawning a write job.

### T11-003 [TODO] — P-08: Intent routing gaps
- Priority: P0
- Files: src/conversation/decide.ts
- Details: add write-intent patterns (I want, please make, make it, can you add); link "also..." follow-ups to previous job; handle natural-language cancel/status; keep brainstorm out of jobs.

### T11-004 [TODO] — P-09: Grounded answers for repo files
- Priority: P0
- Files: src/conversation/decide.ts, src/brain/index.ts
- Details: questions about named repo files route to read-only job or brain gets bounded repo context.

### T11-005 [TODO] — P-10: /cancel unknown id + thinking... newline
- Priority: P0
- Files: bin/air.ts
- Details: /cancel of unknown id says so; print thinking... on its own line.

## P1 — Harness defects

### T11-006 [TODO] — H-oracles: fix noOrphans (regex + unit tests)
- Files: tests/e2e/harness/oracles.ts, tests/e2e/harness/oracles.test.ts
- Details: correctly escaped regexes; Linux/Mac/Windows scan; positive+negative unit tests with real marked process.

### T11-007 [TODO] — H-brain: fake kilo brain (version, JSON output, records prompt)
- Files: tests/e2e/harness/fake-executors/fake-kilo.mjs, kilo/kilo.cmd shims
- Details: supports --version and run ... --format json, prints JSON text line, supports FAKE_DELAY_MS, records prompt to file.

### T11-008 [TODO] — H-mutation: real mutation gate running scenarios
- Files: scripts/mutation-check.mjs
- Details: run real scenarios against each mutation; all must be detected.

### T11-009 [TODO] — H-knowngap: use knownGap for P-06..P-09
- Files: tests/e2e/scenarios/real-jobs.test.ts
- Details: mark open gaps with knownGap (XPASS forces removal).

### T11-010 [TODO] — H-report: wire report.ts/preflight.ts/retry.ts/mcp-client.ts
- Files: tests/e2e/harness/*
- Details: use in scenarios; produce results/ output; gitignore results/.

### T11-011 [TODO] — H-live: create live suite
- Files: tests/e2e/live/*.live.test.ts
- Details: at least listed live scenarios; SKIP with reason; zero tests fails.

## P2 — Rewrite weak tests with teeth

### T11-012 [TODO] — Rewrite P-01..P-04, F-01, L-01 per round3 section 5.3
- Files: tests/e2e/scenarios/real-jobs.test.ts
- Details: timing assertions, no if-around-key-assertion, wait for final reply/brain_end.

### T11-013 [TODO] — Delete/rewrite vacuous tests (security H-01, run-tasks, mcp, J-01, soak)
- Files: tests/e2e/scenarios/*.test.ts
- Details: one ID one scenario, name equals content.

### T11-014 [TODO] — Implement missing scenario groups (G, E, F, C/D, H, I, L, soak)
- Files: tests/e2e/scenarios/*.test.ts
- Details: priority order per round3 section 4.4.

## P3 — Fixture work

### T11-015 [TODO] — TaskBoard in radmanmilos/test + acceptance tests
- Files: tests/e2e/fixtures/
- Details: tag baseline-v1, add missing fixture files, hidden acceptance tests for FEAT-1..4.

## P4 — Docs

### T11-016 [TODO] — Update docs/testing.md (only what exists)
- Files: docs/testing.md
EOF
Write-Path "E:/GitHub/air/docs/reviews/tasks_air_11.md"