# AIR - Complete Task List from Reviews 5
Generated: 2026-11-03
Sources:
- docs/reviews/chatGPT_plan_review_5.md (R6-01..R6-09)
- docs/reviews/claude_plan_review_v5.md (H-02,H-03,H-04,H-05,H-06,H-07,H-08,H-09,H-10,H-11,H-12,H-13,H-14,H-15,H-16,I-01,I-02,I-03,I-04,I-05)
- docs/reviews/deepseek_plan_review_5.md (DS-01..DS-08)
- docs/reviews/grok_plan_review_5.md (G5-01..G5-13)

All work in E:\\GitHub\\air. Archive review files when all related tasks are complete and tests pass.

## P0 - Critical (Blockers)

### P0-1 Cross-process concurrency (locks + seats)
- [x] [G5-01][H-02][R6-01][R6-02] Fix lock stale detection: never compare holder.start to PROCESS_START; use PID liveness + ownership token/heartbeat; fixed slot files for global pool. Files: src/utils/lock.ts, src/utils/concurrency.ts
- [x] [DS-01][G5-02] Enforce global concurrency cap from config.maxConcurrentAgents; use shared seat namespace (not per-session unique ids); pass cap correctly. Files: src/execution/sessions.ts, src/utils/concurrency.ts, bin/air.ts
- [x] [G5-03][H-05] Unsafe same-cwd parallel writes: refuse multi-session writes on same cwd unless readOnly or isolated; plan worktree isolation; tests for refusal. Files: src/execution/sessions.ts, bin/air.ts
- [x] [H-02] Multi-process tests: 4 processes x 20 increments = 80; cap enforced across processes; SIGKILL recovery; no ignored seat/lock timeouts.

### P0-2 Routing, allow-list, failover
- [ ] [R6-03][H-06][DS-08][G5-08] Separate discovery from auth; derive allow-list from actual first candidate; real candidate proposals (no hardcoded goose); bind approval to exact proposal hash; --allow-provider/consent; built-CLI e2e.
- [x] [DS-02][G5-04] Model catalog: derive available from registry (agree with air status/check-models), reasons when unavailable, exclude unavailable from best.
- [x] [DS-03][G5-04] Best-model: respect task.readOnly/mode/capabilities (write/read/headless), filter before ranking, return null with reason if none eligible.

### P0-3 MCP protocol + output
- [x] [R6-05][H-04] MCP stdout only JSON-RPC: remove process.stdout writes from runAttempt in MCP mode; persist redacted output to disk; get_task_output returns it with offsets; real stdio test.

### P0-4 Trust, verify, handoff, permissions
- [x] [R6-04][H-07] trustedRepos global-only (ignore in repo); canonicalize paths (realpath) before compare; checkVerifyTrust requires source; no execFileSync; tree-kill. Tests: repo tries to trust self -> refused.
- [x] [H-07][I-01] Repo config cannot set global-only keys (failover.mode/allowProviderSwitch, privacy, redaction, permission, tools[].executable, trustedRepos, concurrency, verify) - warn and ignore.
- [x] [R6-07][R6-08][H-15][G5-07] Redact handoff fully (tracked diff + untracked contents); fix ESM require -> import; preview destination/size before consent; bind approval to payload.
- [ ] [I-01][H-03] Permissions: wire permission config, adapter enforcement/refusal, read-only not routed to non-enforcing, no broad flags in unverified.

## P1 - High
### P1-1 Redaction/streaming/output
- [ ] [R6-06][H-09] Streaming redactor: case-insensitive prefix/guards, unbounded withheld buffer fixed, UTF-8 string decoding safe, property tests for split boundaries.
- [ ] [H-10][G5-05] Byte-accurate limits: Buffer-based accumulation, UTF-8 boundary safe, ring buffer tail, truncation flags in state/MCP.
### P1-2 Deltas/tests/isolation
- [ ] [H-11][G5-06] Delta detection by content fingerprints; track untracked deletions; pre-existing dirt not counted.
- [ ] [I-02][F-16][G5-09] Test isolation: AIR_CONFIG_DIR/AIR_CACHE_DIR per test, global setup, guard real cache writes; make tests parallel-safe; real stdio MCP test.
- [ ] [H-14] Adapter-gate must inject/mock or use fixtures, not rely on host tools.
### P1-3 Orchestrator/sessions
- [ ] [H-13] Extract src/orchestrator/runTask with DI; unify CLI/MCP/sessions.
- [ ] [H-05][R6-09] Sessions: one worktree per write session or refuse same-cwd writes; route through orchestrator; correct exit codes; guard empty adapters.
- [ ] [H-03] Adapter construction from config without prototype loss; pass configured model/executable to argv.

## P2 - Polish
- [ ] [H-08] Signal handling, process tree kill, CANCELLED state.
- [ ] [H-12][G5-13] Model recommender scoring improvements, cost overrides.
- [ ] [I-03][I-04][I-05] Import rewrite robustness/NodeNext, docs accuracy, verify arg parsing.
- [ ] [G5-10][G5-11][G5-12] Docs polish, seat backoff, MCP restart behavior docs.
