# AIR — Architecture Review and Implementation Plan

> **Document type:** AI-agent implementation specification  
> **Target repository:** `https://github.com/radmanmilos/air`  
> **Default branch reviewed:** `main`  
> **Review snapshot:** 2026-10-30  
> **Primary objective:** Build a safe, reliable orchestrator for existing AI coding agents.  
> **Instruction priority:** Safety and correctness > reliable execution and recovery > maintainability > feature breadth.

---

## 0. Instructions to the implementation agent

Treat this document as the implementation contract for AIR.

1. Inspect the current repository before changing anything. Do not assume this document perfectly reflects the latest checkout.
2. Update `PLAN.md` to reflect the decisions and phases in this document before implementing substantial features.
3. Implement incrementally. Keep the project buildable and tested after every phase.
4. Do not create placeholder implementations and report them as complete. A feature is complete only when its behavior works and has tests.
5. Do not modify unrelated projects or repositories. Work only inside the AIR repository unless the user explicitly authorizes otherwise.
6. Do not perform destructive Git operations, discard user changes, commit, push, or rewrite repository history unless explicitly requested.
7. When a requirement depends on agent CLI behavior, verify it against the installed version and current official documentation. Do not assume different agents have interchangeable flags or output formats.
8. When a requirement is ambiguous, choose the safest reversible behavior, document the assumption, and continue. Ask the user only when a decision is both consequential and cannot be safely defaulted.

### Definition of done

A phase is complete only when:

- Its code is implemented, not stubbed.
- Automated tests cover its normal and failure paths.
- `npm run build`, `npm run typecheck`, and `npm test` pass (after those scripts are introduced).
- User-facing documentation describes actual behavior rather than planned behavior.
- Failure messages are actionable and do not expose secrets.

---

## 1. Product intent

AIR is a unified AI-tool orchestrator with a CLI and an MCP server.

It should:

- Accept a coding task from a user or an MCP client.
- Discover installed and usable agent CLIs.
- Determine which agent/provider/model candidates can perform the task.
- Explain its routing decision.
- Launch the selected agent as a child process.
- Stream output while retaining bounded data for parsing and recovery.
- Detect and classify execution failures.
- Offer a controlled failover to another suitable candidate.
- Preserve repository state and task context when handing work to another agent.
- Track health and cooldowns at the correct level.

AIR is an orchestration layer. It must not reimplement the coding-agent experience or replace the agents' own permission systems.

### Initial agent integrations

- Aider
- Goose
- OpenCode
- Kilo Code

The architecture must allow new adapters to be added without changing the router's core logic.

---

## 2. Current repository baseline

The reviewed repository was an initial scaffold with one commit on `main` (`Initial air scaffold`, 2026-10-30).

### Files observed

```text
.
├── .gitignore
├── PLAN.md
├── README.md
├── bin/
│   └── air.ts
├── config/
│   └── models/
│       ├── aider-free-models.yml
│       └── check-free-models.ps1
├── package.json
├── package-lock.json
└── tsconfig.json
```

### Observed implementation state

- `bin/air.ts` declares `run`, `status`, `route-test`, `config`, `health`, and `mcp` commands.
- Those commands currently print `Not implemented yet`.
- There is no `src/` directory in the reviewed tree.
- There is no automated test directory or test setup in the reviewed tree.
- No configuration loader, schema, router, adapter, health tracker, context packer, or MCP server implementation was present.
- `package.json` declares `main: ./dist/index.js`, but no corresponding source entrypoint was present.

### Known scaffold issues to verify and fix

1. `config/models/check-free-models.ps1` reads `tools\aider-free-models.yml`, but the model list is located at `config/models/aider-free-models.yml`.
2. The model-check script validates listed backup models but does not validate the YAML `default` model.
3. The PowerShell `$Tool` parameter appears unused.
4. The PowerShell script reads `OPENAI_API_KEY`; verify and use the correct credential variable for OpenRouter, preferably `OPENROUTER_API_KEY`.
5. The script's HTTP Referer and application title currently identify another project. Make these configurable or set them to AIR.
6. The script's YAML parsing is rudimentary. Avoid assuming every line beginning with `-` is a valid model entry; use a reliable parser or deliberately constrain and validate the format.
7. `package.json` declares `./dist/index.js`, but the reviewed source tree does not contain an index source file. Either add the intended entrypoint or remove/correct the `main` field.
8. Ensure the CLI entrypoint has the correct Node shebang and executable packaging behavior for supported platforms.
9. README claims must be aligned with what is actually implemented.
10. Add test, typecheck, and lint infrastructure.

