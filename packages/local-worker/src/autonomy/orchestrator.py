"""Multi-model orchestration: hybrid sequential/parallel routing with benchmarking."""
from __future__ import annotations

import json
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Any, Dict, List

from src.core.agent_loop import Agent
from src.core.ollama_client import OllamaClient
from src.core.router import Router
from src.tools.builtin import build_registry

BENCH_FILE = Path(".agent/benchmarks.json")


def _load_benchmarks() -> dict:
    if BENCH_FILE.exists():
        try:
            return json.loads(BENCH_FILE.read_text(encoding="utf-8"))
        except Exception:
            return {}
    return {}


def _save_benchmarks(data: dict) -> None:
    BENCH_FILE.parent.mkdir(parents=True, exist_ok=True)
    BENCH_FILE.write_text(json.dumps(data, indent=2), encoding="utf-8")


def record_benchmark(model: str, task: str, duration: float, success: bool) -> None:
    data = _load_benchmarks()
    entry = data.setdefault(model, {"times": [], "successes": 0, "failures": 0})
    entry["times"].append(duration)
    if success:
        entry["successes"] += 1
    else:
        entry["failures"] += 1
    _save_benchmarks(data)


class Orchestrator:
    """Hybrid orchestrator: sequential by default, parallel when steps are independent."""

    def __init__(self, max_workers: int = 2):
        self.max_workers = max_workers
        self.router = Router()

    def run_sequential(self, goal: str, steps: List[str]) -> List[Dict[str, Any]]:
        registry = build_registry()
        agent = Agent(client=OllamaClient(), router=self.router, registry=registry, verbose=True)
        results = []
        for step in steps:
            start = time.time()
            out = agent.run(f"Overall goal: {goal}\nCurrent step: {step}")
            record_benchmark(self.router.pick("default"), step, time.time() - start, "FAIL" not in str(out).upper())
            results.append({"step": step, "result": out})
        return results

    def run_parallel(self, goal: str, steps: List[str]) -> List[Dict[str, Any]]:
        """Run independent steps in parallel. Use only when steps have no dependencies."""
        results: List[Dict[str, Any]] = [None] * len(steps)  # type: ignore

        def worker(idx: int, step: str) -> tuple[int, str]:
            registry = build_registry()
            agent = Agent(client=OllamaClient(), router=self.router, registry=registry, verbose=False)
            start = time.time()
            out = agent.run(f"Overall goal: {goal}\nCurrent step: {step}")
            record_benchmark(self.router.pick("default"), step, time.time() - start, "FAIL" not in str(out).upper())
            return idx, out

        with ThreadPoolExecutor(max_workers=self.max_workers) as ex:
            futures = {ex.submit(worker, i, s): i for i, s in enumerate(steps)}
            for fut in as_completed(futures):
                idx, out = fut.result()
                results[idx] = {"step": steps[idx], "result": out}
        return results

    def run_hybrid(self, goal: str, steps: List[str], parallel: bool = False) -> List[Dict[str, Any]]:
        if parallel and len(steps) > 1:
            return self.run_parallel(goal, steps)
        return self.run_sequential(goal, steps)