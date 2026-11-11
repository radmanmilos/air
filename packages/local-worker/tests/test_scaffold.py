"""Scaffolding tests: templates and doc generation stay inside the job root."""
from __future__ import annotations

import pytest

from air_local import policy
from air_local.scaffold import doc_generator, templates


@pytest.fixture(autouse=True)
def _root(tmp_path):
    policy.reset()
    policy.configure(tmp_path, allow_write=True)
    yield tmp_path
    policy.reset()


def test_scaffold_writes_template_files(tmp_path):
    result = templates.scaffold_project(template="documentation", folder="proj")
    assert result["template"] == "documentation"
    assert (tmp_path / "proj" / "README.md").exists()


def test_scaffold_unknown_template():
    result = templates.scaffold_project(template="nope", folder="proj")
    assert "unknown template" in result["error"]


def test_scaffold_refuses_escape(tmp_path):
    result = templates.scaffold_project(template="documentation", folder="../outside")
    assert "error" in result
    assert not (tmp_path.parent / "outside").exists()


def test_generate_docs_for_project(tmp_path):
    project = tmp_path / "proj"
    project.mkdir()
    (project / "main.py").write_text(
        '"""Demo module."""\n\n\ndef greet(name: str) -> str:\n    """Say hi."""\n'
        '    return f"hi {name}"\n',
        encoding="utf-8",
    )
    result = doc_generator.generate_all_docs(folder="proj")
    assert set(result["files"]) == {"README.md", "ARCHITECTURE.md", "API.md"}
    readme = (project / "README.md").read_text(encoding="utf-8")
    assert "greet" in readme


def test_generate_docs_refuses_escape(tmp_path):
    result = doc_generator.generate_all_docs(folder="..")
    assert "error" in result
