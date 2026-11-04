# deepseek_super_agent_review.md

## 0. Document metadata

- **Reviewer**: DeepSeek
- **Target repository**: https://github.com/radmanmilos/air
- **Review date**: 2026-11-04
- **Supersedes for forward-looking work**: `deepseek_plan_review.md` (DS-01..DS-08). Those items are still foundational and must be closed; this document extends them toward the new "super agent" vision.
- **New motto / ethos**: *"AIR is free and so are we"* — free-first by default, no hidden paid dependencies.
- **Verification caveat**: I do not have direct repo access in this session. Findings are inferred from the prior review trajectory and architectural reasoning. Every claim about "current code" below must be verified against `main` before implementation begins. Where I'm uncertain I say so explicitly.
- **How to use**:
  - `MUST` = blocker for the next milestone.
  - `SHOULD` = strongly recommended; defer only with a documented reason in `PLAN.md`.
  - `VERIFY` = existing behavior that needs a proving test.
  - Reference IDs (`SA-xx`) in commits and `PLAN.md`.
  - Do not start a later phase until the current phase's acceptance criteria pass with real tests.

---

## 1. The vision (restated so the implementation AI cannot drift)

The user should feel like they are talking to **one assistant**, not a CLI orchestrator.

Concretely:

1. **One front agent** that the user talks to. It holds the conversation, answers directly when it can, and delegates when it cannot or when the work is long-running.
2. **Background execution** by the most suited **free** tool and model, chosen by the existing router + failover + health + cooldown machinery. The user should not need to know which tool ran unless they ask.
3. **Non-blocking**: while a background task runs, the user can send more messages. The front agent answers from existing context or spawns additional tasks. It never makes the user wait for a task to finish.
4. **Asynchronous result injection**: when a task completes, its result is redacted, size-capped, optionally summarized, and injected back into the conversation so the front agent can continue coherently.
5. **Free-first**: free tools and models are preferred by default. Paid is opt-in only.
6. **Seamless handoff**: switching from one tool/model to another, or from foreground to background, must not break the conversation or reveal internal plumbing.

If a design decision makes any of those six properties worse, it is the wrong decision.

---

## 2. Verdict

**The existing architecture is a strong foundation for this vision, but the vision requires a new layer that does not currently exist: a persistent conversational front agent with asynchronous background job integration.**

The good news:
- The execution runner, router, health tracker, cooldowns, failover loop, redaction, task-state persistence, and MCP task lifecycle are exactly the substrate the super agent needs. Nothing needs to be rebuilt.
- The `TaskState` model and atomic persistence are directly reusable as the backing store for background jobs.
- The MCP server already supports async task submission, polling, and approval — the pattern is proven.

The gap:
- There is **no conversation session**, **no front agent**, **no `air chat`-style REPL**, and **no path for a background task result to be injected back into a conversation**. Today the CLI is one-shot per command.
- The model catalog and recommender are not **free-aware**: there is no `free` flag, no free-tier quota tracking, and no "free-first" filter in routing.
- The recommender still lacks task-aware eligibility (carryover DS-03).
- The concurrency cap bug (carryover DS-01) and catalog availability bug (carryover DS-02) must be closed before the super agent can be trusted, because the front agent will spawn many tasks in parallel.

**Bottom line**: the substrate is ready; the super-agent layer is not built. Three carryover P0s must be fixed first, then a new layered feature set (SA-01 through SA-09) turns the substrate into the "one agent" experience.

---

## 3. What is already good and should not be regressed

These are load-bearing for the super agent. Do not simplify them away:

