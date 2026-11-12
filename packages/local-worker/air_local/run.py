"""Headless worker entrypoint used by AIR.

    python -m air_local.run --request <file> --result <file> [--verbose]

Reads a contract request, runs the local model with tools, writes a contract
result file, and exits with a stable code. Logs go to stderr; stdout stays
empty so callers never parse prose.

Exit codes (also recorded in ``contracts/job.schema.json``)::

    0 COMPLETED
    2 INVALID_REQUEST
    3 WORKER_FAILED
    4 CANCELLED
    5 PROVIDER_UNAVAILABLE
"""
from __future__ import annotations

import argparse
import json
import os
import signal
import subprocess
import sys
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import requests

from air_local import contract, policy
from air_local.loop import Agent

try:
    _reconfigure = getattr(sys.stdout, "reconfigure", None)
    if _reconfigure is not None:
        _reconfigure(encoding="utf-8", errors="replace")
except Exception:  # pragma: no cover - not a TTY
    pass

EXIT_CODES = contract.EXIT_CODES


def _now() -> str:
    return datetime.now(UTC).isoformat()


def _log(message: str) -> None:
    print(f"air-local: {message}", file=sys.stderr)


def _write_result(path: str | Path, result: dict[str, Any]) -> None:
    """Write the result atomically: a half-written file is never observed."""
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    tmp = target.with_name(target.name + ".tmp")
    tmp.write_text(json.dumps(result, indent=2, ensure_ascii=False), encoding="utf-8")
    os.replace(tmp, target)


def _finish(
    result_path: str | Path,
    *,
    run_id: str,
    state: str,
    category: str | None = None,
    message: str | None = None,
    answer: str | None = None,
    started_at: str | None = None,
    steps: int = 0,
    tool_calls: list[dict] | None = None,
    changed_files: list[str] | None = None,
) -> int:
    result: dict[str, Any] = {
        "contractVersion": contract.CONTRACT_VERSION,
        "runId": run_id,
        "state": state,
        "startedAt": started_at or _now(),
        "endedAt": _now(),
        "steps": steps,
        "toolCalls": tool_calls or [],
        "changedFiles": changed_files or [],
    }
    if answer is not None:
        result["answer"] = answer
    if category is not None:
        result["error"] = {"category": category, "message": message or category}
    try:
        _write_result(result_path, result)
    except Exception as exc:  # pragma: no cover - disk failure
        _log(f"cannot write result file: {exc}")
        return EXIT_CODES["WORKER_FAILED"]
    return EXIT_CODES[category or state]


def _changed_files(cwd: Path) -> list[str]:
    """Informational only: AIR derives real evidence from the worktree delta."""
    try:
        proc = subprocess.run(
            ["git", "status", "--porcelain"],
            cwd=str(cwd),
            capture_output=True,
            text=True,
            timeout=15,
        )
    except Exception:
        return []
    if proc.returncode != 0:
        return []
    files: list[str] = []
    for line in proc.stdout.splitlines():
        if not line.strip():
            continue
        path = line[3:].strip()
        arrow = path.find(" -> ")
        if arrow >= 0:
            path = path[arrow + 4 :]
        files.append(path)
    return files


def _classify_exception(exc: BaseException) -> tuple[str, str]:
    """Map an exception to a contract error category."""
    if isinstance(exc, requests.exceptions.ConnectionError):
        return "PROVIDER_UNAVAILABLE", f"cannot reach Ollama: {exc}"
    if isinstance(exc, requests.exceptions.Timeout):
        return "PROVIDER_UNAVAILABLE", f"Ollama timed out: {exc}"
    if isinstance(exc, requests.exceptions.HTTPError):
        status = getattr(getattr(exc, "response", None), "status_code", None)
        if status in (404, 429, 500, 502, 503, 504):
            return "PROVIDER_UNAVAILABLE", f"Ollama returned HTTP {status}: {exc}"
    text = str(exc).lower()
    if "ollama is unavailable" in text or "connection refused" in text:
        return "PROVIDER_UNAVAILABLE", str(exc)
    return "WORKER_FAILED", str(exc)


