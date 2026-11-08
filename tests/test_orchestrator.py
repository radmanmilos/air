"""Tests for multi-model orchestrator (Phase 4)."""
from unittest.mock import patch, MagicMock
from src.autonomy.orchestrator import Orchestrator, record_benchmark
import json
from pathlib import Path


def _mock_client():
    mc = MagicMock()
    mc.is_online.return_value = True
    mc.chat.return_value = {"message": {"content": "ok"}}
    return mc


@patch("src.autonomy.orchestrator.OllamaClient")
def test_run_sequential(mock_client_cls):
    mock_client_cls.return_value = _mock_client()
    orch = Orchestrator()
    results = orch.run_sequential("goal", ["step1", "step2"])
    assert len(results) == 2
    assert all("result" in r for r in results)


@patch("src.autonomy.orchestrator.OllamaClient")
def test_run_parallel(mock_client_cls):
    mock_client_cls.return_value = _mock_client()
    orch = Orchestrator(max_workers=2)
    results = orch.run_parallel("goal", ["step1", "step2"])
    assert len(results) == 2
    assert all("result" in r for r in results)


@patch("src.autonomy.orchestrator.OllamaClient")
def test_run_hybrid(mock_client_cls):
    mock_client_cls.return_value = _mock_client()
    orch = Orchestrator()
    seq = orch.run_hybrid("goal", ["step1"], parallel=False)
    par = orch.run_hybrid("goal", ["step1", "step2"], parallel=True)
    assert len(seq) == 1
    assert len(par) == 2


def test_record_benchmark(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    record_benchmark("m1", "t1", 1.5, True)
    data = json.loads((tmp_path / ".agent" / "benchmarks.json").read_text())
    assert "m1" in data
    assert data["m1"]["successes"] == 1