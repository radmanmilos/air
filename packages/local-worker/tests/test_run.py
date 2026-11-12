"""Entrypoint tests: request/result files, stable exit codes, clean stdout."""
from __future__ import annotations

import json

import pytest
import requests

from air_local import contract, policy, run


@pytest.fixture(autouse=True)
def _reset_policy():
    policy.reset()
    yield
    policy.reset()


def _write_request(tmp_path, payload) -> str:
    path = tmp_path / "request.json"
    path.write_text(
        payload if isinstance(payload, str) else json.dumps(payload),
        encoding="utf-8",
    )
    return str(path)


def _request(tmp_path, **overrides) -> dict:
    base = {
        "contractVersion": 1,
        "runId": "run-1",
        "task": "say hi",
        "cwd": str(tmp_path),
    }
    base.update(overrides)
    return base


def _fake_agent(monkeypatch, *, answer="done", error=None, steps=1, calls=None):
    """Replace the real Ollama-backed agent with a deterministic stub."""

    class FakeAgent:
        def __init__(self, max_steps=40, verbose=False):
            self.max_steps = max_steps
            self.verbose = verbose
            self.steps_used = steps
            self.tool_calls = list(calls or [])

        def run(self, task, model=None, images=None):  # noqa: ARG002
            if error is not None:
                raise error
            return answer

    monkeypatch.setattr(run, "Agent", FakeAgent)


def _result(tmp_path) -> dict:
    return json.loads((tmp_path / "result.json").read_text(encoding="utf-8"))


def test_exit_codes_are_the_contract_table():
    assert run.EXIT_CODES == contract.EXIT_CODES
    assert run.EXIT_CODES == {
        "COMPLETED": 0,
        "INVALID_REQUEST": 2,
        "WORKER_FAILED": 3,
        "CANCELLED": 4,
        "PROVIDER_UNAVAILABLE": 5,
    }


def test_completed_job_writes_a_valid_result_and_exits_zero(
    tmp_path, monkeypatch, capsys
):
    _fake_agent(monkeypatch, answer="all done", steps=3, calls=[{"name": "read_file", "ok": True}])
    request = _write_request(tmp_path, _request(tmp_path))

    code = run.main(["--request", request, "--result", str(tmp_path / "result.json")])

    assert code == 0
    result = _result(tmp_path)
    assert contract.validate_result(result) == []
    assert result["state"] == "COMPLETED"
    assert result["answer"] == "all done"
    assert result["steps"] == 3
    assert result["toolCalls"] == [{"name": "read_file", "ok": True}]
    # stdout stays empty: callers read the result file, never prose.
    assert capsys.readouterr().out == ""
    assert not (tmp_path / "result.json.tmp").exists()


def test_missing_request_file_is_an_invalid_request(tmp_path, capsys):
    code = run.main(
        ["--request", str(tmp_path / "nope.json"), "--result", str(tmp_path / "result.json")]
    )
    assert code == 2
    result = _result(tmp_path)
    assert result["state"] == "FAILED"
    assert result["error"]["category"] == "INVALID_REQUEST"
    assert contract.validate_result(result) == []
    assert capsys.readouterr().out == ""


def test_malformed_json_is_an_invalid_request(tmp_path):
    request = _write_request(tmp_path, "{not json")
    code = run.run(request, str(tmp_path / "result.json"))
    assert code == 2
    assert _result(tmp_path)["error"]["category"] == "INVALID_REQUEST"


def test_request_with_a_utf8_bom_is_accepted(tmp_path, monkeypatch):
    _fake_agent(monkeypatch)
    path = tmp_path / "request.json"
    path.write_bytes(b"\xef\xbb\xbf" + json.dumps(_request(tmp_path)).encode("utf-8"))
    assert run.run(str(path), str(tmp_path / "result.json")) == 0
    assert _result(tmp_path)["state"] == "COMPLETED"


def test_contract_violation_is_an_invalid_request(tmp_path):
    payload = _request(tmp_path)
    del payload["task"]
    request = _write_request(tmp_path, payload)
    code = run.run(request, str(tmp_path / "result.json"))
    assert code == 2
    result = _result(tmp_path)
    assert result["error"]["category"] == "INVALID_REQUEST"
    assert "task" in result["error"]["message"]


