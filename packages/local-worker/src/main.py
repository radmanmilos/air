"""CLI entrypoint."""
from __future__ import annotations

import sys
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

import json
import re
from pathlib import Path

import typer
from rich.console import Console
from rich.table import Table

from src.core.agent_loop import Agent
from src.core.ollama_client import OllamaClient
from src.core.router import Router
from src.tools.builtin import build_registry
from src.autonomy.project_executor import ProjectExecutor

app = typer.Typer(help="Making Good AIs — local agent")
console = Console()

REPO_ROOT = Path(__file__).resolve().parents[1]


def _goal_points_outside_repo(goal: str) -> bool:
    """Heuristic: detect file paths in the goal that live outside the MGAI repo."""
    path_pattern = r"[a-zA-Z]:[\\/][^\\/\"'<>|?*\n]*(?:[\\/][^\\/\"'<>|?*\n]*)*|\\\\[^\\/\"'<>|?*\n]+(?:\\\\[^\\/\"'<>|?*\n]+)+"
    candidates = re.findall(path_pattern, goal)
    repo_root = REPO_ROOT.resolve()
    for p in candidates:
        try:
            candidate = Path(p)
            if not candidate.is_absolute():
                continue
            resolved = candidate.resolve()
            if not str(resolved).startswith(str(repo_root) + "\\"):
                return True
        except Exception:
            continue
    return False


@app.command()
def models():
    """List installed Ollama models."""
    client = OllamaClient()
    ms = client.list_models()
    t = Table("Name", "Size (GB)", "Modified")
    for m in ms:
        size = m.get("size", 0) / (1024 ** 3)
        t.add_row(m["name"], f"{size:.2f}", m.get("modified_at", "")[:19])
    console.print(t)
    console.print("\nRouter mapping:")
    for k, v in Router().available().items():
        console.print(f"  {k}: {v}")


@app.command()
def run(goal: str, model: str = typer.Option(None, help="Override model"), yes: bool = typer.Option(False, "--yes", "-y", help="Auto-approve tool calls"),
        project: bool = typer.Option(False, "--project", help="Treat as new-project work (external folder), skip self-improvement cycle"),
        self_improve: bool = typer.Option(False, "--self-improve", help="Force self-improvement mode on MGAI's own codebase")):
    """Run the agent on a goal."""
    client = OllamaClient()
    registry = build_registry()
    if yes:
        # monkeypatch approval
        import src.core.approval as a
        a.approve = lambda *a, **k: True
    if self_improve:
        project_mode = False
    elif _goal_points_outside_repo(goal):
        project_mode = True
    else:
        project_mode = project
    agent = Agent(client=client, router=Router(), registry=registry, verbose=True, project_mode=project_mode)
    result = agent.run(goal, model=model, project_mode=project_mode)
    console.print("\n[bold green]Result:[/bold green]")
    console.print(result)


@app.command()
def chat(model: str = typer.Option(None, help="Model to chat with")):
    """Interactive chat (no tools)."""
    client = OllamaClient()
    router = Router()
    m = model or router.pick("default")
    console.print(f"Chatting with {m}. Type 'exit' to quit.")
    messages = [{"role": "system", "content": "You are a helpful local assistant."}]
    while True:
        try:
            user = typer.prompt("you")
        except (EOFError, KeyboardInterrupt):
            break
        if user.strip().lower() in ("exit", "quit"):
            break
        messages.append({"role": "user", "content": user})
        resp = client.chat(model=m, messages=messages)
        msg = resp.get("message", {})
        content = msg.get("content", "")
        messages.append(msg)
        console.print(f"[cyan]ai:[/cyan] {content}")


@app.command("plan")
def run_plan_cmd(goal: str):
    """Plan a goal into steps (no execution)."""
    from src.autonomy.planner import plan
    steps = plan(goal)
    for i, s in enumerate(steps, 1):
        console.print(f"{i}. {s}")


@app.command("self-improve")
def self_improve_cmd(goal: str):
    """Run the self-improvement workflow on this project."""
    from src.autonomy.self_improve import self_improve
    res = self_improve(goal)
    console.print(res)


@app.command("voice")
def voice_cmd(seconds: float = 5.0):
    """Run voice mode (listen -> think -> speak)."""
    from src.interfaces.voice_mode import run_voice_loop
    run_voice_loop(seconds=seconds)


@app.command()
def inspect(model: str):
    """Show model capabilities."""
    client = OllamaClient()
    info = client.show(model)
    console.print(json.dumps(info.get("capabilities", []), indent=2))
    console.print("\nDetails:")
    for k in ("model", "parameters"):
        console.print(f"  {k}: {info.get(k)}")


@app.command("project-execute")
def project_execute_cmd(folder: str = typer.Argument(..., help="Project folder path"),
                        goal: str = typer.Argument("", help="Project goal (reads requirement.txt if omitted)")):
    """Execute a project: plan → execute → verify → iterate."""
    executor = ProjectExecutor(folder)
    result = executor.execute(goal)
    console.print(f"\n[bold green]Result:[/bold green]\n{result}")


@app.command("project-status")
def project_status_cmd(folder: str = typer.Argument(..., help="Project folder path")):
    """Check status of a saved project."""
    executor = ProjectExecutor(folder)
    st = executor.status()
    console.print(f"\n[bold cyan]Project:[/bold cyan] {st['folder']}")
    console.print(f"[bold cyan]Key:[/bold cyan] {st['key']}")
    console.print(f"[bold cyan]Completed:[/bold cyan] {st['completed']}")
    console.print(f"[bold cyan]Steps:[/bold cyan] {st['steps_completed']}/{st['steps_total']}")
    console.print(f"[bold cyan]Files:[/bold cyan] {len(st['files_created'])}")
    for f in st["files_created"]:
        console.print(f"  - {f}")


@app.command("project-plan")
def project_plan_cmd(folder: str = typer.Argument(..., help="Project folder path"),
                     goal: str = typer.Argument("", help="Project goal")):
    """Decompose a goal into steps without executing."""
    from src.autonomy.task_decomposer import decompose_goal
    req_file = Path(folder) / "requirement.txt"
    requirement = ""
    if req_file.exists():
        requirement = req_file.read_text(encoding="utf-8", errors="replace")
    if not goal:
        goal = requirement
    steps = decompose_goal(goal, requirement)
    console.print(f"\n[bold cyan]Project plan for:[/bold cyan] {goal}")
    console.print(f"[bold cyan]Folder:[/bold cyan] {folder}")
    console.print(f"[bold cyan]Steps:[/bold cyan] {len(steps)}")
    for i, s in enumerate(steps, 1):
        console.print(f"  {i}. {s}")


@app.command("project-resume")
def project_resume_cmd(folder: str = typer.Argument(..., help="Project folder path")):
    """Resume an interrupted project."""
    executor = ProjectExecutor(folder)
    result = executor.resume()
    console.print(f"\n[bold green]Result:[/bold green]\n{result}")


if __name__ == "__main__":
    app()
