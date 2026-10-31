# AIR — Follow-up Review 3 (Delta Review)

> **Target repository:** https://github.com/radmanmilos/air  
> **Branch:** `main`  
> **Review date:** 2026-10-31  
> **Reviewed HEAD:** `17f8e3697905352c7b348260dc18b49420e5646d`  
> **Previous review:** `project_reviews/chatGPT_plan_review_2.md`  
> **Purpose:** Identify only the remaining issues found after the latest changes. This document does not replace `PLAN.md` or earlier reviews.

---

## 0. Instructions to the implementation agent

1. Read the current `PLAN.md`, this delta review, and the existing review documents before editing.
2. Re-check the current checkout. This review describes the repository at the HEAD above and may be superseded by later commits.
3. Apply only actionable corrections below. Do not redesign the architecture or restart the review process.
4. Update `PLAN.md` and `docs/behavior-spec.md` where behavior or acceptance criteria change. Keep one authoritative definition for each policy.
5. Do not claim that a phase is complete because types, interfaces, mocks, or documentation exist. Completion requires working behavior and passing tests.
6. Do not implement real cross-agent continuation until the Phase 3 handoff, redaction, provider-consent, and persistence gates pass.
7. Do not commit, push, reset, stash, clean, revert, or rewrite history unless explicitly authorized.

Priority meanings:
- **P0:** Correct before relying on the relevant behavior or calling the relevant phase complete.
- **P1:** Correct before the associated phase is considered complete.
- **P2:** Packaging, test-quality, or maintainability correction.

## 1. Updated assessment

The latest changes are meaningful progress. Preserve the following decisions:

- Headless-only execution.
- Aider plus one verified second agent as the initial scope.
- Vertical-slice development and the Phase 2 / Phase 3 real-failover gate.
- Dirty working-tree refusal by default, with explicit `--allow-dirty`.
- Provider/model cooldown scope.
- A shared error taxonomy and normalized task result states.
- Asynchronous MCP jobs with explicit approval and no prompting on MCP stdio.
- Central platform path resolution, config versioning, redaction, JSONL observability, and adapter conformance.

The package manifest and lockfile now agree on the root dependency set, including Zod, cross-spawn, Vitest, and the pinned MCP SDK. Keep this improvement; do not regenerate or alter dependencies without a reason.

**Current implementation status:** The repository now has shared types, a mock adapter/fixture, initial tests, a redaction utility, and a behavior specification. The actual CLI commands still contain placeholders. No `docs/adapters/` directory or real adapter spike reports are present in the reviewed tree. Phase 0 is therefore not complete, and later phases must not be represented as implemented.

---

## 2. Required delta corrections

### R3-01 — Finish Phase 0 evidence before moving on (P0)

**Observed**

`PLAN.md` says Phase 0 is complete when `docs/adapters/*.md` exist and document Aider plus one other candidate. The current tree contains `docs/behavior-spec.md`, but no `docs/adapters/` directory or adapter spike reports. No real agent adapter is present yet.

**Required**

1. Choose the second candidate only after a real headless CLI spike.
2. Create `docs/adapters/aider.md` and `docs/adapters/<chosen-tool>.md` based on experiments with recorded CLI versions.
3. For each tool, document:
   - Executable name and version.
   - Exact headless command and argument array.
   - Task prompt and optional file passing.
   - Provider/model selection.
   - Permission/approval behavior and how automatic commits are disabled.
   - Output format and whether structured output is available.
   - Observed success, rate-limit, quota, authentication, model-unavailable, timeout, and cancellation behavior.
   - Exit code, signal, and stdout/stderr evidence for each observed scenario.
   - Known limitations and unsupported capabilities.
4. Separate observed facts from assumptions. Do not fill the spike reports with guessed flags or undocumented behavior.

**Acceptance**

- Both adapter spike documents exist and identify the exact tested versions.
- The mock suite still runs without network access or installed AI tools.
- Phase 0 is not marked complete until the documents and tests meet the criteria in `PLAN.md`.

### R3-02 — Fix the package `main` path (P0)

**Observed**

`package.json` declares:

