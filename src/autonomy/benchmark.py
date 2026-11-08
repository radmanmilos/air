"""
Benchmark harness for multi-model performance measurement.
Provides benchmark(task, model) function and compare_models() for cross-model analysis.
"""
import time
from typing import Any, Dict, Optional, List

# Default model configuration
DEFAULT_TIMEOUT = 60
BASELINE_MODEL = "qwen3.5:4b"


def benchmark(
    task: str,
    model: str = BASELINE_MODEL,
    timeout: int = DEFAULT_TIMEOUT,
) -> Dict[str, Any]:
    """
    Benchmark a task on the specified model.
    
    Args:
        task: Description of the work to perform (string).
        model: Ollama model name to use (string).
        timeout: Maximum time in seconds before aborting.
        
    Returns:
        Dict containing benchmark results with metrics.
    """
    start_time = time.time()
    
    try:
        # Placeholder: actual task execution via agent loop would go here
        # For now, we measure the overhead and can be extended to run real tasks
        
        if timeout is not None:
            elapsed = time.time() - start_time
        else:
            elapsed = None
            
    except Exception as e:
        return {
            "task": task,
            "model": model,
            "status": "failed",
            "error": str(e),
            "elapsed_seconds": time.time() - start_time,
        }
    
    return {
        "task": task,
        "model": model,
        "status": "success",
        "elapsed_seconds": elapsed or 0.0,
        "metrics": {"throughput_samples": 1},
    }


def compare_models(
    tasks: List[str],
    models: List[str] = [BASELINE_MODEL],
    timeout: int = DEFAULT_TIMEOUT,
) -> Dict[str, Any]:
    """
    Benchmark multiple models on the same task(s).
    
    Args:
        tasks: List of task descriptions to benchmark.
        models: List of model names to compare (defaults to baseline).
        timeout: Maximum time per model in seconds.
        
    Returns:
        Dict containing comparative benchmark results.
        
    Example:
        >>> result = compare_models(["read config.yaml"], ["qwen3.5:4b", "deepseek-r1:8b"])
        >>> print(result)
    """
    comparison_results = []
    
    for task in tasks:
        model_results = []
        
        for model in models:
            result = benchmark(task, model=model, timeout=timeout)
            if result["status"] == "success":
                elapsed = float(result["elapsed_seconds"])
            else:
                elapsed = None
            
            comparison_results.append({
                "task": task,
                "model": model,
                "status": result["status"],
                "elapsed_seconds": elapsed,
                "error": result.get("error"),
            })
        
        # Calculate speedup for multi-model comparison
        completed_models = [r for r in comparison_results if r["status"] == "success" and r["elapsed_seconds"] is not None]
        if len(completed_models) >= 2:
            times = [float(r["elapsed_seconds"]) for r in completed_models]
            fastest = min(times)
            slowest = max(times)
            speedup_percentage = ((slowest - fastest) / slowest * 100) if slowest > 0 else 0
            
            comparison_results.append({
                "task": task,
                "model": "aggregate",
                "status": "success",
                "elapsed_seconds": fastest,
                "metrics": {
                    "models_tested": len(completed_models),
                    "avg_time": sum(times) / len(times),
                    "min_time": fastest,
                    "max_time": slowest,
                    "speedup_percentage": speedup_percentage,
                },
            })
    
    return {"comparisons": comparison_results}


if __name__ == "__main__":
    # Example usage - benchmark on multiple models
    result = compare_models(
        tasks=["read config.yaml"],
        models=["qwen3.5:4b", "deepseek-r1:8b"]
    )
    print(result)
