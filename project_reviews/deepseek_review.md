# grok_plan_review.md

## 0. How to use this document

This document is a supplementary implementation contract for the `air` project. It is written for an AI agent (or human developer) responsible for building the orchestrator.

- **Priority**: Treat this as a set of **required changes** unless marked `SHOULD` or `MAY`.
- **Order**: Execute items in the order they appear in the **Revised phase order** section (Section 3). Do not start a later phase until the acceptance criteria for the current phase are met.
- **IDs**: Each item has a unique ID (e.g., `G-01`). Reference these IDs in commit messages and documentation.
- **Verification**: Before implementing, cross-check any CLI flags, output formats, or platform-specific behavior against the **currently installed versions** of the target agent tools (aider, goose, opencode, etc.). Do not assume documentation matches reality.
- **First action**: Update `PLAN.md` to reflect the decisions in this document and the existing reviews before writing substantial code.

## 1. Review Summary

The existing reviews (ChatGPT and Claude) correctly identified critical issues: the need for a vertical slice, a mock adapter, proper cooldown keying, and cross-platform process management. The updated `PLAN.md` has incorporated most of that feedback.

This review focuses on **operational robustness, security, and long-term maintainability**—areas that are still underspecified or at risk of being overlooked once the core routing works. The verdict is: **the architectural direction is sound, but the implementation plan needs hardening in the following areas before it is production-ready.**

| Area | Current state | Risk if unaddressed | Priority |
|------|--------------|---------------------|----------|
| Secret & key management | Not mentioned | API keys leaked in logs or config | **P0** |
| Observability (structured logs, metrics) | Vague (“logs”) | Impossible to debug routing failures | **P0** |
| Adapter contract & validation | Implicit | New adapters break the router | **P1** |
| Concurrency & resource limits | Not addressed | Spawning many agents overloads the machine | **P1** |
| Configuration schema evolution | Zod schema exists but no migration strategy | Breaking changes on upgrade | **P2** |
| Documentation as executable spec | Planned but not enforced | AI builder drifts from intent | **P1** |

## 2. Requirements (Actionable Directives)

### G-01 Secret isolation and redaction (P0)

**Problem**: The plan mentions configuration and model lists but does not define how API keys, tokens, or sensitive environment variables are handled during streaming, logging, or failover handoff.

**Change**:
- MUST implement a **secret redaction layer** that runs on all captured stdout/stderr before it is written to logs, displayed, or used for context handoff.
- MUST ensure that configuration files (`config.yaml`, `.airrc.yaml`) never contain raw secrets in version-controlled examples. Provide a `.env.example` pattern and document that secrets belong in environment variables or an OS keychain.
- MUST validate that error messages and debug logs do not include full command lines that may contain `--api-key` flags.

**Acceptance**:
- A test fixture that injects a fake API key into a simulated tool output is redacted in the final log.
- `air status` never prints secret values.

### G-02 Structured observability from day one (P0)

**Problem**: “Observability: health tracking, cooldowns, logs” is listed as a principle but not specified. Ad-hoc `console.log` will make routing decisions impossible to audit.

**Change**:
- MUST emit structured logs (JSON lines) for every routing decision, tool launch, failure classification, and failover event. Include fields: `event`, `task_id`, `selected_tool`, `reason`, `error_class`, `duration_ms`.
- SHOULD expose a `air status --json` flag that returns machine-readable health/cooldown state, in addition to the human-readable table.
- MUST log the **exact reason** a tool was skipped (e.g., `cooldown_active`, `capability_mismatch`) rather than a generic “not available”.

**Acceptance**:
- Running a task with a forced failover produces a log stream that clearly shows: attempt 1 → rate limit detected (evidence) → cooldown set → attempt 2.
- `air status --json` validates against a documented schema.

### G-03 Formalize the adapter contract (P1)

**Problem**: The architecture says “allow new adapters to be added without changing the router’s core logic,” but there is no explicit interface definition or validation harness.

**Change**:
- MUST define a TypeScript interface `AgentAdapter` with at minimum:
  - `id: string` (e.g., `aider`)
  - `canHandle(task: TaskContext): boolean | Promise<boolean>`
  - `spawn(task: TaskContext, options: SpawnOptions): ChildProcess`
  - `parseOutput(chunk: Buffer): ParsedEvent[]` (for rate-limit detection)
  - `classifyError(exitCode: number, stderr: string): ErrorClass`
- MUST provide a **conformance test suite** (using the mock adapter) that every new adapter must pass before being registered.
- SHOULD include a `create-adapter` template generator or a `docs/adapters/` guide with a worked example.

