"""Executor: run planned steps with the agent, checkpoint progress."""
from __future__ import annotations

import json
from pathlib import Path

from src.core.agent_loop import Agent
from src.core.ollama_client import OllamaClient
from src.core.router import Router
from src.tools.builtin import build_registry


class Executor:
    def __init__(self, checkpoint_file: str = ".agent/plan_state.json", max_steps_per_task: int = 30):
        self.checkpoint_file = Path(checkpoint_file)
        self.checkpoint_file.parent.mkdir(parents=True, exist_ok=True)
        self.max_steps_per_task = max_steps_per_task

    def run_plan(self, goal: str, steps: list[str]) -> list[dict]:
        registry = build_registry()
        agent = Agent(client=OllamaClient(), router=Router(), registry=registry, max_steps=self.max_steps_per_task, verbose=True)
        results = []
        for i, step in enumerate(steps, 1):
            print(f"\n=== Step {i}/{len(steps)}: {step} ===")
            out = agent.run(f"Overall goal: {goal}\nCurrent step: {step}")
            results.append({"step": step, "result": out})
            self._checkpoint(goal, i, results)
        return results

    def _checkpoint(self, goal: str, done: int, results: list[dict]) -> None:
        state = {"goal": goal, "done": done, "results": results}
        self.checkpoint_file.write_text(json.dumps(state, indent=2, default=str), encoding="utf-8")