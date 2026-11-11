"""Shell tool tests: no shell, allowlist, cwd jail."""
from __future__ import annotations

import pytest

from air_local import policy
from air_local.tools import shell


@pytest.fixture(autouse=True)
def _root(tmp_path):
    policy.reset()
    policy.configure(tmp_path, allow_shell=True)
    yield tmp_path
    policy.reset()


def test_shell_denied_when_not_allowed(tmp_path):
    policy.configure(tmp_path, allow_shell=False)
    assert shell.run_shell("git --version").startswith("ERROR:")


@pytest.mark.parametrize("command", ["echo hi && whoami", "git status | more", "ls; rm -rf ."])
def test_shell_metacharacters_are_blocked(command):
    assert shell.run_shell(command).startswith("BLOCKED:")


def test_binary_must_be_allowlisted():
    assert shell.run_shell("curl http://example.com").startswith("BLOCKED:")


def test_allowed_command_runs():
    result = shell.run_shell("git --version")
    assert "EXIT CODE: 0" in result
    assert "git version" in result.lower()


def test_cwd_escape_is_refused(tmp_path):
    result = shell.run_shell("git --version", cwd="..")
    assert result.startswith("ERROR:")


def test_missing_cwd_is_reported():
    assert shell.run_shell("git --version", cwd="nope").startswith("ERROR:")


def test_split_keeps_windows_paths_intact():
    assert shell._split("git -C E:\\GitHub\\air status")[2] == "E:\\GitHub\\air"
