# air — Release Readiness Review (2026-11-02)

## Status: READY

189 tests passing (31 files). `npm run build` clean. `npx tsc --noEmit` clean.
CLI verified end-to-end (`air models`, `air status`, `air run`). Pushed to
`origin/main` as `radmanmilos`.

## What is implemented

### Core
- **Routing** — Priority-list candidate selection with exact skip reasons
  (cooldown_active, capability_mismatch, cannot_handle, tool_not_registered,
  already_visited, allow_list_blocked)
- **Failover with control** — Asks before switching by default; `--auto`
  switches within the allow-list only; never bypasses provider restrictions
- **Stream + buffer** — Live output while parsing for rate limits; bounded
  rolling buffer with truncation metadata; UTF-8 byte-accurate limits
- **Context handoff** — Mechanical git-state handoff packer (4KB diff cap,
  2KB tail cap, redaction); includes agent-produced untracked file content
- **MCP server** — Fully async stdio JSON-RPC with `run_task`,
  `get_task_status`, `get_task_output`, `approve_failover`, `cancel_task`,
  `get_status`
- **Safety** — Dirty-tree refusal by default (`--allow-dirty` opt-in);
  provider allow-list; hop cap; revisit prevention; verify trust gate
- **Success detection** — Uses actual workspace delta (git status/diff),
  not stdout length; pre-existing dirt is NOT counted as agent work
- **Process facts** — Timeout, cancellation, and spawn errors take
  precedence over stderr matching
- **Streaming redaction** — Secrets redacted per-chunk with a split-token
  guard window; UTF-8 boundaries handled

### New this session
- **Model catalog** — Lists every adapter's provider/model, capabilities,
  cost tier, and context window; `air models --best <task>` recommends the
  cheapest eligible model
- **Multi-session parallel** — `air run --sessions <t1> <t2>` runs multiple
  tasks concurrently, each on its own model, with independent job state and
  concurrency seats
- **Inter-process coordination** — Lock files with O_CREAT|O_EXCL atomic
  create and stale-lock (dead PID / mismatched start time) recovery;
  health flush and task-index append are concurrency-safe
- **Status/health semantics** — `air status` reports total successes,
  failures, success rate, and active cooldowns
- **Exit code table** — Single source of truth; SUCCESS=0, NO_CHANGES=1,
  ALL_EXHAUSTED=2, USER_CANCELLED=3, CONFIG_OR_DIRTY=4, TIMEOUT=5,
  FAILOVER_PROPOSED=6, TASK_FAILURE=7

## Adapters

| Adapter | Status | Verified |
|---|---|---|
| aider | enabled, headless | 0.86.2 |
| goose | enabled, headless | 1.57.0 |
| opencode | unverified spike | — |
| kilocode | unverified spike | — |
| codex | unverified spike | — |
| github-copilot | unverified spike | — |
| mock | test-only, injected explicitly | — |

## Known limitations

- MCP `approve_failover` flips state to SWITCHING but does not yet continue
  execution (pending G3-02)
- MCP `run_task` awaits the full process inside the tool handler (pending
  G3-12)
- opencode, kilocode, codex, and github-copilot are unverified spikes
- `npm run lint` is not configured (eslint not installed)
- `npm audit` reports only dev-only vulnerabilities (vitest/esbuild/eslint)

## Test inventory (31 files, 189 tests)

| File | Tests | Covers |
|---|---|---|
| behavior-spec.test.ts | 8 | End-to-end behavior contract |
| redaction.test.ts | 12 | Secret redaction patterns |
| streaming-redact.test.ts | 6 | Split-token guard window |
| health.test.ts | 9 | Health tracker + error policy |
| new-adapters.test.ts | 20 | opencode/kilocode/codex/github-copilot |
| router.test.ts | 8 | Candidate selection + allow-list |
| config.test.ts | 7 | Config loader + redaction |
| lock.test.ts | 6 | Inter-process lock |
| aider.test.ts | 8 | Aider adapter |
| catalog.test.ts | 5 | Model catalog |
| paths.test.ts | 5 | Path resolution |
| allowlist.test.ts | 6 | Provider allow-list |
| trace-rotation.test.ts | 3 | Trace rotation |
| adapter-conformance.test.ts | 8 | Adapter conformance |
| runner.test.ts | 8 | Process runner |
| redaction-chokepoint.test.ts | 7 | Redaction choke points |
| verify.test.ts | 7 | Verify hook + trust gate |
| atomic.test.ts | 4 | Atomic writes |
| fixtures.test.ts | 9 | Mock tool fixtures |
| concurrency.test.ts | 3 | Concurrency cap |
| goose.test.ts | 5 | Goose adapter |
| exit-codes.test.ts | 3 | Exit code table |
| task-state.test.ts | 2 | Task state persistence |
| mcp-async.test.ts | 6 | MCP async + output persistence |
| failover.test.ts | 2 | Failover gate |
| sessions.test.ts | 3 | Multi-session parallel |
| mcp.test.ts | 1 | MCP server start |
| mcp-job-lifecycle.test.ts | 4 | MCP job lifecycle |
| handoff.test.ts | 5 | Handoff packer |
| dirty-tree.test.ts | 5 | Dirty-tree + delta |
| adapter-gate.test.ts | 4 | Adapter gate |