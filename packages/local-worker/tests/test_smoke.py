"""Smoke tests: package wiring, registry contents, and import hygiene."""
from __future__ import annotations

from pathlib import Path

import pytest

from air_local import __version__, policy
from air_local.models import Router
from air_local.tools.builtin import build_registry

PACKAGE = Path(__file__).resolve().parents[1] / "air_local"

EXPECTED = {
    "read_file",
    "write_file",
    "append_file",
    "list_dir",
    "search_files",
    "file_info",
    "run_shell",
    "web_search",
    "web_fetch",
    "git_status",
    "git_diff",
    "git_branch",
    "git_commit",
    "git_log",
    "run_tests",
    "ensure_ollama_online",
    "is_ollama_online",
    "analyze_code",
    "check_dependencies",
    "count_lines",
    "generate_tests",
    "run_project_tests",
    "list_templates",
    "scaffold_project",
    "generate_docs",
}

DROPPED = {
    "remember",
    "recall",
    "index_file",
    "memory_count",
    "describe_image",
    "speak",
    "listen",
    "transcribe_file",
    "check_guardrails",
    "list_plugins",
    "load_plugins",
    "create_sample_plugin",
    "install_packages",
}


def test_version():
    assert __version__ == "0.2.0"


def test_registry_contains_retained_tools():
    names = set(build_registry().names())
    assert EXPECTED <= names


def test_registry_excludes_dropped_tools():
    names = set(build_registry().names())
    assert not (DROPPED & names)


def test_registry_dispatch_reports_unknown_tool():
    assert build_registry().dispatch("nope", {}).startswith("ERROR:")


def test_router_reads_config_from_env(tmp_path, monkeypatch):
    config = tmp_path / "config.yaml"
    config.write_text(
        "models:\n  brain: brain-x\n  coder: code-x\n  reasoner: reason-x\n  embed: embed-x\n",
        encoding="utf-8",
    )
    monkeypatch.setenv("AIR_LOCAL_CONFIG", str(config))
    router = Router()
    assert router.pick("default") == "brain-x"
    assert router.pick("code") == "code-x"
    assert router.pick("embed") == "embed-x"


def test_loop_has_no_interactive_approval():
    source = (PACKAGE / "loop.py").read_text(encoding="utf-8")
    assert "input(" not in source
    assert "approval" not in source


@pytest.mark.parametrize("path", sorted(PACKAGE.rglob("*.py")), ids=lambda p: p.name)
def test_no_stale_imports(path: Path):
    text = path.read_text(encoding="utf-8")
    assert "from src." not in text
    assert "import src." not in text
    assert "air_local.core" not in text
    assert "air_local.memory" not in text
    assert "air_local.senses" not in text


def test_policy_defaults_to_safe_capabilities(tmp_path):
    policy.reset()
    configured = policy.configure(tmp_path)
    assert configured.allow_write is True
    assert configured.allow_shell is False
    policy.reset()
