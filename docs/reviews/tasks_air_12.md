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

## M1 — Monorepo absorption

### T12-010 [ ] — Subtree import
- Command: `git subtree add --prefix packages/local-worker ../MakeingGoodAIs master`
- Preserve full history; one commit.

### T12-011 [ ] — Prune to the retained subset
- Delete everything outside the keep list, plus `mgai.egg-info/`,
  `.pytest_cache/`, `METADATA.md`, `mgai.py`, `mgai.bat`.
- One commit. Dropped files remain reachable through the subtree merge.

### T12-012 [ ] — Rename package `src` → `air_local`
- Rewrite `from src.` → `from air_local.`; keep `tests/` working.
- Add a test that fails on stale `from src.` imports.

### T12-013 [ ] — Python CI job + AGENTS.md polyglot checklist
- `.github/workflows/ci.yml`: `pytest`, `ruff`, `mypy` on Python 3.12/3.14,
  path-filtered.
- `AGENTS.md` validation checklist gains the Python commands.

## M2 — Harden the retained worker

### T12-020 [ ] — Shell tool: argv, allowlist, cwd jail
- `tools/shell.py`: no `shell=True`; split with `shlex`, enforce allowlist,
  resolve cwd inside the job root.

### T12-021 [ ] — State and cwd isolation
- `--cwd` respected (no `os.chdir(ROOT)`); explicit `--state-dir`; config via
  `AIR_LOCAL_CONFIG`.

### T12-022 [ ] — No interactive approval
- Headless path never calls `input()`; policy flags decide write/shell access.

### T12-023 [ ] — Tests for read-only and denial
- Read-only run writes nothing; shell denied when not allowed; cwd escape
  refused.

## M3 — Contract and headless entrypoint

### T12-030 [ ] — `contracts/job.schema.json`
- Request/result schema, `contractVersion: 1`, exit-code table.

### T12-031 [ ] — `python -m air_local.run --request --result`
- Result file, not stdout; logs to stderr; stable exit codes.

### T12-032 [ ] — `air setup local` and `air doctor`
- Provision a cache venv from the bundled package; report Python, venv, Ollama,
  and model status.

### T12-033 [ ] — Contract tests on both sides
- Python validates against `../../contracts/job.schema.json`; TypeScript
  validates the same file.

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
