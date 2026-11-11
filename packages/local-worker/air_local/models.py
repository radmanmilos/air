"""Capability-based model selection for local Ollama models.

This is not AIR's cross-provider router. It only maps a capability name to one
of the local model slots configured in ``config.yaml``.
"""
from __future__ import annotations

from air_local.ollama import load_config


class Router:
    def __init__(self) -> None:
        self.cfg = load_config()
        self.models = self.cfg["models"]

    def pick(self, capability: str) -> str:
        """Map ``default|code|reason|embed`` to a configured model."""
        cap = capability.lower()
        if cap in ("code", "coder", "programming"):
            return self.models["coder"]
        if cap in ("reason", "plan", "critique", "think_fast"):
            return self.models["reasoner"]
        if cap in ("embed", "embedding"):
            return self.models["embed"]
        return self.models["brain"]

    def available(self) -> dict:
        return dict(self.models)
