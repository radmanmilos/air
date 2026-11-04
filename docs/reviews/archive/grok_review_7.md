# grok_plan_review_7.md

> **Document type:** Full review + next implementation plan (single file)  
> **Target repository:** https://github.com/radmanmilos/air  
> **Tip reviewed:** `main` @ `e19aeadb4edfd8f43efa3dd266e0746cb0b3e5f3`  
> **Motto:** *AIR is free and so are we*  
> **Product goal:** One super-agent face; free hands in the background; non-blocking conversation; best free tool/model per job; coherent results  
> **Review date:** 2026-11-04  
> **Instruction priority:** Safety and correctness > real conversation loop > free-first enforcement > polish  

---

## 0. Instructions to the implementation agent

1. Read this with the live tree, `README.md`, `PLAN.md`, `AGENTS.md`, `docs/behavior-spec.md`.
2. Inspect the repository before changing anything.
3. Keep the project buildable and testable after every change.
4. Prefer free (costTier 0 / catalog free / local) before paid unless the user explicitly opts in.
5. Work only inside the `air` repository.
6. Never discard user changes, auto-commit, auto-push, or rewrite history unless the user explicitly requests it.
7. A feature is done only when implemented, tested, and reflected in README/behavior-spec/CLI help.

### Validation checklist (every task)

- `npm run typecheck`
- `npm run typecheck:test`
- `npm run lint`
- `npm test`
- `npm run build`
- Docs updated if user-facing behavior changed

---

## 1. Executive assessment

**Honest position:** The **scaffold** for the super-agent vision is largely in place. The **behavior** that makes it feel like one agent is still thin.

| Vision piece | Code present? | Actually works end-to-end? |
|--------------|---------------|----------------------------|
| Durable conversation store | Yes (`src/conversation/`) | Yes (persist/load/append) |
| `air chat` REPL | Yes | **Stub** — most messages only get “Acknowledged.” |
| Non-blocking `/run` from chat | Yes | Partial — starts job; **no background completion → injectResult** |
| MCP `chat_send` / `get_conversation` | Yes | Stub assistant text only |
| Action schema (answer / spawn / cancel / status / clarify) | Yes | **Not wired** into chat decision path |
| Planner (`planFromRequest`) | Yes | Heuristic only; weakly integrated |
| Result compiler | Yes | Exists; not automatically driving chat replies |
| Free-first sort in router | Yes | Sort by costTier; freeOnly preference not fully enforced as hard gate |
| Worktree isolation for writes | Yes | Real `git worktree` |
| Orchestrator + failover + seats + delta success | Yes | Mature |
| Adapters | 2 verified routed (aider, goose); others visible unverified | Matches README Known limitations |

**Distance to goal:**  
Infrastructure ~**80–85%**. Product experience of “one free agent you can keep talking to” ~**40–50%**.

The next work is **not** more adapters. It is **closing the loop**: message → decide → (answer | plan | spawn) → monitor → compile → inject into conversation → notify user.

---

## 2. What landed since review 6 (G6)

| G6 item | Status |
|---------|--------|
| G6-01 Conversation thread | **Done** — `Conversation`, messages, facts, activeWorkIds, disk persist |
| G6-02 Non-blocking follow-ups | **Scaffold only** — chat accepts lines; jobs not watched to completion |
| G6-03 Free-first policy | **Partial** — router sorts by costTier; no hard freeOnly gate / paid consent path fully productized |
| G6-04 Result compilation | **Done as module** — not fully glued to chat/MCP completion path |
| G6-05 Context preservation rules | **Partial** — conversation survives; worker prompts not yet built from thread summary/facts |
| G6-06 README contradictions | **Improved** — verified vs unverified tables consistent with Known limitations |
| G6-07 MCP conversation tools | **Partial** — `chat_send` / `get_conversation` exist; no job linkage or compile inject |
| G6-08 Delegation planner | **Done as module** — keyword heuristics |
| G6-09 Install UX | Present (catalog/installer); not re-audited in depth this pass |
| Worktrees (beyond G6) | **Done** — real git worktrees per write job |

---

## 3. Critical gaps (P0)

### G7-01 — Wire the front-agent decision loop (P0)

**Problem:** `air chat` and MCP `chat_send` do not use `ActionSchema` / planner. Non-`/run` messages get a fixed “Acknowledged.”

**Required:**

1. On each user message (chat REPL + MCP `chat_send`):
   - Append user message to conversation.
   - Produce an `Action` (start with deterministic heuristics + optional future LLM front-agent):
     - control (`/status`, cancel, clarify) → handle locally
     - pure Q&A with no workspace need → `answer`
     - workspace / code work → `spawn_job` (via planner)
   - Never block the input loop on long jobs.
