"""Git tools for inspecting and committing inside the job root."""
from __future__ import annotations

import subprocess
import sys

from air_local import policy


def _run(args: list[str], cwd: str = ".") -> str:
    try:
        workdir = policy.resolve(cwd, must_exist=True)
    except (PermissionError, FileNotFoundError) as exc:
        return f"ERROR: {exc}"
    try:
        proc = subprocess.run(
            ["git", *args],
            cwd=str(workdir),
            capture_output=True,
            text=True,
            timeout=120,
        )
    except FileNotFoundError:
        return "ERROR: git is not installed"
    except Exception as exc:  # pragma: no cover - platform dependent
        return f"ERROR: {exc}"
    out = []
    if proc.stdout.strip():
        out.append(proc.stdout.strip())
    if proc.stderr.strip():
        out.append("STDERR: " + proc.stderr.strip())
    out.append(f"EXIT: {proc.returncode}")
    return "\n".join(out)


def git_status(cwd: str = ".") -> str:
    return _run(["status", "--short", "--branch"], cwd)


def git_diff(cwd: str = ".", staged: bool = False) -> str:
    args = ["diff"]
    if staged:
        args.append("--staged")
    return _run(args, cwd)


def git_branch(name: str = "", cwd: str = ".") -> str:
    if name:
        try:
            policy.require_write(cwd)
        except PermissionError as exc:
            return f"ERROR: {exc}"
        return _run(["checkout", "-b", name], cwd)
    return _run(["branch", "--show-current"], cwd)


def git_commit(message: str, cwd: str = ".") -> str:
    try:
        policy.require_write(cwd)
    except PermissionError as exc:
        return f"ERROR: {exc}"
    return _run(["commit", "-am", message], cwd)


def git_log(cwd: str = ".", n: int = 10) -> str:
    return _run(["log", f"-{n}", "--oneline"], cwd)


def run_tests(cwd: str = ".", pattern: str = "") -> str:
    """Run pytest in the job root. Never rolls the repository back."""
    try:
        policy.require_shell()
    except PermissionError as exc:
        return f"ERROR: {exc}"
    try:
        workdir = policy.resolve(cwd, must_exist=True)
    except (PermissionError, FileNotFoundError) as exc:
        return f"ERROR: {exc}"

    cmd = [sys.executable, "-m", "pytest", "-q"]
    if pattern:
        cmd += ["-k", pattern]
    try:
        proc = subprocess.run(
            cmd, cwd=str(workdir), capture_output=True, text=True, timeout=300
        )
    except subprocess.TimeoutExpired:
        return "ERROR: tests timed out after 300s"
    except Exception as exc:  # pragma: no cover - platform dependent
        return f"ERROR: {exc}"
    out = (proc.stdout + "\n" + proc.stderr)[-6000:]
    return f"{out}\nEXIT: {proc.returncode}"
