"""Thin wrapper around the Ollama HTTP API."""
from __future__ import annotations

import base64
import json
from pathlib import Path
from typing import Any, Iterable

import requests
import yaml

CONFIG_PATH = Path(__file__).resolve().parents[2] / "config.yaml"


def load_config() -> dict:
    with open(CONFIG_PATH, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


class OllamaClient:
    def __init__(self, base_url: str | None = None, keep_alive: str | None = None):
        cfg = load_config()
        self.base_url = (base_url or cfg["ollama"]["base_url"]).rstrip("/")
        self.keep_alive = keep_alive or cfg["ollama"]["keep_alive"]
        self.cfg = cfg

    # ---------- chat ----------
    def chat(
        self,
        model: str,
        messages: list[dict],
        tools: list[dict] | None = None,
        images: list[str] | None = None,
        think: bool = True,
        stream: bool = False,
        options: dict | None = None,
    ) -> dict:
        payload: dict[str, Any] = {
            "model": model,
            "messages": messages,
            "stream": stream,
            "keep_alive": self.keep_alive,
            "think": think,
        }
        if tools:
            payload["tools"] = tools
        if images:
            # attach images to last user message if not already
            payload["messages"] = self._attach_images(messages, images)
        if options:
            payload["options"] = options
        r = requests.post(f"{self.base_url}/api/chat", json=payload, timeout=300)
        r.raise_for_status()
        return r.json()

    @staticmethod
    def _attach_images(messages: list[dict], images: list[str]) -> list[dict]:
        out = [dict(m) for m in messages]
        # find last user message
        for i in range(len(out) - 1, -1, -1):
            if out[i].get("role") == "user":
                out[i]["images"] = images
                break
        return out

    # ---------- embeddings ----------
    def embed(self, model: str, text: str | list[str]) -> list[list[float]]:
        inputs = [text] if isinstance(text, str) else text
        r = requests.post(
            f"{self.base_url}/api/embed",
            json={"model": model, "input": inputs},
            timeout=120,
        )
        r.raise_for_status()
        return r.json()["embeddings"]

    # ---------- models ----------
    def list_models(self) -> list[dict]:
        r = requests.get(f"{self.base_url}/api/tags", timeout=30)
        r.raise_for_status()
        return r.json().get("models", [])

    def show(self, model: str) -> dict:
        r = requests.post(f"{self.base_url}/api/show", json={"model": model}, timeout=60)
        r.raise_for_status()
        return r.json()

    # ---------- helpers ----------
    @staticmethod
    def image_to_b64(path: str | Path) -> str:
        data = Path(path).read_bytes()
        return base64.b64encode(data).decode()

    @staticmethod
    def extract_text(resp: dict) -> str:
        msg = resp.get("message", {})
        return msg.get("content", "") or ""

    @staticmethod
    def extract_thinking(resp: dict) -> str:
        msg = resp.get("message", {})
        return msg.get("thinking", "") or ""

    @staticmethod
    def extract_tool_calls(resp: dict) -> list[dict]:
        msg = resp.get("message", {})
        return msg.get("tool_calls") or []