- **Execution runner** with redaction integration, bounded tails, timeouts, tree-kill, AbortSignal. Background tasks need all of this.
- **Health tracker + cooldowns keyed by `(provider, model)`**. Free-tier rate limits are the single biggest operational risk in a free-first design; this is the right abstraction to extend.
- **Inter-process locking** (`O_CREAT|O_EXCL`, stale PID detection). The front agent and background jobs will mutate shared state concurrently; the lock is essential.
- **Task-state persistence** with atomic writes and a locked index. This is exactly the store the super agent needs for "background jobs the front agent tracks."
- **Streaming redaction** with the concat invariant. Anything injected into the conversation must be redacted first; this is the mechanism.
- **Error taxonomy** as a single source of truth. Front-agent decisions ("should I fail over? should I ask the user? should I retry?") depend on stable categories.
- **Adapter registry** separating installed from verified. The front agent must never silently route to an unverified adapter.
- **Verify trust gate**. Background tasks may run repo-supplied commands; the trust gate must remain in force.
- **MCP task lifecycle**. This is the closest existing pattern to what the super agent needs; reuse the shape.

---

## 4. Carryover P0s (foundational — must be closed before SA work)

These are unchanged from the prior review. They are not optional; the super agent multiplies their impact because it will run many tasks concurrently.

### SA-00a — Concurrency cap must use configured value (carryover DS-01)

**Symptom**: multi-session path passes a literal `1` to the seat-acquisition helper instead of `config.concurrency.maxConcurrentAgents`, and may use per-session seat names. The global counter is correct but the cap comparison never trips.

**Change**:
- MUST pass `config.concurrency.maxConcurrentAgents` into the seat-acquisition helper.
- MUST use one shared seat name (e.g., `'agent'`) for the global pool.
- MUST use the same cap in CLI `--parallel` and MCP session manager.

**Acceptance**: `maxConcurrentAgents: 2` limits concurrency to 2 across CLI and MCP; a 3-session test proves it.

---

### SA-00b — Model catalog must reflect real availability (carryover DS-02)

**Symptom**: the catalog builder sets `available: true` unconditionally instead of consulting the adapter registry.

**Change**:
- MUST derive `available` from the adapter registry status (the same source used by `check-models.ts`).
- MUST include a reason when `available: false` (`not_installed`, `unverified`, `auth_required`).
- MUST exclude unavailable adapters from the recommender.

**Acceptance**: `air models`, `air models --best`, and `air status` agree on availability.

---

### SA-00c — Best-model recommender must respect task requirements (carryover DS-03)

**Symptom**: the recommender receives the task but ignores it; eligibility is `available && headless` only.

**Change**:
- MUST filter by `task.readOnly` (write tasks require `capabilities.write`).
- MUST filter by `task.mode` (`auto` requires `headless`).
- SHOULD support optional `requiresCode`.
- MUST return `null` with a reason when nothing is eligible.

**Acceptance**: read-only, write, ask, auto cases each have a passing test.

**Recommendation**: close SA-00a, SA-00b, SA-00c in a single sprint before starting Phase A. They are small wiring changes and they unblock everything else.

---

## 5. Critical gaps for the super-agent vision (P0)

### SA-01 — No persistent conversation session exists

**Symptom**: the CLI is one-shot per command. There is no object that holds the user's message history, the front agent's model choice, or the set of active background tasks associated with this conversation. Restarting the CLI loses context.

**Change**:
- MUST introduce `ConversationSession` with at minimum:
  - `id` (ULID or UUID)
  - `createdAt`, `updatedAt`
  - `messages: Message[]` where `Message = { role: 'user' | 'assistant' | 'system' | 'tool', content, taskId?, toolName?, timestamp }`
  - `activeTaskIds: string[]`
  - `frontAgentModel: { provider, model }`
  - `configSnapshot: { freeOnly: boolean, maxConcurrentAgents: number, ... }` (so the session is replayable even if config changes)
- MUST persist to `<data>/air/conversations/<id>.json` using atomic writes (temp + rename), reusing the pattern already in `task-state.ts`.
- MUST load on `air chat --resume <id>` and on process restart if a session is marked "active."
- MUST be safe to append while background tasks are completing (lock around mutation, or append-only log with periodic compaction — pick one and document it).
- SHOULD expose `air conversations list` and `air conversations show <id>` for debugging.

**Acceptance**:
- Start `air chat`, exchange messages, kill the process, restart with `--resume`, and the front agent answers with full history.
- Two concurrent appends to the same conversation (e.g., a user message and a task-completion event) do not corrupt the file.

---

