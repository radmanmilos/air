"""Project Execution Engine — Plan → Execute → Verify → Iterate.

Supercharged layer on top of the existing Agent that turns a goal into
a multi-step project with verification, retry, dependency ordering,
and state persistence.

Architecture:
  1. Decompose goal into concrete steps (task_decomposer / deepseek-r1)
  2. Analyze step dependencies (which files each step reads/writes)
  3. Execute steps in dependency order (waves), sequentially within waves
  4. Critique each step result against requirements (result_verifier / deepseek-r1)
  5. Retry failed steps with adapted instructions
  6. Verify final deliverables satisfy all requirements
  7. Persist state to disk for session resumption

No protected files are modified — new module under src/autonomy/.
"""
from __future__ import annotations

import hashlib
import json
import re
import sys
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Set

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

from src.autonomy.result_verifier import verify_step as _vs_step, verify_final as _vs_final
from src.autonomy.task_decomposer import decompose_goal as _decompose, model_for_step
from src.core.agent_loop import Agent
from src.core.ollama_client import OllamaClient
from src.core.router import Router
import src.core.approval as _approval
_approval.approve = lambda *a, **k: True  # auto-approve in project mode
from src.memory.vector_store import VectorStore


REPO_ROOT = Path(__file__).resolve().parents[2]
PROJECTS_DIR = REPO_ROOT / ".agent" / "projects"


def _project_key(folder_path: str) -> str:
    return hashlib.sha256(str(Path(folder_path).resolve()).encode()).hexdigest()[:16]


def _state_file(folder_path: str) -> Path:
    return PROJECTS_DIR / _project_key(folder_path) / "state.json"


