# AIR Terminal UX and Client Architecture
**Status:** IN_PROGRESS (audit complete; first focused improvement implemented).
**Prepared:** 2026-11-16
**Owner:** integration agent

This document defines the terminal-first user experience for AIR and evaluates whether a separate desktop application is justified. It is the design contract for the UI milestone (UI-01..UI-05 in docs/reviews/tasks_air_13.md). It distinguishes existing implemented functionality from new work.

## 1. Product UX goals

- A user inside VS Code's terminal can start, understand and complete a task without reading manual pages.
- AIR feels like one coherent product, not a router that shells out to other tools.
- Non-interactive/scripted/CI usage is preserved exactly; interactivity never breaks plain output or exit codes.
- Presentation is never authorization. The core runtime keeps enforcing permissions and approvals.
- Restraint over decoration: no ASCII art banners, no constant spinners, no dashboard noise.

## 2. Primary users and workflows

- **First-run user**: installs AIR, runs `air`, sees what it is, checks dependencies, and starts a conversation.
- **Developer in VS Code terminal**: types a question or task, watches progress, cancels if needed, resumes later.
- **Script/CI caller**: runs `air run`, `air status --json`, `air doctor --json`, `air mcp` non-interactively and relies on exit codes and plain output.
- **Operator**: inspects status, models, adapters, cooldowns and configuration.

Primary workflow: `air` (or `air chat`) -> read prompt -> get answer or started job -> monitor -> receive compiled result -> optionally `air merge <id> --apply`.
## 3. Current terminal experience (audit findings)

Evidence gathered 2026-11-16 by running the live CLI (`npx tsx bin/air.ts`) on Windows.

### What already exists

- `air --help` lists 17 commands with descriptions; commander handles subcommand help.
- `air status` / `air health` show tools, providers, local worker, cooldowns and counters; `--json` is supported.
- `air doctor` reports Python/venv/worker/Ollama/models with [ok]/[fail]/[skip] markers and `--offline`.
- `air chat` is a readline REPL with `/run`, `/plan`, `/cancel`, `/status`, `/jobs`, `/tasks`, `/stats`, `/last`, `/help`, `/quit`.
- `air run` streams adapter output, classifies errors, prints one loud next step (`air merge <id> --apply`).
- `air route-test --explain` prints routing reasoning; `air models` lists provider/model/cost/ctx.
- Streaming redaction (`src/security/streaming-redact.ts`) guards split-token secrets in live output.

### Main usability problems (evidence-backed)

1. **No first-run welcome.** `air` with no args prints commander usage and exits 0. There is no plain-language explanation, no dependency check, no guidance. Evidence: `npx tsx bin/air.ts` prints only the usage block.
2. **Decorative banner on every `air run`.** A cyan ASCII box (`AIR - Adaptive Intelligence Router`) plus a slogan prints before the task. It is noise in scripted output and fights with real tool output. Evidence: `air run "list files" --read-only` prints the box first.
3. **Banner truncates the slogan.** The box renders `AIR is free and so are we` without the closing quote, which looks broken. Evidence: same run.
4. **Noisy interstitial logs leak to stdout.** `air run` emits Ollama app logs (`time=... level=INFO source=app_windows.go...`) and ANSI spinner escape sequences (`[?2026h`, `[?25l`, `1G`, `K`) into the terminal. This is not AIR output; it is a spawned process bleeding through. Evidence: same run on a machine with Ollama running.
5. **No TTY / color detection.** There is no `isTTY` check, no `--no-color`, no `NO_COLOR` handling. Color codes are emitted regardless of environment, which corrupts piped/scripted output. Evidence: grep for `isTTY|NO_COLOR|FORCE_COLOR` in `src/` returns only `src/orchestrator/orchestrator.ts:781` and a git diff flag.
6. **`air chat` brain path prints a raw `thinking...` line and clears it with cursor hacks.** It uses `process.stdout.write('air: thinking...\n')` then `\r + spaces + \r`. Fragile, not readable when piped, and leaks to non-TTY. Evidence: `bin/air.ts:813,817`.
7. **No conversation identity/status visible in the prompt.** The REPL prints `air chat (conversation <id>)` once at startup but the prompt is bare `> ` with no model/task context. Evidence: `bin/air.ts:660`.
8. **Command discoverability is split.** `air commands` lists slash commands but omits `/plan`, `/quit`, `/exit`, `/help`; `air --help` lists subcommands but not slash commands. Evidence: `air commands` output vs `bin/air.ts:746`.
9. **No plain-language onboarding for the local worker.** `air status` says `local (not-installed) (unavailable)` and `air doctor` says `Run air setup local`, but nothing explains what the worker is or why it matters. Evidence: `air status` and `air doctor` outputs above.
10. **Error messages are terse.** `air run` prints `Failed.` with no next step; the orchestrator's `Working tree is dirty` message is the exception. Evidence: `bin/air.ts:140`.