### SA-02 — No non-blocking interactive UX exists

**Symptom**: there is no REPL. Users cannot send a follow-up while a task is running because there is no running process to send it to.

**Change**:
- MUST add `air chat` as a REPL command.
- MUST accept user input while a background task is in flight.
- MUST support at least:
  - `--resume <id>` to continue a conversation
  - `--free-only` (default `true`) and `--allow-paid` to change the routing policy for this session
  - `--model <provider/model>` to pin the front agent model
- MUST render three kinds of output distinctly:
  - the front agent's reply
  - a subtle "task started" acknowledgement (e.g., `▸ task 01H... started (aider)`)
  - an asynchronous "task finished" notification injected as an assistant message
- MUST NOT block on task completion. The user's prompt should return immediately after the front agent decides what to do.
- SHOULD handle `Ctrl-C` as "cancel the current foreground thought or task," not "kill the conversation."
- SHOULD handle `Ctrl-D` / `exit` as "persist session and quit."

**Acceptance**:
- User asks the front agent to do something long-running, then immediately asks an unrelated question. The unrelated question is answered while the task runs.
- When the task finishes, a message appears without the user prompting.

---

### SA-03 — No asynchronous result injection into the conversation

**Symptom**: even if a background task completes, there is no mechanism to deliver its result back to the front agent in a form the front agent can reason about.

**Change**:
- MUST define a `TaskResultSummary` shape: `{ taskId, status, tool, provider, model, durationMs, changes: { added, modified, deleted }, errors?: string, verifyOutput?: string, nextSteps?: string }`.
- MUST redact the summary before injection (reuse streaming redactor).
- MUST cap the summary size (e.g., 4 KB injected inline; anything larger is summarized — see SA-08).
- MUST inject the summary as a `tool` message keyed by `taskId` so the front agent can reference it.
- MUST be atomic with the conversation write: either the task result is fully injected or not at all.
- MUST recover gracefully: if the front agent crashes between "task finished" and "result injected," the raw result remains in task-state and can be re-injected on next session load.

**Acceptance**:
- Run a mock task end-to-end. When it finishes, an assistant message appears that references what the task did, in natural language, without the user asking.
- A crash mid-injection is recovered on restart without losing the task result.

---

### SA-04 — Model catalog is not free-aware

**Symptom**: there is no `free` flag on model entries and no free-tier quota tracking. The router cannot prefer free models, and the recommender cannot know which models will cost money.

**Change**:
- MUST extend the model entry with:
  - `free: boolean` (true for local models like Ollama and for known free tiers)
  - `freeTier?: { requestsPerMinute?: number, requestsPerDay?: number, resetWindowMs: number }`
  - `contextWindow: number`
  - `estimatedCostPerKTok?: { input: number, output: number }` (null for free)
- MUST default the router to **free-only** when the session is in free mode (`--free-only`, default).
- MUST return a clear, actionable error when free-only mode has no eligible candidate: e.g., `"No free model available for this task. Run with --allow-paid or wait for cooldowns to clear."`
- MUST expose `air models --free` to list only free models, and `air models --all` for the full list.

**Acceptance**:
- With only free adapters installed, `air chat` works without any `--allow-paid` flag.
- With `--free-only` and all free models cooled down, the router errors with the exact message above.

---

### SA-05 — Front agent has no stability or fallback story

**Symptom**: nothing currently decides which model is the front agent, or what happens if it fails.

**Change**:
- MUST designate a front-agent model (configured, or auto-selected from free tier at session start, persisted in `ConversationSession.frontAgentModel`).
- MUST use a **neutral message format** for the conversation that can be converted to any provider's API (do not bind the conversation to one provider's native schema).
- MUST implement a fallback chain for the front agent itself: if the primary front model fails (rate limit, auth), try the next eligible front model **without losing history**.
- SHOULD use a single provider for the front agent in MVP to avoid cross-provider tool-use schema mismatch. Document the limitation.
- MUST NOT route the front agent to the same free tier that is currently exhausted by background tasks.

