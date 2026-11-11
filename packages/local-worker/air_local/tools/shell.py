"""Shell execution tool: argv only, allowlisted binaries, cwd inside the job root.

There is no shell. The command string is split into argv, the first token must
be an allowlisted binary, and shell metacharacters are rejected outright. This
removes the whole class of injection bugs that ``shell=True`` invites.
"""
from __future__ import annotations

import shlex
import subprocess
from pathlib import Path

from air_local import policy

# Binaries the worker may invoke. Extend deliberately; never run a shell.
ALLOWED = frozenset(
    {
        "cargo",
        "cat",
        "cmake",
        "dir",
        "echo",
        "find",
        "git",
        "go",
        "grep",
        "head",
        "ls",
        "make",
        "mypy",
        "node",
        "npm",
        "npx",
        "pip",
        "py",
        "pwd",
        "pytest",
        "python",
        "python3",
        "ruff",
        "tail",
        "tsc",
        "type",
        "where",
        "which",
    }
)

SHELL_METACHARACTERS = frozenset("|&;<>`$()\n\r")


def _split(command: str) -> list[str]:
    """Split a command into argv without invoking a shell."""
    if any(ch in SHELL_METACHARACTERS for ch in command):
        raise ValueError(
            "shell metacharacters are not allowed; pass one argv command"
        )
    tokens = shlex.split(command, posix=False)
    cleaned = []
    for token in tokens:
        if len(token) >= 2 and token[0] == token[-1] and token[0] in "\"'":
            token = token[1:-1]
        cleaned.append(token)
    return cleaned


def _binary_name(token: str) -> str:
    name = Path(token).name.lower()
    return name[:-4] if name.endswith(".exe") else name


def run_shell(command: str, cwd: str = ".", timeout: int = 120) -> str:
    """Run one allowlisted command inside the job root."""
    try:
        policy.require_shell()
    except PermissionError as exc:
        return f"ERROR: {exc}"

    try:
        argv = _split(command)
    except ValueError as exc:
        return f"BLOCKED: {exc}"
    if not argv:
        return "ERROR: empty command"
    if _binary_name(argv[0]) not in ALLOWED:
        return f"BLOCKED: '{argv[0]}' is not in the shell allowlist"

    try:
        workdir = policy.resolve(cwd, must_exist=True)
    except (PermissionError, FileNotFoundError) as exc:
        return f"ERROR: {exc}"
    if not workdir.is_dir():
        return f"ERROR: cwd is not a directory: {workdir}"

    try:
        proc = subprocess.run(
            argv,
            shell=False,
            cwd=str(workdir),
            capture_output=True,
            text=True,
            timeout=timeout,
        )
    except subprocess.TimeoutExpired:
        return f"ERROR: timed out after {timeout}s"
    except FileNotFoundError:
        return f"ERROR: executable not found: {argv[0]}"
    except OSError as exc:
        return f"ERROR: {exc}"

    out = []
    if proc.stdout:
        out.append("STDOUT:\n" + proc.stdout[-8000:])
    if proc.stderr:
        out.append("STDERR:\n" + proc.stderr[-4000:])
    out.append(f"EXIT CODE: {proc.returncode}")
    return "\n".join(out)
