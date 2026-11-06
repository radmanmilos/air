"""ReAct agent loop: think -> tool call -> observe -> repeat."""
from __future__ import annotations

import sys
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

from src.core.ollama_client import OllamaClient
from src.core.router import Router
from src.tools.registry import Registry


SYSTEM_PROMPT = """You are a capable local AI assistant with access to tools.
You can read/write files, run shell commands, and search the web.
Work step by step. Use tools when needed. After getting tool results, continue reasoning.
When you have the final answer, respond directly to the user without tool calls.
Be concise. Prefer doing over explaining.
Do not run git commit unless the user explicitly asks; leave commits to the self-improvement workflow.
Never overwrite config.yaml, README.md, VISION.md, or PLAN.md unless the user explicitly asks.
You are MGAI (Makeing Good AIs), a unified system of multiple LLM models connected with tools. The user is your creator. Your identity is documented in METADATA.md. You may read/update METADATA.md.


class Agent:
    def __init__(self, client: OllamaClient | None = None, router: Router | None = None,
                 registry: Registry | None = None, max_steps: int = 20, verbose: bool = True):
        self.client = client or OllamaClient()
        self.router = router or Router()
        self.registry = registry
        self.max_steps = max_steps
        self.verbose = verbose
        self.messages: list[dict] = [{"role": "system", "content": SYSTEM_PROMPT}]

    def _loop(self, model: str, messages: list[dict]) -> str:
        for step in range(1, self.max_steps + 1):
            if self.verbose:
                print(f"\n[step {step}] thinking with {model}...")
            resp = self.client.chat(
                model=model,
                messages=messages,
                tools=self.registry.schemas() if self.registry else None,
            )
            msg = resp.get("message", {})
            thinking = msg.get("thinking")
            if self.verbose and thinking:
                print(f"  (thinking) {thinking[:300]}{'...' if len(thinking or '') > 300 else ''}")
            messages.append(msg)

            tool_calls = msg.get("tool_calls") or []
            if not tool_calls:
                content = msg.get("content", "")
                if self.verbose:
                    print(f"\n[done] {content[:500]}")
                return content

            for tc in tool_calls:
                fn = tc["function"]
                name = fn["name"]
                args = fn.get("arguments", {})
                if self.verbose:
                    print(f"  -> tool: {name}({args})")
                tool = self.registry.get(name) if self.registry else None
                if tool and tool.requires_approval:
                    from src.core.approval import approve
                    if not approve(name, args):
                        result = "DENIED by user."
                        if self.verbose:
                            print("     (denied)")
                        messages.append({"role": "tool", "content": result, "tool_call_id": tc.get("id")})
                        continue
                result = self.registry.dispatch(name, args) if self.registry else "ERROR: no registry"
                if self.verbose:
                    preview = result[:400].replace("\n", " ")
                    print(f"     <- {preview}{'...' if len(result) > 400 else ''}")
                messages.append({"role": "tool", "content": result, "tool_call_id": tc.get("id")})

        return "Reached max steps without a final answer."

    def run(self, goal: str, model: str | None = None, images: list[str] | None = None) -> str:
        model = model or self.router.pick("default")
        # one-shot: reset conversation
        self.messages = [{"role": "system", "content": SYSTEM_PROMPT}]
        user_msg = {"role": "user", "content": goal}
        if images:
            user_msg["images"] = images
        self.messages.append(user_msg)
        return self._loop(model, self.messages)

    def chat(self, goal: str, model: str | None = None, images: list[str] | None = None) -> str:
        model = model or self.router.pick("default")
        user_msg = {"role": "user", "content": goal}
        if images:
            user_msg["images"] = images
        self.messages.append(user_msg)
        result = self._loop(model, self.messages)
        return result
