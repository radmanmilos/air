# Testing AIR

## Unit Tests
Run: `npm test` (vitest, 240+ tests)
Run: `npm run typecheck`, `npm run typecheck:test`, `npm run lint`

## E2E Test Harness (tests/e2e/)
Structured test system per `docs/reviews/air_e2e_test_redesign.md`.

### Structure
- `tests/e2e/harness/` - sandbox, air-process, oracles, report
- `tests/e2e/scenarios/` - scenario tests (A-01..M-05)
- `tests/e2e/fixtures/` - fixture specs and hidden acceptance tests

### Running
- Deterministic suite (CI): `npm run e2e:det` (fake executors, no real tools)
- Live suite (local): `npm run e2e:live -- --fixture <path>` (real tools)

### AIR_EVENT_LOG
When `AIR_EVENT_LOG=<path>` is set, AIR appends JSON lines for:
- message_received, brain_start, brain_end, job_submitted, job_started, job_finished, notice_printed, command_handled

Tests use this for latency measurement and ordering assertions.

## Production-Like Tests
- `scripts/production-test.ps1` - 16 tests across 6 tiers (Windows)
- Run: `powershell -ExecutionPolicy Bypass -File scripts/production-test.ps1 -ProjectPath "E:\GitHub\test"`

## Manual Testing
See `docs/reviews/air_e2e_test_redesign.md` for the full scenario catalog (A-01..M-05) with acceptance criteria.