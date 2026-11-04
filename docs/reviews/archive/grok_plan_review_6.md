# grok_plan_review_6.md

> **Document type:** Full vision-aligned implementation review  
> **Target repository:** https://github.com/radmanmilos/air  
> **Tip reviewed:** `main` @ `947428fa8067250f9b7b540e99a6517c1ffb4327`  
> **Motto:** *AIR is free and so are we*  
> **Product target:** One super-agent that accepts work, orchestrates free tools/models across sessions, monitors execution, returns results, and preserves a single conversational feel for the user while background work continues.  
> **Review date:** 2026-11-04  
> **Instruction priority:** Safety and correctness > free-first routing > seamless user conversation > parallel efficiency > feature breadth  

---

## 0. Instructions to the implementation agent

1. Read this with the live tree, `README.md`, `PLAN.md`, `docs/behavior-spec.md`, `config/catalog.json`, `src/orchestrator/orchestrator.ts`.
2. Inspect the repository before changing anything.
3. Keep the project buildable and testable after every change.
4. Prefer free (costTier 0 / catalog-tagged free / local) candidates before paid ones unless the user explicitly opts into paid.
5. Work only inside the `air` repository.
6. Never discard user changes, auto-commit, auto-push, or rewrite history unless the user explicitly requests it.
7. Do not expand paid-provider defaults. Free-first is a product constraint, not a slogan.

### Definition of done for the super-agent vision

| User experience goal | Technical requirement |
|----------------------|----------------------|
| Feels like one agent | Persistent **conversation thread** (user-facing context) independent of which backend tool/model ran |
| Work can run in the background | Jobs are async; user can send follow-ups without blocking on the current run |
| Follow-ups stay coherent | Thread memory + optional “active job” summaries injected into the next turn |
| Best free tool/model for the job | Router ranks **free + capable + healthy** before paid; catalog + health + capabilities drive choice |
| Result comes back cleanly | Monitor → compile (delta, status, redacted output) → attach to thread as one reply |
| Safe | Dirty-tree, seats, isolation, redaction, allow-list, hop caps unchanged |

---

## 1. Executive assessment

**What AIR is today:** A strong **headless multi-tool orchestrator** (CLI + MCP) with routing, failover, mechanical handoff, sessions, seats, free-adapter catalog/installer, dashboard, and resume-by-runId.

**What the new vision needs:** A **conversation-shaped super-agent layer** on top of that orchestrator so the user never has to think about tools, models, or waiting.

| Layer | Status |
|-------|--------|
| Process runner, redaction, delta success, errors, exit codes | **Mature** |
| Adapters (6 verified per latest commit) + registry gate | **Mature** (README still has contradictory “unverified” text — fix) |
| Free catalog + install/upgrade/uninstall | **Present** |
| Orchestrator brain (single failover loop, session log) | **Present — foundational** |
| Global concurrency seats (PID-stale reclaim) | **Fixed vs prior review** |
| Multi-writer same-cwd refusal | **Present** |
| User conversation thread / chat continuity | **Missing** |
| Non-blocking follow-ups while jobs run | **Partial** (MCP async; CLI still waits on single `run`) |
| Unified “compile result into one reply” for chat UX | **Partial** (task state + dashboard, not conversation replies) |
| Free-first ranking as hard policy | **Partial** (costTier heuristic; not enforced as product policy) |

**Verdict:** Infrastructure is ~80% of a free multi-tool orchestrator. The **super-agent UX** (one mind, async conversation, free-first delegation) is the main gap. Build that next; do not add more adapters until the conversation layer exists.

---

## 2. Progress since Grok review 5 (G5)

| G5 item | Status |
|---------|--------|
| G5-01 seat/lock stale detection | **Fixed** — seats reclaim on dead PID only; global slots `name-i.seat` |
| G5-02 global maxConcurrentAgents | **Fixed** — `acquireSeat('agent', maxConcurrentAgents)` |
| G5-03 multi-writer same cwd | **Fixed** — `assertSessionIsolation` |
| G5-04 catalog capabilities | **Improved** — uses `fileEditing` / `headlessExecution`; still fuzzy on “reasoning” |
| README MCP accuracy | **Fixed** earlier; still has **internal contradiction** on verified vs unverified tables |
| Orchestrator centralization | **Added** — major positive step |
| Free catalog + installer | **Added** — aligns with motto |
| All 6 adapters verified in registry META | **Claimed in tip commit** — keep smoke evidence in docs |

