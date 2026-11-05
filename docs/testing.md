# Testing AIR in a Production-Like Environment

## Overview

AIR includes a structured test suite that exercises real CLI commands against a live project directory, simulating how an end user would interact with AIR.

## Running the Test Suite

```powershell
powershell -ExecutionPolicy Bypass -File scripts/production-test.ps1 -ProjectPath "E:\GitHub\test"
```

Optional parameters:
- `-LogFile "custom_log.md"` — custom log file name (default: `test_log.md`)

## Test Cases

1. **air status** — Verifies all adapters are detected and health tracking works.
2. **air models** — Verifies model listing and Ollama detection.
3. **air dashboard** — Verifies session/event display.
4. **air chat (read-only)** — Sends a question via chat, verifies job spawning and completion.
5. **air verify-repo** — Runs the configured verification command.

## Test Project Setup

The test project (`e:\GitHub\test`) is a C# console app connected to GitHub. It is safe to modify, commit, and push. Before testing:

```bash
git clone https://github.com/radmanmilos/test.git
cd test
```

Ensure Ollama is running with a model (e.g., `qwen2.5-coder:7b`) for offline/free testing.

## Re-running Tests

The test suite is idempotent. Run it anytime to verify AIR functionality. Results are logged to `test_log.md` in the target project.

## CI Integration

CI runs unit tests, typecheck, lint, build, and the dist import scan. The production test suite is manual (requires a live project and Ollama).