def test_missing_cwd_is_an_invalid_request(tmp_path):
    request = _write_request(tmp_path, _request(tmp_path, cwd=str(tmp_path / "gone")))
    code = run.run(request, str(tmp_path / "result.json"))
    assert code == 2
    assert _result(tmp_path)["error"]["category"] == "INVALID_REQUEST"


def test_provider_unavailable_exits_five(tmp_path, monkeypatch):
    _fake_agent(monkeypatch, error=RuntimeError("Ollama is unavailable: connection refused"))
    request = _write_request(tmp_path, _request(tmp_path))

    code = run.run(request, str(tmp_path / "result.json"))

    assert code == 5
    result = _result(tmp_path)
    assert result["state"] == "FAILED"
    assert result["error"]["category"] == "PROVIDER_UNAVAILABLE"
    assert contract.validate_result(result) == []


def test_connection_error_exits_five(tmp_path, monkeypatch):
    _fake_agent(monkeypatch, error=requests.exceptions.ConnectionError("refused"))
    request = _write_request(tmp_path, _request(tmp_path))
    assert run.run(request, str(tmp_path / "result.json")) == 5


def test_http_503_exits_five(tmp_path, monkeypatch):
    response = requests.Response()
    response.status_code = 503
    error = requests.exceptions.HTTPError("unavailable", response=response)
    _fake_agent(monkeypatch, error=error)
    request = _write_request(tmp_path, _request(tmp_path))
    assert run.run(request, str(tmp_path / "result.json")) == 5


def test_other_failures_are_worker_failures(tmp_path, monkeypatch):
    _fake_agent(monkeypatch, error=ValueError("tool exploded"))
    request = _write_request(tmp_path, _request(tmp_path))

    code = run.run(request, str(tmp_path / "result.json"))

    assert code == 3
    result = _result(tmp_path)
    assert result["error"]["category"] == "WORKER_FAILED"
    assert "tool exploded" in result["error"]["message"]


def test_cancellation_exits_four(tmp_path, monkeypatch):
    _fake_agent(monkeypatch, error=run._Cancelled())
    request = _write_request(tmp_path, _request(tmp_path))

    code = run.run(request, str(tmp_path / "result.json"))

    assert code == 4
    result = _result(tmp_path)
    assert result["state"] == "CANCELLED"
    assert result["error"]["category"] == "CANCELLED"


def test_read_only_request_disables_writes(tmp_path, monkeypatch):
    _fake_agent(monkeypatch)
    request = _write_request(tmp_path, _request(tmp_path, readOnly=True))
    assert run.run(request, str(tmp_path / "result.json")) == 0
    assert policy.current().allow_write is False


def test_shell_and_network_flags_reach_the_policy(tmp_path, monkeypatch):
    _fake_agent(monkeypatch)
    request = _write_request(
        tmp_path, _request(tmp_path, allowShell=True, allowNetwork=False)
    )
    assert run.run(request, str(tmp_path / "result.json")) == 0
    active = policy.current()
    assert active.allow_shell is True
    assert active.allow_network is False


def test_max_steps_reaches_the_agent(tmp_path, monkeypatch):
    seen = {}

    class FakeAgent:
        def __init__(self, max_steps=40, verbose=False):
            seen["max_steps"] = max_steps
            self.steps_used = 0
            self.tool_calls = []

        def run(self, task, model=None, images=None):  # noqa: ARG002
            return "ok"

    monkeypatch.setattr(run, "Agent", FakeAgent)
    request = _write_request(tmp_path, _request(tmp_path, maxSteps=7))
    assert run.run(request, str(tmp_path / "result.json")) == 0
    assert seen["max_steps"] == 7


def test_changed_files_parses_porcelain_without_eating_the_first_name(tmp_path):
    from air_local.run import _changed_files

    repo = tmp_path / "repo"
    repo.mkdir()
    (repo / "Program.cs").write_text("Console.WriteLine();\n", encoding="utf-8")
    import subprocess

    git = ["-c", "user.name=t", "-c", "user.email=t@t"]
    subprocess.run(["git", *git, "init"], cwd=repo, check=True, capture_output=True)
    subprocess.run(["git", *git, "add", "-A"], cwd=repo, check=True, capture_output=True)
    subprocess.run(
        ["git", *git, "commit", "-m", "init"], cwd=repo, check=True, capture_output=True
    )
    (repo / "Program.cs").write_text("Console.WriteLine(1);\n", encoding="utf-8")

    assert _changed_files(repo) == ["Program.cs"]
