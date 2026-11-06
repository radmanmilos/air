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
