"""Task Decomposer — Break complex project goals into concrete steps.

Uses the deepseek-r1:1.5b reasoner model to convert a high-level goal into
an ordered, executable step list. Works standalone or as part of ProjectExecutor.

No protected files are modified.
"""
from __future__ import annotations

import json
import re
from typing import List, Optional

from src.core.ollama_client import OllamaClient
from src.core.router import Router


def _pick_model() -> str:
    return Router().pick("reason")  # deepseek-r1:1.5b


def decompose_goal(goal: str, requirements: str = "") -> List[str]:
    """Break a project goal into concrete, ordered implementation steps.

    Returns a list of step strings, each describing a single file-creation
    or file-modification action an agent can perform with write_file /
    read_file / run_shell tools.
    """
    client = OllamaClient()
    model = _pick_model()
    prompt = (
        "You are a project planner. Break the following project goal into a "
        "concise numbered list of concrete, actionable steps. Each step should "
        "be a single file-creation or file-modification action that an AI agent "
        "can perform using write_file, read_file, and shell tools.\n\n"
        "Return ONLY a JSON array of strings. No prose.\n\n"
        f"GOAL: {goal}\n\n"
        f"REQUIREMENTS: {requirements}\n\n"
        "Steps should cover: reading requirements, creating the main application "
        "file(s), creating a user manual, and verifying the app runs. "
        "Keep steps small and focused."
    )
    resp = client.chat(model=model, messages=[{"role": "user", "content": prompt}],
                       think=True, timeout=30)
    text = OllamaClient.extract_text(resp)
    m = re.search(r"\[.*\]", text, re.S)
    if m:
        try:
            arr = json.loads(m.group(0))
            if isinstance(arr, list):
                return [str(x) for x in arr if str(x).strip()]
        except Exception:
            pass
    # Fallback: numbered lines
    steps = []
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        line = re.sub(r"^\d+[\.\)]\s*", "", line)
        if line:
            steps.append(line)
    return steps or [goal]


def decompose_goal_safe(goal: str, requirements: str = "") -> List[str]:
    """Decompose a goal into steps with full fallback on any failure.

    Never raises — always returns a non-empty list of steps.
    """
    try:
        return decompose_goal(goal, requirements)
    except Exception:
        # Ultimate fallback: generic steps based on requirements content
        req_lower = (requirements or "").lower()
        if any(k in req_lower for k in ("search", "file", "folder", "word", "sentence")):
            return [
                "Read requirements.txt to understand project needs",
                "Create app.py with file search functionality (tkinter GUI, progress bar)",
                "Create USER_MANUAL.md with installation and usage instructions",
                "Verify app.py runs without errors"
            ]
        if any(k in req_lower for k in ("document", "explain", "logic", "markdown", "how it works", "mgai", "mgaI")):
            return [
                "Read requirements.txt to understand documentation needs",
                "Create USER_MANUAL.md with documented content",
                "Verify document is complete and readable"
            ]
        return [
            "Read requirements.txt to understand project needs",
            "Create app.py with main application logic",
            "Create USER_MANUAL.md with usage instructions",
            "Verify app runs correctly"
        ]


def estimate_step_type(step: str) -> str:
    """Classify a step as 'code', 'plan', 'docs', or 'general'."""
    s = step.lower()
    if any(k in s for k in ("write_file", "create file", "app.py", "main.py",
                            ".py", "implement", "build", "code")):
        return "code"
    if any(k in s for k in ("plan", "decompose", "structure", "design")):
        return "plan"
    if any(k in s for k in ("manual", "readme", "docs", "documentation")):
        return "docs"
    return "general"


def model_for_step(step: str) -> str:
    """Pick the best model for a given step."""
    t = estimate_step_type(step)
    router = Router()
    if t == "code":
        return router.pick("code")  # qwen2.5-coder:7b
    if t in ("plan", "docs"):
        return router.pick("reason")  # deepseek-r1:1.5b
    return router.pick("default")  # qwen3.5:4b
