# Evaluation fixture catalog

These files are the version-controlled scenario catalog and concrete synthetic payloads for the local-first model evaluation programme.

| File | Cases | Evaluated role or purpose |
|---|---:|---|
| coordinator.json | 20 | Expected coordinator action class and safe fallback |
| planner.json | 12 | Plan semantic oracles and invalid-graph rejection |
| tool-calling.json | 12 | Cross-role tool selection and policy oracle |
| coder.json | 8 | Bounded code-edit acceptance oracle using an isolated Node fixture |
| debugging.json | 8 | Concrete stack traces, diffs, source snippets and diagnostic oracles |
| reviewer.json | 10 | Synthetic seeded defects, evidence anchors and clean controls |
| summarizer.json | 8 | Concrete message transcripts, required facts and redaction constraints |
| embeddings.json | 10 | Labelled queries against a synthetic 12-document corpus |

## Format and use

- Every fixture has a stable ID. Do not recycle IDs; add new IDs for new cases.
- Inputs are synthetic and must remain free of private repositories, credentials and personal data. The secret-like value in S04 is a fake test canary, not a credential.
- \`expectedAction\`, \`oracle\`, \`expectedTool\`, \`expectedRelevantDocIds\` and \`policyOracle\` describe scoring criteria, not instructions to bypass runtime policy.
- Tool names in \`tool-calling.json\` are checked against \`packages/local-worker/air_local/tools/builtin.py\`. Update the fixture and this note if the public tool registry changes.
- The coder workspace lives under \`payloads/workspaces/coder-discount\`. The baseline intentionally has a failing test. Every repetition must use \`createEvalWorkspace('coder-discount')\`, which copies it into a new temporary directory. Never edit the shared fixture in place.
- \`tests/evals/helpers/workspace.ts\` rejects unsafe fixture names, path escapes and symlinks; cleanup removes only the temporary directory created by that invocation.
- \`tests/evals/workspace.test.ts\` proves source immutability, per-run isolation and cleanup. It is a fixture harness, not a model runner.
- The scenario catalogs and payloads still do not constitute an executable model benchmark. The repeatable runner, provider/model invocation, prompt versioning, resource metrics and scoring report remain L0-04c.
- The runner must record model tag/digest, prompt version, Ollama version, hardware, context, repetitions, raw outcomes, latency and measurable memory. Missing models are skipped with a reason; no fixture may auto-pull a model.
- See [the evaluation plan](../../../docs/architecture/local-first-evaluation.md) for metrics and proposed gates.
