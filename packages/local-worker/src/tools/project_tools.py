"""Project tools — expose project execution as callable agent tools.

Tools:
  - project_init: Initialize a project folder with requirement.txt
  - project_plan: Decompose a goal into steps without executing
  - project_execute: Run plan→execute→verify→iterate on a project
  - project_status: Check status of a saved project
  - project_resume: Resume an interrupted project
  - project_files: List files created in a project folder

No protected files are modified.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict

from src.autonomy.project_executor import ProjectExecutor
from src.tools.registry import Registry, Tool


# ---------------------------------------------------------------------------
# Tool implementations
# ---------------------------------------------------------------------------

def project_init(args: Dict[str, Any]) -> str:
    """Initialize a project folder with a requirement.txt file."""
    folder = args.get("folder", "")
    requirement = args.get("requirement", "")
    goal = args.get("goal", "")
    if not folder:
        return "ERROR: 'folder' is required"
    p = Path(folder)
    p.mkdir(parents=True, exist_ok=True)
    req_file = p / "requirement.txt"
    if requirement:
        req_file.write_text(requirement, encoding="utf-8")
        return f"Initialized project at {folder} with requirement.txt ({len(requirement)} chars)"
    elif goal:
        req_file.write_text(goal, encoding="utf-8")
        return f"Initialized project at {folder} with requirement.txt from goal ({len(goal)} chars)"
    return f"Initialized project at {folder} (empty requirement.txt)"


def project_plan(args: Dict[str, Any]) -> str:
    """Decompose a goal into steps without executing."""
    from src.autonomy.task_decomposer import decompose_goal
    folder = args.get("folder", ".")
    goal = args.get("goal", "")
    requirement = args.get("requirement", "")
    if not goal:
        # try reading requirements from folder
        req_file = Path(folder) / "requirement.txt"
        if req_file.exists():
            goal = req_file.read_text(encoding="utf-8", errors="replace")
        else:
            return "ERROR: 'goal' is required and no requirement.txt found in folder"
    if not requirement:
        req_file = Path(folder) / "requirement.txt"
        if req_file.exists():
            requirement = req_file.read_text(encoding="utf-8", errors="replace")
    steps = decompose_goal(goal, requirement)
    lines = [f"Project plan for: {goal}"]
    lines.append(f"Folder: {folder}")
    lines.append(f"Steps: {len(steps)}")
    for i, s in enumerate(steps, 1):
        lines.append(f"  {i}. {s}")
    return "\n".join(lines)


def project_execute(args: Dict[str, Any]) -> str:
    """Run plan→execute→verify→iterate on a project folder."""
    folder = args.get("folder", "")
    goal = args.get("goal", "")
    if not folder:
        return "ERROR: 'folder' is required"
    executor = ProjectExecutor(folder)
    return executor.execute(goal)


def project_status(args: Dict[str, Any]) -> str:
    """Check status of a saved project."""
    folder = args.get("folder", "")
    if not folder:
        return "ERROR: 'folder' is required"
    executor = ProjectExecutor(folder)
    st = executor.status()
    lines = [
        f"Project: {st['folder']}",
        f"Key: {st['key']}",
        f"Completed: {st['completed']}",
        f"Steps: {st['steps_completed']}/{st['steps_total']}",
        f"Files created: {len(st['files_created'])}",
    ]
    for f in st["files_created"]:
        lines.append(f"  - {f}")
    return "\n".join(lines)


def project_resume(args: Dict[str, Any]) -> str:
    """Resume an interrupted project."""
    folder = args.get("folder", "")
    if not folder:
        return "ERROR: 'folder' is required"
    executor = ProjectExecutor(folder)
    return executor.resume()


def project_files(args: Dict[str, Any]) -> str:
    """List files created in a project folder."""
    folder = args.get("folder", "")
    if not folder:
        return "ERROR: 'folder' is required"
    p = Path(folder)
    if not p.exists():
        return f"ERROR: folder not found: {folder}"
    files = []
    for f in p.rglob("*"):
        if f.is_file() and not f.name.startswith(".") \
           and f.name not in ("requirement.txt", "requirements.txt"):
            files.append(str(f.relative_to(p)))
    if not files:
        return "(no project files created yet)"
    return "\n".join(sorted(files))


# ---------------------------------------------------------------------------
# Registry registration
# ---------------------------------------------------------------------------

def register_tools(registry: Registry) -> None:
    registry.register(Tool(
        name="project_init",
        description="Initialize a project folder with a requirement.txt file.",
        parameters={
            "type": "object",
            "properties": {
                "folder": {"type": "string", "description": "Project folder path"},
                "requirement": {"type": "string", "description": "Requirement text"},
                "goal": {"type": "string", "description": "Goal text (used if requirement not given)"}
            },
            "required": ["folder"]
        },
        func=project_init,
    ))
    registry.register(Tool(
        name="project_plan",
        description="Decompose a project goal into steps without executing.",
        parameters={
            "type": "object",
            "properties": {
                "folder": {"type": "string", "description": "Project folder path"},
                "goal": {"type": "string", "description": "Project goal"},
                "requirement": {"type": "string", "description": "Requirement text"}
            },
            "required": ["folder", "goal"]
        },
        func=project_plan,
    ))
    registry.register(Tool(
        name="project_execute",
        description="Execute a project: plan → execute → verify → iterate.",
        parameters={
            "type": "object",
            "properties": {
                "folder": {"type": "string", "description": "Project folder path"},
                "goal": {"type": "string", "description": "Project goal"}
            },
            "required": ["folder"]
        },
        func=project_execute,
    ))
    registry.register(Tool(
        name="project_status",
        description="Check status of a saved project.",
        parameters={
            "type": "object",
            "properties": {
                "folder": {"type": "string", "description": "Project folder path"}
            },
            "required": ["folder"]
        },
        func=project_status,
    ))
    registry.register(Tool(
        name="project_resume",
        description="Resume an interrupted project.",
        parameters={
            "type": "object",
            "properties": {
                "folder": {"type": "string", "description": "Project folder path"}
            },
            "required": ["folder"]
        },
        func=project_resume,
    ))
    registry.register(Tool(
        name="project_files",
        description="List files created in a project folder.",
        parameters={
            "type": "object",
            "properties": {
                "folder": {"type": "string", "description": "Project folder path"}
            },
            "required": ["folder"]
        },
        func=project_files,
    ))