class _Cancelled(Exception):
    pass


def _install_signal_handlers() -> None:
    def handler(signum, frame):  # noqa: ARG001 - signal signature
        raise _Cancelled()

    for name in ("SIGTERM", "SIGINT"):
        sig = getattr(signal, name, None)
        if sig is None:
            continue
        try:
            signal.signal(sig, handler)
        except Exception:  # pragma: no cover - platform dependent
            pass


def run(request_path: str, result_path: str, verbose: bool = False) -> int:
    started_at = _now()

    try:
        # ``utf-8-sig`` accepts a BOM if a caller wrote one; it is harmless
        # otherwise. The result file is always written without a BOM.
        raw = Path(request_path).read_text(encoding="utf-8-sig")
    except Exception as exc:
        return _finish(
            result_path,
            run_id="unknown",
            state="FAILED",
            category="INVALID_REQUEST",
            message=f"cannot read request file: {exc}",
            started_at=started_at,
        )

    try:
        request = json.loads(raw)
    except json.JSONDecodeError as exc:
        return _finish(
            result_path,
            run_id="unknown",
            state="FAILED",
            category="INVALID_REQUEST",
            message=f"request is not valid JSON: {exc}",
            started_at=started_at,
        )

    errors = contract.validate_request(request)
    if errors:
        run_id = request.get("runId") if isinstance(request, dict) else "unknown"
        return _finish(
            result_path,
            run_id=str(run_id or "unknown"),
            state="FAILED",
            category="INVALID_REQUEST",
            message="; ".join(errors),
            started_at=started_at,
        )

    run_id = request["runId"]
    cwd = Path(request["cwd"]).expanduser().resolve()
    if not cwd.is_dir():
        return _finish(
            result_path,
            run_id=run_id,
            state="FAILED",
            category="INVALID_REQUEST",
            message=f"cwd is not a directory: {cwd}",
            started_at=started_at,
        )

    read_only = bool(request.get("readOnly", False))
    allow_shell = bool(request.get("allowShell", False))
    allow_network = bool(request.get("allowNetwork", True))
    policy.configure(
        cwd,
        allow_write=not read_only,
        allow_shell=allow_shell,
        allow_network=allow_network,
    )

    if request.get("configPath"):
        os.environ["AIR_LOCAL_CONFIG"] = str(request["configPath"])

    _install_signal_handlers()

    agent = Agent(
        max_steps=int(request.get("maxSteps", 40)),
        verbose=verbose or os.environ.get("AIR_LOCAL_VERBOSE") == "1",
    )

    try:
        answer = agent.run(request["task"], model=request.get("model"))
    except _Cancelled:
        return _finish(
            result_path,
            run_id=run_id,
            state="CANCELLED",
            category="CANCELLED",
            message="cancelled by signal",
            started_at=started_at,
            steps=agent.steps_used,
            tool_calls=agent.tool_calls,
            changed_files=_changed_files(cwd),
        )
    except Exception as exc:
        category, message = _classify_exception(exc)
        _log(f"{category}: {message}")
        return _finish(
            result_path,
            run_id=run_id,
            state="FAILED",
            category=category,
            message=message,
            started_at=started_at,
            steps=agent.steps_used,
            tool_calls=agent.tool_calls,
            changed_files=_changed_files(cwd),
        )

    _log(f"completed in {agent.steps_used} step(s)")
    return _finish(
        result_path,
        run_id=run_id,
        state="COMPLETED",
        answer=answer,
        started_at=started_at,
        steps=agent.steps_used,
        tool_calls=agent.tool_calls,
        changed_files=_changed_files(cwd),
    )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="air-local",
        description="AIR local worker (invoked by the air CLI, not by users).",
    )
    parser.add_argument("--request", required=True, help="Path to the contract request JSON")
    parser.add_argument("--result", required=True, help="Path to write the contract result JSON")
    parser.add_argument("--verbose", action="store_true", help="Log agent steps to stderr")
    args = parser.parse_args(argv)
    return run(args.request, args.result, verbose=args.verbose)


if __name__ == "__main__":
    raise SystemExit(main())
