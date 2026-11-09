"""Result Verifier — Verify project results against requirements.

Uses deepseek-r1:1.5b to critique step results and final project deliverables.
Works standalone or as part of ProjectExecutor.

No protected files are modified.
"""
from __future__ import annotations

import json
import re
from typing import Any, Dict, List, Optional

from src.core.ollama_client import OllamaClient
from src.core.router import Router


def _pick_model() -> str:
    return Router().pick("reason")  # deepseek-r1:1.5b


def verify_step(goal: str, requirements: str, step: str, result: str) -> dict:
    """Critique whether a step result satisfies its purpose.

    Returns dict: {"pass": bool, "reason": str, "fix": str}
    """
    client = OllamaClient()
    model = _pick_model()
    prompt = (
        "You are a strict reviewer. Given a PROJECT GOAL, REQUIREMENTS, a STEP, "
        "and the RESULT of executing that step, reply with JSON only:\n"
        '{"pass": true/false, "reason": "...", "fix": "..."}\n'
        "pass = true if the result meaningfully advances the step. "
        "pass = false if the result is empty, a placeholder, or doesn't address "
        "the step. fix = what still needs to be done.\n\n"
        f"GOAL: {goal}\n"
        f"REQUIREMENTS: {requirements}\n"
        f"STEP: {step}\n"
        f"RESULT: {result[:2000]}\n\n"
        "ONLY JSON. No prose."
    )
    resp = client.chat(model=model, messages=[{"role": "user", "content": prompt}],
                       think=True, timeout=600)
    text = OllamaClient.extract_text(resp)
    m = re.search(r"\{.*\}", text, re.S)
    if m:
        try:
            return json.loads(m.group(0))
        except Exception:
            pass
    return {"pass": False, "reason": text, "fix": "Review and redo step"}


def verify_final(goal: str, requirements: str, folder_path: str,
                 files_created: Optional[List[str]] = None) -> dict:
    """Verify the final project satisfies all requirements.

    Returns dict: {"pass": bool, "reason": str, "missing": [str]}
    """
    client = OllamaClient()
    model = _pick_model()

    if files_created is None:
        from pathlib import Path
        folder = Path(folder_path)
        files_created = []
        for p in folder.rglob("*"):
            if p.is_file() and not p.name.startswith("."):
                files_created.append(str(p.relative_to(folder)))

    file_list = "\n".join(f"- {f}" for f in sorted(files_created)) or "(no files)"

    prompt = (
        "You are a final reviewer. Given a PROJECT GOAL, REQUIREMENTS, and the "
        "list of files created, decide if the project is complete and satisfies "
        "all requirements. Reply with JSON only:\n"
        '{"pass": true/false, "reason": "...", "missing": ["file1", "file2"]}\n'
        "pass = true if all key requirements are addressed by existing files. "
        "missing = list of files that still need to be created.\n\n"
        f"GOAL: {goal}\n"
        f"REQUIREMENTS: {requirements}\n"
        f"FILES CREATED:\n{file_list}\n\n"
        "ONLY JSON. No prose."
    )
    resp = client.chat(model=model, messages=[{"role": "user", "content": prompt}],
                       think=True, timeout=600)
    text = OllamaClient.extract_text(resp)
    m = re.search(r"\{.*\}", text, re.S)
    if m:
        try:
            return json.loads(m.group(0))
        except Exception:
            pass
    return {"pass": False, "reason": text, "missing": []}


def score_completeness(files_created: List[str], requirements: str) -> float:
    """Heuristic completeness score from 0.0 to 1.0 based on files present."""
    if not files_created:
        return 0.0
    score = 0.0
    has_code = any(f.endswith(".py") for f in files_created)
    has_docs = any(f.lower().endswith((".md", ".txt")) for f in files_created)
    has_readme = any(f.lower() in ("readme.md", "readme.txt") for f in files_created)
    has_manual = any("manual" in f.lower() for f in files_created)

    if has_code:
        score += 0.4
    if has_docs:
        score += 0.2
    if has_readme:
        score += 0.2
    if has_manual:
        score += 0.2
    return min(score, 1.0)
