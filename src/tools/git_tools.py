"""Git tools (for self-improvement and project work)."""
from __future__ import annotations

import subprocess
from pathlib import Path


def _run(args: list[str], cwd: str = ".") -> str:
    workdir = Path(cwd).resolve() if Path(cwd).is_absolute() else (Path(".").resolve() / cwd).resolve()
    try:
        proc = subprocess.run(["git"] + args, cwd=str(workdir), capture_output=True, text=True, timeout=120)
    except Exception as e:
        return f"ERROR: {e}"
    out = []
    if proc.stdout.strip():
        out.append(proc.stdout.strip())
    if proc.stderr.strip():
        out.append("STDERR: " + proc.stderr.strip())
    out.append(f"EXIT: {proc.returncode}")
    return "\n".join(out)


def _rollback(cwd: str = ".") -> str:
    """Rollback to previous git state before changes."""
    try:
        prev_commit = subprocess.run(
            ["git", "rev-parse", "~1"],
            capture_output=True, text=True, timeout=10,
            cwd=str(Path(cwd).resolve() if Path(cwd).is_absolute() else (Path(".").resolve() / cwd))
        ).stdout.strip()
        if prev_commit:
            result = subprocess.run(
                ["git", "checkout", prev_commit[:7]],
                capture_output=True, text=True, timeout=30,
                cwd=str(Path(cwd).resolve() if Path(cwd).is_absolute() else (Path(".").resolve() / cwd))
            )
            return f"Rolled back to {prev_commit[:8]}: EXIT: {result.returncode}"
        else:
            return "No previous commit found - rollback skipped"
    except Exception as e:
        return f"Rollback error: {e} (skipped)"


def git_status(cwd: str = ".") -> str:
    return _run(["status", "--short", "--branch"], cwd)


def git_diff(cwd: str = ".", staged: bool = False) -> str:
    args = ["diff"]
    if staged:
        args.append("--staged")
    return _run(args, cwd)


def git_branch(name: str = "", cwd: str = ".") -> str:
    if name:
        return _run(["checkout", "-b", name], cwd)
    return _run(["branch", "--show-current"], cwd)


def git_commit(message: str, cwd: str = ".") -> str:
    return _run(["commit", "-am", message], cwd)


def git_log(cwd: str = ".", n: int = 10) -> str:
    return _run(["log", f"-{n}", "--oneline"], cwd)


def run_tests(cwd: str = ".", pattern: str = "", rollback_on_fail: bool = True) -> str:
    # Rollback to previous commit if flag is set (safety for self-improve)
    if rollback_on_fail:
        print(f"  → Rolling back before tests...")
        rollback_out = _rollback(cwd)
        print(f"  {rollback_out}")
    
    cmd = ["python", "-m", "pytest", "-q"]
    if pattern:
        cmd += ["-k", pattern]
    workdir = Path(cwd).resolve() if Path(cwd).is_absolute() else (Path(".").resolve() / cwd).resolve()
    try:
        proc = subprocess.run(cmd, cwd=str(workdir), capture_output=True, text=True, timeout=300)
    except Exception as e:
        return f"ERROR: {e}"
    out = (proc.stdout + "\n" + proc.stderr)[-6000:]
    return f"{out}\nEXIT: {proc.returncode}"
