"""Tests for benchmark harness."""
import pytest
from src.autonomy.benchmark import benchmark, DEFAULT_TIMEOUT


class TestBenchmark:
    """Test cases for benchmark function."""

    def test_benchmark_simple_task(self):
        """Verify basic benchmark task execution returns success."""
        result = benchmark("read file")
        
        # Check structure
        assert "task" in result
        assert "model" in result
        assert "status" in result
        assert result["status"] == "success"
        
        # Check required fields
        assert "elapsed_seconds" in result
        assert result["task"] == "read file"

    def test_benchmark_with_custom_model(self):
        """Verify benchmark accepts and returns custom model."""
        result = benchmark("write file", model="deepseek-r1:8b")
        
        assert result["model"] == "deepseek-r1:8b"
        assert result["status"] == "success"

    def test_benchmark_timeout(self):
        """Verify timeout parameter is handled."""
        # Using default 60s timeout (long enough for this test)
        result = benchmark("quick task", model="qwen3.5:4b", timeout=60)
        
        assert "elapsed_seconds" in result
        assert isinstance(result["elapsed_seconds"], (int, float))