## 4. Terminal interaction principles

1. **Detect the environment first.** TTY vs non-TTY, color support (`NO_COLOR`, `FORCE_COLOR`, `--no-color`), and width. Never emit color or cursor control when output is not a TTY.
2. **Plain output is a first-class mode.** Scripted/piped/CI output must be clean text, stable ordering, and correct exit codes. Interactive enhancements must degrade gracefully, never break plain output.
3. **One message class at a time.** User input, AIR prose, status, job events, errors and diagnostics each get a distinct visual treatment. No wall of undifferentiated gray text.
4. **Jobs are non-blocking.** A started job returns the conversation to the prompt immediately. Results arrive as compiled events, not as a blocking wait.
5. **Show the active model/task only when it is useful.** A small contextual status line is enough; never narrate internal routing.
6. **Fail closed, explain plainly.** Permission/security/refusal messages state what happened and the next useful action. Diagnostic detail stays behind `--dev`/`--json`.
7. **No full-screen TUI framework.** The current readline-based REPL is the right shape. A polished command/chat interface beats an attractive full-screen TUI that duplicates the terminal.

## 5. Proposed terminal layout and workflow

The design is a compact command/chat interface, not a full-screen TUI.

```
$ air
AIR 0.2.0  ·  local-first AI agent
Type a message, or /help for commands.

  air> what does this repo do?
air: This repo is AIR, a unified AI tool orchestrator...
       (model: ollama/qwen3.5:4b)

  air> fix the failing test in tests/auth
air: Started job 550e8400-...
       job 550e8400 finished: 1 file changed.
       Next: air merge 550e8400 --apply

  air> /status
       conv=abc123  messages=12  active=(none)  model=ollama/qwen3.5:4b

  air> /cancel
       Cancelled 550e8400
```

- **Startup header (one line):** `AIR <version> · <one-line product description>`. No box, no slogan, no banner.
- **First-run path:** if no config exists, `air` prints a short welcome, runs `air doctor --offline` quietly, and suggests `air setup local` if the worker is missing. It never installs or starts anything without an explicit command.
- **Main area:** chat-style. User lines start with `air> `. AIR prose lines start with `air:`. Job events are indented and dimmer.
- **Input prompt:** `air> ` with the current conversation id and active job count embedded when useful.
- **Contextual status line:** shown inline on `/status` and in the prompt when a job is active (`active=1`).
- **Approval interaction:** a proposed failover prints the proposed provider/model and what would be sent, then offers `[y]es / [n]o / [s]top`. Never silent.
- **Help:** `/help` lists commands grouped by purpose; `air --help` lists subcommands. Both are kept in sync by a behavior-spec test.

## 6. Non-interactive and scripting behavior (non-negotiable)

- `air run`, `air status`, `air doctor`, `air models`, `air route-test`, `air config`, `air merge`, `air resume`, `air verify`, `air dashboard`, `air export`, `air commands` and `air mcp` must behave identically in TTY and non-TTY mode: same text, same ordering, same exit codes.
- Color/cursor control is gated on `process.stdout.isTTY` (and `process.stderr.isTTY` for diagnostics) plus an explicit `--no-color` flag and `NO_COLOR`/`FORCE_COLOR` env support. When off, chalk is a no-op.
- No spinner, no banner, no `thinking...` interstitial is emitted when output is not a TTY. The brain path must write a single final line, never a cleared intermediate.
- `air chat` detects non-TTY stdin and exits with a usage message pointing to `air run` instead of entering the REPL.
- `--json` outputs remain machine-readable and must not contain color codes in any mode.
- All of the above is covered by tests in `tests/cli-interactive.test.ts` (added in UI-02).

## 7. Desktop / VS Code application evaluation

The owner wants a serious assessment. AIR must remain **one product and one core runtime**: the terminal, a desktop UI and a possible VS Code extension are clients of shared AIR capabilities and contracts, not independent orchestrators with separate conversation state, tool execution, permissions, provider configuration or task lifecycle.

### 7.1 Option comparison

