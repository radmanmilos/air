"""CLI entrypoint."""
from __future__ import annotations

import sys
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

import json
from pathlib import Path

import typer
from rich.console import Console
from rich.table import Table

from src.core.agent_loop import Agent
from src.core.ollama_client import OllamaClient
from src.core.router import Router
from src.tools.builtin import build_registry

app = typer.Typer(help="Making Good AIs — local agent")
console = Console()


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
def run(goal: str, model: str = typer.Option(None, help="Override model"), yes: bool = typer.Option(False, "--yes", "-y", help="Auto-approve tool calls")):
    """Run the agent on a goal."""
    client = OllamaClient()
    registry = build_registry()
    if yes:
        # monkeypatch approval
        import src.core.approval as a
        a.approve = lambda *a, **k: True
    agent = Agent(client=client, router=Router(), registry=registry, verbose=True)
    result = agent.run(goal, model=model)
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


if __name__ == "__main__":
    app()
