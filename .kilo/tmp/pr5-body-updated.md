## Scope completed
- **P0-01:** Atomic conversation mutation/stale-write correction.
- **P1-01:** MCP cancellation and terminal-state reconciliation.
- **P1-02:** Local-only chat answer path and prevention of unintended external CLI egress.
- **P1-03:** Evaluation schema/tool-context integrity improvements (authoritative schema/tool context in eval requests, oracle isolation, deterministic planner validation separation, proposal-only tool validation boundaries recorded).
- **P1-05:** Fail-closed safety-oracle boundary contract (typed statuses/evidence, opt-in `--execute-safety-oracles`, capability detection; no untrusted execution enabled).

## Exact CI evidence (all completed/success, 7/7 jobs)
- P0-01 (`fda9506`): https://github.com/radmanmilos/air/actions/runs/43293203530
- P1-01 (`c1e4742`): https://github.com/radmanmilos/air/actions/runs/43313608385
- P1-02 (`cb0880c`): https://github.com/radmanmilos/air/actions/runs/43329891518
- P1-03 implementation (`42ee626809446d4cd17c44633db890401b2d9688`): https://github.com/radmanmilos/air/actions/runs/43339234872
- P1-03 documentation follow-up (`1d83ed0d23aa9e2533b5abb208a49dbbf7808916`): https://github.com/radmanmilos/air/actions/runs/43382851018
- P1-05 fail-closed boundary contract (`02cbaadf9b03aeec0009315f71d0b69ef44fabcb`): https://github.com/radmanmilos/air/actions/runs/43391210944

## P1-05 status (PARTIAL, NOT DONE)
- **Implemented in `02cbaad` (CI 43391210944, 7/7 green):** fail-closed capability/oracle contract, opt-in request flag, truthful `not_run`/`unsupported` reporting, and separation of proposal validation from executed safety/acceptance oracles.
- **Default behavior:** proposal-only; no untrusted patch application, no fixture command execution, no proposed tool dispatch.
- **Opt-in behavior:** currently reports `unsupported`/not executed on all platforms because demonstrable OS-enforced isolation/sandbox controls are not implemented; fail-closed (never marked passed without executed evidence).
- **Still open:** sandboxed execution, OS-enforced filesystem/network/process isolation, untrusted patch/command/tool execution, and executed coder/tool-calling/debugging safety/acceptance oracles.

## Remaining scope and limitations
- **P1-04:** Reviewer leakage audit passed only for the audited fixture/prompt paths; residuals remain as documented.
- **P1-05:** Execution/sandbox acceptance remains open (runner fail-closed/proposal-only for untrusted execution).
- **P1-06:** Deterministic planner validation is present for audited cases, but a runner-level no-model-call assertion remains recommended.
- **Tool registry parity/drift detection** and **proposal argument validation** have documented limitations (manual worker-registry mirror, no automated parity/drift proof; proposal validation does not fully enforce arg value types and records rather than rejects extra keys — not an execution-safety boundary). P1-03 residuals preserved.
- **P1-07** and **P2-01 through P2-03** remain open.
- **L3/L4 remain blocked.** **L0-05 reconciliation is not complete.**

Follow-up report: `docs/reviews/p1-evaluation-followup-review.md`

> Draft PR for incremental L0-05 reconciliation; not claimed merge-ready until remaining required findings are reconciled with evidence and acceptance gates are satisfied.