**Acceptance**:
- Forcing a rate-limit on the front agent model results in a transparent switch to a fallback model, and the user still sees a coherent reply.
- History is preserved across the switch.

---

## 6. Important gaps (P1)

### SA-06 — Task capability detection is minimal

**Symptom**: the router uses a priority list. It does not derive required capabilities from the task text, so "most suited" is not actually evaluated.

**Change**:
- SHOULD NOT build a heavy LLM classifier. Start with:
  - **Explicit hints from the front agent** (the `spawn_task` tool should accept `{ requiresWrite, requiresCode, requiresLongContext, maxDurationMs }`). The front agent decides based on the user's message.
  - **Heuristic fallbacks** for CLI one-shot mode (e.g., presence of "write", "modify", "refactor" → `requiresWrite: true`).
- MUST use those capability hints to filter the router's candidate set (before priority list ordering).
- MUST record the inferred capability set in the trace event so misroutes are auditable later.

**Acceptance**:
- A task with `requiresWrite: true` never routes to a read-only model.
- The trace event contains `capabilities: { write: true, code: false, ... }`.

### SA-07 — Free-tier quota is not tracked

**Symptom**: the health tracker tracks cooldowns but not free-tier usage counters. A free tier can be hammered until it hard-fails, at which point we learn by accident.

**Change**:
- MUST extend health state per `(provider, model)` with `freeTierUsage: { requestsThisMinute, requestsToday, resetAt }`.
- MUST increment on each spawn and on each completion (count spawns; that is what quota hits).
- MUST deprioritize (soft) a free model at ≥ 80% of its free-tier limit and exclude it at 100%.
- MUST reset counters based on `freeTier.resetWindowMs` from the catalog.
- SHOULD surface quota state in `air status --json`.

**Acceptance**:
- A free model near its daily limit is deprioritized in routing (visible in `route-test --explain`).
- Counters reset correctly across the reset window (test by manipulating the clock, not by waiting).

### SA-08 — Output summarization before injection

**Symptom**: a tool's raw stdout can be megabytes. Injecting it into the conversation will blow the front agent's context window.

**Change**:
- MUST summarize tool output larger than a configurable threshold (default 4 KB) before injection.
- Summarization MUST be redacted first.
- SHOULD use the front agent itself for summarization if the front agent's context can hold the raw output; otherwise use a cheap secondary model.
- MUST preserve structured fields (`status`, `tool`, `changes`, `errors`) verbatim in the summary envelope, and only summarize the "output" body.
- MUST cap the final injected size to a configured maximum (default 8 KB).

**Acceptance**:
- A task producing 5 MB of stdout results in a ≤ 8 KB injected summary that references the key facts (success/failure, files changed, errors).

### SA-09 — MCP conversation tools

**Symptom**: MCP currently exposes task tools but not conversation tools. A client cannot "chat" over MCP.

**Change**:
- SHOULD add MCP tools: `conversation_create`, `conversation_message` (append user message, get front agent reply), `conversation_status` (history + active tasks).
- MUST reuse the same `ConversationSession` store as the CLI.
- MUST NOT require the MCP client to know which tools/models ran.

**Acceptance**:
- An MCP client can create a conversation, send a message, receive a reply, and receive an async notification when a background task completes.

### SA-10 — Cost/free observability

**Symptom**: users cannot see whether a session spent money.

**Change**:
- MUST include `free: boolean` and `estimatedCostUsd: number` in trace events for each spawn.
- SHOULD add `air chat --stats` (or a `/stats` REPL command) that shows: messages exchanged, tasks run, tools used, all-free-yes/no, estimated cost.
- MUST aggregate cost per session and per day.

**Acceptance**:
- In a free-only session, `--stats` reports `estimatedCostUsd: 0` and lists which free tools were used.

### SA-11 — Cross-provider front-agent fallback

**Symptom**: if the front agent's provider goes down entirely, cross-provider fallback is non-trivial because tool-use schemas differ.

**Change**:
- SHOULD NOT attempt cross-provider front-agent fallback in MVP. Same-provider fallback (different model) is sufficient.
- MUST document the limitation and provide a clear error when no same-provider fallback exists.
- MAY add a portable "prompt-only" fallback mode (no tools) as a future escape hatch — but only if real users hit the problem.

