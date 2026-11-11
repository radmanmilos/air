"""Guardrail tools for the agent."""
from __future__ import annotations

from src.core.guardrails import protected_changed, diff_size, MAX_DIFF_LINES


def check_guardrails(cwd: str = ".") -> str:
    prot = protected_changed(cwd)
    ds = diff_size(cwd)
    lines = [f"protected_changed: {prot or '(none)'}", f"diff_lines: {ds} / {MAX_DIFF_LINES}"]
    if prot:
        lines.append("STATUS: BLOCKED - protected files changed")
    elif ds > MAX_DIFF_LINES:
        lines.append("STATUS: BLOCKED - diff too large")
    else:
        lines.append("STATUS: OK")
    return "\n".join(lines)