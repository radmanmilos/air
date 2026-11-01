# grok_plan_review_4.md

## Document metadata

- **Target repository**: https://github.com/radmanmilos/air
- **Review date**: 2026-11-01
- **Type**: Final audit / sign-off review
- **Supersedes**: `project_reviews/grok_plan_review_3.md` for forward-looking work. Prior reviews remain historical.
- **Purpose**: Determine whether the project can be declared "done" for its stated 1.0 scope, and enumerate any final polish required before release.
- **Note on verification**: This review is based on repository inspection. Several acceptance items below require **manual execution** (e.g., end-to-end with a real aider binary) that cannot be verified by static inspection alone. Those are marked `[MANUAL]` and must be run by a human before sign-off.

---

## 0. Verdict

**The project is functionally complete for its stated 1.0 scope.** The core orchestrator, router, health tracker, execution runner, config system, MCP server, observability, redaction, failover loop, and verify hook are all implemented and tested. Prior P0 gaps (aider registration, concurrency enforcement, mock isolation) appear closed.

**It is not yet "released."** Before calling it done, complete the **Release checklist** in Section 3. None of those items are architectural; they are operational and documentation polish.

**Estimated remaining effort**: 1–2 sessions of focused work, most of it verification and packaging rather than code.

---

## 1. Prior-item closure verification

Run these checks before declaring done. Each maps to a requirement from the prior reviews.

| ID | Prior requirement | Verification command / action | Expected result |
|----|------------------|-------------------------------|-----------------|
| G3-01 | Aider registered in default adapter list | `grep -n "AiderAdapter" bin/air.ts src/mcp/server.ts` | Aider appears in both adapter lists |
| G3-01 | Mock removed from production lists | `grep -rn "MockAdapter" bin src` | No matches, OR matches only behind `AIR_USE_MOCK` guard |
| G3-01 | No production → test dependency | `grep -rn "from ['\"].*tests/" src bin` | No matches |
| G3-02 | Concurrency lock implemented | `ls src/ | grep -i lock` or `grep -rn "air.lock" src` | Lock module present |
| G3-02 | `maxConcurrentAgents` enforced | `grep -rn "maxConcurrentAgents" src` | Read in a semaphore/queue, not just schema |
| G3-02 | Concurrent runs do not corrupt state | `[MANUAL]` Run two `air run` commands simultaneously | Second waits or fails cleanly; `health.json` intact |
| G3-03 | Aider tests exist | `ls tests/ | grep aider` | `aider.test.ts` present and passing |
| G3-05 | MCP uses real adapters | `grep -n "listAdapters" src/mcp/server.ts` | Uses same registration as CLI |
| G3-06 | README matches adapters | Read README adapter table | Only aider, goose (and mock-for-tests) listed |
| G3-06 | Adapter docs exist | `ls docs/adapters/` | `aider.md` and `goose.md` present |
| G3-07 | Log rotation implemented | `grep -rn "rotate" src/observability/` | Rotation logic present |
| G3-08 | Non-blocking kill path | `grep -rn "execSync" src/execution/` | No `execSync` in tree-kill path |
| All | No stubs remain | `grep -rn "Not implemented" src bin` | No matches |
| All | Test suite green | `npm test` | All tests pass |
| All | Build + typecheck green | `npm run build && npm run typecheck && npm run typecheck:test` | No errors |

**If any item fails, treat it as a blocker for sign-off.**

---

## 2. Final polish (non-blocking, but recommended before release)

These are P2/P3 items. They do not block a 1.0 release but will improve the first impression and reduce support burden.

### G4-01 — Remove residual TODOs and dead code (P2)

- Scan for `TODO`, `FIXME`, `XXX`, `HACK` in `src/` and either resolve or convert to tracked issues.
- Remove commented-out code blocks and unused exports.
- Verify that `MockAdapter` (if relocated) is exported only from a dev entry point.

**Acceptance**: `grep -rn "TODO\|FIXME" src` returns only items with a linked issue number.

### G4-02 — Consistent error messages and exit codes (P2)

- Audit CLI commands for consistent phrasing (e.g., all “error:” prefixes), consistent exit codes, and consistent use of the shared error taxonomy.
- Ensure every user-facing error includes a next-step hint (e.g., “run `air status` to see cooldowns”).

**Acceptance**: Manual review of `air run`, `air status`, `air route-test`, `air config` error paths shows consistent style.

### G4-03 — `air status --json` schema is documented (P2)

- Publish a JSON schema (or a documented TypeScript type) for `air status --json` output so integrators can rely on it.
- Add a test that validates the output against the schema.

**Acceptance**: `docs/schemas/status.json` (or equivalent) exists and is exercised by a test.

### G4-04 — Adapter authoring guide (P2)

- `docs/adapters/README.md` (or `docs/adapters/authoring.md`) describing how to add a new adapter: the `AgentAdapter` interface, the conformance suite, the spike-and-document process, and how to register it.
- Include a minimal worked example pointing to `docs/adapters/goose.md`.

