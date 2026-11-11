"""File tool tests: writes stay inside the job root."""
from __future__ import annotations

import pytest

from air_local import policy
from air_local.tools import files


@pytest.fixture(autouse=True)
def _root(tmp_path):
    policy.reset()
    policy.configure(tmp_path, allow_write=True)
    yield tmp_path
    policy.reset()


def test_write_then_read(tmp_path):
    result = files.write_file("notes/a.txt", "hello")
    assert "Wrote 5 chars" in result
    assert files.read_file("notes/a.txt") == "hello"


def test_append(tmp_path):
    files.write_file("a.txt", "one")
    files.append_file("a.txt", " two")
    assert files.read_file("a.txt") == "one two"


def test_write_outside_root_is_refused(tmp_path):
    outside = tmp_path.parent / "escape.txt"
    result = files.write_file(str(outside), "nope")
    assert result.startswith("ERROR:")
    assert not outside.exists()


def test_read_outside_root_is_refused(tmp_path):
    outside = tmp_path.parent / "secret.txt"
    outside.write_text("secret", encoding="utf-8")
    assert files.read_file(str(outside)).startswith("ERROR:")


def test_protected_file_is_refused(tmp_path):
    assert files.write_file("config.yaml", "x").startswith("ERROR:")
    assert not (tmp_path / "config.yaml").exists()


def test_read_only_mode_blocks_writes(tmp_path):
    policy.configure(tmp_path, allow_write=False)
    assert files.write_file("a.txt", "x").startswith("ERROR:")
    assert not (tmp_path / "a.txt").exists()


def test_list_dir_and_info(tmp_path):
    files.write_file("a.txt", "abc")
    listing = files.list_dir(".")
    assert "a.txt" in listing
    info = files.file_info("a.txt")
    assert "size=3 bytes" in info
    assert "is_file=True" in info


def test_search_skips_git_and_matches(tmp_path):
    files.write_file("src/app.py", "needle here")
    files.write_file(".git/config", "needle here")
    hits = files.search_files("needle")
    assert "src" in hits.replace("\\", "/")
    assert ".git" not in hits


def test_invalid_regex_is_reported(tmp_path):
    assert files.search_files("[").startswith("ERROR:")