| Criterion | A. Improved CLI / terminal-first | B. Terminal + optional desktop companion | C. VS Code extension |
|---|---|---|---|
| Development/maintenance cost | Lowest. Uses existing TS CLI + readline. | Medium. Needs a stable local client contract + IPC. | Medium. Needs extension API + lifecycle hosting. |
| VS Code integration | Already runs inside the VS Code terminal. | Same, plus a panel. | Native panel, workspace context, diff review. |
| Cross-platform | Already Windows/macOS/Linux. | Same, plus desktop packaging. | Same, plus VS Code requirement. |
| Conversation/task visibility | Good with the design in §5. | Best of both. | Best inside VS Code. |
| Longer-running workflows | Adequate; terminal multiplexers help. | Desktop keeps the session alive. | Extension host keeps it alive. |
| Terminal limitations | Prompt scrollback, no native menus, mixed with tool output. | Same. | Same (extension can also run in terminal). |
| Shared runtime required | None. | Yes: stable local interaction contract (UI-03). | Yes: same contract, plus extension hosting. |
| Multiple clients / concurrent sessions | One process per terminal. | Possible with a daemon/IPC. | Possible via extension + terminal. |
| Packaging and updates | npm install / bootstrap scripts. | Desktop packaging (Tauri/Electron). | VS Code marketplace. |
| Resource overhead | Minimal. | Medium (desktop runtime). | Minimal (shares VS Code). |
| Accessibility | Terminal accessibility tooling. | Native accessibility. | VS Code accessibility. |
| Risk of duplicate orchestrator | None. | Low if the boundary is enforced. | Low if the boundary is enforced. |
| Dependency surface | Existing deps only. | Adds desktop framework. | Adds extension tooling. |

### 7.2 Recommendation

**Do not build a separate desktop application now.** Build Option A (excellent terminal experience) first, and keep Option B architecturally possible by defining the shared client/runtime boundary (UI-03) before any desktop work.

Rationale:
- The owner's stated preference matches the evidence: the terminal is where AIR is actually used today, and the audit in §3 shows the terminal experience needs fixing before any new surface is attractive.
- A desktop app would not materially improve the core loop (submit -> monitor -> compile -> merge); it would add packaging, updates, IPC, lifecycle and platform risk.
- VS Code already provides the "desktop" container with workspace context, diff review and terminal coexistence, so a VS Code extension (Option C) is the only desktop-class surface worth considering later, and only after the shared contract exists.
- The shared boundary is the real prerequisite: without it a desktop client would inevitably fork AIR's conversation state, permissions and task lifecycle.

### 7.3 What should be built now

1. UI-01: audit and this design document (done).
2. UI-02: first focused terminal improvement (done).
3. UI-03: shared client/runtime boundary and stable local interaction contract, if justified by later evaluation.
4. UI-04: optional VS Code extension or desktop companion, based on the decision above.
5. UI-05: packaging, usability validation, accessibility and release readiness.

### 7.4 Minimum architectural boundary for future clients

- A versioned, local interaction contract over conversation create/list/select, job submit/status/cancel, approval request/decision, and status/query.
- Authenticated local IPC (or another appropriately constrained mechanism) if a desktop client is introduced; no unauthenticated network listener.
- The core runtime owns conversation persistence, permissions, provider configuration and task lifecycle. Clients present and receive; they never mutate policy or bypass approval.
- A single source of truth for effective configuration; clients read it, they do not duplicate it.

## 8. Security and permission boundaries

- Model output is untrusted. UI presentation is never authorization.
- Approval state is enforced by the core runtime (`src/orchestrator/orchestrator.ts`, MCP `approve_failover`). The UI only presents the request and the choice.
- Execution and permissions never move into the UI. A desktop/VS Code client cannot bypass AIR's authorization and policy enforcement.
- No secrets in terminal output, logs, screenshots, telemetry or conversation history. `src/security/redact.ts` remains the single choke point.
- No network listener is introduced without a documented security design. If a desktop client is eventually introduced, prefer authenticated local IPC.
- Workspace paths, terminal input, model output and external tool results are all treated as untrusted.
- The P1-05 fail-closed boundary is preserved; the experimental Windows sandbox prototype is not wired into the runtime.

## 8a. UI-03 architecture decision — shared client/runtime boundary (2026-11-16)

**Decision: defer the versioned local interaction API until L1/L2 contracts stabilize.**

