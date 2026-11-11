"""AIR local worker.

Runs a local Ollama model with a small, audited tool set inside a job root
chosen by AIR. This package is internal to the ``air`` monorepo: users interact
with the ``air`` CLI, never with this package directly.
"""
from __future__ import annotations

__version__ = "0.2.0"

__all__ = ["__version__"]
