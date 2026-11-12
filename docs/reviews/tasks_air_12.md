# AIR — Task List: absorb MakeingGoodAIs as `packages/local-worker`

**Source:** plan discussion (2026-11-11)
**Decision:** monorepo; AIR is the control plane, the retained MGAI subset is an
internal local worker. `air` is the only user-facing interface.

## Scope rule

Take MGAI's **tools and local model transport**, not its orchestration:

- Keep: `ollama_client.py`, `agent_loop.py`, `tools/{registry,files,web,git_tools,builtin,code_analysis}.py`,
  `tools/shell.py` (rewritten), `autonomy/{templates,doc_generator,test_generator}.py`.
- Drop: router, orchestrator, planner, executor, critic, result_verifier,
  self_improve, multi_agent, approval, guardrails, scheduler, memory, senses,
  interfaces, voice, plugin_system, `mgai.py`, `mgai.bat`, `METADATA.md`.

## M0 — Baseline truth and green tests [DONE]

### T12-001 [DONE] — E-04 parallel job id assertion
- Files: `tests/e2e/scenarios/groups.test.ts`
- `waitForLine`'s second argument is a time offset, not a line index. The test
  passed `0` twice and re-matched the first "Started job" line. Search strictly
  after `m1.t`.

### T12-002 [DONE] — F-02 conversation persistence
- Files: `tests/e2e/scenarios/groups.test.ts`
- Conversation ids are UUIDs (`src/conversation/index.ts` `assertId`); the test
  extracted `run-...`, producing an empty id and `conversations/.json`. Extract
  the UUID and assert it is non-empty.

### T12-003 [DONE] — Version truth
- Files: `src/index.ts`, `bin/air.ts`
- `src/index.ts` is the single version source (0.2.0); CLI `--version` and
  `air status --json` use it.

### T12-004 [DONE] — README / commands / adapter table truth
- Files: `README.md`, `bin/air.ts`, `docs/behavior-spec.md`, `PLAN.md`
- Removed the unimplemented `--allow-paid` claim; documented `air merge`;
  adapter verification table now matches `src/adapters/registry.ts`.

### T12-005 [DONE] — Deterministic e2e fixtures and honest git oracle
- Root cause of two flakes: `real-jobs.test.ts` wrote into the shared
  `tests/e2e/fixtures/minimal` on every call, while other test files copied the
  same directory. A copy taken mid-write landed dirty, so write jobs were
  refused as dirty-tree (E-04 timed out waiting for "Started job") and MCP saw
  phantom changes.
- Fixes: fixtures are read-only inputs; `createSandbox` establishes the git
  baseline in the copy (`tests/e2e/harness/sandbox.ts`), with regression tests.
- `oracles.gitChangedFiles` trimmed the raw porcelain output before slicing the
  status columns, turning `Program.cs` into `rogram.cs`; it now parses lines
  without trimming and resolves rename destinations.
- Write jobs fail closed: `createWorktree` retries/prunes and
  `Orchestrator.start` throws `Workspace isolation failed` instead of running a
  write task in the source tree (`tests/worktree-failclosed.test.ts`).
- `Orchestrator.persist` no longer leaves a rejected lock promise unhandled.

## M1 — Monorepo absorption [DONE]

### T12-010 [DONE] — Subtree import
- `git subtree add --prefix packages/local-worker ../MakeingGoodAIs master`
  (commit `137e0a4`). Full history preserved; `git log --follow` reaches
  pre-absorb commits.

### T12-011 [DONE] — Prune to the retained subset
- Kept `air_local/{ollama,loop,models,policy}.py`,
  `air_local/tools/{registry,files,shell,web,git,ollama_tools,code_analysis,builtin}.py`,
  `air_local/scaffold/{templates,doc_generator,test_generator}.py`.
- Dropped orchestrator/planner/executor/critic/verifier/self-improve/
  multi-agent/approval/guardrails/scheduler/memory/senses/interfaces/voice/
  plugin system, `mgai.py`, `mgai.bat`, and the MGAI top-level docs.

### T12-012 [DONE] — Rename package `src` → `air_local`
- Imports rewritten to `air_local.*`; `tools/git_tools.py` → `tools/git.py`.
- `tests/test_smoke.py::test_no_stale_imports` fails on `from src.`,
  `import src.`, or references to dropped subpackages.

