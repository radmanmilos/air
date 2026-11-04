# AIR — deep product and architecture review

**Review date:** November 4, 2026  
**Repository:** [radmanmilos/air](https://github.com/radmanmilos/air)  
**Branch:** `main`  
**Latest commit reviewed:** [`947428fa8067250f9b7b540e99a6517c1ffb4327`](https://github.com/radmanmilos/air/commit/947428fa8067250f9b7b540e99a6517c1ffb4327)  
**Product direction:** “AIR is free and so are we”

---

# 1. Executive assessment

## Verdict

**The direction is promising, but the current implementation does not yet deliver the product you described. AIR has the beginnings of an orchestrator; it is not yet a persistent conversational supervisor with a reliable multi-worker execution engine.**

The repository now contains many of the right ingredients: a central `Orchestrator`, adapter and model catalogs, a free-tool installation catalog, task/session execution, MCP entry points, failover proposals, session logs, health tracking, concurrency slots, and a dashboard. This is meaningful progress.

The core problem is that these pieces still behave like a collection of features rather than one coherent runtime. In its current shape, AIR behaves more like:

> Accept one task, choose the first eligible adapter in a priority-ordered list, run it, record a coarse result and possibly attempt a sequential failover.

The product you want is:

> Maintain one user-facing conversation, turn incoming requests and follow-ups into a durable work plan, delegate independent work to specialist tools/models, monitor multiple executions, incorporate new user instructions while work is running, verify and combine the results, and respond through the same conversational agent.

Those are different system boundaries. The implementation has started moving toward the second, but the active execution path is still substantially the first.

## The most important product decision

**Keep one conversational front agent and make every other model/tool a worker.**

The model that directly interacts with the user must own the conversation, user intent, history, clarification, approvals and final response. A background worker should never become a second user-facing personality or silently take over the conversation.

There are two valid deployment shapes:

1. **MCP-hosted front agent (recommended for the current product):** VS Code Chat or another host remains the conversational front agent and calls AIR as an execution service. AIR maintains durable conversation/work IDs and exposes follow-up, status and result operations to that same host conversation.
2. **AIR-owned front agent (optional future product):** AIR itself hosts a conversation supervisor model and chat API. That supervisor owns the transcript and uses the same execution service underneath.

Do not build two competing conversational supervisors. Make the front agent replaceable while keeping the worker/orchestration runtime the same.

## Goal scorecard

| Product requirement | Current state | Assessment |
|---|---|---|
| One incoming-work entry point | CLI and MCP exist; normal tasks delegate to the central orchestrator | Partial |
| One persistent user-facing agent | No conversation/thread identity or message history in AIR | Missing |
| Accept follow-ups while work runs | Status/resume tools exist, but no follow-up-to-existing-conversation/plan operation | Missing |
| Decompose requests into suitable jobs | No planner/work graph; `runSessions` expects caller-supplied prompts | Missing |
| Route work to most suitable tool/model | First-eligible priority selection; `chooseAdapter` is not used by `start()` | Weak |
| Prefer genuinely free models | Cost tiers and free labels exist; no reliable cost/auth/quota enforcement | Unproven |
| Run independent workers concurrently | Separate session helper exists; central orchestrator has no global seat acquisition | Partial |
| Isolate concurrent writes | Guard exists, but an “isolated” flag does not create a worktree | Incomplete |
| Monitor live execution | Coarse events/session log exist; live status is stale/incomplete | Partial |
| Cancel/interrupt work | MCP cancellation does not reach the orchestrator's private process signal | Broken |
| Recover work after restart | Session JSON loads, but live process recovery is not implemented | Not delivered |
| Preserve worker context and changes | Git handoff and resume exist, but ID/resume contracts are inconsistent | Partial |
| Compile one coherent answer | No result synthesizer; multi-session CLI reports status strings | Missing |
| Safe provider switching | Allow-list and MCP approval wiring have blockers | Broken |
| Secure adapter installation/extension | Remote factories and repo-controlled auto-install create an unsafe trust boundary | Unsafe |

---

# 2. What has improved since the previous reviews

The latest repository is materially different from the November 3 state.

### Genuine improvements

- `src/orchestrator/orchestrator.ts` now owns the primary CLI and MCP execution path.
- The CLI `run` command delegates to `Orchestrator.start()` instead of retaining a separate full failover loop inline.
- MCP `run_task` starts an orchestrator operation in the background rather than directly awaiting the old process runner.
- A model catalog, cost override schema and best-model helper have been added.
- The adapter catalog supports install status, package-manager installs and direct downloads.
- The registry can load dynamic adapters declared through `factoryModule`.
- A global, slot-based concurrency seat pool replaced the earlier count-and-reserve implementation.
- Session configuration now has concurrency and workspace-isolation fields.
- The code refuses multiple non-isolated write sessions targeting the same `cwd`.
- Handoff code now uses ESM file imports and redacts tracked diff and untracked file content.
- The streaming redactor now uses a `TextDecoder`, case-insensitive bearer-prefix handling and a bounded buffer.
- Workspace snapshots now include fingerprints for changed files, improving detection of additional edits to already-dirty files.
- The CLI has gained `resume`, adapter management, a dashboard, export and command-listing surfaces.
- CI now has build, lint, package and real-binary smoke-test jobs.
- Cancellation has a separate health counter.
- The latest commit records local verification against six installed CLI versions.

These are useful foundations. This review does not recommend throwing them away. It recommends tightening their boundaries and moving to one durable conversation/workflow runtime.

### What “verified” means today

The latest commit marks all six adapters verified using locally installed CLI versions. That is useful implementation evidence, but it is not the same as continuous CI verification of all six.

The current CI real-binary job installs Aider and attempts Goose. The real-binary test suite has version checks for some other tools, skips tests when those binaries are absent, and does not contain a GitHub Copilot real-binary test. The registry itself checks PATH presence and static `verified` metadata; it does not compare the actual installed binary version with `verificationVersion`.

Keep these as separate facts:

- adapter command implementation verified against version X;
- installed executable discovered;
- installed executable version checked and compatible;
- end-to-end capability verified by acceptance test;
- model/provider availability and price verified.

They should not be collapsed into one `verified: true` flag.

---

# 3. P0 — security and core-runtime blockers

## P0-01 — Repo-controlled catalog settings can execute code or install tools

**Files:** `src/config/loader.ts`, `src/config/catalog.ts`, `src/adapters/registry.ts`, `src/installer/installer.ts`

The config loader merges `.airrc.yaml` into the effective runtime config. That means an untrusted repository can influence `catalog.remoteUrl`, `catalog.autoInstall`, tool configuration and the catalog AIR uses to discover adapters.

`Orchestrator.start()` calls `autoInstallMissing(config)` and `ensureDynamicAdaptersLoaded(config)` before launching the task. Dynamic adapter loading reads catalog entries and performs `import(entry.factoryModule)` for entries that declare a factory module. The install catalog can also contain package-manager commands and direct-download URLs.

This creates an unsafe trust chain:

1. A repo config can select a remote catalog.
2. The remote catalog can describe modules to import or programs to install.
3. AIR loads that catalog during task startup.
4. If auto-install is enabled, AIR can install missing entries in the background without the per-adapter confirmation used by the interactive install command.

A project being analysed must not be able to extend AIR's executable code or trigger system-level installation merely by supplying repository config.

The installer’s optional “signature” mechanism also needs stronger terminology and design. The current direct-download flow can compare a downloaded binary's SHA-256 digest with a string downloaded from a `signatureUrl`. That is a checksum comparison, not a digital signature verified against a trusted public key. If the binary and checksum are served by the same compromised source, both can be changed. The check is optional, and the bundled Goose direct-download entry does not declare one.

**Instructions for the implementation AI**

1. Treat repo `.airrc.yaml` as untrusted task metadata, not as authority to change AIR's installation or plugin trust policy.
2. Move `catalog.remoteUrl`, `catalog.autoInstall`, `factoryModule`, install roots and trusted binary sources to a separately trusted user/global configuration.
3. Do not dynamically import executable code from a remote catalog. Prefer a built-in adapter factory registry. For third-party extensions, require explicit global trust and cryptographic signature verification against a pinned trusted key.
4. Disable automatic installation by default. Never auto-install every missing tool at task start. Install only a selected tool after explicit user consent, or after a separately configured global policy explicitly authorizes it.
5. Validate remote catalog data with a strict schema, restrict URLs to approved HTTPS hosts, restrict executable paths to a safe basename or approved installation root, impose download-size limits and verify binary hashes/signatures.
6. Log the exact source, version, hash and trust decision for every installed or dynamically loaded adapter.

**Acceptance test:** A disposable repository containing untrusted catalog settings must not cause AIR to import a module, run an install command, download an executable or change global trust policy.

## P0-02 — MCP returns a different run ID from the one the orchestrator actually uses

**Files:** `src/mcp/server.ts`, `src/orchestrator/orchestrator.ts`

In the MCP `run_task` handler, MCP creates `runId = makeRunId()`, stores the job under that ID and returns it to the caller. `runTaskInBackground()` then calls `orch.start(...)`. `Orchestrator.start()` creates a second, independent `runId`.

The public ID and the actual orchestrator/task-state ID are therefore different.

This breaks the core API contract:

- `get_task_status` initially finds the outer ID and returns the fallback job state.
- The underlying `TaskState` and orchestrator session are persisted with the inner ID.
- `approve_failover` calls `resumeAfterApproval(args.runId)` using the outer ID, but the orchestrator session map is keyed by the inner ID.
- `resume_task` also receives the outer ID and cannot reliably find the actual orchestrator session.
- After an MCP server restart, the returned outer ID has no corresponding task-state record to recover.

There is a second state mismatch: the orchestrator persists `AWAITING_APPROVAL` in its own session log, but the task-state file written after the failed attempt remains in a failure state. `runTaskInBackground()` reads the task-state file into `job.state`; `approve_failover` then checks `job.state.state === 'AWAITING_APPROVAL'`. This can reject a valid pending proposal even before the ID mismatch is considered.

**Instructions for the implementation AI**

1. Create the canonical work ID once, at the API boundary, and pass it into `Orchestrator.start()`; never create a hidden second ID.
2. Use that exact ID in the MCP response, job map, orchestrator session, TaskState file, event stream, approvals, cancellation, resume and export.
3. Persist all lifecycle transitions consistently: `QUEUED`, `PLANNING`, `RUNNING`, `AWAITING_APPROVAL`, `SWITCHING`, `VERIFYING`, `COMPLETED`, `FAILED`, `CANCELLED`.
4. Make the orchestrator's session record the canonical lifecycle state; do not maintain one public status in MCP and a different status in TaskState.
5. Add a real MCP test that starts a job, observes it, pauses for approval, approves it by the returned ID, completes the continuation and then re-reads it after a server restart.

## P0-03 — MCP cancellation does not abort the actual worker process

**Files:** `src/mcp/server.ts`, `src/orchestrator/orchestrator.ts`

The MCP job creates an `AbortController` and `cancel_task` calls `job.controller.abort()`. But `runTaskInBackground()` calls `Orchestrator.start()` without passing that controller or an externally owned cancellation token.

`Orchestrator.start()` creates a different private `AbortController` and passes that private signal to `runProcess()`. It also never stores the controller in a `SessionHandle` or the orchestrator's `handles` map.

`Orchestrator.cancel()` looks for a handle in `this.handles`, but the `start()` path never populates that map. `waitForAll()` has the same problem.

The current MCP cancellation test can pass by changing `job.state.state` to `CANCELLED` immediately. It does not prove that the worker process has stopped. It uses an in-memory transport and checks the state mutation, while the actual background process may remain alive.

**Instructions for the implementation AI**

- Make the orchestrator own a durable `ExecutionHandle` for every active work item, containing its `AbortController`, child-process identity, current state and completion promise.
- Store handles when work starts and remove them only after terminal cleanup.
- Pass cancellation from MCP/CLI through the orchestrator to the process runner.
- Cancellation must be idempotent, terminate the process tree, persist `CANCELLED` after the process has actually exited and release concurrency seats.
- Do not report successful cancellation before process termination is confirmed.
- On server shutdown, stop accepting new work, cancel or checkpoint active work according to policy and persist the outcome.

**Acceptance test:** Start a child that runs indefinitely, cancel through the public MCP tool, prove the child PID/process group exits, prove the seat is released and prove a second independent task is unaffected.

## P0-04 — The central orchestrator writes agent output to MCP stdout

**File:** `src/orchestrator/orchestrator.ts`

The central execution path passes `onStdout` to `runProcess()` and writes child output to `process.stdout`. `resumeAfterApproval()` does the same.

The MCP server uses `StdioServerTransport`, which uses stdout for protocol messages. Since MCP now delegates to the central orchestrator, agent output can be mixed into JSON-RPC frames.

A previous fix to an older MCP helper does not protect the central path. The active path must be safe.

**Instructions for the implementation AI**

- Give `Orchestrator` an output/event sink; do not let it write directly to process stdout.
- In CLI mode, the sink may stream to the terminal.
- In MCP mode, the sink must persist redacted output and optionally send supported structured notifications. Diagnostics may go to stderr only.
- Add a **process-level** stdio test that launches the built `air mcp` executable, runs a mock adapter that prints arbitrary stdout and stderr, and parses every stdout frame as valid MCP JSON-RPC.

## P0-05 — The normal cross-provider failover path is blocked

**Files:** `src/orchestrator/orchestrator.ts`, `src/security/allowlist.ts`, `bin/air.ts`, `src/mcp/server.ts`

`Orchestrator.start()` builds its default allow-list from the initial adapter and resets it to the actually selected provider/model on the first hop.

When an adapter fails, the orchestrator discovers the next candidate without an allow-list filter, but then calls `checkHandoffAllowlist(adapter, nextAdapter, allow)`. The allow-list contains only the first provider/model. A switch to a different provider is rejected. A switch to another model under the same provider can also be rejected because only the original model is allowed.

The user-facing override fields are not connected:

- CLI has `--allow-provider`, but `runAction()` does not pass it to `Orchestrator.start()`.
- MCP `run_task` accepts `allowProvider`, but does not pass it to the orchestrator.
- `config.failover.allowProviderSwitch` exists but is not applied in the orchestrator's authorization path.

MCP approval has additional inconsistencies:

- The orchestrator proposal stores destination information under `proposal.to.provider` and `proposal.to.model`.
- The MCP approval handler checks `proposal.provider` and `proposal.model`.
- Provider/model/hash arguments are optional.
- The proposal does not reliably include a payload hash.
- Approval resumes with the public MCP ID, which is already affected by P0-02.

**Instructions for the implementation AI**

Separate three operations:

1. **Discover** eligible worker candidates without silently suppressing cross-provider alternatives.
2. **Authorize** the proposed provider/model/data transfer using explicit policy or one-task user consent.
3. **Execute** only after the correct authorization is bound to the exact proposal.

For each proposed handoff, persist a proposal ID/hash that covers the destination, task, data classification and handoff payload. Require an exact approval payload for cross-provider transfer. Auto mode must never bypass that policy.

**Acceptance test:** Provider A makes partial changes and rate-limits. AIR proposes provider B, discloses what will be sent, waits for approval, then continues B on the same task/workspace. Decline must not start B. Auto mode must not cross provider boundaries unless explicitly allowed.

## P0-06 — Repository configuration can authorize its own verify command

**Files:** `src/config/loader.ts`, `src/config/schema.ts`, `bin/air.ts`, `src/context/verify.ts`

`loadConfig({ cwd })` merges repo `.airrc.yaml` into the same `Config` object that contains `trustedRepos`. `air verify-repo` then passes `config.trustedRepos` to `checkVerifyTrust()` as if that list were guaranteed to come from user/global configuration.

It is not. A repository can add its own path to `trustedRepos`, enable its own `verify.command` and provide the command to run. The path comparison has been improved with `realpath`, but the trust source is still not separated.

**Instructions for the implementation AI**

- Load the trusted-repository list from a user/global-only trust store.
- Reject or ignore `trustedRepos` from repo config.
- Keep config provenance for security-sensitive settings; do not flatten trusted-global policy and untrusted-repo preferences into one indistinguishable object.
- Test the full `verify-repo` command using a temporary repository that attempts to trust itself. It must be refused until the user trusts it outside that repository.

---

# 4. P1 — the current architecture does not yet meet the one-agent product goal

## P1-07 — There is no persistent conversation owner or follow-up message model

**Files:** `src/orchestrator/orchestrator.ts`, `src/mcp/server.ts`, `src/types/index.ts`

The task type is essentially an ID, prompt, cwd, optional files/preferred tool/provider/model, mode and read-only flag. There is no `conversationId`, turn ID, message history, conversation summary, active goal, user preference state or message-to-running-work relationship.

`Orchestrator.resume()` starts a new run with a synthetic note saying to continue from the previous session. It does not retrieve actual conversation history, worker outputs, plan, artifacts or checkpoint context and reconstruct ongoing user intent. MCP exposes `resume_task`, but that is a new task/session, not a true follow-up message in the same conversation.

This is the biggest gap relative to “the one user-facing AI keeps the context so it feels like one agent.”

**Product instruction**

Introduce a persistent conversation concept. A conversation should outlive individual tool runs and worker sessions.

A follow-up must be attached to the same conversation and interpreted against:

- the original user goal;
- prior user and assistant turns;
- current plan and worker statuses;
- accepted partial results;
- unresolved questions and approvals;
- the latest working-tree/artifact state.

The background models/tools must not own the user's conversation. They receive bounded work-item context and return results to the same supervisor.

**Important deployment choice:** If VS Code Chat or another MCP host remains the front agent, let that host retain the natural-language conversation. AIR should persist a stable conversation/work reference and expose tools to append follow-up instructions, inspect work and receive updates. Do not introduce a second conversational LLM merely to duplicate the host's memory. If AIR later owns its own chat UI, add a `ConversationSupervisor` over the same execution service.

## P1-08 — There is no planner, task decomposition or dependency graph

**Files:** `src/orchestrator/orchestrator.ts`, `src/router/router.ts`, `src/router/catalog.ts`, `src/execution/sessions.ts`

`Orchestrator.start()` selects one adapter, runs it and may fail over to another. It does not build a plan of specialist tasks.

`runSessions()` accepts an array of prompts supplied by the caller. The CLI `--sessions` option is therefore a manual fan-out mechanism, not automatic delegation. AIR does not decide that a request should be split into research, implementation, test, review and documentation work.

All current adapter `canHandle()` implementations return `true`. The router is a priority list and selects the first eligible candidate. `Orchestrator.chooseAdapter()` uses the model catalog, but it is not used by the active `start()` path.

**Product instruction**

Add a planner that turns a user request into a small typed work graph. A compound coding request might become:

1. inspect the relevant code and architecture;
2. identify the smallest implementation surface;
3. implement the feature in an isolated workspace;
4. run targeted tests and the relevant full suite;
5. have a separate reviewer inspect the diff and test evidence;
6. compile the result for the user.

Not every request needs all of these tasks. The plan should be adaptive and task-sized. Each work item needs a clear objective, acceptance criteria, required capabilities, inputs/artifact references, dependencies, permissions, workspace requirements, budget and result schema.

## P1-09 — The model recommender is not used by the active router

**Files:** `src/orchestrator/orchestrator.ts`, `src/router/catalog.ts`, `bin/air.ts`

`chooseAdapter()` calls `buildModelCatalog()` and `bestModelFor()`, but the active `Orchestrator.start()` does not call it. `start()` uses `selectCandidateFrom()` over adapter registration order.

The model catalog's capability mapping is still approximate: code is inferred from file-editing/headless support, reasoning from streaming support, and read from headless support. Cost tier is inferred from provider/model name patterns or a manual override.

`air models --best <task>` also does not pass the task text into its task filters; it uses a fixed `mode:'ask', readOnly:false` structure.

**Product instruction**

Route work items, not just whole user tasks. Selection should use actual capability requirements such as code editing, code review, test execution, documentation, research, structured reasoning, long-context analysis, image input, shell access and read-only inspection.

Rank candidates by verified suitability first, then real free/low-cost availability, quota headroom, context-window fit, health/cooldown and expected latency. Make the model recommendation path the same path used by execution.

## P1-10 — Multi-session execution is a separate engine and does not return one compiled answer

**Files:** `src/execution/sessions.ts`, `bin/air.ts`, `src/orchestrator/orchestrator.ts`

The CLI `--sessions` path still calls `runSessions()` directly, bypassing the central orchestrator's failover, conversation, result aggregation and event lifecycle.

It assigns adapters by index/modulo. It does not plan subtask/model pairs from task needs. It does not synthesize results; the CLI reads session result strings and chooses a process exit code. The session helper makes one adapter attempt; `maxHops` is recorded but no failover loop is performed there.

**Product instruction**

Remove the separate user-facing multi-session execution path. The orchestrator should create and schedule child work items; `SessionManager` should be a lower-level executor used by it, not a parallel product entry point.

Workers return structured results and artifacts. The supervisor compiles them into one response that explains what was completed, what changed, what was verified, what remains incomplete, and what the next useful action is.

## P1-11 — “Running” work is not actually observable as a live workflow

**Files:** `src/orchestrator/orchestrator.ts`, `src/mcp/server.ts`, `bin/air.ts`

`Orchestrator.start()` awaits each `runProcess()` before it completes the attempt and updates the session map. In the CLI this blocks the command until the process finishes or reaches approval.

MCP starts `runTaskInBackground()` without awaiting it, which is a useful first step. But the MCP job state initially contains only a fallback `RUNNING` record. The orchestrator does not continuously publish structured progress events, worker status, last-output time or heartbeat. `get_task_status` reads `job.state` first, so a process-local job can keep returning the fallback while the real task is executing.

**Product instruction**

Make execution a durable background workflow, not an awaited function hidden behind a tool handler. Persist and emit lifecycle/progress events such as accepted, planning, plan-ready, queued, worker-started, worker-progress, waiting-for-approval, retrying/failover, verifying, worker-completed, result-compiled, awaiting-user-input, completed/failed/cancelled.

Expose an event cursor so the front agent can ask for updates since its last check. MCP should return acceptance quickly and keep serving other requests while work continues.

## P1-12 — The central orchestrator does not enforce global concurrency

**Files:** `src/orchestrator/orchestrator.ts`, `src/utils/concurrency.ts`, `src/execution/sessions.ts`

The slot-based global seat pool is used by `src/execution/sessions.ts`. The main `Orchestrator.start()` path does not acquire a seat. Since normal CLI and MCP work now use `Orchestrator.start()`, the main product path is not governed by `maxConcurrentAgents`.

`Orchestrator.handles` is also never populated. `waitForAll()` and `cancel()` therefore do not manage real work started by `start()`.

**Product instruction**

The orchestrator must acquire/release seats for every worker launch in every entry path. Enforce global, per-provider/model and per-project limits, plus workspace write locks. Persist queued/running/finished transitions and reclaim leases safely after crashes.

## P1-13 — “Isolated worktree” flags do not create isolated worktrees

**File:** `src/execution/sessions.ts`

`assertSessionIsolation()` rejects multiple write sessions targeting the same `cwd` unless a session has `isolated`, `worktree` or a matching `isolation` string. But `isIsolated()` only checks those flags. It does not create a Git worktree, allocate a separate directory, copy the correct state or change the adapter's `cwd`.

A caller can therefore mark a session isolated while it still writes to the same checkout as another session.

**Product instruction**

Do not trust a boolean flag as evidence of isolation. The isolation manager must actually allocate a separate worktree/directory and pass that directory to the worker. Track the source commit and baseline. Define a merge/review procedure before changes are integrated into the user's working tree. Until that exists, refuse parallel write sessions against one checkout even when the caller sets `isolated:true`.

## P1-14 — Persistence is not durable enough for concurrent work or restart recovery

**File:** `src/orchestrator/orchestrator.ts`

The orchestrator persists all sessions and events in one `orchestrator.json` file using `writeFileSync()` of the full in-memory snapshot. It is not protected by a cross-process lock and does not use an atomic temp-write/rename cycle.

MCP creates a new `Orchestrator` for each `run_task`. Concurrent instances can load the same previous snapshot and then overwrite one another's sessions/events when they persist. A crash during a write can leave truncated JSON; `load()` silently ignores corrupt state.

The code loads persisted sessions but does not reconcile `RUNNING` work after restart, reattach to live child processes, recover worker state or mark abandoned work as interrupted. The README's claim that work survives restarts is therefore stronger than the implementation.

**Product instruction**

Use a transactional durable store for conversations, plans, work items, executions and events. SQLite is a reasonable local default; a locked append-only event store is another option. Add recovery rules for live workers, dead workers with checkpoints, abandoned workers and pending approvals.

## P1-15 — Worker result is measured per hop, not across the whole task

**File:** `src/orchestrator/orchestrator.ts`

`beforeSnap` is captured inside the failover loop for each provider attempt. If provider A makes useful changes and then rate-limits, provider B starts with A's changes already present. If B completes without making further changes, the final delta for B can be empty and the overall task can be recorded as `NO_CHANGES`.

The delta path also does not account for a worker that commits changes: a clean working tree after the commit can appear to contain no change if the baseline HEAD is not compared.

**Instruction**

Capture one immutable baseline for the whole user work item before the first worker starts. Keep per-attempt snapshots for debugging, but compute the final user-visible change set from the initial baseline to the final workspace and commit state.

## P1-16 — The “free” claim is not enforced by the routing system

**Files:** `config/catalog.json`, `src/config/catalog.ts`, `src/router/catalog.ts`, `src/adapters/registry.ts`

The catalog describes itself as free/no-login/no-license tools, but installing a CLI does not prove that the model behind it is free, unauthenticated, within quota or available to the user's account.

Several catalog and adapter identities disagree:

- Goose catalog: `local / goose-default`; adapter: `openai / gpt-4o`.
- OpenCode and Kilo catalog: `local` defaults; adapters: `openrouter / gemma-4-31b-it:free`.
- Codex catalog: `openai / gpt-5-mini`; adapter: `openai / gpt-4o`.
- GitHub Copilot catalog: `github / copilot-default`; adapter: `openai / gpt-4o`.

Several adapters only pass `--model` when `preferredModel` is explicitly set. The normal orchestrator task does not set it, so the actual provider/model may be defined by the user's CLI profile/recipe rather than the identity AIR reports.

The cost-tier heuristic cannot verify a live free tier, plan entitlement, quota or cost. `costOverrides` exists but the active orchestrator path does not use it for candidate selection.

**Product instruction**

Treat “free-first” as an enforceable policy, not a description in JSON. For every invocation resolve and record actual executable path/version, provider, model/deployment, auth requirement, free/paid/unknown status, quota/headroom where discoverable and cost/usage where available. If the active model is unknown, label it `unknown-cost`, not `free`. Default paid spend should be zero; paid fallback must require explicit user consent.

## P1-17 — Permission settings exist in config but are not enforced

**Files:** `src/config/schema.ts`, `src/config/loader.ts`, adapter command builders

The config schema has `permission.mode`, `broadApproval`, `autoCommit` and `allowShell`. The inspected runtime path does not apply these values to task execution.

Instead, adapter commands hard-code automation flags: Aider uses `--yes-always`, OpenCode and Kilo use `--auto`, and GitHub Copilot uses `--allow-all-tools`. Some adapter capability metadata says `shellAccess: false`, while the Copilot command enables all tools.

**Product instruction**

Create a shared permission policy evaluated before every worker invocation. It should decide read-only/write access, allowed paths, shell/process execution, network access, installation/update permissions, commit/push permissions and data egress. Translate this into the narrowest supported adapter flags. If an adapter cannot enforce the requested boundary, reject or isolate the operation.

## P1-18 — Cross-process lock cleanup is still vulnerable to ownership races

**Files:** `src/utils/lock.ts`, `src/utils/concurrency.ts`, `src/health/tracker.ts`

The earlier live-owner timestamp comparison was fixed: the current code checks PID liveness rather than treating a different process-start timestamp as stale. The slot-based seat allocator is also an improvement.

However, stale reclamation still has a race. A process reads a stale file, decides to unlink it and then unlinks by path. Another process may have replaced that path with a new live lock/seat in between. Release ownership checks only PID, not a unique acquisition token. The stored process-start timestamp is not used to detect PID reuse.

Separately, health counters are still merged as absolute snapshots:

```ts
successes: { ...base.successes, ...snapshot.successes }
```

Two workers can load the same count, each increment it, and later flush stale absolute values. The lock serializes writes but does not make increments additive.

**Instruction**

Use a unique random ownership token for each lock/seat acquisition. Verify that token immediately before release or stale reclamation. Use safe owner identity including PID/start identity where available. For counters, persist per-tracker increments inside the locked transaction instead of merging stale totals. Add genuine independent-process race tests.

## P1-19 — Byte caps still risk corrupting multibyte output

**File:** `src/execution/runner.ts`

The runner now uses Buffer byte slicing, which is better than UTF-16 string slicing. But retained prefixes use `buf.subarray(0, remaining).toString('utf8')`. If the cap splits a multi-byte UTF-8 character, Node replaces the invalid trailing sequence during decoding. The returned text may not faithfully represent output, and the re-encoded string can use more bytes than the retained raw slice.

**Instruction**

Use a code-point-safe UTF-8 truncation helper or keep captured buffers and decode only after finding a safe boundary. Test emoji and non-Latin characters with the cap at every byte boundary. Clarify whether byte counters mean total emitted bytes or retained bytes, and whether limits are per stream or aggregate.

## P1-20 — Streaming redaction advertises more token coverage than replacement implements

**Files:** `src/security/streaming-redact.ts`, `src/security/redact.ts`, `tests/streaming-redact.test.ts`

The streaming redactor recognizes additional prefixes such as `gho_`, `ghs_`, `ghu_`, `ASIA`, `xox` and `AIza`. But the actual `TOKEN_RE` and `TOKEN_DETECT` patterns in `redact.ts` still cover a smaller set (selected `sk-*`, `ghp_`, `github_pat_` and `AKIA` forms).

The guard may withhold these newer token types, but the final `redact()` call does not replace them. The `MAX_WITHHELD` overflow path also flushes the whole buffer through the same incomplete replacement layer. The tests only use a fake `sk-or` token; they do not prove the newly advertised token families are protected.

**Instruction**

Use one shared secret-pattern registry for detection, streaming prefix guarding and replacement. Add fixtures for every supported token family, lower/mixed-case bearer schemes, flags, environment variables, long output that hits `MAX_WITHHELD`, and tokens split at every chunk boundary. No supported secret may appear in streams, stored output, traces, handoffs, MCP responses or final responses.

## P1-21 — Verify trust provenance is still mixed with repo config

**Files:** `src/config/loader.ts`, `bin/air.ts`, `src/context/verify.ts`

The path comparison in `checkVerifyTrust()` now canonicalizes paths with `realpath`, which is an improvement. But `trustedRepos` still exists in the merged config and `verify-repo` still reads it from that merged object. The issue is the source of the trust list, not only path matching. This remains open until P0-06 is fixed.

## P1-22 — Malformed YAML can still be treated as missing configuration

**File:** `src/config/loader.ts`

The global and repo config loading blocks use broad `catch {}`. A missing file is fine, but YAML parsing errors and other I/O failures also fall into the empty catch block. `loadConfig()` can return defaults without surfacing invalid config.

The CLI `config --validate` action uses `loadConfig()` and checks `errors`, so it may not report the parse problem. `validateConfigFile()` reports errors when called directly, but the main command does not use it to validate both active config sources.

**Instruction**

Catch `ENOENT` as optional/missing; report parse and other errors. Make `air config --validate` validate the actual global and repo config sources and fail closed on malformed policy.

## P1-23 — “Verified all six adapters” is not represented accurately in CI

**Files:** `src/adapters/registry.ts`, `tests/smoke-real-binary.test.ts`, `.github/workflows/ci.yml`, `README.md`

The latest commit marks all six adapters verified and records local checks against six installed CLI versions. However:

- CI installs Aider and attempts Goose only.
- The real-binary smoke suite is gated by `AIR_SMOKE_TEST=1`.
- OpenCode/Kilo/Codex tests only run version commands if the binaries already exist.
- There is no GitHub Copilot real-binary test in the inspected suite.
- The registry checks PATH presence and static metadata, not installed-version compatibility.
- README has contradictory statements: one section says all six are verified, another says only Aider/Goose are CI-smoke-test verified.

**Instruction**

Represent local validation, CI validation and runtime version compatibility separately. Add genuine command smoke tests for all adapters routed by default, or mark those without CI/runtime proof experimental and disable them by default. Smoke tests must exercise the headless task path, not only `--version`.

## P1-24 — The adapter catalog does not enforce its own install integrity claims

**Files:** `src/config/catalog.ts`, `src/installer/installer.ts`, `src/installer/status.ts`

Additional concerns:

- Remote catalog JSON is parsed with a TypeScript cast rather than runtime schema validation.
- Catalog entries can override bundled entries by ID.
- Direct-download URLs are not restricted to an approved host list in the inspected installer.
- `signatureUrl` is optional and is not a public-key digital signature.
- Package-manager install commands are accepted as free-form executable/argument strings.
- The binary executable value is joined with the cache bin directory without strict basename/path validation.
- Install-status persistence uses a fixed `.tmp` path and an in-memory read/modify/write without a cross-process lock.
- `getInstallStatus()` combines PATH presence with persisted metadata but does not verify the actual executable version against the catalog pin.

**Instruction**

Make the bundled catalog immutable by default, validate remote entries strictly, use a trusted host/signature policy, enforce safe paths, lock install-state updates and verify actual binary version after install and before routing.

---

# 5. P2 — product quality and consistency

## P2-25 — The orchestrator event log is not yet a monitoring system

**File:** `src/orchestrator/orchestrator.ts`

Events are currently generic log entries. They do not provide a reliable timeline for each worker with heartbeat, progress, output cursor, retry count, resource usage or artifact references. The dashboard is a static file snapshot.

**Instruction:** Make events first-class, typed, append-only records with sequence numbers and worker IDs. Distinguish conversation, turn, plan, work item, execution and adapter-attempt events. Let the front agent poll or subscribe to durable events.

## P2-26 — Current tests do not prove session concurrency or live cancellation

**Files:** `tests/sessions.test.ts`, `tests/orchestrator.test.ts`

The session test checks that two handles are returned; it does not measure peak concurrency. Its cancellation test uses `MOCK_MODE='succeed'`, so it does not prove cancellation of a live worker.

The orchestrator test starts session 1 with `await orch.start(...)`, then starts session 2 with another `await orch.start(...)`. These are sequential calls, not parallel scheduling. The “compiled response” is a joined string of run IDs and result names, not result synthesis.

**Instruction:** Add blocked-worker tests that measure overlapping process lifetimes, prove one cancellation stops only one live process, verify configured seat limits and test the final synthesized user response.

## P2-27 — The MCP integration test is labelled “stdio” but does not exercise stdio

**File:** `tests/mcp-async.test.ts`

This is a useful SDK client/server round trip, but it uses `InMemoryTransport.createLinkedPair()`. It does not launch a process using `StdioServerTransport`, so it cannot detect stdout protocol contamination or prove restart behavior.

**Instruction:** Keep the in-memory API test, but name its scope accurately. Add process-level stdio, worker PID/cancellation, restart/recovery and cross-provider approval/resume tests.

## P2-28 — README and archived plan overstate completion and contain contradictions

**Files:** `README.md`, `PLAN.md`, `.kilo/archive/CONSOLIDATED-PLAN-ARCHIVED.md`

The README describes routing, monitoring and result compilation as implemented, but it also contains conflicting adapter verification statements and a passing-test count that differs from the latest commit's stated count. The archived plan marks all tasks complete, including orchestration and catalog tasks, despite the open issues above.

**Instruction:** Create a new canonical product specification for the one-conversation/many-workers architecture. Keep the old plan as historical context, not proof that the new objective is complete. Update README claims only after acceptance tests exist.

## P2-29 — Declared Node engine range does not match `import.meta.dirname`

**Files:** `package.json`, `src/config/catalog.ts`, `.github/workflows/ci.yml`

`package.json` declares Node `>=18`, while `src/config/catalog.ts` uses `import.meta.dirname`, which is not available on the full declared Node 18 range. CI currently tests Node 22 only.

**Instruction:** Use a Node 18-compatible URL-to-path implementation or raise the declared engine minimum, and test that minimum in CI.

---

# 6. Recommended product architecture

The simplest architecture that matches your stated experience is five cooperating roles. This is a product separation, not a requirement to run five separate LLMs.

## A. Conversation Supervisor — the one agent the user experiences

This is the continuity owner. It holds the conversation and is the only role that speaks as AIR to the user.

Responsibilities:

- retain the conversation or a durable summary plus recent turns;
- interpret new messages and follow-ups;
- explain what AIR is doing without exposing internal tool noise;
- decide whether a new message changes, adds to, pauses or cancels existing work;
- ask only when a meaningful approval or clarification is needed;
- receive work-item results and produce one coherent response;
- remember which claims are verified and which remain uncertain.

The supervisor can be the existing host agent in VS Code/MCP. If AIR later adds its own chat product, implement it as a separate conversation layer over the same execution service.

**Workers never become the front agent.** They do not own the transcript and do not independently respond to the user.

## B. Planner — turns a user goal into work

The planner converts a request into a small typed plan. It should avoid over-decomposition: one worker is enough for a simple request.

Example: “Implement feature X, add tests and review the change.”

Possible plan:

1. inspect the relevant code and architecture;
2. identify the smallest implementation surface;
3. implement the feature in an isolated workspace;
4. run targeted tests and then the relevant full suite;
5. have a separate reviewer inspect the diff and test evidence;
6. compile the result for the user.

Not every request needs all these tasks. The plan should be adaptive and task-sized.

## C. Scheduler and worker executor — runs tools/models

The scheduler selects a tool/model for each work item based on required task capabilities, verified headless command support, actual provider/model identity, available free quota/local availability, context-window fit, health/cooldowns, concurrency and workspace locks, expected cost and latency.

It should launch independent tasks concurrently, but serialize conflicting writes unless it has created genuine independent worktrees.

The executor owns process launch, output, cancellation, timeouts, retries, checkpoints, artifacts and cleanup.

## D. Monitor — keeps the whole run understandable

Every worker emits events. The monitor turns low-level process activity into coherent status: queued, started, progressing, waiting for approval, rate-limited/retrying, completed, failed, cancelled, result ready.

The front agent should be able to ask for updates without blocking or restarting a worker.

## E. Result compiler — one answer back to the user

The result compiler collects structured worker results, verifies evidence and creates a final response for the Conversation Supervisor. It should not simply concatenate model outputs. It should resolve duplication/conflict, identify incomplete work, link evidence/artifacts and state what actually changed.

---

# 7. Recommended data model

The current `TaskInput` is too small to represent this lifecycle. Keep it for an adapter invocation if useful, but introduce explicit domain entities.

## Conversation

```ts
interface Conversation {
  conversationId: string;
  createdAt: string;
  updatedAt: string;
  title?: string;
  messages: ConversationMessage[];
  summary?: string;
  activeWorkIds: string[];
  userPreferences?: {
    freeOnly: boolean;
    paidFallbackRequiresApproval: boolean;
  };
}
```

The host front agent may own the actual transcript. If so, AIR can store a compact conversation reference, summary and message/work correlation rather than duplicating the entire host transcript.

## Work request and plan

```ts
interface WorkRequest {
  workId: string;
  conversationId: string;
  originatingTurnId: string;
  goal: string;
  cwd: string;
  constraints: string[];
  readOnly: boolean;
  budget: { maxPaidCost: number; freeOnly: boolean };
  state: WorkState;
  planId?: string;
}

interface WorkItem {
  workItemId: string;
  workId: string;
  parentWorkItemId?: string;
  dependsOn: string[];
  objective: string;
  acceptanceCriteria: string[];
  requiredCapabilities: string[];
  readOnly: boolean;
  allowedPaths?: string[];
  workspaceId: string;
  selectedAdapterId?: string;
  selectedProvider?: string;
  selectedModel?: string;
  estimatedCost?: number;
  state: WorkItemState;
  result?: WorkerResult;
}
```

## Execution and artifacts

```ts
interface Execution {
  executionId: string;
  workItemId: string;
  adapterId: string;
  executablePath: string;
  executableVersion?: string;
  provider: string;
  model: string;
  pid?: number;
  state: ExecutionState;
  startedAt?: string;
  heartbeatAt?: string;
  endedAt?: string;
  exitCode?: number;
  outputCursor?: number;
  cancellationRequestedAt?: string;
}

interface Artifact {
  artifactId: string;
  workItemId: string;
  kind: 'diff' | 'file' | 'test-report' | 'log' | 'summary';
  path?: string;
  contentHash: string;
  sizeBytes: number;
  redacted: boolean;
}
```

## Events

Every meaningful state transition should append an event with a monotonic sequence number:

```ts
interface WorkEvent {
  sequence: number;
  conversationId: string;
  workId: string;
  workItemId?: string;
  executionId?: string;
  type: string;
  timestamp: string;
  detail: Record<string, unknown>;
}
```

This event stream is how the front agent knows what is happening without repeatedly launching new work.

---

# 8. Recommended conversation and MCP/API behavior

The most important change for the user experience is to stop treating a follow-up as a new unrelated task.

Suggested tool/API surface:

| Operation | Purpose |
|---|---|
| `submit_message(conversationId, message)` | Append a new user turn to the same conversation; supervisor decides whether to create/adjust work |
| `start_work(conversationId, goal, constraints)` | Create a durable work request and return immediately |
| `get_conversation(conversationId)` | Retrieve summary, active work IDs and current user-facing state |
| `get_work_status(workId)` | Return plan/work-item/execution state |
| `get_events(workId, afterSequence)` | Return new progress events without re-sending old output |
| `approve_action(approvalId, decision)` | Approve a specific provider change, installation or permission request |
| `send_instruction(workId, message)` | Append a follow-up instruction to active work; do not blindly restart the worker |
| `cancel_work(workId)` | Cancel the full work tree and its child processes |
| `resume_work(workId)` | Resume a checkpointed or interrupted plan |
| `get_result(workId)` | Return the final structured result and artifacts |

The exact public method names can change. The invariant is what matters:

**A conversation persists while its work items change.** A new message can arrive while work continues. The front agent should be able to reply to the user, record the follow-up and update the plan without terminating unrelated workers.

### Example interaction

1. User: “Review this repo and fix the failing tests.”
2. Front agent: “I’ll inspect the test failures and delegate implementation and verification.”
3. AIR creates a work plan and starts independent inspection/review jobs.
4. User: “Also make sure we don't add paid dependencies.”
5. Front agent continues the conversation and sends that constraint to the existing work plan. It does not start a second, unrelated run.
6. AIR updates the plan and records the free-only dependency rule.
7. Workers report results and evidence.
8. Front agent returns one response: changes, tests, trade-offs and any unresolved item.
9. User: “Can you explain why you changed that file?”
10. The same front agent answers using its conversation context and recorded work artifacts. It does not need to rerun the task or switch user-facing identity.

### How to support follow-ups while workers execute

Do not make the supervisor wait for the worker's promise. Use a durable work queue and event stream.

For each new turn, the front agent decides whether to answer directly, append an instruction/constraint, create a child work item, ask for approval, or cancel/supersede part of the plan.

Some follow-ups will not be safe to apply to an already-running process. Record the instruction and apply it at the next safe boundary, or pause the worker and ask the user. Do not pretend a running process received an instruction if its command interface cannot accept one.

---

# 9. A practical free-first routing policy

The motto should become an enforceable runtime policy.

## Default policy

1. Prefer local tools/models that do not incur provider charges when they can satisfy the work item's requirements.
2. Next prefer providers/models with verified free availability for that user's account and current task.
3. Rank eligible candidates by capability fit, context window, health, current quota headroom and latency.
4. Keep a per-conversation and per-work budget. Default paid spend should be zero.
5. Never silently fall back to a paid provider because a free model is rate-limited.
6. If no free eligible worker remains, tell the front agent that work is blocked or request explicit paid-fallback consent.
7. Persist the resolved provider/model and cost classification used for each execution.

A tool being free to install does not make its model free to use. AIR should distinguish free software, local inference, free hosted inference tier, account-authenticated inference, paid inference and unknown cost. For the initial implementation, `unknown` must not be treated as `free`.

## Cost-aware routing

Do not rely on name heuristics such as a model string containing `free`, `mini` or `small`. Use catalog metadata with provenance, last-verified time and optional user overrides. Keep cost status separate from adapter verification status.

Track token/usage metadata where the adapter/provider exposes it. When usage is unavailable, label cost as unknown rather than inventing a number.

---

# 10. Prioritized implementation brief

This is the order I recommend. Do not start by adding more adapters, models, a larger dashboard or a new chat UI. First make the execution core coherent and safe.

## Phase A — make the current runtime safe and controllable

**A1. Fix canonical IDs.** One work ID must be created once and used by CLI/MCP, task state, orchestrator state, events, approvals, cancellation and resume.

**A2. Fix cancellation.** The actual AbortController/process handle must be owned by the orchestrator and exposed through the public API. Prove the child process exits.

**A3. Fix MCP stdout.** No agent output may be written to stdout in MCP mode. Use the persisted output/event channel.

**A4. Fix provider authorization.** Separate candidate discovery from user/provider consent. Wire CLI/MCP allow-provider settings and config policy. Require an exact proposal identity/hash on approval.

**A5. Fix trust provenance.** Repo config may not load adapter code, trigger silent installs or grant global trust. Disable dynamic remote module imports by default. Fix verify trust from global-only state.

**A6. Make permissions real.** Apply a shared permission policy to the adapters, and remove/reject settings that cannot actually be enforced.

**A7. Fix the evidence path.** Use one task-level initial workspace baseline across all failover attempts. Include commits and actual final artifacts.

## Phase B — create one durable execution engine

**B1.** Make the orchestrator return immediately with a durable Work handle; do not block MCP or the front agent on the whole process.

**B2.** Persist state transactionally. Use SQLite or another safe transactional store for conversations, plans, work items, executions and events. Do not rewrite one full JSON snapshot from multiple orchestrator instances.

**B3.** Implement the scheduler. Apply global/per-provider concurrency limits to every entry path, not just the legacy `runSessions()` helper.

**B4.** Implement workspace isolation. Create real Git worktrees or other isolated directories. A flag is not isolation.

**B5.** Implement worker heartbeats and recovery. Reconcile RUNNING processes on restart, record worker PIDs, manage process groups and release leases/slots safely.

**B6.** Unify the entry points. CLI, MCP and any future UI should call the same orchestration API. Remove or reduce duplicate task/failover logic in `bin/air.ts`, `src/mcp/server.ts` and `src/execution/sessions.ts`.

## Phase C — deliver the single-agent experience

**C1.** Introduce `ConversationId` and turn handling. Keep the host front agent as conversation owner when using MCP; AIR should store stable conversation/work references and support follow-ups.

**C2.** Add planner/work-graph creation. Start with a small set of deterministic task types and use an LLM planner only where it adds value.

**C3.** Add worker result contracts. Workers return structured outcomes, diffs, test reports, artifacts, uncertainties and evidence—not merely text tails.

**C4.** Add follow-up routing. A new user turn can update existing work, create a child work item, ask for approval or be answered by the front agent without disturbing active workers.

**C5.** Add one result compiler. Verify completion criteria, resolve duplicated/conflicting worker outputs and return one coherent response through the same front agent.

**C6.** Add progress delivery. Expose events/notifications or cursor-based polling so the user can continue the conversation while work is active.

## Phase D — make “free and verified” trustworthy

**D1.** Correct provider/model identity. Align adapter metadata, catalog metadata and actual command configuration.

**D2.** Separate adapter verification from runtime availability. Check executable path and version; gate unsupported versions.

**D3.** Validate free status. Model/account cost and quota status must be explicit. Use `unknown` when not verifiable.

**D4.** Make installation secure. Trusted sources, strict catalog schema, public-key signatures or pinned hashes from an independent trust channel, path validation and explicit approval.

**D5.** Add real adapter tests. CI should exercise the actual headless command path for every adapter marked supported, or mark it experimental and keep it out of routing.

---

# 11. Acceptance test plan — definition of done

The product is ready for a serious preview when these end-to-end tests pass. Unit tests are necessary but not sufficient.

## Conversation continuity

- [ ] A conversation receives a stable ID that survives multiple turns, worker launches and server restart.
- [ ] A user can send a follow-up while two workers are running.
- [ ] The follow-up appears in the existing conversation and is interpreted against active work.
- [ ] The follow-up does not accidentally start a duplicate unrelated task.
- [ ] The front agent retains the same user-facing role and generates the final answer.

## Planning and delegation

- [ ] A simple task produces one work item rather than unnecessary parallelism.
- [ ] A compound task is decomposed into appropriate independent work items.
- [ ] Research/read-only work can run concurrently with independent checks.
- [ ] Conflicting writes are serialized or assigned real isolated worktrees.
- [ ] Each work item has acceptance criteria and a measurable result state.
- [ ] The orchestrator can explain why each worker/tool/model was selected.

## Monitoring and lifecycle

- [ ] `start_work` returns before workers finish.
- [ ] Status and event polling show live state transitions and recent progress.
- [ ] A worker can fail/retry without losing previous outputs or checkpoints.
- [ ] Cancelling one work item terminates its process tree and leaves unrelated work running.
- [ ] Restarting AIR restores the conversation and accurately reconciles active/abandoned work.
- [ ] Approval can be completed using exactly the ID returned when work was created.

## One coherent result

- [ ] Worker outputs are persisted as structured artifacts.
- [ ] The result compiler verifies completion criteria instead of trusting a worker's “done” text.
- [ ] The front agent returns one coherent response, not a list of raw model replies.
- [ ] The response distinguishes verified results from unresolved or failed work.
- [ ] A follow-up question can refer to a previous diff/test/result without rerunning the entire plan.

## Free-first and safety

- [ ] A zero-paid-budget task never calls a paid/unknown-cost model silently.
- [ ] Cross-provider data transfer requires explicit policy/consent.
- [ ] Repo config cannot load executable code, trigger silent installs or grant global trust.
- [ ] Workers cannot exceed assigned read/write/shell/network permissions.
- [ ] Every adapter invocation records actual provider/model/version, not just a default label.
- [ ] Secrets are redacted in output, logs, handoffs, events and final responses.
- [ ] A model/tool failover preserves the run's original workspace baseline and prior worker changes.

## Concurrency and recovery

- [ ] The configured global concurrency cap is respected by CLI and MCP paths.
- [ ] Per-provider and per-project caps are also respected.
- [ ] Multiple AIR processes cannot steal live seats or locks.
- [ ] Concurrent health/install/session updates cannot overwrite one another.
- [ ] A worker launched in a worktree really runs in that worktree.
- [ ] A restart cannot leave a process running without an owner or persisted execution record.

---

# 12. Final recommendation

**Do not interpret “one super agent” as “run more agents at once.” The differentiator is continuity and orchestration.**

The user should always speak to the same front agent, while AIR treats every other model/tool as an internal worker. The front agent owns the goal and conversation; AIR owns the plan, execution, monitoring and evidence; the front agent then explains the result.

The next major milestone should be one complete vertical slice:

1. A user starts one conversation and requests a compound task.
2. The front agent creates one AIR work ID.
3. AIR creates a plan with two independent read-only workers and one dependent implementation worker.
4. AIR runs the first workers concurrently under a strict free-only budget.
5. The user sends a follow-up while they are running.
6. The same conversation receives that instruction and updates the plan.
7. The implementation worker runs in an actual isolated workspace.
8. AIR monitors each worker, handles a simulated rate limit and preserves the work.
9. A verification/review worker checks the output.
10. AIR compiles one structured result and returns it to the same front agent.
11. The user asks a follow-up about the diff, and the front agent answers using the same conversation and artifacts.

If AIR can do that reliably, the architecture will match the product idea. More adapters, another model catalog, more CLI commands or another dashboard before this vertical slice is complete will not move the product nearly as far.

---

# 13. CI and evidence caveat

The latest commit message reports typecheck pass, lint clean and 220 tests passed/5 skipped. The current workflow definition includes app/test typechecks, unit/integration tests, build, lint, package smoke and a separate real-binary smoke job.

However, the latest commit's combined status lookup returned no status records, and the workflow-run lookup available during this review did not return a push run for that commit. I therefore cannot independently certify the latest GitHub Actions run as green.

The latest workflow's real-binary job installs Aider and attempts Goose. The other adapter tests are conditional on binaries already being present and are skipped when absent; GitHub Copilot has no real-binary smoke test in the inspected suite. The latest all-six local verification claim should be preserved as local evidence, but should not be represented as six adapters continuously verified by CI.

---

# 14. Source links reviewed

All links are pinned to commit `947428fa8067250f9b7b540e99a6517c1ffb4327`.

## Product and documentation

- [Latest commit](https://github.com/radmanmilos/air/commit/947428fa8067250f9b7b540e99a6517c1ffb4327)
- [README](https://github.com/radmanmilos/air/blob/947428fa8067250f9b7b540e99a6517c1ffb4327/README.md)
- [PLAN](https://github.com/radmanmilos/air/blob/947428fa8067250f9b7b540e99a6517c1ffb4327/PLAN.md)
- [Archived consolidated plan](https://github.com/radmanmilos/air/blob/947428fa8067250f9b7b540e99a6517c1ffb4327/.kilo/archive/CONSOLIDATED-PLAN-ARCHIVED.md)
- [CI workflow](https://github.com/radmanmilos/air/blob/947428fa8067250f9b7b540e99a6517c1ffb4327/.github/workflows/ci.yml)

## Orchestrator and interfaces

- [Central orchestrator](https://github.com/radmanmilos/air/blob/947428fa8067250f9b7b540e99a6517c1ffb4327/src/orchestrator/orchestrator.ts)
- [CLI](https://github.com/radmanmilos/air/blob/947428fa8067250f9b7b540e99a6517c1ffb4327/bin/air.ts)
- [MCP server](https://github.com/radmanmilos/air/blob/947428fa8067250f9b7b540e99a6517c1ffb4327/src/mcp/server.ts)
- [Task/session manager](https://github.com/radmanmilos/air/blob/947428fa8067250f9b7b540e99a6517c1ffb4327/src/execution/sessions.ts)
- [Task types](https://github.com/radmanmilos/air/blob/947428fa8067250f9b7b540e99a6517c1ffb4327/src/types/index.ts)
- [Task state persistence](https://github.com/radmanmilos/air/blob/947428fa8067250f9b7b540e99a6517c1ffb4327/src/execution/task-state.ts)

## Routing and adapters

- [Router](https://github.com/radmanmilos/air/blob/947428fa8067250f9b7b540e99a6517c1ffb4327/src/router/router.ts)
- [Model catalog/recommender](https://github.com/radmanmilos/air/blob/947428fa8067250f9b7b540e99a6517c1ffb4327/src/router/catalog.ts)
- [Adapter registry](https://github.com/radmanmilos/air/blob/947428fa8067250f9b7b540e99a6517c1ffb4327/src/adapters/registry.ts)
- [Adapter contract](https://github.com/radmanmilos/air/blob/947428fa8067250f9b7b540e99a6517c1ffb4327/src/adapters/adapter.ts)
- [Bundled free-tool catalog](https://github.com/radmanmilos/air/blob/947428fa8067250f9b7b540e99a6517c1ffb4327/config/catalog.json)
- [Catalog loader](https://github.com/radmanmilos/air/blob/947428fa8067250f9b7b540e99a6517c1ffb4327/src/config/catalog.ts)

## Config, security and installation

- [Config schema](https://github.com/radmanmilos/air/blob/947428fa8067250f9b7b540e99a6517c1ffb4327/src/config/schema.ts)
- [Config loader](https://github.com/radmanmilos/air/blob/947428fa8067250f9b7b540e99a6517c1ffb4327/src/config/loader.ts)
- [Verify trust gate](https://github.com/radmanmilos/air/blob/947428fa8067250f9b7b540e99a6517c1ffb4327/src/context/verify.ts)
- [Provider allow-list](https://github.com/radmanmilos/air/blob/947428fa8067250f9b7b540e99a6517c1ffb4327/src/security/allowlist.ts)
- [Redaction rules](https://github.com/radmanmilos/air/blob/947428fa8067250f9b7b540e99a6517c1ffb4327/src/security/redact.ts)
- [Streaming redactor](https://github.com/radmanmilos/air/blob/947428fa8067250f9b7b540e99a6517c1ffb4327/src/security/streaming-redact.ts)
- [Handoff packer](https://github.com/radmanmilos/air/blob/947428fa8067250f9b7b540e99a6517c1ffb4327/src/context/handoff.ts)
- [Installer](https://github.com/radmanmilos/air/blob/947428fa8067250f9b7b540e99a6517c1ffb4327/src/installer/installer.ts)
- [Install status store](https://github.com/radmanmilos/air/blob/947428fa8067250f9b7b540e99a6517c1ffb4327/src/installer/status.ts)

## Execution, state and tests

- [Process runner](https://github.com/radmanmilos/air/blob/947428fa8067250f9b7b540e99a6517c1ffb4327/src/execution/runner.ts)
- [Output types](https://github.com/radmanmilos/air/blob/947428fa8067250f9b7b540e99a6517c1ffb4327/src/types/outcome.ts)
- [Workspace checkpoint](https://github.com/radmanmilos/air/blob/947428fa8067250f9b7b540e99a6517c1ffb4327/src/context/checkpoint.ts)
- [Lock implementation](https://github.com/radmanmilos/air/blob/947428fa8067250f9b7b540e99a6517c1ffb4327/src/utils/lock.ts)
- [Concurrency slots](https://github.com/radmanmilos/air/blob/947428fa8067250f9b7b540e99a6517c1ffb4327/src/utils/concurrency.ts)
- [Health tracker](https://github.com/radmanmilos/air/blob/947428fa8067250f9b7b540e99a6517c1ffb4327/src/health/tracker.ts)
- [Orchestrator tests](https://github.com/radmanmilos/air/blob/947428fa8067250f9b7b540e99a6517c1ffb4327/tests/orchestrator.test.ts)
- [MCP integration tests](https://github.com/radmanmilos/air/blob/947428fa8067250f9b7b540e99a6517c1ffb4327/tests/mcp-async.test.ts)
- [Session tests](https://github.com/radmanmilos/air/blob/947428fa8067250f9b7b540e99a6517c1ffb4327/tests/sessions.test.ts)
- [Real-binary smoke tests](https://github.com/radmanmilos/air/blob/947428fa8067250f9b7b540e99a6517c1ffb4327/tests/smoke-real-binary.test.ts)
