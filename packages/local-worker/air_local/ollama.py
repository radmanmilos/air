"""Thin wrapper around the Ollama HTTP API."""
from __future__ import annotations

import base64
import json
import os
import subprocess
import time
from pathlib import Path
from typing import Any

import requests
import yaml

DEFAULT_CONFIG: dict[str, Any] = {
    "ollama": {"base_url": "http://localhost:11434", "keep_alive": "5m"},
    "models": {
        "brain": "qwen3.5:4b",
        "coder": "qwen2.5-coder:7b",
        "reasoner": "deepseek-r1:1.5b",
        "embed": "nomic-embed-text",
    },
    "routing": {"default_context": 8192, "max_context": 32768},
    "tools": {
        "shell": {"timeout_seconds": 120},
        "web": {"enabled": True},
    },
    "agent": {"max_steps": 40, "verbose": False},
}

BUNDLED_CONFIG = Path(__file__).resolve().parents[1] / "config.yaml"


def config_path() -> Path:
    """Config location: ``AIR_LOCAL_CONFIG`` wins, else the bundled file."""
    override = os.environ.get("AIR_LOCAL_CONFIG")
    if override:
        return Path(override).expanduser().resolve()
    return BUNDLED_CONFIG


def load_config() -> dict[str, Any]:
    """Load config, merging over the built-in defaults."""
    path = config_path()
    data: dict[str, Any] = {}
    if path.exists():
        with open(path, encoding="utf-8") as f:
            data = yaml.safe_load(f) or {}
    merged = {key: dict(value) for key, value in DEFAULT_CONFIG.items()}
    for key, value in data.items():
        if isinstance(value, dict) and isinstance(merged.get(key), dict):
            merged[key].update(value)
        else:
            merged[key] = value
    return merged


class OllamaClient:
    def __init__(self, base_url: str | None = None, keep_alive: str | None = None):
        cfg = load_config()
        self.base_url = (base_url or cfg["ollama"]["base_url"]).rstrip("/")
        self.keep_alive = keep_alive or cfg["ollama"]["keep_alive"]
        self.cfg = cfg
        self._last_online_check = 0.0
        self._online_cache_ttl = 10.0

    # ---------- Ollama lifecycle / resilience ----------
    def is_online(self) -> bool:
        now = time.time()
        if now - self._last_online_check < self._online_cache_ttl:
            return getattr(self, "_last_online_state", False)
        try:
            r = requests.get(f"{self.base_url}/api/version", timeout=5)
            state = r.status_code == 200
        except Exception:
            state = False
        self._last_online_state = state
        self._last_online_check = now
        return state

    def ensure_online(self, timeout: int = 300) -> bool:
        """Start Ollama if needed and wait up to ``timeout`` seconds."""
        if self.is_online():
            return True
        try:
            subprocess.Popen(
                ["ollama", "serve"],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                creationflags=subprocess.CREATE_NEW_PROCESS_GROUP if os.name == "nt" else 0,
            )
        except Exception:
            pass
        deadline = time.time() + timeout
        while time.time() < deadline:
            self._last_online_check = 0.0
            if self.is_online():
                return True
            time.sleep(2)
        return False

    # ---------- chat ----------
    def chat(
        self,
        model: str,
        messages: list[dict],
        tools: list[dict] | None = None,
        images: list[str] | None = None,
        think: bool | None = None,
        stream: bool = False,
        timeout: int = 600,
        options: dict | None = None,
    ) -> dict:
        payload: dict[str, Any] = {
            "model": model,
            "messages": messages,
            "stream": stream,
            "keep_alive": self.keep_alive,
        }
        if think is not None and think:
            model_lower = model.lower()
            if any(m in model_lower for m in ("qwen3", "deepseek-r1")):
                payload["think"] = True
        if tools:
            payload["tools"] = tools
        if images:
            payload["messages"] = self._attach_images(messages, images)
        if options:
            payload["options"] = options

        url = f"{self.base_url}/api/chat"

        def _do_request(stream_flag: bool) -> dict:
            if not stream_flag:
                r = requests.post(url, json=payload, timeout=timeout)
                r.raise_for_status()
                return r.json()
            r = requests.post(url, json=payload, stream=True, timeout=timeout)
            r.raise_for_status()
            content = ""
            thinking = ""
            tool_calls: list[dict] = []
            final: dict[str, Any] = {}
            for line in r.iter_lines(decode_unicode=True):
                if not line:
                    continue
                try:
                    chunk = json.loads(line)
                except json.JSONDecodeError:
                    continue
                msg = chunk.get("message", {}) or {}
                content += msg.get("content", "") or ""
                thinking += msg.get("thinking", "") or ""
                if msg.get("tool_calls"):
                    tool_calls.extend(msg["tool_calls"])
                if chunk.get("done"):
                    final = chunk
                    break
            return {
                "model": model,
                "message": {
                    "role": "assistant",
                    "content": content,
                    "thinking": thinking,
                    "tool_calls": tool_calls or None,
                },
                "done": True,
                "total_duration": final.get("total_duration"),
            }

        try:
            return _do_request(stream)
        except (requests.exceptions.ConnectionError, requests.exceptions.Timeout) as exc:
            if self.ensure_online(timeout=300):
                return _do_request(stream)
            raise RuntimeError(f"Ollama is unavailable: {exc}") from exc

    @staticmethod
    def _attach_images(messages: list[dict], images: list[str]) -> list[dict]:
        out = [dict(m) for m in messages]
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
        return base64.b64encode(Path(path).read_bytes()).decode()

    @staticmethod
    def extract_text(resp: dict) -> str:
        return (resp.get("message", {}) or {}).get("content", "") or ""

    @staticmethod
    def extract_thinking(resp: dict) -> str:
        return (resp.get("message", {}) or {}).get("thinking", "") or ""

    @staticmethod
    def extract_tool_calls(resp: dict) -> list[dict]:
        return (resp.get("message", {}) or {}).get("tool_calls") or []
