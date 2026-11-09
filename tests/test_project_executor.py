"""Tests for ProjectExecutor — no Ollama required."""
import os
import sys
import tempfile
from pathlib import Path
from unittest.mock import patch, MagicMock

import pytest

# Add src to path so imports work when run directly
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from src.autonomy.project_executor import (
    ProjectExecutor, _get_app_template, _get_manual_template,
    FILE_SEARCH_APP_TEMPLATE, CLI_TOOL_APP_TEMPLATE, API_SERVICE_APP_TEMPLATE,
    USER_MANUAL_TEMPLATE, CLI_TOOL_MANUAL_TEMPLATE, API_SERVICE_MANUAL_TEMPLATE,
    MGAI_DOC_TEMPLATE,
)


class TestTemplateSelection:
    """Test that the right template is selected based on requirements content."""

    def test_file_search_template(self):
        content, tmpl = _get_app_template("build a file search app for windows")
        assert content == "app.py"
        assert "search_files" in tmpl
        assert "tkinter" in tmpl

    def test_cli_tool_template(self):
        content, tmpl = _get_app_template("create a cli tool with argparse")
        assert content == "app.py"
        assert "argparse" in tmpl
        assert "process_input" in tmpl

    def test_api_service_template(self):
        content, tmpl = _get_app_template("build a rest api service with fastapi")
        assert content == "app.py"
        assert "FastAPI" in tmpl
        assert "@app.post" in tmpl

    def test_default_template(self):
        content, tmpl = _get_app_template("build something generic")
        assert content == "app.py"
        assert "TODO" in tmpl

    def test_file_search_manual(self):
        fname, tmpl = _get_manual_template("build a file search app")
        assert fname == "USER_MANUAL.md"
        assert "File Search App" in tmpl

    def test_cli_tool_manual(self):
        fname, tmpl = _get_manual_template("create a cli tool")
        assert fname == "USER_MANUAL.md"
        assert "CLI Tool" in tmpl

    def test_api_service_manual(self):
        fname, tmpl = _get_manual_template("build a rest api service")
        assert fname == "USER_MANUAL.md"
        assert "FastAPI Service" in tmpl

    def test_doc_only_manual(self):
        fname, tmpl = _get_manual_template("explain how mgai operates")
        assert fname == "USER_MANUAL.md"
        assert "MGAI — How It Operates" in tmpl


class TestRequirementsGeneration:
    """Test requirements.txt generation from app content."""

    def test_no_dependencies(self):
        executor = ProjectExecutor.__new__(ProjectExecutor)
        result = executor._generate_requirements_txt("print('hello')")
        assert "No external dependencies" in result

    def test_fastapi_dependency(self):
        executor = ProjectExecutor.__new__(ProjectExecutor)
        result = executor._generate_requirements_txt("from fastapi import FastAPI")
        assert "fastapi" in result

    def test_requests_dependency(self):
        executor = ProjectExecutor.__new__(ProjectExecutor)
        result = executor._generate_requirements_txt("import requests")
        assert "requests" in result


class TestProjectExecutorInit:
    """Test ProjectExecutor initialization."""

    def test_init_creates_state(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            executor = ProjectExecutor(tmpdir)
            assert executor.folder_path == str(Path(tmpdir).resolve())
            assert executor.state["folder"] == str(Path(tmpdir).resolve())
            assert "key" in executor.state
            assert "steps" in executor.state


class TestWriteRealCode:
    """Test that _write_real_code creates the right files."""

    def test_writes_app_and_manual(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            executor = ProjectExecutor(tmpdir)
            executor._write_real_code("build a file search app for windows", tmpdir)

            files = os.listdir(tmpdir)
            assert "app.py" in files
            assert "USER_MANUAL.md" in files
            assert "__init__.py" in files
            assert "requirements.txt" in files

    def test_writes_cli_tool(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            executor = ProjectExecutor(tmpdir)
            executor._write_real_code("create a cli tool with argparse", tmpdir)

            app_path = Path(tmpdir) / "app.py"
            content = app_path.read_text()
            assert "argparse" in content

    def test_writes_api_service(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            executor = ProjectExecutor(tmpdir)
            executor._write_real_code("build a rest api service with fastapi", tmpdir)

            app_path = Path(tmpdir) / "app.py"
            content = app_path.read_text()
            assert "FastAPI" in content

    def test_doc_only_writes_manual_only(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            executor = ProjectExecutor(tmpdir)
            executor._write_real_code("explain how mgai operates in markdown", tmpdir)

            files = os.listdir(tmpdir)
            assert "USER_MANUAL.md" in files
            assert "app.py" not in files

    def test_does_not_overwrite_existing(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            # Pre-create app.py with custom content
            (Path(tmpdir) / "app.py").write_text("# CUSTOM CONTENT")
            executor = ProjectExecutor(tmpdir)
            executor._write_real_code("build a file search app", tmpdir)

            app_path = Path(tmpdir) / "app.py"
            assert app_path.read_text() == "# CUSTOM CONTENT"

    def test_list_created_files(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            executor = ProjectExecutor(tmpdir)
            executor._write_real_code("build a file search app", tmpdir)

            files = executor._list_created_files()
            assert "app.py" in files
            assert "USER_MANUAL.md" in files
            assert "__init__.py" in files
            # requirement.txt should NOT be listed (it's the input, not output)
            assert "requirement.txt" not in files
            assert "requirements.txt" not in files

    def test_verify_code_compiles(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            executor = ProjectExecutor(tmpdir)
            executor._write_real_code("build a file search app", tmpdir)

            result = executor._verify_code_compiles()
            assert result is not None
            assert "compiled OK" in result

    def test_run_app_briefly(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            executor = ProjectExecutor(tmpdir)
            executor._write_real_code("build a file search app", tmpdir)

            result = executor._run_app_briefly()
            assert result is not None
            assert "OK" in result


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