2. `spawn_job`:
   - `planFromRequest(goal, hints)`
   - For each ready work item: start orchestrator job; push `runId` to `activeWorkIds`
   - Append assistant message: short ack + job id(s)
3. Reject invalid actions via Zod (`parseActions`).

**Acceptance:**

- Message “what is a mutex?” → assistant answer, no job.
- Message “fix the bug in src/x.ts” → spawn job, ack with runId, REPL still accepts input.
- Tests for both paths with mock orchestrator or mock adapter.

### G7-02 — Job completion → compile → injectResult → notify (P0)

**Problem:** Started jobs are not joined back into the conversation automatically.

**Required:**

1. Background waiter (per job) or shared poller in chat process:
   - When orchestrator session reaches terminal state → `compileJobResult(facts)` → `injectResult(convId, summary, runId)`.
   - Remove runId from `activeWorkIds`.
   - Print a single line in REPL: `job <id> finished: <one-line summary>`.
2. MCP: either document polling (`get_conversation` + job status) or add `get_job_result` / push via existing task status tools linked by `workId`.
3. Idempotent inject (same runId does not double-append).

**Acceptance:**

- Integration test: `/run` mock job → conversation gains tool/job message with compiled text.
- Restart-safe: if chat process dies, `air chat --resume` can reconcile activeWorkIds from orchestrator/task state (at least mark orphaned jobs).

### G7-03 — Free-only hard gate (P0)

**Problem:** Preference fields exist (`userPreferences.freeOnly`) but routing does not clearly **refuse** paid when freeOnly is true and a free capable candidate exists—or force approval when only paid remains.

**Required:**

1. Config + conversation prefs: `freeOnly` default true; `paidFallbackRequiresApproval` default true.
2. Router / orchestrator:
   - When freeOnly: filter to costTier 0 (local / `:free` / catalog free) after capability checks.
   - If none eligible and paidFallbackRequiresApproval: surface proposal (ask), do not silently use paid.
   - `--allow-paid` / user approval clears the gate for that turn or conversation.
3. `air models --best` explains free preference and skips.
4. Tests: free+paid eligible → free wins; freeOnly + only paid → no silent paid route.

**Acceptance:** Unit + route-test coverage; README states the policy once without contradiction.

### G7-04 — Worker prompt from conversation context (P0)

**Problem:** Jobs are started with the raw task string; thread summary/facts are not used.

**Required:**

1. When spawning, build worker prompt from:
   - user goal
   - optional `conversation.summary` + last N facts (bounded, redacted)
   - explicit file hints if any
2. Do **not** dump full message history or secrets into workers.
3. On job completion, update `facts` with 1–3 short factual bullets from delta/compiler (not model prose).

**Acceptance:** Test that spawn includes summary/facts when present; redaction applied.

---

## 4. High priority (P1)

### G7-05 — Chat UX completeness

- Commands: `/status`, `/jobs`, `/cancel <id>`, `/run`, `/plan <goal>`, `/quit`, `/help`
- Show conversation id on start; support `--resume`
- On job finish, optional `/last` to reprint compiled result
- Windows-safe readline behavior

### G7-06 — MCP parity

| Tool | Behavior |
|------|----------|
| `chat_send` | Full decision loop (not only ack) |
| `get_conversation` | Return thread (redact secrets in content if needed) |
| `list_conversations` | ids + updatedAt + title |
| `list_jobs` / reuse task status | Filter by conversation activeWorkIds |
| `approve_failover` | Unchanged; link runId to conversation if known |

### G7-07 — Planner quality (light)

- Prefer single write work item unless parallel read-only is clear
- Sequential: review → edit when both match
- Never schedule two writers on one cwd without worktree isolation (worktree path already exists—use it in orchestrator start for write jobs)

### G7-08 — Result compiler richness

- Include delta file list, verify PASS/FAIL, duration, adapter id (optional/verbose flag)
- Keep default user-facing text short
- Always run through `redact`

### G7-09 — Worktree lifecycle

- Create worktree for write jobs; run adapter with `cwd = worktreePath`
- On success: define merge policy (explicit `air merge <jobId>` vs auto)—**recommend explicit merge for v1**
- On failure/cancel: remove worktree; do not leave branches forever (GC command or TTL)
- Tests with real git repo in temp dir

### G7-10 — Front-agent without paying by default

MVP may stay heuristic (keywords + ActionSchema). If a model is used for the front agent later:

- Prefer local/free model only
- Structured output must validate against ActionSchema
- Fallback to heuristics on parse failure

---

## 5. Medium priority (P2)

### G7-11 — Conversation summary compaction