Re-check all of these against the current checkout before acting; the repository may have changed since the review snapshot.

---

## 3. Non-negotiable design principles

### 3.1 Preserve work

- Never reset, clean, overwrite, or discard a user's changes as part of normal AIR operation.
- Never assume a replacement agent should restart the original task from scratch.
- A replacement agent must inspect the current working tree and continue from the actual state.
- Capture the state before and after every agent execution.

### 3.2 Separate routing approval from execution permissions

These are independent decisions:

1. Is AIR allowed to switch to another agent?
2. What is the selected agent allowed to do (edit files, execute shell commands, commit, etc.)?

Approving a failover must never grant broader permissions to the replacement agent.

### 3.3 Prefer safe defaults

- Failover mode defaults to `ask`.
- Automatic failover must be an explicit opt-in.
- Do not enable unrestricted agent permissions by default.
- Do not enable automatic Git commits by default.
- Do not invoke a shell with concatenated, untrusted task strings.
- Do not log credentials or transmit secrets in handoff context.

### 3.4 Keep adapters independent

Each agent has its own CLI syntax, process lifecycle, output format, authentication model, and permission behavior. Those differences belong in adapters, not in the router.

### 3.5 Make decisions explainable

Every route and failover proposal must state the reason, selected agent/provider/model, relevant availability information, and viable alternatives.

### 3.6 Be cross-platform

Support Windows, macOS, and Linux. Do not hard-code Windows drive paths or assume that `~/.config` is the correct configuration location on every platform.

---

## 4. Target architecture

Use clear modules with explicit responsibilities. Names may be adjusted to fit the existing repository, but responsibility boundaries must remain.

```text
bin/
  air.ts                    # CLI entrypoint
src/
  adapters/                 # Aider, Goose, OpenCode, Kilo adapters
  classifier/               # Task feature extraction/classification
  config/                   # Config loading, merging, validation, defaults
  context/                  # Execution snapshots and handoff packages
  execution/                # Process runner and task lifecycle
  health/                   # Health events, cooldowns, history
  mcp/                      # MCP server and tools
  router/                   # Candidate generation, scoring, explanation
  security/                 # Redaction, sensitive-path policy
  types/                    # Shared domain types
  utils/                    # Platform paths, logging, errors
config/
  default.yaml
  schema.json
  models/
  rules/
tests/
  unit/
  integration/
```

### 4.1 Core domain separation

Keep these concepts distinct:

- **Agent/tool:** Aider, Goose, OpenCode, or Kilo.
- **Provider:** OpenRouter, Anthropic, OpenAI, and others.
- **Model:** A concrete model identifier exposed by a provider.
- **Candidate:** A valid combination of agent, provider, model, and capabilities.
- **Task:** The user's original request and execution constraints.
- **Run:** One attempt by one candidate to execute a task.
- **Task execution:** The complete lifecycle, potentially containing multiple runs and failover attempts.

Do not represent agent health, provider health, and model health as one boolean.

### 4.2 Suggested core types

Use types equivalent to the following. Adjust details where the real adapters require them.

```ts
export type ErrorCategory =
  | 'RATE_LIMIT'
  | 'QUOTA_EXCEEDED'
  | 'MODEL_UNAVAILABLE'
  | 'AUTH_ERROR'
  | 'NETWORK_ERROR'
  | 'PROCESS_CRASH'
  | 'TOOL_NOT_INSTALLED'
  | 'TIMEOUT'
  | 'USER_CANCELLED'
  | 'PERMISSION_DENIED'
  | 'UNKNOWN';

export interface ToolCapabilities {
  headlessExecution: boolean;
  structuredOutput: boolean;
  fileEditing: boolean;
  shellAccess: boolean;
  imageInput: boolean;
  supportsCancellation: boolean;
}

export interface ExecutionCandidate {
  id: string;
  tool: string;
  provider: string;
  model: string;
  capabilities: ToolCapabilities;
}

export interface TaskInput {
  id: string;
  prompt: string;
  cwd: string;
  files?: string[];
  preferredTool?: string;
  preferredProvider?: string;
  preferredModel?: string;
  mode: 'ask' | 'auto';
}

export interface CommandSpec {
  executable: string;
  args: string[];
  cwd: string;
  env?: Record<string, string>;
}

export interface ExecutionResult {
  runId: string;
  candidate: ExecutionCandidate;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  startedAt: string;
  finishedAt: string;
  cancelled: boolean;
  timedOut: boolean;
  outputSummary: string;
  errorCategory: ErrorCategory;
}
```

