# deepseek_plan_review.md

## Document metadata

- **Reviewer**: DeepSeek (correcting prior filename `grok_plan_review_*` — this review supersedes them all)
- **Target repository**: https://github.com/radmanmilos/air
- **Review date**: 2026-11-03
- **Status at review**: Release candidate. Full test suite green. README advertises nine new capabilities: model listing, best-model recommendation, multi-session parallel execution, inter-process coordination, byte-accurate output limits, streaming redaction, workspace delta detection, verify trust gating, and failover semantics.
- **Verification caveat**: Findings below are described by module and behavior, not hard line numbers, so they remain actionable as the code moves. Verify against current `main` before editing.
- **How to use**:
  - `MUST` = blocker for release-candidate sign-off.
  - `SHOULD` = recommended before public announcement.
  - `VERIFY` = existing fix that needs a proving test before sign-off.
  - Reference IDs (`DS-xx`) in commit messages and `PLAN.md`.

---

## 0. Verdict

The project is **feature-complete but not sign-off ready**. The architecture is strong and several prior concerns (inter-process locking, streaming redaction, byte-accurate tails) have been genuinely fixed. However, **three P0 defects from the previous review appear to remain**, and each one directly contradicts a claim the README now makes about the new features. Four P1 items need proving tests before the release candidate can be signed.

| Capability | Advertised behavior | Current risk | Release-blocking |
|---|---|---|---|
| Multi-session parallel execution | Honors `maxConcurrentAgents` | Cap may be hardcoded to `1` per session even though global counting exists | **Yes (DS-01)** |
| Model listing (`air models`) | Shows real availability | Catalog may mark every adapter `available: true` without consulting the registry | **Yes (DS-02)** |
| Best-model recommendation | Picks cheapest *eligible* model for the task | Recommender may ignore `task.readOnly` / `task.mode` | **Yes (DS-03)** |
| Inter-process coordination | Lock + stale-PID recovery | Implemented; needs concurrency proof | No (verify) |
| Byte-accurate output limits | Truncates without breaking UTF-8 | Implemented; needs multi-byte boundary test | VERIFY (DS-04) |
| Streaming redaction | Withholds secret prefixes across chunks | Implemented; needs invariant test under split secrets | VERIFY (DS-05) |
| Workspace delta detection | Detects agent-caused changes even under `--allow-dirty` | Needs proof for pre-existing dirty edits and untracked deletions | VERIFY (DS-06) |
| Verify trust gating | Refuses untrusted repo-supplied commands, symlinks included | Needs proof that realpath resolution is used | VERIFY (DS-07) |
| Failover semantics (MCP) | `approve_failover` continues execution | Needs end-to-end proof that second attempt actually runs | VERIFY (DS-08) |

**Sign-off rule**: do not publish the release candidate until DS-01 through DS-03 are fixed and DS-04 through DS-08 are proven with tests. If any VERIFY fails, escalate it to P0 and fix it.

---

## 1. What is working well (do not regress)

These are load-bearing and should be preserved:

- **Streaming redaction** with an overlap window and a `redact(prefix) + redact(suffix) === redact(whole)` invariant. This is a stronger guarantee than most implementations.
- **Inter-process locks** using `O_CREAT|O_EXCL`, stale-PID detection, and atomic reclaim.
- **Task-state persistence** using atomic writes and a locked index — correct approach for concurrent CLI + MCP.
- **Error taxonomy** (`src/types/errors.ts`) as a single source of truth with derived helpers; prevents policy drift between runner, router, and health.
- **Adapter registry** that separates "installed" from "verified" and excludes unverified adapters from routing while still letting `air status` report them.
- **Verify hook** that separates CLI-supplied commands from repo-supplied commands and refuses repo commands unless explicitly trusted.
- **Failover loop** integrated with the error taxonomy and structured tracing.
- **Byte-accurate tail caps** using a byte-counting utility rather than UTF-16 string length.

---

## 2. P0 blockers

### DS-01 — Multi-session concurrency cap is not wired to config

**Symptom**: `maxConcurrentAgents` in config is parsed and validated, but the multi-session path appears to call the seat-acquisition helper with a hardcoded `1` per session, and uses the session ID as the seat name. The global seat counter in `src/utils/concurrency.ts` counts all seat files correctly, so the *mechanism* is right, but the *cap value passed in* is wrong: the effective limit becomes `1` regardless of config.

**Impact**: `air --parallel N` never actually runs more than one agent. The README claim about concurrency seats is false in production.

