"""Contract tests: one schema file, validated identically on both sides.

The Python worker and the TypeScript control plane both read
``contracts/job.schema.json``. These tests pin the Python half and fail loudly
if the schema grows a keyword the small validator does not implement.
"""
from __future__ import annotations

import copy
import json

import pytest

from air_local import contract


def _schema() -> dict:
    return contract.load_schema()


def _request(**overrides) -> dict:
    base = {"contractVersion": 1, "runId": "run-1", "task": "say hi", "cwd": "."}
    base.update(overrides)
    return base


def _result(**overrides) -> dict:
    base = {"contractVersion": 1, "runId": "run-1", "state": "COMPLETED"}
    base.update(overrides)
    return base


def test_schema_path_is_the_canonical_air_file():
    path = contract.schema_path()
    assert path.name == "job.schema.json"
    assert path.parent.name == "contracts"
    # packages/local-worker/air_local -> packages/local-worker -> packages -> air
    assert (path.parent.parent / "PLAN.md").exists()


def test_schema_path_env_override(tmp_path, monkeypatch):
    target = tmp_path / "job.schema.json"
    target.write_text(json.dumps(_schema()), encoding="utf-8")
    monkeypatch.setenv("AIR_CONTRACT_PATH", str(target))
    assert contract.schema_path() == target.resolve()


def test_contract_version_matches_the_schema():
    assert _schema()["x-contractVersion"] == contract.CONTRACT_VERSION


def test_exit_codes_match_the_schema():
    declared = {name: int(code) for code, name in _schema()["x-exitCodes"].items()}
    assert declared == contract.EXIT_CODES


def test_validator_implements_every_keyword_in_the_schema():
    # A new keyword must be implemented here (and in src/contracts/job.ts)
    # before it can enter the contract.
    assert contract.unsupported_keywords() == []


def test_unsupported_keywords_are_reported():
    schema = copy.deepcopy(_schema())
    schema["$defs"]["request"]["properties"]["task"]["minLength"] = 1
    assert contract.unsupported_keywords(schema) == ["minLength"]


def test_accepts_a_minimal_request():
    assert contract.validate_request(_request()) == []


def test_accepts_a_full_request():
    request = _request(
        readOnly=True,
        allowShell=True,
        allowNetwork=False,
        model="qwen2.5-coder:7b",
        maxSteps=12,
        configPath="/tmp/worker.yaml",
    )
    assert contract.validate_request(request) == []


def test_accepts_a_completed_result():
    result = _result(
        answer="done",
        startedAt="2026-01-01T00:00:00Z",
        endedAt="2026-01-01T00:00:01Z",
        steps=2,
        toolCalls=[{"name": "read_file", "ok": True}],
        changedFiles=["src/a.ts"],
    )
    assert contract.validate_result(result) == []


def test_accepts_a_failed_result():
    result = _result(
        state="FAILED",
        error={"category": "PROVIDER_UNAVAILABLE", "message": "no ollama"},
    )
    assert contract.validate_result(result) == []


def test_rejects_missing_required_fields():
    request = _request()
    del request["runId"]
    errors = contract.validate_request(request)
    assert any("runId" in e for e in errors)


def test_rejects_unknown_fields():
    errors = contract.validate_request(_request(extra="nope"))
    assert any("extra" in e for e in errors)


def test_rejects_wrong_contract_version():
    errors = contract.validate_request(_request(contractVersion=2))
    assert any("contractVersion" in e for e in errors)


def test_rejects_wrong_types():
    errors = contract.validate_request(_request(readOnly="yes"))
    assert any("readOnly" in e for e in errors)


@pytest.mark.parametrize("steps", [0, 201])
def test_rejects_out_of_range_max_steps(steps):
    errors = contract.validate_request(_request(maxSteps=steps))
    assert any("maxSteps" in e for e in errors)


def test_rejects_unknown_result_state():
    errors = contract.validate_result(_result(state="DONE"))
    assert any("state" in e for e in errors)


def test_rejects_unknown_error_category():
    result = _result(
        state="FAILED",
        error={"category": "SOMETHING_ELSE", "message": "x"},
    )
    errors = contract.validate_result(result)
    assert any("category" in e for e in errors)


def test_rejects_malformed_tool_call():
    errors = contract.validate_result(_result(toolCalls=[{"name": "x"}]))
    assert any("ok" in e for e in errors)


def test_rejects_a_result_used_as_a_request():
    # The two definitions are distinct; sharing fields must not make them
    # interchangeable.
    assert contract.validate_request(_result()) != []


def test_unknown_definition_is_an_error():
    with pytest.raises(ValueError, match="unknown contract definition"):
        contract.validate({}, "nope")


def test_shared_examples_agree_with_the_validator():
    # contracts/examples/cases.json is also read by tests/contracts.test.ts,
    # so both validators are proven to accept and reject the same payloads.
    cases_file = contract.schema_path().parent / "examples" / "cases.json"
    cases = json.loads(cases_file.read_text(encoding="utf-8"))["cases"]
    assert cases, "shared contract examples must not be empty"
    for case in cases:
        validator = (
            contract.validate_request
            if case["kind"] == "request"
            else contract.validate_result
        )
        errors = validator(case["value"])
        assert (not errors) is case["valid"], f"{case['name']}: {errors}"