These are design targets, not permission to create unused abstractions. Implement only the fields needed by real behavior and tests.

---

## 5. Task lifecycle and state machine

Represent the task lifecycle explicitly. Do not infer state from scattered booleans.

Suggested states:

```text
QUEUED
  -> DISCOVERING
  -> ROUTING
  -> RUNNING
  -> SUCCEEDED

RUNNING
  -> FAILURE_DETECTED
  -> AWAITING_APPROVAL
  -> SWITCHING
  -> RUNNING (new run)

Any active state
  -> CANCELLED

Any unrecoverable state
  -> FAILED
```

Rules:

- `AWAITING_APPROVAL` is used only when failover is possible and approval is required.
- `SWITCHING` is not entered until the previous process is confirmed stopped and its final state is captured.
- `SUCCEEDED` requires a successful adapter result, not merely the absence of a detected rate-limit string.
- `CANCELLED` must remain distinct from an agent or provider failure.
- Every state transition must be recorded with a timestamp and reason.
- Do not allow two active runs for the same task unless a deliberate future feature supports this safely.

### 5.1 Run record

Persist a record for every agent attempt. Include:

- Task ID and run ID.
- Agent, provider, model, and adapter version.
- Working directory.
- Start/end time and duration.
- Process exit code and termination signal.
- Error category and relevant provider retry metadata.
- Bounded stdout/stderr summaries or references to securely stored logs.
- Git baseline and final snapshot identifiers.
- Handoff relationship to the next run, if any.

Persist only what is necessary. Apply log rotation and retention limits.

---

## 6. Process execution requirements

Build one well-tested process runner used by all adapters.

MUST:

- Use `child_process.spawn` with executable and argument array separated.
- Avoid `shell: true` for normal execution.
- Set the intended working directory explicitly.
- Stream stdout and stderr to the user in real time.
- Parse output incrementally while also keeping bounded buffers.
- Record exit code, signal, spawn errors, and timestamps.
- Handle `SIGINT`, `SIGTERM`, Windows termination differences, and child-process cleanup.
- Support user cancellation and configurable timeouts.
- Prevent orphaned child processes where the platform allows process-group termination.
- Avoid unbounded memory growth from long-running or noisy agents.
- Ensure MCP/stdin-stdout protocols are not polluted by AIR diagnostic output.

Do not assume an agent's human-readable output is a stable API. Prefer structured output when supported by the installed version.

### 6.1 Adapter responsibilities

Each adapter should expose behavior equivalent to:

```ts
interface IAirAdapter {
  detect(): Promise<ToolStatus>;
  getCapabilities(): ToolCapabilities;
  buildCommand(input: AdapterTaskInput): CommandSpec;
  parseOutput(chunk: OutputChunk): ParsedEvent[];
  classifyError(result: ExecutionResult): ClassifiedError;
}
```

Execution itself may be delegated to the shared process runner. Keep adapter-specific command building and parsing inside the adapter.

### 6.2 CLI command verification

The review identified these current CLI directions as likely integration targets:

- Aider: `aider` with message/message-file options.
- Goose: `goose run` with non-interactive text/instruction input where supported.
- OpenCode: `opencode run`.
- Kilo Code: `kilo run` (the executable is `kilo`, not necessarily `kilocode`).

These are not hard-coded assumptions. Before implementing each adapter:

1. Detect the installed CLI and version.
2. Consult its current official documentation or `--help` output.
3. Verify headless/non-interactive operation.
4. Verify model/provider flags and environment variable conventions.
5. Verify structured output support.
6. Verify permission controls and auto-commit defaults.
7. Write adapter tests for the exact command construction.

