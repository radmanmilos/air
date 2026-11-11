"""Tests for multi-model benchmark comparison (Phase 4 - sub-cycle 3c)."""
import pytest
from unittest.mock import patch, MagicMock
from src.autonomy.benchmark import benchmark, compare_models


def _mock_client():
    mc = MagicMock()
    mc.is_online.return_value = True
    mc.chat.return_value = {"message": {"content": "ok"}}
    return mc


@patch("src.core.ollama_client.OllamaClient")
def test_compare_single_model(mock_client_cls):
    """Verify comparison works with single model."""
    mock_client_cls.return_value = _mock_client()

    result = compare_models(["read config.yaml"], models=["qwen3.5:4b"])

    assert "comparisons" in result
    assert len(result["comparisons"]) == 1

    comp = result["comparisons"][0]
    assert "task" in comp
    assert "model" in comp
    assert "status" in comp
    assert "elapsed_seconds" in comp


@patch("src.core.ollama_client.OllamaClient")
def test_compare_multiple_models(mock_client_cls):
    """Verify comparison works with multiple models."""
    mock_client_cls.return_value = _mock_client()

    result = compare_models(
        tasks=["read config.yaml"],
        models=["qwen3.5:4b", "deepseek-r1:8b"]
    )

    assert len(result["comparisons"]) >= 2

    models_result = [r for r in result["comparisons"] if r["model"] in ["qwen3.5:4b", "deepseek-r1:8b"]]
    assert len(models_result) == 2

    for comp in models_result:
        assert comp["status"] == "success"


@patch("src.core.ollama_client.OllamaClient")
def test_benchmark_offline_returns_skipped(mock_client_cls):
    """Verify benchmark returns skipped when Ollama is offline."""
    mc = MagicMock()
    mc.is_online.return_value = False
    mock_client_cls.return_value = mc

    result = benchmark("read config.yaml", model="qwen3.5:4b")
    assert result["status"] == "skipped"