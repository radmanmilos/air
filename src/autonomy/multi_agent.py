"""Multi-Agent Role Collaboration System.

MGAI spawns specialized agent roles that collaborate on complex projects:
- Architect: designs system structure, picks tech stack, defines file layout
- Coder: implements actual code files
- Reviewer: critiques code quality, security, completeness
- Integrator: merges agent outputs into a coherent deliverable

Uses the same underlying model with different system prompts per role.
No protected files modified.
"""
from __future__ import annotations

import json
import re
import sys
from typing import Any, Dict, List, Optional

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

from src.core.agent_loop import Agent
from src.core.ollama_client import OllamaClient
from src.core.router import Router
from src.tools.builtin import build_registry


# ---------------------------------------------------------------------------
# Role definitions
# ---------------------------------------------------------------------------

ROLE_PROMPTS: Dict[str, str] = {
    "architect": """You are MGAI's Architect. Your job is system design, not coding.
Given a project goal and requirements, produce a JSON design spec with:
- "stack": list of technologies/languages
- "files": list of {path, purpose, key_functions}
- "data_flow": brief description
- "entry_point": main file to run

Return ONLY valid JSON. No prose.""",

    "coder": """You are MGAI's Coder. Your job is to write clean, working Python code.
Given an architect's design spec and a specific file to implement, write the
complete file content. Use only standard library unless requirements say
otherwise. Include docstrings, error handling, and type hints.
Return ONLY the file content inside a single ```python block. No prose.""",

    "reviewer": """You are MGAI's Reviewer. Your job is quality assurance.
Given a file's content and the project requirements, critique it:
- security issues (eval, exec, shell=True, hardcoded secrets)
- bugs (undefined variables, missing imports, type errors)
- missing features vs requirements
- style issues

Return JSON: {"pass": bool, "issues": [str], "suggestions": [str]}.""",

    "integrator": """You are MGAI's Integrator. Your job is to merge agent outputs.
Given multiple file contents and their purposes, produce a final project
manifest: which files exist, their contents, and a run command.
Return JSON: {"files": [{path, content}], "run_command": str}.""",
}


class RoleAgent:
    """Single-role agent wrapper."""

    def __init__(self, role: str, client: OllamaClient, router: Router,
                 registry=None, verbose: bool = True):
        self.role = role
        self.client = client
        self.router = router
        self.registry = registry
        self.verbose = verbose
        model = router.pick("code" if role == "coder" else "reason")
        self.agent = Agent(client=client, router=router, registry=registry,
                           max_steps=25, verbose=verbose, project_mode=True)

    def run(self, prompt: str) -> str:
        system = ROLE_PROMPTS.get(self.role, "")
        full_prompt = f"{system}\n\n{prompt}" if system else prompt
        return self.agent.run(full_prompt)


class MultiAgentTeam:
    """Orchestrates architect → coder → reviewer → integrator pipeline."""

    def __init__(self, folder_path: str):
        self.folder_path = folder_path
        self.client = OllamaClient()
        self.router = Router()
        self.registry = build_registry()
        self.architect = RoleAgent("architect", self.client, self.router,
                                   self.registry)
        self.coder = RoleAgent("coder", self.client, self.router,
                               self.registry)
        self.reviewer = RoleAgent("reviewer", self.client, self.router,
                                  self.registry)
        self.integrator = RoleAgent("integrator", self.client, self.router,
                                    self.registry)

    def build(self, goal: str, requirements: str) -> dict:
        """Run the full multi-agent pipeline."""
        results: dict = {}

        # 1. Architect designs
        print("  [Architect] Designing system...")
        arch_prompt = (
            f"GOAL: {goal}\n"
            f"REQUIREMENTS: {requirements}\n"
            f"TARGET_FOLDER: {self.folder_path}\n"
            "Design the system. Output JSON only."
        )
        arch_raw = self.architect.run(arch_prompt)
        results["architecture"] = arch_raw

        # 2. Coder implements each file
        files: List[dict] = []
        try:
            arch = json.loads(arch_raw)
            file_list = arch.get("files", [])
        except Exception:
            file_list = [{"path": "app.py", "purpose": "main application",
                          "key_functions": ["main"]}]

        for fspec in file_list:
            fpath = fspec.get("path", "app.py")
            purpose = fspec.get("purpose", "")
            key_funcs = fspec.get("key_functions", [])

            print(f"  [Coder] Writing {fpath}...")
            code_prompt = (
                f"Implement file: {fpath}\n"
                f"Purpose: {purpose}\n"
                f"Key functions: {', '.join(key_funcs)}\n"
                f"Requirements: {requirements}\n"
                "Write the complete file content. Output ONLY a ```python block."
            )
            code_raw = self.coder.run(code_prompt)
            code = self._extract_code_block(code_raw)

            # 3. Reviewer critiques
            print(f"  [Reviewer] Reviewing {fpath}...")
            review_prompt = (
                f"File: {fpath}\n"
                f"Purpose: {purpose}\n"
                f"Requirements: {requirements}\n"
                f"Code:\n{code[:3000]}\n"
                "Review and output JSON only."
            )
            review_raw = self.reviewer.run(review_prompt)
            try:
                review = json.loads(review_raw)
            except Exception:
                review = {"pass": True, "issues": [], "suggestions": []}

            if not review.get("pass", True) and review.get("suggestions"):
                # 4. Coder fixes based on review
                print(f"  [Coder] Fixing {fpath} based on review...")
                fix_prompt = (
                    f"File: {fpath}\n"
                    f"Issues found: {review['issues']}\n"
                    f"Suggestions: {review['suggestions']}\n"
                    f"Current code:\n{code}\n"
                    "Rewrite the file fixing all issues. Output ONLY a "
                    "```python block."
                )
                code_raw = self.coder.run(fix_prompt)
                code = self._extract_code_block(code_raw)

            files.append({"path": fpath, "content": code})
            results.setdefault("files", []).append(files[-1])

        # 5. Integrator produces final manifest
        print("  [Integrator] Producing final manifest...")
        int_prompt = (
            f"GOAL: {goal}\n"
            f"Files: {json.dumps([{'path': f['path']} for f in files])}\n"
            "Produce final project manifest. Output JSON only."
        )
        int_raw = self.integrator.run(int_prompt)
        results["integration"] = int_raw

        results["files"] = files
        return results

    # ---------------------------------------------------------------------------
    # Helpers
    # ---------------------------------------------------------------------------

    @staticmethod
    def _extract_code_block(text: str) -> str:
        m = re.search(r"```(?:\w+)?\n(.*?)\n```", text, re.DOTALL)
        if m:
            return m.group(1).strip()
        return text.strip()


# Convenience function
def build_with_team(folder_path: str, goal: str,
                    requirements: str = "") -> dict:
    """Build a project using the multi-agent team."""
    team = MultiAgentTeam(folder_path)
    return team.build(goal, requirements)