---

## 3. Architecture target (implement this)

```
User (CLI chat / MCP host / VS Code)
        │
        ▼
┌───────────────────────────────┐
│  Conversation layer (NEW)     │  threadId, messages[], activeJobs[]
│  - accept user turns anytime  │
│  - decide: answer | delegate  │
│  - never block on long runs   │
└───────────────┬───────────────┘
                │ delegate(task, constraints)
                ▼
┌───────────────────────────────┐
│  Orchestrator (EXISTS)        │  chooseAdapter, failover loop, sessions
│  - free-first ranking         │
│  - seats / isolation / health │
│  - monitor + compile result   │
└───────────────┬───────────────┘
                │
        ┌───────┴────────┐
        ▼                ▼
   Adapter tools      Models (prefer :free / local)
```

**Hard rule:** The user-facing conversation model/context is **not** the same object as the worker model. Workers are disposable. The thread is durable.

---

## 4. Required work (ordered)

### G6-01 — Conversation thread primitive (P0)

**Gap:** There is session/run state and `orchestrator.json`, but no first-class **user conversation** that accumulates turns and results.

**Implement:**

```ts
// src/conversation/thread.ts (suggested)
interface ThreadMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'job';
  content: string;          // redacted if needed
  ts: string;
  jobRunId?: string;        // links to orchestrator session
  meta?: Record<string, unknown>;
}

interface ConversationThread {
  threadId: string;
  cwd?: string;
  messages: ThreadMessage[];
  activeJobIds: string[];
  createdAt: string;
  updatedAt: string;
}
```

- Persist under `paths.cacheDir/threads/<threadId>.json` (atomic write).
- CLI: `air chat` (or `air ask`) opens/continues default thread; `--thread <id>` selects.
- MCP: tools `chat`, `get_thread`, `list_threads` **or** extend `run_task` to accept `threadId` and return assistant-shaped text.
- Every completed job appends a `role: 'job'` or synthesized `assistant` summary (delta + status + short redacted tail), never raw secret-bearing logs.

**Acceptance:** User can send turn 1 (long coding task), turn 2 (question) before turn 1 finishes, and later see both answers in one thread history.

### G6-02 — Non-blocking follow-ups (P0)

**Gap:** CLI `run` waits for completion. MCP is async, but there is no conversation loop that keeps accepting input while jobs run.

**Implement:**

1. `air chat` REPL (or MCP host): on user message:
   - If message is a **control** command (`/status`, `/jobs`, `/cancel <id>`, `/dashboard`) → handle locally.
   - Else classify: **quick answer** (no tool) vs **delegate** (needs workspace tool).
2. Delegate path: `orch.start(...)` without awaiting in the REPL loop; print `Started job <runId>`; continue reading input.
3. Background watcher: on job terminal state → append compiled result to thread → print notification in REPL / MCP notification if available.
4. Never require the user to stop talking until workers finish.

**Acceptance:** Documented flow + test with mock adapter: two messages in, two results out, overlapping runtime.

### G6-03 — Free-first routing policy (P0)

**Motto enforcement.**

**Implement:**

1. Config: `routing.preferFree: true` (default **true**).
2. Candidate ranking order:
   1. `available && verified && enabled`
   2. capable of task (write/read/headless)
   3. not on cooldown
   4. **costTier ascending** (0 before 1–3)
   5. health score / fewer recent failures
   6. larger context window as weak tie-break
3. Catalog models tagged free / OpenRouter `:free` / ollama / lm-studio are costTier 0.
4. Paid candidates only if no free capable candidate exists **or** user passes `--allow-paid` / config override.
5. `air models --best` must explain why (skip reasons + free preference).

**Acceptance:** With both free and paid eligible, free wins. Tests lock this in.

### G6-04 — Result compilation into one user-facing reply (P0)

**Gap:** Orchestrator stores result states; user still sees tool-shaped output.

**Implement `compileJobResult(session) → assistantMessage`:**

- Include: outcome label, adapter id (optional, hideable), workspace delta summary, verify status if run, short redacted tail, next-step hint.
- Do **not** dump full model transcripts by default.
- Attach to thread; MCP returns this text as the tool result when polled/completed.

**Acceptance:** Golden tests for SUCCEEDED_WITH_CHANGES, NO_CHANGES, FAILED+RATE_LIMIT, CANCELLED.

### G6-05 — Context preservation rules (P0)