Document supported versions and known limitations.

---

## 7. Safe context handoff

Context handoff is a first-class feature and the primary differentiator of AIR.

### 7.1 Capture before execution

Before launching the first agent, capture:

- Repository root and working directory.
- Current Git branch and HEAD.
- Full initial status: staged, unstaged, and untracked paths.
- Initial diff where applicable.
- Relevant project instruction files (for example `AGENTS.md`).
- The user's original task and explicit constraints.

Do not modify or normalize the user's working tree while capturing it.

### 7.2 Capture after every run

After every agent attempt, capture:

- Final Git status and diff.
- Files changed, added, removed, or renamed.
- Last useful output and structured events.
- Error category and failure details.
- Any explicit progress or next-step summary from the agent.

Distinguish changes that existed before AIR started from changes made during the AIR task. Git snapshots are not enough if unrelated user activity can occur concurrently; document any limitation and use conservative attribution.

### 7.3 Handoff package

The replacement agent should receive a structured package containing:

1. Original task (preserved verbatim).
2. Explicit constraints and relevant repository rules.
3. Summary of completed work.
4. Remaining work and known blockers.
5. Changed-file list.
6. Relevant diff or concise diff summary.
7. Test/build commands already run and their results.
8. Failure reason and relevant output excerpt.
9. Clear instruction to inspect the current working tree before editing.
10. Clear instruction to continue from the current state rather than redo completed work.

Do not attach the entire repository by default. Use a configurable context budget and include only relevant material.

### 7.4 Handoff safety

- Never reset, clean, stash, checkout over, or revert user changes automatically.
- Never launch a replacement while the prior process may still be writing.
- Never assume all changes in the working tree belong to AIR.
- Do not automatically commit or push.
- If state attribution is uncertain, tell the user and request an explicit decision before risky operations.
- Consider isolated Git worktrees as a future opt-in execution mode; do not make this a blocker for the first safe implementation.

---

## 8. Security and permissions

### 8.1 Agent permissions

- Preserve each agent's native permission controls.
- Do not pass broad auto-approval flags by default.
- Do not silently enable shell access or unrestricted file editing.
- Disable automatic commits by default where configurable.
- Make autonomous execution a separate explicit setting from automatic failover.
- Display the effective permission mode before execution when it is material.

### 8.2 Sensitive data

Exclude or redact, by default:

- `.env` and `.env.*` files.
- Private keys and certificates containing private material.
- API tokens and credentials.
- Password files and auth caches.
- Common cloud credential directories.
- User-configured sensitive paths.

Do not rely only on filenames. Add secret-pattern scanning/redaction for logs and handoff content, with tests.

Never print secret values in errors. Avoid storing secrets in task records or execution logs.

### 8.3 Repository-local configuration

Treat `.airrc.yaml` as untrusted input because it may come from a cloned repository.

- Validate it against a strict schema.
- Reject unsupported keys and invalid values.
- Do not allow it to execute arbitrary commands or inject arbitrary shell fragments.
- Keep executable paths and environment overrides constrained and explicit.
- Clearly define precedence between built-in defaults, global config, repository config, and CLI arguments.
- Consider warning or requiring trust approval before honoring sensitive repo-level settings.

---

## 9. Routing and candidate scoring

Start with deterministic, explainable rules. Do not introduce an LLM-based classifier as a prerequisite.

### 9.1 Signals

Use available signals such as:

- Task intent/category (edit, debug, refactor, tests, docs, UI, image/screenshot, etc.).
- Explicit file paths and extensions.
- Number of files and repository scope.
- Required capabilities (headless, image input, shell, structured output).
- User's preferred agent/provider/model.
- Tool installation and authentication status.
- Provider/model availability and cooldown.
- Historical task success and failure data.
- Configured cost/performance preference.

### 9.2 Scoring

Use a transparent weighted score, with weights in configuration or documented defaults. A candidate must be filtered out first if it is unavailable or lacks a required capability.

Illustrative model:

```text
score(candidate, task) =
    task_fit
  + capability_fit
  + model_fit
  + provider_availability
  + historical_success
  + user_preference
  - cooldown_penalty
  - configured_cost_penalty
```

Do not pretend to know provider cost or model availability if no reliable data source exists. Mark unknown values as unknown rather than inventing them.

