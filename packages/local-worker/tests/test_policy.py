"""Policy tests: jail, read-only mode, protected files, shell gate."""
from __future__ import annotations

import pytest

from air_local import policy


@pytest.fixture(autouse=True)
def _reset_policy():
    policy.reset()
    yield
    policy.reset()


def test_resolve_relative_and_absolute_inside_root(tmp_path):
    policy.configure(tmp_path)
    assert policy.resolve("a.txt") == (tmp_path / "a.txt").resolve()
    assert policy.resolve(tmp_path / "b.txt") == (tmp_path / "b.txt").resolve()


def test_resolve_refuses_escape(tmp_path):
    policy.configure(tmp_path / "root")
    with pytest.raises(PermissionError):
        policy.resolve("../outside.txt")
    with pytest.raises(PermissionError):
        policy.resolve(tmp_path / "outside.txt")


def test_resolve_must_exist(tmp_path):
    policy.configure(tmp_path)
    with pytest.raises(FileNotFoundError):
        policy.resolve("missing.txt", must_exist=True)


def test_require_write_honours_read_only(tmp_path):
    policy.configure(tmp_path, allow_write=False)
    with pytest.raises(PermissionError):
        policy.require_write("a.txt")
    policy.configure(tmp_path, allow_write=True)
    assert policy.require_write("a.txt") == (tmp_path / "a.txt").resolve()


@pytest.mark.parametrize("name", [".git/config", "config.yaml", "AGENTS.md", "PLAN.md", "key.pem"])
def test_require_write_refuses_protected(tmp_path, name):
    policy.configure(tmp_path)
    with pytest.raises(PermissionError):
        policy.require_write(name)
    assert policy.is_protected(tmp_path / name)


def test_shell_gate_defaults_closed(tmp_path):
    policy.configure(tmp_path)
    with pytest.raises(PermissionError):
        policy.require_shell()
    policy.configure(tmp_path, allow_shell=True)
    policy.require_shell()


def test_network_gate(tmp_path):
    policy.configure(tmp_path, allow_network=False)
    with pytest.raises(PermissionError):
        policy.require_network()


def test_env_flags_are_used_when_arguments_are_none(tmp_path, monkeypatch):
    monkeypatch.setenv("AIR_LOCAL_ALLOW_WRITE", "0")
    monkeypatch.setenv("AIR_LOCAL_ALLOW_SHELL", "yes")
    configured = policy.configure(tmp_path)
    assert configured.allow_write is False
    assert configured.allow_shell is True
