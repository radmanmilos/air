"""Tests for benchmark harness."""
import pytest
from unittest.mock import patch, MagicMock
from src.autonomy.benchmark import benchmark, DEFAULT_TIMEOUT


def _mock_client():
    mc = MagicMock()
    mc.is_online.return_value = True
    mc.chat.return_value = {"message": {"content": "ok"}}
    return mc


@patch("src.core.ollama_client.OllamaClient")
def test_benchmark_simple_task(mock_client_cls):
    """Verify basic benchmark task execution returns success."""
    mock_client_cls.return_value = _mock_client()

    result = benchmark("read file")

    assert "task" in result
    assert "model" in result
    assert "status" in result
    assert result["status"] == "success"

    assert "elapsed_seconds" in result
    assert result["task"] == "read file"


@patch("src.core.ollama_client.OllamaClient")
def test_benchmark_with_custom_model(mock_client_cls):
    """Verify benchmark accepts and returns custom model."""
    mock_client_cls.return_value = _mock_client()

    result = benchmark("write file", model="deepseek-r1:8b")

    assert result["model"] == "deepseek-r1:8b"
    assert result["status"] == "success"


@patch("src.core.ollama_client.OllamaClient")
def test_benchmark_timeout(mock_client_cls):
    """Verify timeout parameter is handled."""
    mock_client_cls.return_value = _mock_client()

    result = benchmark("quick task", model="qwen3.5:4b", timeout=60)

    assert "elapsed_seconds" in result
    assert isinstance(result["elapsed_seconds"], (int, float))


@patch("src.core.ollama_client.OllamaClient")
def test_benchmark_offline_skipped(mock_client_cls):
    """Verify benchmark returns skipped when Ollama is offline."""
    mc = MagicMock()
    mc.is_online.return_value = False
    mock_client_cls.return_value = mc

    result = benchmark("read file")
    assert result["status"] == "skipped"