```json
"main": "./dist/index.js"
```

But `src/index.ts` is compiled with `tsconfig.json` using `rootDir: "./"` and `outDir: "./dist"`. Its emitted path is therefore `dist/src/index.js`, not `dist/index.js`.

Adding `src/index.ts` did not, by itself, fix the entrypoint mismatch.

**Required**

Choose one consistent packaging arrangement:

- Change `main` to `./dist/src/index.js` (and add a matching `exports` entry if package consumers are supported); or
- Change the build/layout so the actual emitted file is `dist/index.js`.

Do not change `rootDir` to `src` without accounting for `bin/air.ts`, which is also compiled into the `dist/bin/` path.

**Acceptance**

After a clean `npm ci` and `npm run build`:

- Every declared `main`, `exports`, and `bin` target exists.
- A Node import of the package resolves successfully.
- The packaged artifact contains the expected entrypoints.

### R3-03 — Restore and test the CLI shebang (P0)

**Observed**

The latest `bin/air.ts` begins with imports and does not contain `#!/usr/bin/env node`, despite a prior commit message stating that a shebang was added.

A package `bin` target intended to run directly on Unix must have a valid Node shebang in the emitted executable.

**Required**

1. Add the shebang as the first line of `bin/air.ts`.
2. Verify the TypeScript build preserves it in `dist/bin/air.js`.
3. Verify the npm-installed command works on Windows and on Unix-like systems.
4. Keep diagnostics off stdout when running MCP mode; the shebang does not change the MCP stdout protocol requirement.

**Acceptance**

- Build output starts with the expected shebang.
- `npm link` / package installation followed by `air --help` works on supported platforms.
- Add a packaging test or CI smoke test that checks the emitted entrypoint.

### R3-04 — Make the error action policy the single source of truth (P0)

**Observed**

`src/types/errors.ts` currently defines two decision mechanisms that disagree:

- `ERROR_POLICY` maps `RATE_LIMIT` and `QUOTA_EXCEEDED` to `wait_cooldown`, and `NETWORK_ERROR` to `retry_same`.
- `triggersFailover()` returns `true` for all categories except `NO_FAILOVER_CATEGORIES`; this includes `RATE_LIMIT`, `QUOTA_EXCEEDED`, and `NETWORK_ERROR`.

For example, a `NETWORK_ERROR` is both `retry_same` and `triggersFailover === true`. A `RATE_LIMIT` is both `wait_cooldown` and `triggersFailover === true`. A caller could use the wrong helper and take the opposite action from the policy table.

The policy also needs to match AIR's product behavior: a temporary rate limit on one `(provider, model)` should normally make that candidate ineligible and allow a different eligible candidate to be proposed; waiting for that same candidate is a fallback when no safe alternative exists or when the configured retry policy says to wait.

**Required**

1. Make `ERROR_POLICY` (or one equivalent typed policy function) the only action authority.
2. Remove `NO_FAILOVER_CATEGORIES` / `triggersFailover`, or derive all helper results directly from the canonical policy. Do not maintain two independent lists.
3. Define the exact action and fallback behavior for every category.
4. Clarify `QUOTA_EXCEEDED`: distinguish a temporary model/provider throttle from exhausted account/billing quota. Do not assume a timer will repair an exhausted billing quota.
5. For `RATE_LIMIT`, define when AIR proposes a different candidate immediately, when it waits for `Retry-After`, and what it does when no alternative is eligible.
6. Ensure the candidate filter excludes the limited `(provider, model)` but does not incorrectly exclude unrelated candidates.

**Acceptance**

- A table-driven test covers every `ErrorCategory` and its one canonical action.
- There is no code path where `getErrorAction(category)` and a separate boolean helper imply conflicting behavior.
- Tests cover rate limit with an alternate provider, rate limit with no alternate, shared provider/model cooldown, and exhausted quota.
- `USER_CANCELLED`, `AUTH_ERROR`, and `PERMISSION_DENIED` never trigger automatic failover.

### R3-05 — Pass complete process-outcome evidence to error classification (P1)

**Observed**