### 9.3 Explainability

`air route-test "..."` must show:

- Task classification and confidence/why it was inferred.
- Candidate list and excluded candidates.
- Selected tool/provider/model.
- Reasons for selection.
- Relevant availability/cooldown state.
- Alternatives and reasons they ranked lower.

### 9.4 User overrides

Support overrides equivalent to:

```bash
air run "Fix the navbar" --tool opencode
air run "Fix the navbar" --model provider/model
air route-test "Fix the navbar"
```

Adapt the exact flags if necessary, but document and test them. Explicit user choices must take precedence over automatic preference scoring, subject to hard availability and safety constraints.

---

## 10. Health tracking and failure classification

Track health separately at these levels:

- Agent executable/installation.
- Agent authentication/configuration where detectable.
- Provider.
- Model.

A rate limit for one model must not automatically mark the entire agent unavailable.

### 10.1 Normalized error categories

Implement at least:

- `RATE_LIMIT`
- `QUOTA_EXCEEDED`
- `MODEL_UNAVAILABLE`
- `AUTH_ERROR`
- `NETWORK_ERROR`
- `PROCESS_CRASH`
- `TOOL_NOT_INSTALLED`
- `TIMEOUT`
- `USER_CANCELLED`
- `PERMISSION_DENIED`
- `UNKNOWN`

### 10.2 Classification rules

- Prefer structured exit/error events and provider metadata.
- Parse `Retry-After` or equivalent retry information where available.
- Use adapter-specific output patterns only as a fallback.
- Store the evidence/reason for each classification.
- Do not trigger failover for every error category.
- `USER_CANCELLED` must never be treated as a provider failure.
- Authentication and permission errors should be surfaced clearly rather than repeatedly retrying alternate models with the same broken credentials.

### 10.3 Cooldowns

- Scope cooldowns to the narrowest known failing component (prefer model/provider over whole agent).
- Use provider-supplied retry windows when available.
- Otherwise use bounded exponential backoff with jitter.
- Persist cooldown timestamps and failure history.
- Allow `air status` to explain active cooldowns and their reasons.

---

## 11. Configuration design

Support:

- Platform-appropriate global config directory.
- Optional repository-local `.airrc.yaml`.
- Environment variables for secrets and runtime overrides.
- CLI arguments with highest precedence.

Document precedence explicitly. A suggested precedence is:

```text
CLI arguments > environment overrides > repository config > global config > built-in defaults
```

Use a strict schema with useful validation errors.

Configuration should define:

- Failover mode (`ask` or `auto`).
- Tool enablement and executable overrides.
- Provider/model candidates.
- Routing preferences and scoring weights.
- Cooldown/backoff settings.
- Timeouts and output-buffer limits.
- Sensitive path exclusions.
- Logging and retention limits.
- Permission policy preferences that do not override agent-native safety defaults.

Do not hard-code a particular free-model list as the router's core source of truth. Model lists should be configurable and refreshable. Treat availability checks as snapshots, not guarantees that a subsequent inference request will succeed.

---

## 12. CLI requirements

Implement and document these commands:

| Command | Required behavior |
|---|---|
| `air run <task>` | Discover, route, execute, stream, and optionally fail over. |
| `air route-test <task>` | Explain routing without executing an agent. |
| `air status` | Show tools, providers, models, and active cooldowns. |
| `air health` | Show health/failure history and summary statistics. |
| `air config` | Validate and display effective configuration; never reveal secrets. |
| `air mcp` | Start the MCP server using stdio by default. |

`air run` should support:

- Explicit tool/provider/model override.
- Explicit failover mode override.
- Optional file hints.
- Working-directory selection, defaulting to current directory.
- Cancellation.
- Clear final status and run ID.

Ensure `--help` and invalid-argument errors work before any agent is installed.

---

## 13. MCP requirements

Design MCP around task IDs and asynchronous lifecycle state rather than assuming every client can interact with a terminal prompt.

Suggested tools:

- `run_task`
- `get_task_status`
- `get_task_output`
- `approve_failover`
- `cancel_task`
- `get_status`

Requirements:

