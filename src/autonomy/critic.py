"""Critic: evaluate whether a result satisfies the goal."""
from __future__ import annotations

from src.core.ollama_client import OllamaClient
from src.core.router import Router


def critique(goal: str, result: str, model: str | None = None) -> dict:
    model = model or Router().pick("reason")
    client = OllamaClient()
    prompt = (
        "You are a strict reviewer. Given a GOAL and a RESULT, reply with JSON: "
        '{"pass": true/false, "reason": "...", "fix": "..."}. '
        "Only JSON, no prose.\n\nGOAL: " + goal + "\n\nRESULT: " + result[:3000]
    )
    resp = client.chat(model=model, messages=[{"role": "user", "content": prompt}], think=True)
    text = client.extract_text(resp)
    import json, re
    m = re.search(r"\{.*\}", text, re.S)
    if m:
        try:
            return json.loads(m.group(0))
        except Exception:
            pass
    return {"pass": False, "reason": text, "fix": ""}