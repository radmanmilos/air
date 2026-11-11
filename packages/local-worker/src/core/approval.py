"""Human-in-the-loop approval for sensitive tools."""
from __future__ import annotations


def approve(tool_name: str, args: dict) -> bool:
    print(f"\n  !! Approval required: {tool_name}")
    print(f"     args: {args}")
    try:
        ans = input("     Allow? [y/N]: ").strip().lower()
    except EOFError:
        return False
    return ans in ("y", "yes")
