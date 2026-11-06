# Testing AIR

## Unit Tests
Run: `npm test` (vitest)
Run: `npm run typecheck`, `npm run typecheck:test`, `npm run lint`

## E2E Test Harness (tests/e2e/)
Structured test system per `docs/reviews/archive/air_e2e_test_redesign.md`.

### Structure
- `tests/e2e/harness/` - sandbox, air-process, oracles, chat-driver, report, preflight, retry, mcp-client, known-gap
- `tests/e2e/scenarios/` - scenario tests
- `tests/e2e/fixtures/` - fixture specs (TaskBoard lives in AIR repo; dedicated repo not yet split)
- `tests/e2e/live/` - (not yet created; `e2e:live` currently runs no tests)

### Running
- Deterministic suite (CI): `npm test` (includes e2e scenarios)
- `results/` output: report.ts exists but is not wired into a reporter yet (no results/ produced).

### AIR_EVENT_LOG
When `AIR_EVENT_LOG=<path>` is set, AIR appends JSON lines for:
- message_received, brain_start, brain_end, job_submitted, job_started, job_finished, notice_printed, command_handled

Tests use this for latency measurement and ordering assertions.

### Known gaps
Real gaps are marked with `knownGap(id, issue)` (vitest `it.fails`): passing means the bug is still present; XPASS forces removal.

## Production-Like Tests
- `scripts/production-test.ps1` - unchanged; tracks detection only.
- Prefer the Node harness (`npm run e2e:det`) for real assertions.