"""Tests for multi-model benchmark comparison (Phase 4 - sub-cycle 3c)."""
import pytest
from src.autonomy.benchmark import benchmark, compare_models


class TestCompareModels:
    """Test cases for compare_models function."""

    def test_compare_single_model(self):
        """Verify comparison works with single model."""
        result = compare_models(["read config.yaml"], models=["qwen3.5:4b"])
        
        # Should return comparisons list
        assert "comparisons" in result
        assert len(result["comparisons"]) == 1
        
        # Check structure of comparison result
        comp = result["comparisons"][0]
        assert "task" in comp
        assert "model" in comp
        assert "status" in comp
        assert "elapsed_seconds" in comp

    def test_compare_multiple_models(self):
        """Verify comparison works with multiple models."""
        result = compare_models(
            tasks=["read config.yaml"],
            models=["qwen3.5:4b", "deepseek-r1:8b"]
        )
        
        # Should have 2 model comparisons + aggregate
        assert len(result["comparisons"]) >= 2
        
        # Find qwen and deepseek results
        models_result = [r for r in result["comparisons"] if r["model"] in ["qwen3.5:4b", "deepseek-r1:8b"]]
        assert len(models_result) == 2
        
        for comp in models_result:
            assert comp["status"] == "success"

    def test_compare_aggregate_metrics(self):
        """Verify aggregate metrics calculation."""
        result = compare_models(
            tasks=["read config.yaml"],
            models=["qwen3.5:4b", "deepseek-r1:8b"]
        )
        
        # Check for aggregate comparison entry
        agg_result = [r for r in result["comparisons"] if r["model"] == "aggregate"]
        assert len(agg_result) >= 1
        
        agg = agg_result[0]
        assert "metrics" in agg
        
        metrics = agg["metrics"]
        # Should contain time-based metrics
        assert any(k in metrics for k in ["avg_time", "min_time", "max_time"])

    def test_compare_with_timeout(self):
        """Verify timeout parameter is respected."""
        result = compare_models(
            tasks=["read config.yaml"],
            models=["qwen3.5:4b"],
            timeout=60  # Long enough for this test
        )
        
        assert "comparisons" in result
        assert len(result["comparisons"]) == 1

    def test_compare_empty_tasks(self):
        """Verify handling of empty tasks list."""
        result = compare_models(
            tasks=[],
            models=["qwen3.5:4b"]
        )
        
        # Should return valid structure even with empty tasks
        assert isinstance(result, dict)
        assert "comparisons" in result


class TestBenchmarkFunction:
    """Test cases for standalone benchmark function."""

    def test_benchmark_success(self):
        """Verify basic benchmark returns success."""
        result = benchmark("read file")
        
        assert "status" in result
        assert result["status"] == "success"

    def test_benchmark_with_custom_model(self):
        """Verify custom model support."""
        result = benchmark("task", model="custom-model")
        
        assert result["model"] == "custom-model"