- Use the official MCP SDK and deliberately select a supported version.
- Pin dependency compatibility and test the chosen version.
- Use stdio by default.
- Write protocol messages only to stdout; diagnostics go to stderr or a configured log.
- Represent approval-required failover as a task state that the MCP client can inspect and approve.
- Validate all MCP inputs and enforce the same permissions/security rules as the CLI.
- Handle client disconnects and cancellation predictably.
- Do not let MCP requests bypass task/run lifecycle controls.

---

## 14. Testing strategy

Use unit tests for deterministic logic and integration tests with mock executable processes. Do not require paid API calls for the standard test suite.

### 14.1 Required scenarios

1. Agent succeeds normally.
2. Agent exits with a rate-limit error.
3. Agent crashes during execution.
4. Agent changes files and then hits a rate limit.
5. Replacement agent receives a correct handoff and continues from the current working tree.
6. All candidate agents fail.
7. Replacement agent is unavailable.
8. Authentication fails.
9. User rejects a failover.
10. User cancels execution.
11. Cooldown expires.
12. Initial working tree contains unrelated staged, unstaged, and untracked user changes.
13. Sensitive files and secrets are excluded/redacted from handoff and logs.
14. Two AIR tasks run without corrupting one another.
15. A child process ignores graceful termination and AIR performs bounded cleanup.
16. Output exceeds configured buffer limits without unbounded memory growth.
17. Structured output is parsed incrementally across arbitrary chunk boundaries.
18. Invalid or malicious repository configuration is rejected safely.
19. CLI arguments override configuration according to documented precedence.
20. MCP approval and cancellation follow the same lifecycle state machine.

### 14.2 Test quality requirements

- Assert observable behavior, not only that methods were called.
- Include Windows-specific process/path tests where practical.
- Use temporary Git repositories for handoff tests.
- Use deterministic fake clocks for cooldown/backoff tests.
- Use mock binaries to test actual spawn arguments, stdout/stderr, exit codes, signals, and timeouts.
- Do not require network access for unit tests.

### 14.3 Required scripts

Introduce scripts equivalent to:

```json
{
  "scripts": {
    "build": "tsc",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint .",
    "dev": "tsx bin/air.ts"
  }
}
```

Choose compatible dependencies and configure them correctly. These commands are targets, not a claim that the packages already exist.

---

## 15. Phased implementation plan

### Phase 0 — Reconcile plan and baseline

**Deliverables**

- Re-inspect current repository and identify changes since the review snapshot.
- Update `PLAN.md` with this architecture, risks, phase gates, and acceptance criteria.
- Correct README claims so implemented and planned functionality are clearly distinguished.
- Record supported Node.js versions and platform targets.

**Exit criteria**

- Plan matches actual repository structure.
- No undocumented assumptions remain about current code.

### Phase 1 — Foundation

**Deliverables**

- TypeScript project structure and valid package entrypoints.
- CLI scaffold with working help/version behavior.
- Cross-platform config/cache/log paths.
- Default config and strict schema validation.
- Config merge/precedence behavior.
- Structured logger with secret redaction and bounded retention.
- Test framework, lint, typecheck, and build scripts.

**Exit criteria**

- Config loads and validates on Windows/macOS/Linux.
- Invalid config produces useful errors.
- No secret values are printed by `air config` or logs.
- All foundation tests pass.

### Phase 2 — Process runner and first real adapter

**Deliverables**

- Shared safe process runner.
- Tool discovery and version detection.
- One complete adapter (recommended: Aider, subject to verified local availability).
- Real-time streaming and bounded output capture.
- Cancellation, timeout, exit status, and spawn-error handling.
- No automatic commits or broad permission bypass by default.

**Exit criteria**

- Mock-process tests cover success, error, timeout, cancellation, large output, and cleanup.
- A real local smoke test can execute a small task with the selected agent when configured.
- CLI reports accurate result and run ID.

### Phase 3 — Second adapter and reliable failover

**Deliverables**

- A second fully working adapter (choose based on verified environment and headless capability).
- Task/run lifecycle state machine.
- Git baseline/final snapshot capture.
- Handoff package generation.
- Failover proposal and explicit approval flow.
- Safe continuation using the existing working tree.

**Exit criteria**

- Simulated partial changes survive failover.
- No new agent starts before the previous process is stopped and captured.
- User changes are not overwritten or discarded.
- Rejecting failover leaves the workspace unchanged by AIR.
- End-to-end mock tests prove handoff correctness.

