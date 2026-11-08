"""ReAct agent loop: think -> tool call -> observe -> repeat."""
from __future__ import annotations

import os
import sys
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

from src.core.ollama_client import OllamaClient
from src.core.router import Router
from src.tools.registry import Registry


BASE_SYSTEM_PROMPT = """You are a capable local AI assistant with access to tools.
You can read/write files, run shell commands, and search the web.
Work step by step. Use tools when needed. After getting tool results, continue reasoning.
When you have the final answer, respond directly to the user without tool calls.
Be concise. Prefer doing over explaining.
Do not stop at describing a plan — actually execute it using tools until the task is fully complete.
"""

PROJECT_MODE_SYSTEM_ADDITION = """IMPORTANT: You are building a CLIENT PROJECT in an external folder, NOT modifying your own codebase.
Do NOT run git commit, create branches, or update PLAN.md. Do NOT follow self-improvement cycle discipline.
Just build what the user asked for, write files directly into the target folder, and deliver the finished app.
Do not treat requirement.txt as a pip requirements file — it contains human-readable project requirements.
You must actually CREATE the files using write_file tool. Do not just describe a plan — execute it.
Do not return a final answer until at least one file has been written to the target folder.
For a Windows file search app, create these files:
- app.py — tkinter GUI app: folder picker, search box, results list with file path/line number/match %, progress bar while searching
- USER_MANUAL.md — how to install and use the app
Keep calling write_file until both files exist in the target folder.
"""

SELF_IMPROVE_SYSTEM_ADDITION = """Do not run git commit unless the user explicitly asks; leave commits to the self-improvement workflow.
Never overwrite config.yaml, README.md, VISION.md, or PLAN.md unless the user explicitly asks.
You are MGAI (Makeing Good AI), a unified system of multiple LLM models connected with tools. The user is your creator. Your identity is documented in METADATA.md. You may read/update METADATA.md.
Follow the cycle-completion checklist in GUARDRAILS.md: commit incrementally, update PLAN.md after each commit, never leave a cycle half-finished. If a session is running long, commit and report at the current milestone before continuing.
"""

def build_system_prompt(project_mode: bool = False) -> str:
    parts = [BASE_SYSTEM_PROMPT]
    if project_mode:
        parts.append(PROJECT_MODE_SYSTEM_ADDITION)
    else:
        parts.append(SELF_IMPROVE_SYSTEM_ADDITION)
        root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        for fname, label in [("METADATA.md", "Identity document"), ("GUARDRAILS.md", "Guardrails")]:
            path = os.path.join(root, fname)
            try:
                if os.path.exists(path):
                    with open(path, "r", encoding="utf-8") as f:
                        parts.append(f"{label} ({fname}):\n" + f.read())
            except Exception:
                pass
    return "\n\n".join(parts)


class Agent:
    def __init__(self, client: OllamaClient | None = None, router: Router | None = None,
                 registry: Registry | None = None, max_steps: int = 40, verbose: bool = True,
                 project_mode: bool = False):
        self.client = client or OllamaClient()
        self.router = router or Router()
        self.registry = registry
        self.max_steps = max_steps
        self.verbose = verbose
        self.project_mode = project_mode
        self.files_written = 0
        self.messages: list[dict] = [{"role": "system", "content": build_system_prompt(project_mode)}]

    def _loop(self, model: str, messages: list[dict]) -> str:
        for step in range(1, self.max_steps + 1):
            if self.verbose:
                print(f"\n[step {step}] thinking with {model}...")
            resp = self.client.chat(
                model=model,
                messages=messages,
                tools=self.registry.schemas() if self.registry else None,
                stream=True,
                timeout=600,
            )
            msg = resp.get("message", {})
            thinking = msg.get("thinking")
            if self.verbose and thinking:
                print(f"  (thinking) {thinking[:300]}{'...' if len(thinking or '') > 300 else ''}")
            messages.append(msg)

            tool_calls = msg.get("tool_calls") or []
            if not tool_calls:
                content = msg.get("content", "")
                if self.project_mode and self.files_written == 0:
                    # Safety net: force file creation before allowing a final answer
                    messages.append({"role": "system", "content": "SAFETY NET: You have not written any files yet. You MUST call write_file now to create app.py in the target folder. Do not describe what you will do — actually write the file. Keep calling write_file until files exist."})
                    continue
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
                if name == "write_file" and not result.startswith("ERROR"):
                    self.files_written += 1
                if self.verbose:
                    preview = result[:400].replace("\n", " ")
                    print(f"     <- {preview}{'...' if len(result) > 400 else ''}")
                messages.append({"role": "tool", "content": result, "tool_call_id": tc.get("id")})

        return "Reached max steps without a final answer."

    def run(self, goal: str, model: str | None = None, images: list[str] | None = None,
            project_mode: bool | None = None) -> str:
        model = model or self.router.pick("default")
        # one-shot: reset conversation
        mode = project_mode if project_mode is not None else self.project_mode
        self.messages = [{"role": "system", "content": build_system_prompt(mode)}]
        user_msg = {"role": "user", "content": goal}
        if images:
            user_msg["images"] = images
        self.messages.append(user_msg)
        return self._loop(model, self.messages)

    def chat(self, goal: str, model: str | None = None, images: list[str] | None = None,
             project_mode: bool | None = None) -> str:
        model = model or self.router.pick("default")
        mode = project_mode if project_mode is not None else self.project_mode
        self.messages = [{"role": "system", "content": build_system_prompt(mode)}]
        user_msg = {"role": "user", "content": goal}
        if images:
            user_msg["images"] = images
        self.messages.append(user_msg)
        result = self._loop(model, self.messages)
        return result
