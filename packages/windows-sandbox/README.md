# windows-sandbox — EXPERIMENTAL / NOT PRODUCTION READY

This directory is an experimental Windows-first OS-enforced sandbox prototype for
untrusted evaluation execution. It is **not** wired into the AIR runtime, is **not**
built or run by CI, and is **not** included in the published `air` package (it is not
listed in `package.json` `files`).

## Status

- **P1-05 OS-enforced sandboxed execution is DEFERRED** to the separate security
  milestone **SEC-W1** (see `docs/reviews/tasks_air_13.md` and
  `docs/architecture/local-first-ai-plan.md`).
- Untrusted evaluation execution remains **disabled on Windows, Linux and macOS**.
  The TypeScript runner fails closed (`unsupported`, `executed: false`) and applies
  no untrusted patch, runs no fixture command, and dispatches no proposed tool.
- This prototype must **not** be enabled to satisfy a test or to claim P1-05
  complete. It is retained as design evidence for SEC-W1 only.

## What it sketches

`Program.cs` demonstrates a Windows approach based on:

- AppContainer profile creation (no capabilities, i.e. no network),
- a Job Object for process-tree containment and termination,
- an explicit workspace ACL grant for the AppContainer SID,
- `CREATE_SUSPENDED` + `AssignProcessToJobObject` before resume,
- timeout via `WaitForSingleObject` + `TerminateJobObject`,
- bounded stdout/stderr capture.

It is incomplete and unproven: it lacks adversarial validation, resource limits,
handle-inheritance hygiene, cancellation plumbing, and reproducible CI evidence.
None of the SEC-W1 acceptance criteria are met by this prototype.

## Build outputs

`bin/` and `obj/` are git-ignored and must never be committed.