`AgentAdapter.classifyError()` currently accepts only `exitCode`, `stderr`, and optional `structured` data. This is insufficient to reliably distinguish:

- A normal non-zero exit.
- A process terminated by a signal.
- A spawn failure (executable missing or permission denied).
- A timeout initiated by AIR.
- A user cancellation initiated by AIR.

The mock adapter maps `exitCode === null` to `PROCESS_CRASH`, so a timeout or cancellation can be mislabeled as a crash if classification is delegated only to the adapter.

**Required**

Introduce a normalized process outcome object, owned by the shared process runner, containing at least:

```ts
interface ProcessOutcome {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  spawnError?: { code?: string; message: string };
  timedOut: boolean;
  cancelled: boolean;
  stdout: string; // bounded/redacted capture or structured event reference
  stderr: string; // bounded/redacted capture
  startedAt: string;
  endedAt: string;
}
```

Adapt the exact shape as needed, but preserve the distinctions above. Process facts such as `timedOut`, `cancelled`, and `spawnError` must take precedence over generic adapter stderr matching.

Do not place unbounded raw output into this object; use the configured bounded buffer and truncation metadata.

**Acceptance**

- Timeout maps to `TIMEOUT`, explicit user cancellation maps to `USER_CANCELLED`, signal termination maps to `PROCESS_CRASH` (unless a more specific known cause exists), and missing executable maps to `TOOL_NOT_INSTALLED`.
- A normal non-zero exit with provider evidence maps through the adapter classification rules.
- Tests exercise exit code, signal, spawn error, timeout, and cancellation separately.

### R3-06 — Harden redaction against repeat calls and quoted secrets (P0)

**Observed**

`src/security/redact.ts` has several correctness issues:

1. `containsSecret()` calls `.test()` on regular expressions declared with the global (`g`) flag. Global regex `.test()` is stateful through `lastIndex`, so repeated calls on the same matching input can alternate between `true` and `false`.
2. `API_KEY_FLAG_RE` handles `--api-key value` but not the common `--api-key=value` form (and equivalent token/auth flags).
3. `DOTENV_LINE_RE` and `redactEnvContents()` stop at whitespace. A quoted environment value containing spaces can have only its first segment redacted, leaving the rest of the secret exposed.
4. `RedactionOptions.allow` is a no-op. It does not implement an allow-list and is misleading in a security-sensitive API.

**Required**

1. Make `containsSecret()` deterministic: use non-global detection regexes or reset `lastIndex` before every test.
2. Handle both `--key value` and `--key=value` argument forms, including quoted values.
3. Parse `.env` assignments so the entire value is replaced, preserving only the key and optional formatting/comment that is safe to retain. Support quoted values containing spaces.
4. Remove the `allow` option unless a real, well-defined allow-list behavior is needed. Never allow a caller to exempt arbitrary strings from redaction without a narrowly scoped design.
5. Add tests for repeated `containsSecret()` calls, quoted `.env` values, `--api-key=value`, `--token=value`, and multiple secrets in one line.
6. Keep redaction idempotent: `redact(redact(text))` must not reveal or further corrupt already-redacted data.

**Acceptance**

- Repeated detection of the same secret returns the same result.
- No part of a quoted secret remains in redacted output.
- Every required output sink (terminal, log, trace, and handoff) uses the redacted representation; raw secrets are not persisted before redaction.
- Security tests include realistic token fixtures and values containing spaces/quotes.

### R3-07 — Align CLI syntax with the behavior specification (P1)

**Observed**

`docs/behavior-spec.md` documents `air config migrate` as a subcommand. The current Commander setup implements `air config --migrate` as an option. Those are different interfaces.

The CLI also exposes `--allow-dirty` and `--read-only` on `air run`, but the behavior spec's `air run` options list does not mention them.

**Required**

1. Choose one canonical migration syntax. Recommended: `air config migrate`, implemented as a Commander subcommand. If choosing `air config --migrate` instead, update the behavior spec, README, and tests consistently.
2. Document all public `air run` flags, including `--allow-dirty` and `--read-only`, plus their safety implications.
3. Keep `--allow-dirty` explicitly non-destructive; document the attribution limitations that remain when it is used.
4. Ensure `--read-only` prevents file-editing execution if that is its intended meaning, rather than merely changing result interpretation. If it only indicates an expected outcome, rename it to avoid implying a permission sandbox.
5. Add tests that compare the actual CLI help/Commander command tree with the behavior spec. String-presence tests alone are insufficient.

