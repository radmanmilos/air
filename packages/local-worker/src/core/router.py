"""Capability-based model router."""
from __future__ import annotations

from src.core.ollama_client import load_config


class Router:
    def __init__(self):
        self.cfg = load_config()
        self.models = self.cfg["models"]

    def pick(self, capability: str) -> str:
        """capability: 'default'|'code'|'reason'|'embed'|'vision'"""
        cap = capability.lower()
        if cap in ("code", "coder", "programming"):
            return self.models["coder"]
        if cap in ("reason", "plan", "critique", "think_fast"):
            return self.models["reasoner"]
        if cap in ("embed", "embedding"):
            return self.models["embed"]
        # default brain handles vision + tools + thinking
        return self.models["brain"]

    def available(self) -> dict:
        return dict(self.models)

    def pick_fastest(self, capability: str) -> str:
        """Pick model based on benchmark data if available, else fall back to pick()."""
        base = self.pick(capability)
        try:
            from pathlib import Path
            import json
            p = Path(".agent/benchmarks.json")
            if not p.exists():
                return base
            data = json.loads(p.read_text(encoding="utf-8"))
            # among models that support this capability, pick fastest avg time
            candidates = []
            for model, info in data.items():
                times = info.get("times", [])
                if times:
                    candidates.append((model, sum(times) / len(times)))
            if not candidates:
                return base
            candidates.sort(key=lambda x: x[1])
            # only override if the fastest is a known model
            if candidates[0][0] in self.models.values():
                return candidates[0][0]
        except Exception:
            pass
        return base