**Change**:
- MUST read `config.concurrency.maxConcurrentAgents` and pass it into the seat-acquisition call instead of the literal `1`.
- MUST use a **single shared seat name** (e.g., `'agent'`) for the global pool, not the session ID. Otherwise the global count is correct but the cap comparison can never trip when each session has its own seat name.
- MUST use the same configured cap on both the CLI `--parallel` path and the MCP session manager.
- SHOULD expose current seat occupancy via `air status --json` so users can see the cap being respected.

**Tests**:
- Set `maxConcurrentAgents: 2`, launch 3 sessions, assert that at most 2 child processes are alive simultaneously.
- Confirm the test fails on current code and passes after the fix.

**Acceptance**: cap in config is the cap enforced; test proves it.

---

### DS-02 — Model catalog reports every adapter as available

**Symptom**: The catalog builder that feeds `air models` and `air models --best` appears to set `available: true` unconditionally, rather than consulting the adapter registry. Note that `check-models.ts` reportedly *does* consult the registry — so the split is that `air models` (the catalog) and `air models --best` (the recommender) disagree with `air status`.

**Impact**: users see uninstalled or unverified adapters listed as available; the recommender can pick one.

**Change**:
- MUST derive `available` from the adapter registry status (the same source used by `check-models.ts`) so `air models`, `air models --best`, and `air status` agree.
- MUST include a reason (`'not_installed'`, `'unverified'`, `'auth_required'`) when `available: false`.
- MUST still list unavailable adapters in `air models` for transparency, but the recommender must exclude them.
- SHOULD add a test that registers a mock adapter with `available: false` and asserts:
  - it appears in `air models` with `available: false` and a reason;
  - it is not returned by `bestModelFor`.

**Acceptance**: no code path marks an adapter available without consulting the registry.

---

### DS-03 — Best-model recommendation ignores task requirements

**Symptom**: The recommender's signature accepts `(catalog, task)` but the `task` parameter is unused. Eligibility appears to check only `available && headless`, so a read-only model can be recommended for a write task, and a model without code capability can be recommended for a coding task.

**Impact**: `air models --best` gives incorrect advice; users who follow it get a tool that cannot perform their task.

**Change**:
- MUST filter candidates by `task.readOnly`: if `readOnly === false`, require `capabilities.write === true`.
- MUST filter by `task.mode`: if `mode === 'auto'`, require `capabilities.headless === true`; if `mode === 'ask'`, do not require headless.
- SHOULD support an optional `requiresCode` flag on the task and require `capabilities.code` when it is true.
- MUST return `null` with a human-readable reason when no eligible model exists, rather than silently falling back to an ineligible one.
- MUST rank by cost **within** the eligible set, and document the ranking rule (cheapest eligible wins for now).

**Tests**:
- (a) read-only task does not select a write-only model;
- (b) write task does not select a read-only model;
- (c) `mode: 'auto'` excludes non-headless models; `mode: 'ask'` includes them;
- (d) no eligible model returns `null` with a reason.

**Acceptance**: all four tests pass and `bestModelFor`'s behavior matches the documented rule.

---

## 3. P1 verifications

These are existing fixes that need a proving test before sign-off. If a test fails, escalate to P0.

### DS-04 — Byte-accurate tails handle multi-byte UTF-8

Feed a buffer containing an emoji and a CJK character at the truncation boundary through the runner's tail-cap logic. Assert:
- the resulting `stdoutTail` and `stderrTail` decode cleanly (no `�` replacement characters);
- byte length ≤ configured `tailCap`.

Fails → escalate to P0 (this contradicts the "byte-accurate" claim).

---

### DS-05 — Streaming redaction holds under split secrets

Construct a token that spans a chunk boundary (e.g., first half in chunk 1, second half in chunk 2). Assert:
- the concatenated stream output contains no unredacted secret;
- the concat-invariant `redact(a) + redact(b) === redact(a+b)` holds for a representative set of split points;
- ordinary uppercase words (e.g., `HELLO`, `ERROR`, `WARNING`) are not delayed more than one chunk (this is a latency sanity check).

Fails on the invariant → escalate to P0.

---

### DS-06 — Workspace delta detects pre-existing edits and untracked deletions

Two tests:

1. Under `--allow-dirty`, dirty a file, run a mock agent that modifies it further. Assert delta is non-empty and the file is listed as changed.
2. Create an untracked file, run a mock agent that deletes it. Assert the delta lists it under `deleted`.

Plus a negative test:
3. Purely pre-existing dirt with no agent changes → empty delta (no false positives).

Fails → escalate to P0 (the "success detection" claim depends on this).

---

### DS-07 — Verify trust gate resolves symlinks

Create a symlink inside a trusted directory that points outside the trusted root. Run `air verify`. Assert the repo-supplied verify command is refused.