### Phase 4 — Routing and health

**Deliverables**

- Task classification and feature extraction.
- Candidate generation and capability filtering.
- Explainable weighted scoring.
- Provider/model-level health and cooldowns.
- `route-test`, `status`, and `health` output.
- Explicit routing overrides.

**Exit criteria**

- Identical inputs and config yield deterministic route decisions.
- Unavailable candidates are excluded with explanations.
- Model-level failures do not incorrectly disable unrelated models or agents.
- Cooldown tests pass with a fake clock.

### Phase 5 — Remaining adapters

**Deliverables**

- Goose adapter.
- OpenCode adapter.
- Kilo Code adapter.
- Per-adapter command, permission, structured-output, and error parsing tests.
- Adapter capability matrix in documentation.

**Exit criteria**

- Each adapter has a verified headless execution path or is clearly marked unsupported/limited.
- Router core does not need tool-specific branching to add or use an adapter.
- All adapters pass the shared adapter contract tests.

### Phase 6 — MCP

**Deliverables**

- MCP server over stdio.
- Task submission, status, output, failover approval, cancellation, and status tools.
- Input validation and lifecycle integration.
- MCP protocol tests and a documented client setup example.

**Exit criteria**

- Server stdout contains only MCP protocol data.
- MCP clients can inspect and approve a pending failover.
- MCP execution uses the same safety and permissions as CLI execution.

### Phase 7 — Hardening and release

**Deliverables**

- Cross-platform test matrix.
- Configuration migration/versioning strategy.
- Installation/uninstallation instructions.
- Troubleshooting documentation.
- Security review of logs, context packaging, repo config, and process execution.
- Release checklist and known limitations.

**Exit criteria**

- Clean install and build succeed on supported platforms.
- All automated tests pass.
- README and CLI help match actual behavior.
- No known path silently discards user work or exposes secrets.

---

## 16. Required user experience

### Example: normal execution

```text
air run "Fix the mobile navigation"

Task: Fix the mobile navigation
Workspace: /path/to/repository

Selected candidate:
  Agent: Aider
  Provider: OpenRouter
  Model: <configured-model>

Reason:
  Suitable for a focused UI/code-editing task.

Permission mode: <effective-agent-permission-mode>
Failover mode: ask

Starting task <task-id>...
[streamed agent output]

Result: SUCCEEDED
Run: <run-id>
Changed files: <count>
```

### Example: rate limit and approval

```text
Agent Aider / Model <model> encountered RATE_LIMIT.

The current working tree has been captured.
Changes detected during this run: <files/count>.

Suggested replacement:
  Agent: Goose
  Provider: <provider>
  Model: <model>

Reason:
  Available candidate with required capabilities.

AIR will preserve the current working tree. The replacement agent will be instructed
 to inspect existing changes and continue rather than restart.

Switch to Goose? [y/N]
```

Do not display made-up model names, availability, or success claims. Populate examples with actual runtime data.

---

## 17. Explicit non-goals for the initial release

Do not expand scope prematurely. The initial release does not need:

- A new AI model or inference backend implemented by AIR.
- An AIR-managed API key vault.
- Automatic Git commits or pushes.
- Silent destructive recovery or rollback.
- A web dashboard.
- A proprietary agent protocol that requires modifying the external agents.
- An LLM-based router before deterministic routing is reliable.
- Parallel agents modifying the same working tree.
- Guaranteed provider quota/availability prediction when providers expose no reliable signal.

These may be considered later with explicit design and security reviews.

---

## 18. Final implementation instruction

Start by re-reading the current repository and reconciling `PLAN.md` with this document.

Then implement **Phase 1 only** unless the user explicitly asks for a different scope. Do not skip ahead to all four adapters or MCP.

At the end of each phase, report:

1. Files added or changed.
2. Behavior implemented.
3. Tests added and exact test results.
4. Build/typecheck/lint results.
5. Known limitations and unresolved decisions.
6. Whether the phase exit criteria are satisfied.

The primary success criterion for AIR is not the number of supported agents. It is this:

> AIR can run a real coding task, detect a genuine failure, preserve all user and agent work, and safely continue with another agent without losing context or exceeding the user's permission choices.
