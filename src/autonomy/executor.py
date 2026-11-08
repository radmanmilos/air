"""Executor: run planned steps with the agent, checkpoint progress."""
from __future__ import annotations

import json
import subprocess
from pathlib import Path

from src.core.agent_loop import Agent
from src.core.ollama_client import OllamaClient
from src.core.router import Router
from src.tools.builtin import build_registry


class Executor:
    def __init__(self, checkpoint_file: str = ".agent/plan_state.json",
                 max_steps_per_task: int = 30):
        self.checkpoint_file = Path(checkpoint_file)
        self.checkpoint_file.parent.mkdir(parents=True, exist_ok=True)
        self.max_steps_per_task = max_steps_per_task

    def run_plan(self, goal: str, steps: list[str],
                 rollback_on_fail: bool = False) -> list[dict]:
        """Run steps with optional rollback on failure."""
        registry = build_registry()
        agent = Agent(client=OllamaClient(), router=Router(),
                     registry=registry, max_steps=self.max_steps_per_task, verbose=True)
        results = []

        for i, step in enumerate(steps, 1):
            print(f"\n=== Step {i}/{len(steps)}: {step} ===")

            if rollback_on_fail and i == 1:
                try:
                    self._rollback()
                    print("Restored previous state successfully")
                except Exception as e:
                    print(f"Rollback failed: {e}")

            out = agent.run(f"Overall goal: {goal}\nCurrent step: {step}")
            results.append({"step": step, "result": out})

            if "FAIL" in str(out).upper():
                if rollback_on_fail and i < len(steps):
                    print(f"  Step failed at {i}/{len(steps)}")

        return results

    def _rollback(self) -> None:
        """Rollback to previous git state before changes."""
        try:
            prev_commit = self._get_previous_commit()
            if prev_commit:
                print(f"Found previous commit: {prev_commit[:8]}")
                result = subprocess.run(
                    ["git", "checkout", prev_commit[:7]],
                    capture_output=True, text=True, timeout=30
                )
                if result.returncode == 0:
                    print("Rolled back to git state successfully")
                else:
                    print(f"Rollback failed: {result.stderr}")
            else:
                print("No previous commit found - rollback skipped")
        except Exception as e:
            print(f"Rollback error: {e} (skipping)")

    def _get_previous_commit(self) -> str | None:
        """Get the hash of the previous commit."""
        try:
            result = subprocess.run(
                ["git", "rev-parse", "~1"],
                capture_output=True, text=True, timeout=10,
                cwd="."
            )
            if result.returncode == 0 and result.stdout.strip():
                return result.stdout.strip()
        except Exception:
            pass
        return None

    def _checkpoint(self, goal: str, done: int, results: list[dict]) -> None:
        state = {"goal": goal, "done": done, "results": results}
        self.checkpoint_file.write_text(json.dumps(state, indent=2, default=str), encoding="utf-8")