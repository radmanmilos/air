# Local worker adapter (`local`)

`local` is AIR's own adapter. It runs the bundled Python worker
(`packages/local-worker`) against a local Ollama model. The worker is not a
separate product: `air` provisions it, invokes it, and reports its state.

## What it is

- **Provider:** `ollama`
- **Model:** the worker's configured `models.brain` (`qwen3.5:4b` by default),
  unless `AIR_LOCAL_MODEL` or a task-specific model is set.
- **Executable:** the provisioned venv's Python (`cacheDir/worker/venv`) or
  `AIR_WORKER_PYTHON` when set.
- **Capabilities:** headless execution, structured contract output, file
  editing, shell access (gated by the AIR permission policy), cancellation.
  No image input, no streaming.

## Provisioning

```bash
air setup local     # create cacheDir/worker/venv and install the worker editable
air doctor          # Python, venv, worker import, Ollama, models
air status          # shows whether the local worker is provisioned
```

`air setup local --force` recreates the venv. A copied install is not used:
the package is installed with `pip --editable` so `air_local` still resolves
to the bundled source and can find `contracts/job.schema.json` and its
`config.yaml`.

## How a job runs

1. AIR selects `local` like any other adapter (verified, enabled, available).
2. `buildCommand` writes a request file under `cacheDir/worker/requests/` and
   reserves a result file under `cacheDir/worker/results/`.
3. AIR spawns:

   ```text
   <venv-python> -m air_local.run \
     --request <request.json> --result <result.json> --print-answer
   ```

4. The worker reads the request, runs the ReAct loop with its tool registry,
   writes an atomic result file, and exits with a contract code.
5. With `--print-answer`, the final answer is the only stdout output. The
   orchestrator forwards it; without the flag stdout stays empty.

The request and result shapes are defined once in
[`contracts/job.schema.json`](../../contracts/job.schema.json). The worker is
also validated against the same shared examples in
[`contracts/examples/cases.json`](../../contracts/examples/cases.json).

## Exit codes and error mapping

| Worker exit | Meaning | AIR category | Failover |
|---|---|---|---|
| 0 | COMPLETED | `UNKNOWN` (success is not a failure) | n/a |
| 2 | INVALID_REQUEST | `PROCESS_CRASH` | no |
| 3 | WORKER_FAILED | `TASK_FAILURE` | no |
| 4 | CANCELLED | `USER_CANCELLED` | no |
| 5 | PROVIDER_UNAVAILABLE | `MODEL_UNAVAILABLE` | yes |

Process facts (`timedOut`, `cancelled`, `spawnError`) take precedence over the
exit code, matching every other adapter.

## Permissions

The AIR permission policy is resolved before adapter selection:

- `readOnly` comes from the task (`--read-only` or a non-write plan).
- `allowShell` is true only when the policy explicitly allows shell access.
- `allowNetwork` follows the policy (off by default).

The worker's own `policy` layer enforces these again inside its tools: job-root
jail, read-only mode, protected files, shell allow-list, and network gate.

## Why it is internal

There is no `mgai` command and no separate installation. The worker exists to
give AIR a free, local, tool-using backend; its orchestration, planner, critic,
memory, and interfaces were deliberately dropped when it was absorbed.
