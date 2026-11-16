## Summary

Reconciles the independent L0-05 review under the **project-owner-approved P1-05 deferral**. L0-05 is complete under a revised scope; P1-05 OS-enforced sandboxed execution is **DEFERRED** to a separate Windows-first security milestone (**SEC-W1**). P1-05 is **not** claimed PASS/DONE, and no untrusted execution is enabled.

## Implemented

- **P0-01 — Atomic conversation mutations.** `mutateConversation()` on the locked read-modify-write path; CLI/MCP use it for `activeWorkIds`/facts and reload fresh state; `injectResult` idempotency moved inside the lock.
- **P1-01 — MCP cancellation semantics.** Cancel linearizes on persisted/actual terminal outcomes; preserves COMPLETED/FAILED; confirms CANCELLED only when persisted; cross-conversation isolation; handle/poller cleanup; narrowed `AIR_MOCK_ADAPTER` seam.
- **P1-02 — Local-only chat answers.** Answer path resolves a local Ollama target via configured coordinator role or explicit local override; no `kilo`/`opencode` spawn or external fallback on the default answer path.
- **P1-03 — Evaluation schema/tool context (proposal-only).** `suiteContract()` sends `format`/`tools` and records `schemaName`/`schemaHash`/`toolSetHash`/`formatProvided`/`toolsProvided`; strict deterministic `validateToolCallProposal()`; Python↔TS tool-registry parity and drift tests. Explicitly **not** an execution/sandbox boundary.
- **P1-04 — Reviewer oracle leakage.** Neutral reviewer fixtures, recursive hidden-field sanitizer, real-fixture prompt leak test.
- **P1-05 (boundary only) — Fail-closed safety-oracle contract.** Typed statuses, opt-in `--execute-safety-oracles` (default off), capability detection, truthful `not_run`/`unsupported`/`executed:false` evidence. No untrusted patch apply, fixture command execution, or proposed-tool dispatch.
- **P1-06 — Planner adversarial fixtures.** Generate/validate split, deterministic `validatePlanDetailed()`, runner-level zero-model-call test.
- **P1-07 — Assistant tool-call contract.** `ModelMessage.toolCalls` + Ollama `tool_calls` serialization with round-trip/sequencing/malformed tests.
- **P2-01/P2-02 — Provider/config hardening.** `health()` treats `TIMEOUT` as offline (caller cancellation still rejects `CANCELLED`); strict HTTP(S) base URL validation (no credentials/query/fragment) in schema and provider.
- **Security hardening.** Recursive redaction of secret-like values in model-visible eval payloads and persisted records, preserving authoritative evidence fields.
- **Experimental prototype.** `packages/windows-sandbox/` retained as **EXPERIMENTAL / NOT PRODUCTION READY**; not wired into the runtime or CI, excluded from `npm pack`, build outputs git-ignored.

## P1-05 deferral (approved)

- **Deferred:** OS-enforced sandboxed execution, untrusted patch application, fixture-command execution, proposed-tool dispatch, filesystem/network/process confinement, and executed coder/tool-calling/debugging safety oracles.
- **Current behavior:** fail-closed on **Windows, Linux and macOS** — execution returns `unsupported` / `executed: false` and launches no untrusted process.
- **Separate milestone:** SEC-W1 (Windows-first) is tracked in `docs/reviews/tasks_air_13.md` and `docs/architecture/local-first-ai-plan.md` with threat model, required design work, and measurable acceptance evidence. It remains OPEN.
- **Not authorized by this PR:** enabling untrusted execution, claiming a sandbox exists, removing fail-closed protections, or marking P1-05 PASS/DONE.

## Acceptance status (revised L0-05)

| Criterion | Status |
|---|---|
| P0-01, P1-01, P1-02 | PASS |
| P1-03 (proposal-only) | PASS |
| P1-04 (audited paths) | PASS |
| P1-05 fail-closed boundary | PASS |
| P1-05 sandboxed execution + executed oracles | **DEFERRED → SEC-W1** |
| P1-06, P1-07 | PASS |
| P2-01, P2-02 | PASS |
| P2-03 (`maxConcurrentGenerative` enforcement) | DEFERRED to L3 (accepted, non-blocking P2) |

L3/L4 remain blocked by L0-03 (independent architecture review), L0-04d (scoring review) and L1/L2 completion — not by L0-05.

## Validation (local, this head)

- `npm run typecheck` — pass
- `npm run typecheck:test` — pass
- `npm run lint` — pass
- `npm test` — 73 files passed / 2 skipped; 458 tests passed / 16 skipped
- `npm run build` — pass (`dist/` regenerated and unchanged vs. committed output)
- `npm pack --dry-run` — pass (261 files; `packages/windows-sandbox` not included)
- `python -m ruff check .` — pass
- `python -m mypy air_local` — pass
- `python -m pytest -q` — 103 passed

Exact-head GitHub CI is linked in the PR checks.

## Remaining work

- SEC-W1: implement and adversarially validate Windows-first OS-enforced confinement; then enable untrusted eval execution and executed safety oracles.
- L0-03 independent architecture review and L0-04d independent scoring/threshold review remain open.
- L3 enforcement of `maxConcurrentGenerative`.

## Notes

- Draft kept until the revised acceptance scope is fully reconciled and the cumulative diff is reviewed.
- No unrelated refactoring; no force-push; no generated binaries committed.