**Acceptance**

- `PLAN.md`, README, behavior spec, Commander implementation, and CLI tests agree on command names and flags.
- `air config migrate` (or the selected canonical alternative) has one documented and tested behavior.
- Read-only mode's actual permission semantics are explicit and tested.

### R3-08 — Keep test-only mock support out of the published runtime package (P2)

**Observed**

`src/adapters/mock.ts` is compiled into the production `dist` tree but resolves its fixture from a path under `tests/fixtures/`. The package `files` allow-list includes `dist`, `bin`, `config`, `docs`, and `src`, but not `tests`.

A published build can therefore contain a mock adapter whose fixture is absent. The mock adapter also uses `node:child_process` directly rather than the planned shared process runner.

**Required**

- Move mock-only adapter/helper code into `tests/` (preferred), or explicitly package the fixture if the mock adapter is intentionally public.
- Do not let test-only source become part of the production runtime API by accident.
- Keep production adapters dependent on the shared process runner; do not create alternate spawn paths in real adapters.

**Acceptance**

- `npm pack --dry-run` contains only intended production files.
- A test imports the built package after packaging and verifies every declared export resolves.
- No production module references a path under `tests/`.

---

## 3. Phase and test status at this review

| Item | Reviewed status | Required next action |
|---|---|---|
| Package root dependency metadata | Improved; root manifest and lockfile appear aligned | Preserve; verify using `npm ci` locally/CI |
| Shared error/result types | Present | Fix policy inconsistency and process-outcome contract |
| Mock fixture and basic tests | Present | Expand tests to cover actual policy and process lifecycle |
| Redaction utility | Present | Fix deterministic detection and quoted/equals-form secrets |
| Behavior spec | Present | Align command syntax and flags with CLI |
| CLI shebang | Missing in latest `bin/air.ts` | Add and verify emitted executable |
| Package `main` target | Mismatched with TypeScript output layout | Correct and test built artifact |
| Adapter spike reports | Missing | Complete Phase 0 evidence |
| Real Aider/second adapter | Missing | Do not start real failover yet |
| Process runner / Git handoff / MCP | Not present in reviewed tree | Implement only in their scheduled phases |

**Verification limitation:** This review inspected GitHub repository files and commit metadata. It did not execute `npm ci`, `npm run build`, `npm run typecheck`, `npm run typecheck:test`, or `npm test`. Do not treat the presence of test files as evidence that they pass.

---

## 4. Required immediate work order

1. Fix the `package.json` `main` target and add/verify the CLI shebang.
2. Fix the canonical error-policy contradiction and define process-outcome metadata.
3. Fix redaction detection and quoted/equals-form secret handling; add regression tests.
4. Align CLI migration/read-only/dirty-tree syntax with `docs/behavior-spec.md` and test the command tree.
5. Finish Phase 0 by creating evidence-based Aider and second-agent spike reports.
6. Run and report from a clean checkout: `npm ci`, `npm run build`, `npm run typecheck`, `npm run typecheck:test`, `npm test`, and `npm pack --dry-run`.
7. Only then proceed to Phase 1/2 according to the authoritative phase gates in `PLAN.md`.

## 5. Instruction to the implementation agent

Apply this as a delta review, not as a request to rewrite the project. Preserve the current architecture and existing good decisions. Update `PLAN.md` only where it needs to clarify or enforce the corrections above. Implement the P0 items before relying on packaging, error-policy, or redaction behavior. Keep Phase 0 explicitly incomplete until real adapter spike evidence exists.

At completion, report:

- Exact files changed.
- The selected decisions for each R3 item.
- Exact commands executed and their exit codes.
- Test counts and results.
- Whether `npm pack --dry-run` and a built-package import succeeded.
- Any remaining limitation or unverified platform behavior.