**Acceptance**: documentation and behavior match. No half-implemented cross-provider fallback ships.

---

## 7. Recommended architecture (target)

### Components

┌─────────────────────────────────────────────────────────────┐
│ User │
└──────┬──────────────────────────────────────────────────────┘
│ messages (non-blocking)
▼
┌─────────────────────────────────────────────────────────────┐
│ Front Agent (REPL / MCP) │
│ - ConversationSession (persisted) │
│ - Front agent model (with same-provider fallback) │
│ - Tools: spawn_task, task_status, task_result, cancel_task │
└──────┬──────────────────────────────────────────────────────┘
│ spawn_task({ task, capabilities })
▼
┌─────────────────────────────────────────────────────────────┐
│ Router (free-first by default) │
│ - Capability filter → availability → free-first → priority │
└──────┬──────────────────────────────────────────────────────┘
│
▼
┌─────────────────────────────────────────────────────────────┐
│ Executor (runner + adapter + health + failover) │
│ - existing machinery; unchanged │
└──────┬──────────────────────────────────────────────────────┘
│ on complete: TaskResultSummary
▼
┌─────────────────────────────────────────────────────────────┐
│ Injector │
│ - redact → summarize if > threshold → cap size │
│ - append to ConversationSession as tool message │
│ - notify front agent (event) │
└─────────────────────────────────────────────────────────────┘


### Data flow (one turn)

1. User types a message → REPL appends `user` message to `ConversationSession`.
2. Front agent is invoked with: full history + available tools + current task list.
3. Front agent either:
   - replies directly (append `assistant` message), or
   - calls `spawn_task(...)` → router selects tool → executor starts → task ID appended to `activeTaskIds` → REPL acknowledges; **control returns to the prompt immediately**.
4. Meanwhile, executor runs. On completion, `TaskResultSummary` is built.
5. Injector redacts, summarizes if needed, and appends a `tool` message to the conversation, then emits an event.
6. REPL receives the event and re-invokes the front agent with a system hint: "A task just finished; summarize for the user." Front agent produces an `assistant` message.
7. User can send another message at any time; the front agent has full history.

### State stores (all atomic, all locked)

| Store | Purpose | Reuse |
|---|---|---|
| `conversations/<id>.json` | ConversationSession | new |
| `tasks/<id>.json` | TaskState | existing |
| `health.json` | Cooldowns + free-tier usage | extend |
| `traces/*.jsonl` | Structured events (incl. cost) | extend |
| `seats/` | Concurrency seats | existing |

---

## 8. Gated phases

| Phase | Items | Gate |
|---|---|---|
| **0** | SA-00a, SA-00b, SA-00c | Carryover P0s fixed with proving tests. |
| **A** | SA-01, SA-02, SA-05 | Conversation session persists; `air chat` REPL works with a **synchronous** front agent (no delegation yet); front-agent fallback works same-provider. |
| **B** | SA-03, SA-04 | Front agent can spawn a task via tool; async completion is injected; free-first catalog + routing works. |
| **C** | SA-06, SA-07, SA-08 | Capability hints filter routing; free-tier quota tracked; output summarization in place. |
| **D** | SA-09, SA-10, SA-11 | MCP conversation tools; cost observability; cross-provider fallback documented as out of scope. |

Do not start Phase A until Phase 0 is green. Do not start Phase B until the `air chat` REPL runs a full conversation with a synchronous front agent. The order matters: the synchronous REPL is the proving ground for the conversation model, before async complexity is added.

---

## 9. Anti-patterns to avoid

The implementation AI MUST NOT:

