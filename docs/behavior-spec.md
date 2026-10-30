# air behavior specification

Authoritative specification for the `air` CLI. If a command is added to the
CLI but not documented here, the conformance test in
`tests/behavior-spec.test.ts` fails.

## Commands

### `air --help`
- Given a request for help,
- When `air --help` is run,
- Then it prints usage, the version, and the list of commands below.

### `air run "<task>"`
- Given a task description,
- When `air run` is executed,
- Then it discovers installed tools, routes to the best candidate, spawns it
  headlessly, streams output, classifies errors, and proposes failover (Phase 2)
  or performs safe cross-agent continuation (Phase 3+).
- Options: `-f, --files <files...>`, `--auto`.

### `air status` (canonical)
- Given a request for status,
- When `air status` is run,
- Then it shows agent/provider/model availability, active cooldowns, and a
  concise recent health/failure summary.
- `--json` returns the same data as machine-readable JSON.

### `air health`
- Given a request for health,
- When `air health` is run,
- Then it displays exactly the same report as `air status` (true alias).

### `air route-test "<task>" --explain`
- Given a task description,
- When `air route-test --explain` is run,
- Then it prints the routing reasoning (classification, candidates considered
  and skip reasons, chosen candidate, alternatives) without executing.

### `air config --validate`
- Given a config request,
- When `air config --validate` is run,
- Then it validates the effective configuration against the Zod schema and
  reports errors with file and key names. Never prints secret values.

### `air config migrate`
- Given an older config version,
- When `air config migrate` is run,
- Then it upgrades the config to the current schema version (G-06).

### `air mcp`
- Given a request for the MCP server,
- When `air mcp` is run,
- Then it starts the MCP server over stdio using async jobs. No prompting on
  stdin; approval is a task-state transition.

## Exit codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Task failure |
| 2 | All candidates exhausted |
| 3 | User abort |
| 4 | Config error |