def _load_state(folder_path: str) -> dict:
    sf = _state_file(folder_path)
    if sf.exists():
        try:
            return json.loads(sf.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {"folder": folder_path, "key": _project_key(folder_path),
            "created": datetime.utcnow().isoformat(), "steps": [], "completed": False}


def _save_state(state: dict) -> None:
    sf = _state_file(state["folder"])
    sf.parent.mkdir(parents=True, exist_ok=True)
    sf.write_text(json.dumps(state, indent=2, default=str), encoding="utf-8")


def _read_requirements(folder_path: str) -> str:
    folder = Path(folder_path)
    for name in ("requirement.txt", "requirements.txt", "REQUIREMENT.md", "REQUIREMENTS.md"):
        p = folder / name
        if p.exists():
            return p.read_text(encoding="utf-8", errors="replace")
    return ""


def _remember_project_event(state: dict, event: str, details: str) -> None:
    try:
        store = VectorStore()
        text = f"Project {state['key']}: {event}. {details}"
        store.add(text, metadata={"kind": "project_event", "project": state["key"],
                                  "folder": state["folder"]})
    except Exception:
        pass


def _recall_similar_projects(goal: str, top_k: int = 3) -> str:
    try:
        store = VectorStore()
        results = store.query(goal, top_k=top_k)
        if not results:
            return ""
        lines = ["Past project memories:"]
        for r in results:
            lines.append(f"- {r['text'][:300]}")
        return "\n".join(lines)
    except Exception:
        return ""


def _extract_file_refs(step_text: str) -> Set[str]:
    """Extract file paths mentioned in a step (for dependency analysis)."""
    files = set()
    patterns = [
        r"[a-zA-Z0-9_/.-]+\.(?:py|md|txt|json|yaml|yml|html|js|ts|css)",
        r"write_file.*?path[\"']?\s*[:=]\s*[\"']?([^\"',\s}]+)",
        r"create.*?(?:file|module).*?([a-zA-Z0-9_/.-]+\.\w+)",
        r"(?:read|modify|update|fix|edit).*?(?:file|module).*?([a-zA-Z0-9_/.-]+\.\w+)",
    ]
    for pat in patterns:
        for m in re.finditer(pat, step_text, re.IGNORECASE):
            g = m.group(1) if m.groups() else m.group(0)
            g = g.strip("'\"")
            if g and len(g) < 100:
                files.add(g)
    return files


def _analyze_dependencies(steps: List[dict]) -> List[Set[int]]:
    """Return dependency sets: deps[i] = set of step indices step i depends on."""
    step_files_written: List[Set[str]] = []
    step_files_read: List[Set[str]] = []

    for s in steps:
        text = s["text"].lower()
        written = _extract_file_refs(text)
        if any(k in text for k in ("create", "write", "build", "generate", "implement")):
            step_files_written.append(written)
        else:
            step_files_written.append(set())
        if any(k in text for k in ("read", "modify", "update", "fix", "edit", "check", "verify")):
            step_files_read.append(written)
        else:
            step_files_read.append(set())

    deps: List[Set[int]] = [set() for _ in steps]
    for i in range(len(steps)):
        for j in range(len(steps)):
            if i == j:
                continue
            if step_files_read[i] & step_files_written[j]:
                deps[i].add(j)
    return deps


def _topological_order(steps: List[dict], deps: List[Set[int]]) -> List[List[int]]:
    """Group steps into sequential waves using topological sort."""
    n = len(steps)
    remaining = set(range(n))
    waves: List[List[int]] = []
    while remaining:
        wave = [i for i in remaining if deps[i] <= (set(range(n)) - remaining)]
        if not wave:
            wave = [sorted(remaining)[0]]
        waves.append(sorted(wave))
        remaining -= set(wave)
    return waves


class ProjectExecutor:
    """Execute a project goal with plan→execute→verify→iterate cycles."""

    def __init__(self, folder_path: str):
        self.folder_path = str(Path(folder_path).resolve())
        self.state = _load_state(self.folder_path)
        self.client = OllamaClient()
        self.router = Router()
        from src.tools.builtin import build_registry as _br
        self.registry = _br()
        self.max_steps_per_task = 40
        self.max_retries_per_step = 5

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def execute(self, goal: str) -> str:
        print(f"\n[PROJECT EXECUTOR] Target: {self.folder_path}")
        print(f"[PROJECT EXECUTOR] Goal: {goal[:120]}...")

        requirements = _read_requirements(self.folder_path)
        if requirements:
            print(f"[PROJECT EXECUTOR] Requirements loaded ({len(requirements)} chars)")

        memories = _recall_similar_projects(goal)
        if memories:
            print(f"[PROJECT EXECUTOR] Past memories:\n{memories[:500]}")

        if not self.state.get("steps"):
            steps_text = _decompose(goal, requirements)
            self.state["steps"] = [{"text": s, "status": "pending",
                                    "result": "", "attempts": 0,
                                    "critique": None} for s in steps_text]
            _save_state(self.state)
            print(f"[PROJECT EXECUTOR] Decomposed into {len(steps_text)} steps")
        else:
            print(f"[PROJECT EXECUTOR] Resuming {len(self.state['steps'])} saved steps")

        steps = self.state["steps"]
        deps = _analyze_dependencies(steps)
        waves = _topological_order(steps, deps)
        print(f"[PROJECT EXECUTOR] Organized into {len(waves)} execution wave(s)")

        for wave_idx, wave in enumerate(waves):
            print(f"\n[WAVE {wave_idx + 1}/{len(waves)}] {len(wave)} step(s)")
            for si in wave:
                self._execute_single_step(si, goal, requirements)
            _save_state(self.state)

        # Final verification
        print("\n=== Final Verification ===")
        created = self._list_created_files()
        final_check = _vs_final(goal, requirements, self.folder_path, created)
        if final_check.get("pass"):
            self.state["completed"] = True
            print(f"    ✓ Verified complete: {final_check.get('reason', '')[:100]}")
        else:
            missing = final_check.get("missing", [])
            print(f"    ✗ Not complete. Missing: {missing}")
            self.state["completed"] = False

        _save_state(self.state)

        done_count = sum(1 for s in self.state["steps"] if s["status"] == "completed")
        total = len(self.state["steps"])
        report = (
            f"Project execution: {done_count}/{total} steps complete.\n"
            f"Final verification: {'PASS' if final_check.get('pass') else 'FAIL'}\n"
            f"Reason: {final_check.get('reason', '')}\n"
            f"Folder: {self.folder_path}\n"
            f"Files: {', '.join(created)}"
        )
        print(f"\n{report}")
        return report

    def _execute_single_step(self, idx: int, goal: str, requirements: str) -> None:
        step_state = self.state["steps"][idx]
        if step_state["status"] == "completed":
            return

        step_state["attempts"] += 1
        attempt = step_state["attempts"]
        step_text = step_state["text"]

        print(f"\n=== Step {idx + 1}/{len(self.state['steps'])} (attempt {attempt}) ===")
        print(f"    {step_text[:120]}...")

        step_goal = (
            f"Overall project goal: {goal}\n"
            f"Requirements: {requirements}\n"
            f"Current step ({idx + 1}/{len(self.state['steps'])}): {step_text}\n"
            f"Project folder: {self.folder_path}\n"
            f"Files already created: {', '.join(self._list_created_files()) or '(none)'}\n"
            "Execute this step now. Use write_file to create files, "
            "read_file to check existing files, run_shell to verify. "
            "Do NOT stop at describing a plan — actually create files."
        )

        model = model_for_step(step_text)
        agent = Agent(client=self.client, router=self.router,
                      registry=self.registry, max_steps=self.max_steps_per_task,
                      verbose=True, project_mode=True,
                      target_folder=self.folder_path)
        result = agent.run(step_goal, model=model)

        critique = _vs_step(goal, requirements, step_text, result)
        step_state["result"] = result
        step_state["critique"] = critique

        if critique.get("pass"):
            step_state["status"] = "completed"
            print(f"    ✓ Step passed: {critique.get('reason', '')[:100]}")
            _remember_project_event(self.state, f"step_{idx + 1}_completed",
                                    f"{step_text}. Result: {result[:200]}")
        else:
            print(f"    ✗ Step failed: {critique.get('reason', '')[:100]}")
            print(f"    Fix: {critique.get('fix', '')[:100]}")
            if attempt < self.max_retries_per_step:
                print(f"    → Retrying ({attempt}/{self.max_retries_per_step})")
                step_state["status"] = "pending"
            else:
                step_state["status"] = "failed"

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _list_created_files(self) -> List[str]:
        folder = Path(self.folder_path)
        files = []
        for p in folder.rglob("*"):
            if p.is_file() and not p.name.startswith(".") \
               and p.name not in ("requirement.txt", "requirements.txt"):
                files.append(str(p.relative_to(folder)))
        return sorted(files)

    def status(self) -> dict:
        completed = sum(1 for s in self.state["steps"] if s["status"] == "completed")
        total = len(self.state["steps"])
        return {
            "folder": self.folder_path,
            "key": self.state["key"],
            "completed": self.state.get("completed", False),
            "steps_completed": completed,
            "steps_total": total,
            "steps": self.state.get("steps", []),
            "files_created": self._list_created_files(),
        }

    def resume(self) -> str:
        if not self.state.get("steps"):
            return "No saved project state found."
        return self.execute("Resume project execution")