### T12-013 [DONE] — Python CI job + AGENTS.md polyglot checklist
- `.github/workflows/ci.yml` job `python` on Ubuntu + Windows, Python 3.12 and
  3.14, running `ruff`, `mypy air_local`, `pytest`.
- `AGENTS.md` validation checklist gains the three Python commands.

## M2 — Harden the retained worker [DONE]

### T12-020 [DONE] — Shell tool: argv, allowlist, cwd jail
- `tools/shell.py`: no `shell=True`; `shlex` split, allowlisted binaries,
  metacharacters rejected, cwd resolved inside the job root.

### T12-021 [DONE] — State and cwd isolation
- `air_local.policy` owns the job root; no `os.chdir`.
- Config resolves via `AIR_LOCAL_CONFIG`, then the bundled `config.yaml`.
- Entrypoint flags (`--cwd`, `--state-dir`) land with T12-031.

### T12-022 [DONE] — No interactive approval
- `loop.py` has no `input()` and no approval import; `policy` flags decide
  write/shell access.

### T12-023 [DONE] — Tests for read-only and denial
- `tests/test_policy.py`, `test_files.py`, `test_shell.py`, `test_scaffold.py`:
  read-only writes change nothing, shell denied by default, cwd/path escapes
  refused, protected files refused.


## M3 — Contract and headless entrypoint [DONE]

### T12-030 [DONE] — `contracts/job.schema.json`
- Request/result definitions, `x-contractVersion: 1`, `x-exitCodes`. The file is
  the only contract; neither side keeps a copy.
- `contracts/examples/cases.json` holds valid/invalid payloads that both test
  suites read.

### T12-031 [DONE] — `python -m air_local.run --request --result`
- Atomic result file (temp + replace), logs only to stderr, stdout empty.
- Exit codes: 0 COMPLETED, 2 INVALID_REQUEST, 3 WORKER_FAILED, 4 CANCELLED,
  5 PROVIDER_UNAVAILABLE. Signals map to CANCELLED; connection/timeout/HTTP
  404/429/5xx map to PROVIDER_UNAVAILABLE.
- Accepts a UTF-8 BOM in the request file (Windows editors write one).

### T12-032 [DONE] — `air setup local` and `air doctor`
- `air setup local` creates `cacheDir/worker/venv` and installs the bundled
  package with `pip install --editable` (a copied install would break the
  contract/config walk-up). Idempotent via `install.json`; `--force` recreates.
- `air doctor` checks Python (>= 3.12), venv, worker import, Ollama
  `/api/version`, and `/api/tags`; `--offline` skips the network checks.
- `air status` reports whether the local worker is provisioned.
- Verified end-to-end on this machine: provision -> `python -m air_local.run`
  -> COMPLETED with `answer: "pong"` against `qwen3.5:4b`.

### T12-033 [DONE] — Contract tests on both sides
- Python (`tests/test_contract.py`, `tests/test_run.py`) and TypeScript
  (`tests/contracts.test.ts`) validate the same schema and the same shared
  examples. `unsupported_keywords` / `unsupportedKeywords` fail the tests if the
  schema grows a keyword the validators do not implement.
- `tests/worker-provision.test.ts` covers pure helpers and doctor; the real
  provisioning test is opt-in with `AIR_PROVISION_TEST=1` and passes locally.

## M4 — AIR adapter

### T12-040 [ ] — `src/adapters/local.ts`
- Implements `AgentAdapter`; `buildCommand` writes the request file and passes
  `--request/--result`; structured `classifyError` with `UNKNOWN` fallback.

### T12-041 [ ] — Registry + catalog
- `META` (verified, no exact-version lockout), `FACTORY`, `EXE`; catalog
  `costTier: 0`; availability probe via the worker's doctor output.

### T12-042 [ ] — Tests
- Adapter conformance, fake-shim unit tests, env-gated integration test,
  failover on `PROVIDER_UNAVAILABLE`.

## M5 — Apply UX, docs, decommission

### T12-050 [ ] — Explicit apply
- After a write job, print one loud next step with `air merge <id>`; `--apply`
  opt-in only.

### T12-051 [ ] — Documentation
- `docs/adapters/local.md`, README, `air status`, MCP `list_adapters`.

### T12-052 [ ] — Decommission MakeingGoodAIs
- Tag `final-before-absorb`, push the subtree, then delete the GitHub repo.