- Treat the super agent as "MCP + a wrapper." It needs its own conversation session and its own front-agent model.
- Block the REPL on task completion. Even for "quick" tasks. The user's prompt must return immediately after the front agent decides.
- Inject raw tool output into the conversation without redaction and size caps.
- Spawn paid models without an explicit user flag (`--allow-paid`).
- Bind the conversation store to one provider's native message schema. Use a neutral internal format.
- Build a heavy task classifier. Use front-agent-provided hints + light heuristics.
- Attempt cross-provider front-agent fallback in MVP. Same-provider is enough; document the rest.
- Rebuild execution, routing, health, or failover. They exist. Reuse them.
- Add a web UI before `air chat` is proven end-to-end.
- Keep `ConversationSession` and `TaskState` in separate stores without an explicit `taskId` link. The link is the whole point.
- Forget the "free and so are we" motto at the routing layer. Any path that defaults to paid is a regression.

---

## 10. Definition of done (for the super-agent milestone)

A single end-to-end demonstration must exist as an automated test or scripted scenario:

1. User runs `air chat`.
2. User types: "Refactor `foo.py` to add type hints."
3. Front agent acknowledges and spawns a background task (visible as a subtle `▸ task started` line).
4. **Before the task completes**, user types: "What's the current branch?"
5. Front agent answers immediately from context.
6. Task completes; a message appears: "Done. `foo.py` was modified with type hints added to 4 functions. No errors."
7. User types: "What function did it change first?"
8. Front agent answers from the injected summary.
9. All of the above used only free tools/models (assert `--stats` reports `estimatedCostUsd: 0`).
10. Kill `air chat` mid-task. Restart with `--resume`. The conversation continues with full history and the task result is present.

If any of these ten steps fails, the milestone is not done.

---

## 11. Immediate next action

Do these in this order, in a single sprint:

1. **Phase 0**: fix SA-00a, SA-00b, SA-00c. Each is a small wiring change with a proving test. Land these first; they unblock everything.
2. **SA-01**: implement `ConversationSession` with atomic persistence. Do not wire it to the front agent yet — just the store, the append/lock semantics, and a `list`/`show` command.
3. **SA-02 + SA-05**: implement `air chat` REPL with a synchronous front agent (no delegation). Front agent replies directly to user messages. Persistence works across restarts.
4. Verify: `air chat`, exchange messages, restart with `--resume`, history is intact.
5. Only then start **Phase B** (delegation via tools + async injection).

The single most important thing to get right is the `ConversationSession` data model. Everything in Phases B–D depends on it being neutral (provider-agnostic), well-linked to `TaskState`, and safe to append to concurrently.

---

## 12. Out of scope (do not expand during this milestone)

Track as post-milestone issues, not blockers:

- Web UI or desktop app.
- Cross-provider front-agent fallback (document, do not implement).
- Multi-user / multi-tenant conversations.
- Voice or image input.
- Persisting conversations across machines.
- Fine-grained budget enforcement (per-token cost accounting is enough).
- LLM-based task classifier (front-agent hints are the MVP).
- New adapters beyond aider + goose (opencode/kilocode only on request).

---

## 13. Honest caveats

- I do not have direct repo access in this session; every "current code does X" claim must be verified against `main`. The carryover P0s (SA-00a..c) are the most likely to have been partially or fully fixed already — verify before re-fixing.
- The "one agent feel" is a **UX** property as much as an architecture property. The plumbing is necessary but not sufficient: the front agent's tone, the subtlety of background notifications, and what the front agent chooses *not* to say (e.g., "switching to goose now") will matter more than whether the code compiles.
- Free-tier limits are volatile. The `freeTier` values in the catalog must be configurable and updatable without a code release. If the router hardcodes limits, the system will break silently when a provider changes its free tier.
- The front agent itself needs a model. In free-only mode, if all free front-agent candidates are rate-limited, the "super agent" is briefly unusable. Decide in advance: (a) wait with a clear message, (b) allow a paid front-agent fallback even in free mode (with a visible warning), or (c) fall back to a local model (Ollama) if installed. I recommend (c) with (a) as a fallback.
- The largest engineering risk is concurrency correctness: conversation appends, task-state writes, health updates, and event injection all touch shared state. Do not hand-roll a new locking scheme — reuse the existing lock, and add a test that simulates a user message and a task completion racing to write the conversation.

---

*End of document. Future findings should be appended as `deepseek_super_agent_review_2.md`, not merged into this file.*