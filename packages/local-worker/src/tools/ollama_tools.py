"""Ollama lifecycle tools for the agent."""
from __future__ import annotations

from src.core.ollama_client import OllamaClient


def ensure_ollama_online(timeout: int = 300) -> str:
    client = OllamaClient()
    if client.ensure_online(timeout=timeout):
        return "Ollama is online."
    return "Ollama could not be brought online within the timeout."


def is_ollama_online() -> str:
    client = OllamaClient()
    return "online" if client.is_online() else "offline"