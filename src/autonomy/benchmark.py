"""
Benchmark harness for multi-model performance measurement.
Provides benchmark(task, model) and compare_models() for cross-model analysis.
"""
from __future__ import annotations

import time
from typing import Any, Dict, Optional, List

DEFAULT_TIMEOUT = 60
BASELINE_MODEL = "qwen3.5:4b"


def benchmark(
    task: str,
    model: str = BASELINE_MODEL,
    timeout: int = DEFAULT_TIMEOUT,
) -> Dict[str, Any]:
    """Benchmark a task on the specified model.

    Runs the task through the agent when Ollama is available; otherwise
    returns a 'skipped' result so callers/tests don't hang.
    """
    from src.core.ollama_client import OllamaClient

    client = OllamaClient()
    start_time = time.time()

    if not client.is_online():
        return {
            "task": task,
            "model": model,
            "status": "skipped",
            "reason": "Ollama offline",
            "elapsed_seconds": 0.0,
        }

    try:
        from src.core.agent_loop import Agent
        from src.core.router import Router
        from src.tools.builtin import build_registry

        agent = Agent(
            client=client,
            router=Router(),
            registry=build_registry(),
            max_steps=5,
            verbose=False,
        )
        result = agent.run(task, model=model)
        elapsed = time.time() - start_time
        return {
            "task": task,
            "model": model,
            "status": "success",
            "result": result,
            "elapsed_seconds": round(elapsed, 3),
            "metrics": {"throughput_samples": 1},
        }
    except Exception as e:
        return {
            "task": task,
            "model": model,
            "status": "failed",
            "error": str(e),
            "elapsed_seconds": round(time.time() - start_time, 3),
        }


def compare_models(
    tasks: List[str],
    models: List[str] = None,
    timeout: int = DEFAULT_TIMEOUT,
) -> Dict[str, Any]:
    """Benchmark multiple models on the same task(s)."""
    if models is None:
        models = [BASELINE_MODEL]

    comparison_results = []

    for task in tasks:
        model_results = []
        for model in models:
            result = benchmark(task, model=model, timeout=timeout)
            model_results.append(result)
            comparison_results.append({
                "task": task,
                "model": model,
                "status": result["status"],
                "elapsed_seconds": result.get("elapsed_seconds"),
                "error": result.get("error") or result.get("reason"),
            })

        completed = [r for r in model_results if r["status"] == "success" and r.get("elapsed_seconds") is not None]
        if len(completed) >= 2:
            times = [float(r["elapsed_seconds"]) for r in completed]
            fastest = min(times)
            slowest = max(times)
            speedup_pct = ((slowest - fastest) / slowest * 100) if slowest > 0 else 0.0
            comparison_results.append({
                "task": task,
                "model": "aggregate",
                "status": "success",
                "elapsed_seconds": fastest,
                "metrics": {
                    "models_tested": len(completed),
                    "avg_time": round(sum(times) / len(times), 3),
                    "min_time": fastest,
                    "max_time": slowest,
                    "speedup_percentage": round(speedup_pct, 2),
                },
            })

    return {"comparisons": comparison_results}


if __name__ == "__main__":
    result = compare_models(
        tasks=["read config.yaml"],
        models=["qwen3.5:4b"],
    )
    print(result)