"""Shell execution tool (arms)."""
from __future__ import annotations

import subprocess
from pathlib import Path

DANGEROUS = ("rm -rf", "del /s", "format ", "mkfs", "shutdown", "reboot", "> /dev", "dd if=")


def run_shell(command: str, cwd: str = ".", timeout: int = 120) -> str:
    low = command.lower()
    for d in DANGEROUS:
        if d in low:
            return f"BLOCKED: command looks dangerous ('{d}'). Refusing to run."
    workdir = Path(cwd).resolve() if Path(cwd).is_absolute() else (Path(".").resolve() / cwd).resolve()
    if not workdir.exists():
        return f"ERROR: cwd not found: {workdir}"
    try:
        proc = subprocess.run(
            command,
            shell=True,
            cwd=str(workdir),
            capture_output=True,
            text=True,
            timeout=timeout,
        )
    except subprocess.TimeoutExpired:
        return f"ERROR: timed out after {timeout}s"
    out = []
    if proc.stdout:
        out.append("STDOUT:\n" + proc.stdout[-8000:])
    if proc.stderr:
        out.append("STDERR:\n" + proc.stderr[-4000:])
    out.append(f"EXIT CODE: {proc.returncode}")
    return "\n".join(out)
