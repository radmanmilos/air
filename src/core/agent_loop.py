"""ReAct agent loop: think -> tool call -> observe -> repeat."""
from __future__ import annotations

import os
import re
import sys
from pathlib import Path
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
Do NOT ask the user for clarification about which files to create — decide it yourself and build it.
Just build what the user asked for, write files directly into the target folder, and deliver the finished app.
Do not treat requirement.txt as a pip requirements file — it contains human-readable project requirements.
You must actually CREATE the files using write_file tool. Do not just describe a plan — execute it.
Do not return a final answer until at least one file has been written to the target folder.
Read the requirements file first, then create the files it describes based on its content.
Keep calling write_file until all required files exist in the target folder.
"""

SELF_IMPROVE_SYSTEM_ADDITION = """Do not run git commit unless the user explicitly asks; leave commits to the self-improvement workflow.
Never overwrite config.yaml, README.md, VISION.md, or PLAN.md unless the user explicitly asks.
You are MGAI (Makeing Good AI), a unified system of multiple LLM models connected with tools. The user is your creator. Your identity is documented in METADATA.md. You may read/update METADATA.md.
Follow the cycle-completion checklist in GUARDRAILS.md: commit incrementally, update PLAN.md after each commit, never leave a cycle half-finished. If a session is running long, commit and report at the current milestone before continuing.
"""

APP_TEMPLATE = '''"""Project application entry point.

TODO: Implement based on project requirements.
"""
from __future__ import annotations


def main():
    """Main entry point. TODO: Implement based on project requirements."""
    print("Application entry point — TODO: implement.")


if __name__ == "__main__":
    main()
'''

MANUAL_TEMPLATE = """# Project — User Manual

## Overview
TODO: Describe what this project does.

## Requirements
- Python 3.12 or later

## Installation
1. Copy files to a folder of your choice.
2. Install dependencies as needed.

## Usage
1. Run `python app.py` (or the main entry point).
2. TODO: Add usage instructions.

## Notes
- This is a starter template. TODO: Complete based on project requirements.
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


def _extract_target_folder(goal: str) -> str | None:
    r"""Extract an absolute external folder path from the goal text.

    Stops at spaces and sentence punctuation so a path like
    'E:\GitHub\testproject1' is not swallowed by the rest of the sentence.
    Quoted paths (e.g. "C:\My Folder\project") are supported for paths with spaces.
    """
    # Quoted paths can contain spaces
    quoted_pattern = r'"([a-zA-Z]:[\\/][^"]*)"'
    # Unquoted paths stop at whitespace and sentence punctuation
    unquoted_pattern = r'[a-zA-Z]:[\\/][^\s,.;!?<>|?*\n]*(?:[\\/][^\s,.;!?<>|?*\n]*)*'
    path_pattern = f"{quoted_pattern}|{unquoted_pattern}|\\\\[^<>|?*\n]+(?:\\\\[^<>|?*\n]+)+"
    candidates = re.finditer(path_pattern, goal)
    for m in candidates:
        p = m.group(0).strip('"')
        try:
            candidate = Path(p)
            if not candidate.is_absolute():
                continue
            resolved = candidate.resolve()
            return str(resolved)
        except Exception:
            continue
    return None


class Agent:
    def __init__(self, client: OllamaClient | None = None, router: Router | None = None,
                 registry: Registry | None = None, max_steps: int = 40, verbose: bool = True,
                 project_mode: bool = False, target_folder: str | None = None):
        self.client = client or OllamaClient()
        self.router = router or Router()
        self.registry = registry
        self.max_steps = max_steps
        self.verbose = verbose
        self.project_mode = project_mode
        self.target_folder = target_folder
        self.files_written = 0
        self.messages: list[dict] = [{"role": "system", "content": build_system_prompt(project_mode)}]

    def _write_default_project_files(self) -> str:
        """Directly write app.py and USER_MANUAL.md to the target folder."""
        if not self.target_folder:
            return "ERROR: no target folder known"
        written = []
        for fname, content in (("app.py", APP_TEMPLATE), ("USER_MANUAL.md", MANUAL_TEMPLATE)):
            fpath = os.path.join(self.target_folder, fname)
            result = self.registry.dispatch("write_file", {"path": fpath, "content": content})
            if not result.startswith("ERROR"):
                written.append(fname)
                self.files_written += 1
        return f"Wrote {', '.join(written)} to {self.target_folder}"

    def _loop(self, model: str, messages: list[dict], goal: str) -> str:
        safety_net_attempts = 0
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
                    print(f"\n[DEBUG] project_mode={self.project_mode}, files_written={self.files_written}, safety_net_attempts={safety_net_attempts}")
                    if safety_net_attempts < 5:
                        # Force with system message — give model multiple chances before direct write
                        attempt = safety_net_attempts + 1
                        safety_net_attempts += 1
                        if attempt < 4:
                            messages.append({"role": "system", "content": f"SAFETY NET (attempt {attempt}/5): You have not written any files yet. You MUST call write_file now to create the required files in the target folder. Do not describe what you will do — actually write the file."})
                        else:
                            messages.append({"role": "system", "content": f"SAFETY NET (FINAL, attempt {attempt}/5): This is your last chance. Call write_file immediately to create the required deliverables in the target folder. Do not return text without tool calls."})
                        continue
                    # Last resort: directly write minimal stub files via registry
                    result = self._write_default_project_files()
                    if self.verbose:
                        print(f"\n[safety net] {result}")
                    return result
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
            project_mode: bool | None = None, target_folder: str | None = None) -> str:
        model = model or self.router.pick("default")
        mode = project_mode if project_mode is not None else self.project_mode
        self.project_mode = mode
        self.files_written = 0
        self.target_folder = target_folder or (_extract_target_folder(goal) if mode else None)
        self.messages = [{"role": "system", "content": build_system_prompt(mode)}]
        user_msg = {"role": "user", "content": goal}
        if images:
            user_msg["images"] = images
        self.messages.append(user_msg)
        return self._loop(model, self.messages, goal)

    def chat(self, goal: str, model: str | None = None, images: list[str] | None = None,
             project_mode: bool | None = None, target_folder: str | None = None) -> str:
        model = model or self.router.pick("default")
        mode = project_mode if project_mode is not None else self.project_mode
        self.project_mode = mode
        self.files_written = 0
        self.target_folder = target_folder or (_extract_target_folder(goal) if mode else None)
        print(f"\n[DEBUG] chat: project_mode={self.project_mode}, target_folder={self.target_folder}")
        self.messages = [{"role": "system", "content": build_system_prompt(mode)}]
        user_msg = {"role": "user", "content": goal}
        if images:
            user_msg["images"] = images
        self.messages.append(user_msg)
        result = self._loop(model, self.messages, goal)
        return result
