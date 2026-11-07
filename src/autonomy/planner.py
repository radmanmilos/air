"""Planner: break a goal into ordered steps using the fast reasoner."""
from __future__ import annotations

import json
import re

from src.core.ollama_client import OllamaClient
from src.core.router import Router


def plan(goal: str, model: str | None = None) -> list[str]:
    model = model or Router().pick("reason")
    client = OllamaClient()
    prompt = (
        "Break the following goal into a concise numbered list of concrete steps. "
        "Return ONLY a JSON array of strings, no prose.\n\nGoal: " + goal
    )
    resp = client.chat(model=model, messages=[{"role": "user", "content": prompt}], think=True, timeout=600)
    text = client.extract_text(resp)
    # try parse JSON
    m = re.search(r"\[.*\]", text, re.S)
    if m:
        try:
            arr = json.loads(m.group(0))
            if isinstance(arr, list):
                steps = []
                for x in arr:
                    if isinstance(x, dict):
                        # coerce dict step into an actionable instruction
                        if "content" in x and ("name" in x or "path" in x or "file" in x):
                            p = x.get("name") or x.get("path") or x.get("file")
                            steps.append(f"Create file {p} with content:\n{x['content']}")
                        elif "step" in x:
                            steps.append(str(x["step"]))
                        else:
                            steps.append(json.dumps(x))
                    else:
                        steps.append(str(x))
                return steps
        except Exception:
            pass
    # fallback: numbered lines
    steps = []
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        line = re.sub(r"^\d+[\.\)]\s*", "", line)
        steps.append(line)
    return steps or [goal]