**Acceptance**: A developer unfamiliar with the codebase can follow the guide to add a stub adapter and pass conformance.

### G4-05 — Version and changelog (P2)

- Bump `package.json` to `1.0.0` (or `0.9.0` if a public beta is preferred).
- Create `CHANGELOG.md` with a summary of the 1.0 feature set.
- Tag the release commit (`git tag v1.0.0`).

**Acceptance**: `CHANGELOG.md` exists, `package.json` version matches the tag, tag is pushed.

### G4-06 — Repository hygiene (P3)

- Add or verify `LICENSE`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md` (if open-source).
- Verify `.gitignore` excludes `node_modules/`, `dist/`, coverage, and any local cache paths.
- Verify `README.md` includes: install, quickstart, supported tools (accurate), configuration overview, and a link to `PLAN.md`.

**Acceptance**: README quickstart works from a clean clone.

### G4-07 — Final security pass (P2)

- Run `npm audit` and address or document any advisories.
- Re-run redaction tests against a fixture that includes realistic API key shapes (OpenAI `sk-...`, Anthropic `sk-ant-...`, GitHub `ghp_...`, Bearer tokens, `--api-key=`).
- Verify no secret appears in `docs/`, `README.md`, or example configs.

**Acceptance**: `npm audit` clean or documented; redaction fixtures cover the above patterns.

### G4-08 — Manual smoke test with real aider (P2, `[MANUAL]`)

Static inspection cannot confirm real-tool behavior. Before release:

1. Install aider at the version documented in `docs/adapters/aider.md`.
2. Run `air run "add a docstring to foo.py"` in a clean repo.
3. Confirm: routes to aider, streams output, classifies any error correctly, and on a forced rate-limit (e.g., invalid key) sets a cooldown visible in `air status --json`.
4. Run the same via `air mcp` with a minimal MCP client.

**Acceptance**: All four steps succeed; output is redacted; behavior matches `docs/behavior-spec.md`.

---

## 3. Release checklist

Complete in order. Do not publish until all are checked.

- [ ] All Section 1 verification items pass.
- [ ] `npm run build && npm run typecheck && npm run typecheck:test && npm test` all green.
- [ ] G4-07 security pass complete.
- [ ] G4-08 manual aider smoke test complete.
- [ ] README adapter table matches `src/adapters/`.
- [ ] `docs/adapters/aider.md` and `docs/adapters/goose.md` present and accurate.
- [ ] `CHANGELOG.md` written; `package.json` version bumped.
- [ ] `LICENSE` present.
- [ ] Git tag created and pushed.
- [ ] If publishing to npm: `npm pack --dry-run` inspected; no `tests/` or cache files included.

---

## 4. Scope boundaries — what "done" does not include

To prevent scope creep, the following are explicitly **out of scope** for 1.0 and should be tracked as post-1.0 issues, not blockers:

- Keyword or LLM-based task classifier / scoring (deferred per prior reviews until real misroutes are observed).
- Opencode and kilocode adapters (only implement if a user requests them; do not advertise).
- Worktree-based checkpointing (read-only diff snapshot is the 1.0 mechanism).
- Cross-machine health/cooldown sync.
- GUI or TUI.
- Multi-repo orchestration.
- Automatic failover *continuation* (1.0 proposes failover; it does not silently continue on a second tool without user action unless already implemented — verify current behavior and document it).

If any of these were accidentally implemented, keep them but do not expand them; if they are partially implemented, gate them behind a feature flag or document the limitation.

---

## 5. Sign-off criteria

The project can be declared **done** when:

1. All Section 1 verification items pass.
2. The Section 3 release checklist is fully checked.
3. The maintainer has run G4-08 manually and confirmed end-to-end behavior with a real tool.
4. `README.md`, `PLAN.md`, and `docs/behavior-spec.md` describe actual behavior with no aspirational claims.
5. A git tag exists and the release is published (npm or GitHub Release).

Until (1)–(5) are satisfied, the correct status is **"feature-complete, pending release."**

---

## 6. Post-1.0 backlog (for tracking, not action)

Ordered by likely value:

1. Second-tool continuation after failover (only if real user demand emerges).
2. Dynamic adapter discovery via `PATH` scan.
3. Config schema v2 with migration path (only when a breaking change is needed).
4. Task classifier (only after collecting real misroute data).
5. Opencode / kilocode adapters (only on request).
6. Trace query CLI (`air trace --last N --json`).

---

## 7. Honest caveats

- This review is based on static inspection and the trajectory of prior reviews. It does **not** substitute for running the code. The `[MANUAL]` items in Sections 1 and 2 are the ones most likely to reveal surprises.
- "Done" here means **done for the stated 1.0 scope**, not "feature-complete forever." Post-1.0 items are listed above.
- If any Section 1 check fails, do not proceed to release; re-open the corresponding `G3-xx` item.

---

*End of document. This is intended as a sign-off artifact. If further work is needed, append `grok_plan_review_5.md` rather than editing this one.*