When messages > N, compact older turns into `summary` + keep recent raw messages. Redact before store.

### G7-12 — Dashboard links conversations

Show conversation id, active jobs, last message ts in `air dashboard`.

### G7-13 — Behavior-spec update

Document `air chat`, MCP chat tools, freeOnly policy, worktree merge policy.

### G7-14 — E2E smoke path

Optional script: create temp git repo → `air chat` scripted lines → mock or real aider if present → assert conversation file contains compiled result.

---

## 6. Explicit non-goals (this plan)

- Web UI
- Daemon/IPC bus (file-based state remains OK for v1)
- Treating unpaid “verified” marketing claims without CI smoke
- Multi-writer same worktree
- Trusting worker “Done” text as success
- Expanding paid providers as defaults

---

## 7. Implementation plan (ordered tasks)

### Phase A — Close the conversation loop (do first)

| ID | Task | Deliverable | Tests |
|----|------|-------------|-------|
| A1 | Decision function `decide(message, conv) → Action[]` | `src/conversation/decide.ts` (or extend actions) | unit: Q&A vs spawn vs status |
| A2 | Wire `air chat` to decide + spawn + ack | `bin/air.ts` | integration with mock |
| A3 | Job waiter + `compileJobResult` + `injectResult` | chat process helper | integration: job completes → tool message |
| A4 | Wire MCP `chat_send` same as decide path | `src/mcp/server.ts` | mcp test |
| A5 | Reconcile `activeWorkIds` on `--resume` | conversation + orchestrator | unit |

**Exit Phase A:** User can chat, run work, keep typing, and see compiled results appear in the thread without restarting.

### Phase B — Free-first as law

| ID | Task | Deliverable | Tests |
|----|------|-------------|-------|
| B1 | Router/orchestrator freeOnly filter + paid approval | router + config schema | route matrix |
| B2 | Surface policy in `air models --best` and route-test | CLI | unit |
| B3 | Docs single policy statement | README, behavior-spec | — |

**Exit Phase B:** No silent paid routing when freeOnly is on.

### Phase C — Context + worktrees

| ID | Task | Deliverable | Tests |
|----|------|-------------|-------|
| C1 | Build worker prompt from summary/facts | orchestrator start path | unit |
| C2 | Write jobs always use `createWorktree` | orchestrator/sessions | workspace tests |
| C3 | `air merge <jobId>` or documented auto-merge | CLI | git integration test |
| C4 | Fact extraction from compiled delta | conversation update | unit |

**Exit Phase C:** Write isolation is real end-to-end; thread facts improve follow-ups.

### Phase D — Polish

| ID | Task | Deliverable |
|----|------|-------------|
| D1 | Chat slash commands + help | CLI |
| D2 | MCP list_conversations / list_jobs | MCP |
| D3 | Dashboard shows conversations | CLI |
| D4 | Summary compaction | conversation |
| D5 | E2E smoke doc/script | docs/scripts |

---

## 8. Architecture (target state after this plan)

```
User
  │
  ├─ air chat / MCP chat_send
  ▼
Conversation (durable thread)
  │ decide() → Action
  ├─ answer / clarify / status / cancel
  └─ spawn_job → Planner → work items
                    │
                    ▼
              Orchestrator (failover, seats, health)
                    │
        ┌───────────┼───────────┐
        ▼           ▼           ▼
   Worktree     Adapter      Runner
   (writes)     (free-first) (redact)
        │           │           │
        └───────────┴───────────┘
                    │
                    ▼
            Result compiler
                    │
                    ▼
         injectResult → Conversation
                    │
                    ▼
              User notified
```

---

## 9. Definition of done (product)

The goal is met for v1 when all are true:

1. User talks only to AIR (`air chat` or MCP chat tools).
2. Follow-ups work while jobs run.
3. Results show up as compiled messages in the same conversation.
4. Free tools/models are preferred; paid needs consent when freeOnly.
5. Write jobs use real worktrees; success still from workspace delta.
6. Secrets stay redacted.
7. README / behavior-spec match reality.
8. CI green on clean clone.

---

## 10. Summary for the human

**What you achieved:** The modules named in review 6 exist—conversation store, planner, compiler, worktrees, chat command, MCP stubs, free-first sort. That is real progress.

**What is next:** Stop expanding surface area. **Close the loop.**

1. Decide instead of “Acknowledged.”  
2. When jobs finish, compile and inject into the conversation.  
3. Enforce free-only for real.  
4. Feed thread facts into workers; isolate writes with worktrees end-to-end.

After Phase A–C, AIR will feel much closer to “one free agent” instead of “a capable orchestrator with a chat stub on top.”
