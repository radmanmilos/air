"""ReAct agent loop: think -> tool call -> observe -> repeat.

Headless by design. Permissions are enforced by :mod:`air_local.policy` inside
the tools, never by prompting a human.
"""
from __future__ import annotations

import json
import sys

from air_local.models import Router
from air_local.ollama import OllamaClient
from air_local.tools.registry import Registry

try:
    _reconfigure = getattr(sys.stdout, "reconfigure", None)
    if _reconfigure is not None:
        _reconfigure(encoding="utf-8", errors="replace")
except Exception:  # pragma: no cover - not a TTY
    pass


BASE_SYSTEM_PROMPT = """You are the local worker inside AIR, a unified AI tool orchestrator.
You have tools to read and write files, run allowlisted commands, inspect git, and fetch web pages.
You MUST use these tools to complete the task. Do not just describe code.
Work step by step: call a tool when you need information or need to change the workspace.
To fix a bug: first read the relevant file, then use write_file to modify it, then use run_shell to run tests.
When the task is complete, reply with a short final answer and no tool calls.
Be concise. Prefer doing over explaining. Do not claim success without evidence from tool output.
"""


class Agent:
    """Drive a local Ollama model until it stops calling tools."""

    def __init__(
        self,
        client: OllamaClient | None = None,
        router: Router | None = None,
        registry: Registry | None = None,
        max_steps: int = 40,
        verbose: bool = False,
    ) -> None:
        self.client = client or OllamaClient()
        self.router = router or Router()
        self.registry = registry
        self.max_steps = max_steps
        self.verbose = verbose
        self.steps_used = 0
        self.tool_calls: list[dict] = []
        self.messages: list[dict] = [
            {"role": "system", "content": BASE_SYSTEM_PROMPT}
        ]

    def _log(self, text: str) -> None:
        if self.verbose:
            print(text, file=sys.stderr)

    def _loop(self, model: str, messages: list[dict]) -> str:
        self.steps_used = 0
        self.tool_calls = []
        for step in range(1, self.max_steps + 1):
            self.steps_used = step
            self._log(f"[step {step}] thinking with {model}...")
            resp = self.client.chat(
                model=model,
                messages=messages,
                tools=self.registry.schemas() if self.registry else None,
                stream=True,
                timeout=600,
            )
            msg = resp.get("message", {}) or {}
            thinking = msg.get("thinking")
            if thinking:
                self._log(f"  (thinking) {thinking[:300]}")
            messages.append(msg)

            tool_calls = msg.get("tool_calls") or []
            if not tool_calls:
                content = msg.get("content", "") or ""
                # Some models emit a tool call as a JSON object in content
                # instead of using Ollama's native tool_calls field. Recover
                # those so the worker can still act.
                candidate = None
                stripped = content.strip()
                if stripped.startswith("{") and stripped.endswith("}"):
                    try:
                        candidate = json.loads(stripped)
                    except json.JSONDecodeError:
                        candidate = None
                if isinstance(candidate, dict) and "name" in candidate:
                    args = candidate.get("arguments", candidate.get("args", {}))
                    if not isinstance(args, dict):
                        args = {}
                    name = candidate["name"]
                    if self.registry is None or self.registry.get(name) is not None:
                        tool_calls = [{"function": {"name": name, "arguments": args}}]
                if isinstance(candidate, list):
                    recovered = []
                    for item in candidate:
                        if isinstance(item, dict) and "name" in item:
                            args = item.get("arguments", item.get("args", {}))
                            if not isinstance(args, dict):
                                args = {}
                            name = item["name"]
                    if self.registry is None or self.registry.get(name) is not None:
                                recovered.append({"function": {"name": name, "arguments": args}})
                    if recovered:
                        tool_calls = recovered

            if not tool_calls:
                content = msg.get("content", "") or ""
                self._log(f"[done] {content[:500]}")
                return content

            for tc in tool_calls:
                fn = tc.get("function", {})
                name = fn.get("name", "")
                args = fn.get("arguments", {})
                self._log(f"  -> tool: {name}({args})")
                result = (
                    self.registry.dispatch(name, args)
                    if self.registry
                    else "ERROR: no registry"
                )
                ok = not (result.startswith("ERROR:") or result.startswith("BLOCKED:"))
                self.tool_calls.append({"name": name, "ok": ok})
                preview = result[:400].replace("\n", " ")
                self._log(f"     <- {preview}{'...' if len(result) > 400 else ''}")
                messages.append(
                    {"role": "tool", "content": result, "tool_call_id": tc.get("id")}
                )

        return "Reached max steps without a final answer."

    def run(
        self, goal: str, model: str | None = None, images: list[str] | None = None
    ) -> str:
        """Run one goal to completion and return the final answer."""
        model = model or self.router.pick("default")
        self.messages = [{"role": "system", "content": BASE_SYSTEM_PROMPT}]
        user_msg: dict = {"role": "user", "content": goal}
        if images:
            user_msg["images"] = images
        self.messages.append(user_msg)
        return self._loop(model, self.messages)

    # ``chat`` was the AIR name; keep it as an alias for embedders.
    def chat(
        self, goal: str, model: str | None = None, images: list[str] | None = None
    ) -> str:
        return self.run(goal, model=model, images=images)
