## Scope completed
- **P0-01:** Atomic conversation mutation/stale-write correction.
- **P1-01:** MCP cancellation and terminal-state reconciliation.
- **P1-02:** Local-only chat answer path and prevention of unintended external CLI egress.
- **P1-03 (prior increments):** Evaluation schema/tool-context integrity improvements (authoritative schema/tool context in eval requests, oracle isolation, deterministic planner validation separation). Automated Python/TypeScript worker tool-registry parity + negative drift-detection checks added for covered schema fields (semantic comparison; hash remains mirror-identity metadata, not sole proof).
- **P1-03 strict proposal argument validation (`e8705738d7f45bcf76562754b8f1a7f754616170`, CI [43419317640](https://github.com/radmanmilos/air/actions/runs/43419317640), 7/7 green):** `validateToolCallProposal()` now performs recursive, deterministic, fail-closed validation against authoritative tool schemas for evaluable features — tool-call structure, required properties, JSON types (`string|boolean|integer|number|object|array|null`, finite integer-vs-fractional, boolean-not-number, nullable unions), enums, nested objects/arrays and `items`, and `additionalProperties` enforcement (including schema-valued additional properties); optional properties/defaults handled without coercion/injection or mutation of proposals. Returns stable reason codes and structured diagnostics (tool/path/expected/actual, no argument-value leakage). Unsupported/unevaluable schema features fail closed. Exercised against real authoritative registry schemas and synthetic edge-case tests. **Proposal-only:** no tool dispatch, patch application, command execution, or network execution (not an execution-safety/sandbox boundary).
- **P1-05:** Fail-closed safety-oracle boundary contract (typed statuses/evidence, opt-in `--execute-safety-oracles`, capability detection; no untrusted execution enabled).

## Exact CI evidence (all completed/success, 7/7 jobs)
- P0-01 (`fda9506`): https://github.com/radmanmilos/air/actions/runs/43293203530
- P1-01 (`c1e4742`): https://github.com/radmanmilos/air/actions/runs/43313608385
- P1-02 (`cb0880c`): https://github.com/radmanmilos/air/actions/runs/43329891518
- P1-03 implementation (`42ee626809446d4cd17c44633db890401b2d9688`): https://github.com/radmanmilos/air/actions/runs/43339234872
- P1-03 documentation follow-up (`1d83ed0d23aa9e2533b5abb208a49dbbf7808916`): https://github.com/radmanmilos/air/actions/runs/43382851018
- P1-05 fail-closed boundary contract (`02cbaadf9b03aeec0009315f71d0b69ef44fabcb`): https://github.com/radmanmilos/air/actions/runs/43391210944
- P1-05 evidence-recording docs (`4bd48db041a3b01c7251ceab7055264ffff5a8bf`): https://github.com/radmanmilos/air/actions/runs/43398692962
- P1-05 head-metadata reconciliation docs (`392c8fd4ec0e52065edcd60dc9d0a318d59c1a6b`): https://github.com/radmanmilos/air/actions/runs/43400519835
- P1-06 runner-level no-model-call test evidence (`2d0746a7a83ecbad1e0b3d7cc7874f856ab81310`): https://github.com/radmanmilos/air/actions/runs/43404486859
- P1-03 automated Python/TypeScript tool registry parity (`fa5f3493ac31aa2f25303a4f168b907de87ed74b`): https://github.com/radmanmilos/air/actions/runs/43408577415
- P1-03 strict proposal argument validation (`e8705738d7f45bcf76562754b8f1a7f754616170`): https://github.com/radmanmilos/air/actions/runs/43419317640

## P1-05 status (PARTIAL, NOT DONE)
- **Implemented in `02cbaad` (CI 43391210944, 7/7 green):** fail-closed capability/oracle contract, opt-in request flag, truthful `not_run`/`unsupported` reporting, and separation of proposal validation from executed safety/acceptance oracles.
- **Default behavior:** proposal-only; no untrusted patch application, no fixture command execution, no proposed tool dispatch.
- **Opt-in behavior:** currently reports `unsupported`/not executed on all platforms because demonstrable OS-enforced isolation/sandbox controls are not implemented; fail-closed (never marked passed without executed evidence).
- **Still open:** sandboxed execution, OS-enforced filesystem/network/process isolation, untrusted patch/command/tool execution, and executed coder/tool-calling/debugging safety/acceptance oracles.

## Remaining scope and limitations
- **P1-03:** Registry parity/drift guarded for covered Python/TS tool-contract fields (`fa5f349`, CI 43408577415; hash mirror-identity metadata, not sole proof). Strict proposal argument validation for evaluable schema features is implemented and CI-verified (`e870573`, CI 43419317640) but remains **proposal-only** (no execution safety/sandboxing) and fail-closed for unsupported/unevaluable schema constructs. **P1-03 is not claimed fully complete unless all ledger acceptance criteria are satisfied.**
- **P1-04:** Reviewer leakage audit passed only for the audited fixture/prompt paths; residuals remain as documented.
- **P1-05:** Execution/sandbox acceptance remains open (runner fail-closed/proposal-only for untrusted execution). **P1-05 is not complete.**
- **P1-06:** Deterministic planner validation is present for audited cases; the runner-level no-model-call criterion is now evidenced (`2d0746a`, CI 43404486859). **P1-06 overall remains TODO/PARTIAL (not fully complete).**
- **P1-07** and **P2-01 through P2-03** remain open.
- **L3/L4 remain blocked.** **L0-05 reconciliation is not complete.** **PR is not merge-ready.**

Follow-up report: `docs/reviews/p1-evaluation-followup-review.md`

> Draft PR for incremental L0-05 reconciliation; not claimed merge-ready until remaining required findings are reconciled with evidence and acceptance gates are satisfied.