Also assert:
- a normal subdirectory of a trusted root **is** trusted;
- a `..`-containing path that escapes the root is refused.

Fails → escalate to P0 (security bypass).

---

### DS-08 — MCP failover continuation is end-to-end

Submit an MCP task that forces a rate-limit failover. Call `approve_failover`. Assert:
- a second execution attempt actually starts (not just a state transition);
- the second attempt produces a result;
- the trace stream records both attempts;
- cooldown for the first provider/model is set and visible via `air status --json`.

If continuation is *not* implemented, then instead:
- remove "full failover semantics" from README and MCP tool description;
- document the limitation in `docs/behavior-spec.md`;
- downgrade DS-08 from "verify" to "document".

---

## 4. Gated order

| Phase | Items | Gate |
|---|---|---|
| **A** | DS-01, DS-02, DS-03 | Concurrency cap uses config; catalog consults registry; recommender respects task shape. All four new tests green. |
| **B** | DS-04, DS-05, DS-06, DS-07, DS-08 | All verifications pass; any failure escalated and fixed. |
| **C** | Section 6 release checklist | Sign-off. |

Do not start Phase B until Phase A is green. Do not publish while any Phase B verification is open.

---

## 5. Anti-patterns to avoid

The implementation AI MUST NOT:

- Pass a hardcoded `1` as the concurrency cap when a configured `maxConcurrentAgents` exists.
- Use per-session seat names for a global resource pool.
- Mark an adapter available without consulting the registry.
- Recommend a model without checking write/read/headless eligibility against the task.
- Count only pre-run file *names* when deciding whether the agent changed a file.
- Trust a path by string prefix without resolving symlinks and `..`.
- Discard stderr from verify commands.
- Claim "full failover semantics" while MCP approval only flips state.
- Claim "release candidate" while DS-01 through DS-03 are open.

---

## 6. Release checklist

- [ ] DS-01, DS-02, DS-03 fixed with new tests.
- [ ] DS-04, DS-05, DS-06, DS-07, DS-08 verified (or DS-08 documented as a limitation).
- [ ] `npm run build && npm run typecheck && npm run typecheck:test && npm test` all green.
- [ ] README claims match behavior:
  - "concurrency seats" reflects the configured cap;
  - "`air models --best` picks the cheapest **eligible** model" reflects availability + task requirements;
  - "full failover semantics" reflects either continuation or the documented limitation.
- [ ] `docs/behavior-spec.md` includes the multi-session concurrency rule and the best-model eligibility rule.
- [ ] `CHANGELOG.md` written; `package.json` version bumped to match the release tag.
- [ ] One manual smoke test with a real aider binary: `air run` → forced rate-limit → failover proposal → cooldown visible in `air status --json`.
- [ ] `npm pack --dry-run` shows no `tests/` or cache files.
- [ ] Git tag created and pushed.

---

## 7. Out of scope (do not expand during this phase)

Track as post-release issues, not blockers:

- Keyword or LLM task classifier / scoring (only after real misroutes are observed).
- Opencode / kilocode adapters (only on user request; do not advertise).
- Worktree-based checkpointing (read-only diff snapshot is the mechanism).
- Cross-machine health/cooldown sync.
- GUI or TUI.
- Multi-repo orchestration.
- Automatic failover continuation in CLI without user action.
- Config schema v2 migration (only when a breaking change is needed).

---

## 8. Immediate next actions (Phase A)

1. **DS-01**: wire `config.concurrency.maxConcurrentAgents` into the seat-acquisition call in the multi-session path; switch to a shared seat name `'agent'`. Add the 3-session / cap-2 integration test.
2. **DS-02**: make the catalog builder consult the adapter registry for `available` and include a reason; add the unavailable-adapter test.
3. **DS-03**: implement `readOnly` and `mode` filters in `bestModelFor`; add the four task-shape tests.

After Phase A passes, run the Phase B verifications. If all pass, execute the Section 6 release checklist and tag.

---

## 9. Honest caveats

- Findings are described by module and behavior, not exact line numbers, because the codebase moves quickly. Verify against current `main` before editing.
- Phase A items are small wiring changes; do not over-engineer them. The hard part is the proving tests, not the fix.
- The most likely "surprise" items are DS-06 (workspace delta under pre-existing dirt) and DS-07 (symlink bypass). If either is broken, treat as security- or correctness-critical and stop the release until fixed.
- If any prior review artifact conflicts with this one, this one wins for forward-looking work. Keep prior artifacts as history.

---

*End of document. Future findings should be appended as `deepseek_plan_review_2.md`, not merged into this file.*