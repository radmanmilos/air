"""Guardrails for safe self-modification."""
from __future__ import annotations

import subprocess
from pathlib import Path

PROTECTED = {
    "config.yaml",
    "README.md",
    "VISION.md",
    "PLAN.md",
    "GUARDRAILS.md",
    "HOW_TO_START.md",
    "requirements.txt",
    ".gitignore",
}
PROTECTED_PREFIXES = ("src/core/", "src/tools/registry.py", "src/tools/builtin.py")
MAX_DIFF_LINES = 400


def is_protected(path: str) -> bool:
    p = path.replace("\\", "/").lstrip("./")
    if p in PROTECTED:
        return True
    for pref in PROTECTED_PREFIXES:
        if p.startswith(pref):
            return True
    return False


def protected_changed(cwd: str = ".") -> list[str]:
    """Return list of protected files that have uncommitted changes."""
    out = subprocess.run(["git", "diff", "--name-only"], cwd=cwd, capture_output=True, text=True)
    changed = [l.strip() for l in out.stdout.splitlines() if l.strip()]
    out2 = subprocess.run(["git", "status", "--porcelain"], cwd=cwd, capture_output=True, text=True)
    for line in out2.stdout.splitlines():
        if line.strip():
            p = line.strip().split()[-1]
            if p not in changed:
                changed.append(p)
    return [p for p in changed if is_protected(p)]


def diff_size(cwd: str = ".") -> int:
    out2 = subprocess.run(["git", "diff", "--numstat"], cwd=cwd, capture_output=True, text=True)
    total = 0
    for line in out2.stdout.splitlines():
        parts = line.split()
        if len(parts) >= 2 and parts[0].isdigit() and parts[1].isdigit():
            total += int(parts[0]) + int(parts[1])
    return total


def syntax_check(paths: list[str], cwd: str = ".") -> list[str]:
    errors = []
    for p in paths:
        if p.endswith(".py"):
            r = subprocess.run(["python", "-m", "py_compile", p], cwd=cwd, capture_output=True, text=True)
            if r.returncode != 0:
                errors.append(f"{p}: {r.stderr.strip()}")
    return errors