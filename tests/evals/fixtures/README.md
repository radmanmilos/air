# Evaluation fixture catalog

These JSON files are the initial version-controlled scenario catalog for the local-first model evaluation programme.

| File | Cases | Role |
|---|---:|---|
| coordinator.json | 20 | Expected coordinator action class and safe fallback |
| planner.json | 12 | Plan semantic oracles and invalid-graph rejection |
| tool-calling.json | 12 | Expected registered worker tool and policy oracle |
| coder.json | 8 | Bounded code-edit acceptance oracle |
| debugging.json | 8 | Root-cause and regression-repair oracle |
| reviewer.json | 10 | Seeded-defect detection and clean controls |
| summarizer.json | 8 | Preservation of facts, constraints and provenance |
| embeddings.json | 10 | Retrieval relevance oracle |

## Format and use

- Every fixture has a stable ID. Do not recycle IDs; add new IDs for new cases.
- Inputs are synthetic and must remain free of private repositories, credentials and personal data.
- \`expectedAction\`, \`oracle\`, \`expectedTool\` and \`policyOracle\` describe scoring criteria, not instructions to bypass runtime policy.
- Tool names in \`tool-calling.json\` are checked against \`packages/local-worker/air_local/tools/builtin.py\`. Update the fixture and this note if the public tool registry changes.
- The coder suite references \`tests/e2e/fixtures/minimal\` as a source fixture. The future runner must copy it into a fresh temporary workspace per repetition; never edit the shared fixture in place.
- The case catalog is not yet an executable benchmark harness. Some suites (debugging, reviewer, summarizer and embeddings) still need concrete input payloads/corpora and labelled outputs. Do not report a model score from these descriptors alone.
- The runner must record model tag/digest, prompt version, Ollama version, hardware, context, repetitions, raw outcomes, latency and measurable memory. Missing models are skipped with a reason; no fixture may auto-pull a model.
- See [the evaluation plan](../../../docs/architecture/local-first-evaluation.md) for metrics and proposed gates.