**Gap:** Handoff is for **worker→worker**. User→AIR context is not modeled.

**Rules to implement:**

1. User thread messages are the source of truth for “what the user asked.”
2. When delegating, build worker prompt from: latest user intent + optional short thread summary + file hints — **not** the entire secret-bearing history unless needed.
3. When a job completes, store a **bounded** summary on the thread (not the full worker stdout).
4. Follow-up user turns can reference prior job results by runId or by natural language; resolver maps to stored summaries.
5. Worker model changes must not reset the thread.

**Acceptance:** Tests show thread survives adapter failover and still answers “what did we change last?” from stored delta/summary.

### G6-06 — Fix README / docs contradictions (P0)

**Observed:** README claims all adapters verified in one table, then still says opencode/kilocode/codex/copilot are UNVERIFIED and never routed.

**Required:** Single source of truth matching `src/adapters/registry.ts` META. Update PLAN, behavior-spec, adapter docs, catalog notes. Remove stale paragraphs.

### G6-07 — Conversation-aware MCP (P1)

Expose:

- `chat(message, threadId?)` → may return immediate text and/or `jobId`
- `get_thread(threadId)`
- `list_jobs(threadId?)`
- Keep existing `run_task` / `approve_failover` for power users

Host agents (VS Code, Claude, etc.) should be able to treat AIR as one tool that “remembers.”

### G6-08 — Delegation planner (P1, after G6-01–05)

Lightweight task split (not a heavy classifier yet):

- Single-shot code edit → one session
- Parallel read-only research → N readOnly sessions
- Write + test → sequential sessions (write then verify) with isolation rules

Prefer **one** session unless parallelism is clearly safe (read-only or isolated cwd).

### G6-09 — Free adapter install UX polish (P1)

`air adapters install` is aligned with the motto. Ensure:

- Install is opt-in and shows commands before running
- Verify after install updates status used by router
- No silent download of untrusted binaries without checksum when available
- Catalog remote URL is optional and validated

### G6-10 — Monitoring surface for the human (P1)

`air dashboard` exists — extend to show:

- Active jobs linked to thread ids
- Free vs paid last selection
- Cooldowns
- Seat utilization

### G6-11 — Lock module stale comment cleanup (P2)

Seat path was fixed; lock file comments may still describe “mismatched start time vs current process.” Align lock stale logic with PID-alive policy and update comments/tests.

### G6-12 — Catalog capability honesty (P2)

Stop mapping `supportsStreaming` → `reasoning`. Prefer explicit capability fields only. “Best model” explanations must be truthful.

---

## 5. What not to do

- Do not build a full custom LLM chat backend if MCP + CLI thread persistence is enough for v1.
- Do not merge user conversation context into worker prompts wholesale (cost, secrets, confusion).
- Do not default-route to paid models while free capable tools exist.
- Do not allow multi-writer sessions on one cwd.
- Do not treat model “Done” prose as success; keep workspace delta.
- Do not block the chat loop on long jobs.

---

## 6. Suggested phase plan (vision)

| Phase | Goal | Exit criteria |
|-------|------|----------------|
| **V0** | Stabilize docs + free-first ranking | G6-03, G6-06 |
| **V1** | Thread + non-blocking chat + compile | G6-01, G6-02, G6-04, G6-05 |
| **V2** | MCP conversation tools + dashboard links | G6-07, G6-10 |
| **V3** | Simple multi-step planner | G6-08 |
| **V4** | Install/catalog hardening | G6-09 |

Do not start V3 until V1 tests are green.

---

## 7. Test matrix (must add)

1. Free vs paid: free wins when both eligible.
2. Thread: message A starts job; message B answered; job A result appended.
3. Failover does not clear thread.
4. Parallel read-only sessions allowed; parallel writers same cwd refused.
5. Seat cap holds across two processes (PID alive).
6. Compile templates for each ResultState.
7. Redaction on compiled assistant messages.
8. `preferFree: false` + `--allow-paid` path.

---

## 8. Summary for the human

You already built the hard parts of an orchestrator: adapters, free catalog, seats, isolation, handoff, failover, MCP, dashboard. The motto and direction are right.

What is still missing for “one super agent” is the **conversation layer**:

- durable user thread
- non-blocking follow-ups
- free-first policy as law
- compiled, human-shaped results
- worker models treated as interchangeable hands, not the face of AIR

Implement G6-01 → G6-05 next. That is the shortest path from “multi-tool router” to “feels like one free agent.”