**Acceptance**:
- The mock adapter implements `AgentAdapter`.
- A failing adapter (e.g., returns wrong error class) is rejected by the conformance suite.

### G-04 Concurrency and resource governance (P1)

**Problem**: The plan does not discuss what happens when multiple `air run` processes are active simultaneously, or when a single task triggers many failover attempts rapidly.

**Change**:
- MUST implement a **global lock or semaphore** per config directory to prevent more than one active orchestration session from mutating shared state (cooldown timers, health records) concurrently.
- SHOULD enforce a configurable `maxConcurrentAgents` limit (default 1) to avoid spawning an unbounded number of child processes.
- MUST ensure that cooldown state is persisted atomically (write-temp-then-rename) to avoid corruption from concurrent writes.

**Acceptance**:
- Two simultaneous `air run` commands do not corrupt the cooldown file.
- The system respects `maxConcurrentAgents`.

### G-05 Executable documentation (P1)

**Problem**: The plan relies on `PLAN.md` and `README.md`, but these are static documents that can drift from implementation. The AI builder needs a **single source of truth** that is testable.

**Change**:
- MUST maintain a `docs/behavior-spec.md` that describes the expected behavior of each CLI command in **Given/When/Then** format. This file is the authoritative specification.
- MUST add a test that validates `air --help` output against the list of commands in `behavior-spec.md`.
- SHOULD generate user-facing CLI help from the same schema used for validation (Zod) to eliminate drift.

**Acceptance**:
- If a command is added to the CLI but not documented in `behavior-spec.md`, a test fails.
- The Zod config schema and the documented config options are verified to be in sync.

### G-06 Configuration migration strategy (P2)

**Problem**: The Zod schema is the “single source of truth,” but no plan exists for evolving the schema when new tools or options are added.

**Change**:
- MUST version the configuration schema (`version: 1` in `config.yaml`).
- MUST provide a `air config migrate` command (or automatic migration on load) that upgrades older configs to the current schema.
- MUST validate repo `.airrc.yaml` against the same schema and **reject** unknown top-level keys by default (with an `--allow-unknown` escape hatch).

**Acceptance**:
- Loading a config with `version: 1` into a binary expecting `version: 2` either migrates automatically or fails with a clear, actionable error.

## 3. Revised Phase Order (Gated)

Adopt the following order. Do not proceed to a later phase until all acceptance checks for the current phase pass.

| Phase | Goal | Gate / Acceptance |
|-------|------|-------------------|
| **0** | Scaffold + mock adapter + test harness | `npm test` passes; mock adapter conforms to `AgentAdapter` (G-03) |
| **1** | Vertical slice: `air run` with one real adapter (aider) | End-to-end: spawn → stream → detect rate limit → failover to mock tool; logs show structured events (G-02) |
| **2** | Secret redaction + observability baseline | Redaction test passes (G-01); `air status --json` validates |
| **3** | Second real adapter + conformance suite | New adapter passes conformance tests (G-03); concurrency lock prevents state corruption (G-04) |
| **4** | Router refinements (priority list → optional scoring) | Only after real misroutes are observed; classifier deferred |
| **5** | MCP server + async jobs | No prompting in MCP mode; job lifecycle documented |
| **6** | Configuration migration + schema evolution | `air config migrate` works (G-06) |

## 4. Anti-patterns to Avoid

The implementation AI MUST NOT:

- Build a keyword-based task classifier before a working vertical slice exists.
- Use `console.log` for anything that needs to be parsed or audited (use structured events).
- Store secrets in plain-text config files committed to the repository.
- Assume that different agent CLIs accept identical flags or produce identical error formats.
- Implement a “health check” that merely checks whether a binary exists on `PATH` without verifying authentication or quota state.
- Spawn child processes with `shell: true` on any platform (use `cross-spawn` with array arguments and tree-kill).

## 5. Definition of Done (Reinforced)

A feature is complete only when:

1. Its code is implemented (not stubbed).
2. It has automated tests covering normal operation and failure modes.
3. `npm run build`, `npm run typecheck`, and `npm test` pass.
4. The behavior is documented in `docs/behavior-spec.md` and matches the implementation.
5. Logs and error messages contain no secrets.
6. The change is reflected in `PLAN.md` with a reference to the relevant review ID (e.g., `G-01`).

## 6. References

- Repository: `radmanmilos/air`
- Existing reviews: `project_reviews/chatGPT_plan_review.md`, `project_reviews/claude_plan_review.md`
- Target tools: aider, goose, opencode, kilocode (verify headless mode per tool before integration)

---

*End of document. This review is intended to be updated as the project evolves; new findings should be appended with incremented IDs.*