### Current state
- **Implemented and tested:** CLI slash commands (`/run`, `/plan`, `/status`, `/jobs`, `/cancel`, `/last`, `/stats`, `/help`, `/quit`), conversation persistence (`mutateConversation`/`appendMessage`), job lifecycle (`runJob`, `injectResult`), orchestrator events. These are internal APIs, not stable public contracts.
- **Not yet stable:** model provider API (L1), role resolver (L2-03), resource manager (L3). A client-facing API built on unstable internals would require breaking changes.
- **Future interface (proposed, not implemented):** A versioned local IPC or stdio-based JSON protocol that exposes conversation CRUD, job submission/cancellation, status queries and approval requests. No network listener. Authentication via per-session token or OS-level access control.
- **Deferred:** multi-client support, desktop companion, VS Code extension. All depend on UI-03.

### Rationale
One shared AIR runtime. Terminal, desktop and VS Code are clients of shared capabilities, not independent orchestrators. Building a client API before L1/L2 stabilize would create a moving target and duplicate orchestration logic.

| Phase | Scope | Status | Depends on |
|---|---|---|---|
| UI-01 | Terminal UX audit and product interaction design | DONE (this task) | None |
| UI-02 | First polished terminal interaction improvement | DONE (this task) | UI-01 |
| UI-03 | Shared client/runtime boundary and stable local interaction contract | TODO | UI-02, L1/L2 |
| UI-04 | Optional VS Code integration or desktop companion | TODO | UI-03 |
| UI-05 | Packaging, usability validation, accessibility and release readiness | TODO | UI-02–UI-04 |

SEC-W1 (Windows-first OS-enforced sandbox for untrusted eval execution) remains OPEN and separately tracked; it is not affected by the UI roadmap.

## 10. Acceptance criteria

- `air` with no args prints a short welcome, never installs or starts anything, and exits 0.
- `air run` prints a one-line header; no ASCII banner box, no slogan.
- Color output is gated on TTY + `NO_COLOR`/`FORCE_COLOR`/`--no-color`; piped output contains no ANSI escapes.
- `air chat` refuses non-TTY stdin with a clear message (opt-in via `AIR_E2E_TTY=1` for the test harness).
- The brain answer path emits no `thinking...` interstitial in non-TTY mode.
- `air status --json`, `air doctor --json` and `air route-test --explain --json` remain machine-readable and color-free in all modes.
- `tests/cli-interactive.test.ts` (8 tests) covers the above.
- Full validation checklist green: typecheck, typecheck:test, lint, test, build, pack --dry-run, dead-code check.
- No existing CLI/MCP behavior, exit codes or conversation persistence changed.

## 12. UI-05 usability and accessibility validation checklist

| Case | Status | Notes |
|---|---|---|
| TTY vs non-TTY detection | Automated | `tests/cli-interactive.test.ts` |
| NO_COLOR / FORCE_COLOR / --no-color | Automated | `tests/cli-interactive.test.ts` |
| ANSI suppression in pipes | Automated | `tests/cli-interactive.test.ts` |
| JSON output color-free | Automated | `tests/cli-interactive.test.ts` |
| Non-TTY chat refusal | Automated | `tests/cli-interactive.test.ts` |
| Welcome prints, no install/start | Automated | `tests/cli-interactive.test.ts` |
| One-line header, no banner box | Automated | `tests/cli-interactive.test.ts` |
| No thinking interstitial in non-TTY | Automated | `tests/cli-interactive.test.ts` |
| Built binary smoke | Automated | `tests/built-binary.test.ts` |
| Command registry drift detection | Automated | `tests/cli-commands.test.ts` |
| Windows PowerShell/CMD | CI (Windows runner) | Manual verification recommended |
| VS Code integrated terminal | Manual | Not automated |
| Narrow terminal width | Manual | Not automated |
| Ctrl+C clean exit | Manual | Not automated |
| Screen reader compatibility | Manual | Not automated |
| Color-only state communication | Design review | Color never sole indicator |

**Decisions made:**
1. AIR remains terminal-first. No full-screen TUI framework.
2. No separate desktop application now. Option A first; Option B kept architecturally possible.
3. Color is presentation, not behavior; configured once at startup.
4. `air chat` is interactive-only; non-TTY callers use `air run` / `air status --json`.
5. The E2E/test harness opts into the REPL with `AIR_E2E_TTY=1`.

**Open questions:**
1. Should `air` with no args also run a quiet `air doctor --offline` and surface the local-worker next step? Deferred: it must never install or start anything without an explicit command.
2. Should the REPL prompt show the active model role? Deferred until L4 coordinator wiring exists.
3. Is a VS Code extension worth pursuing before UI-03? Deferred to UI-04 evaluation.
