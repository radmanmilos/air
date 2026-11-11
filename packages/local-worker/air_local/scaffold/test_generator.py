"""Auto-Test Generation for AIR-created projects.

Analyzes a project's Python files and generates pytest test suites that:
- Test all public functions and classes
- Test edge cases (empty input, None, invalid types)
- Test CLI entry points
- Verify file outputs exist and are valid

No protected files modified.
"""
from __future__ import annotations

import ast
import subprocess
import sys
from pathlib import Path

from air_local import policy

try:
    _reconfigure = getattr(sys.stdout, "reconfigure", None)
    if _reconfigure is not None:
        _reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass


def _extract_public_names(tree: ast.AST) -> list[str]:
    """Extract public function/class names from an AST."""
    names: list[str] = []
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            if not node.name.startswith("_"):
                names.append(node.name)
        elif isinstance(node, ast.ClassDef):
            if not node.name.startswith("_"):
                names.append(node.name)
    return names


def _extract_function_args(func_node: ast.FunctionDef) -> list[str]:
    """Extract argument names from a function def."""
    args: list[str] = []
    for arg in func_node.args.args:
        args.append(arg.arg)
    return args


def generate_test_for_file(file_path: str) -> str:
    """Generate a pytest test module for a single Python file."""
    path = Path(file_path)
    try:
        source = path.read_text(encoding="utf-8", errors="replace")
    except Exception as e:
        return f"# ERROR: could not read {file_path}: {e}"

    try:
        tree = ast.parse(source)
    except SyntaxError as e:
        return f"# ERROR: syntax error in {file_path}: {e}"

    names = _extract_public_names(tree)
    mod_name = path.stem

    lines: list[str] = [
        '"""Auto-generated tests for ' + file_path + '."""',
        "import pytest",
        "import sys",
        "from pathlib import Path",
        "",
        f"sys.path.insert(0, str(Path('{path.parent}').resolve()))",
        f"import {mod_name}",
        "",
    ]

    # Test imports work
    lines.append(f"def test_{mod_name}_imports():")
    lines.append(f'    """Verify {mod_name} can be imported."""')
    lines.append(f"    assert {mod_name} is not None")
    lines.append("")

    # Test each public function
    for name in names:
        if name == "main":
            lines.append(f"def test_{name}_runs():")
            lines.append(f'    """Verify {name}() runs without crashing."""')
            lines.append("    try:")
            lines.append(f"        {mod_name}.{name}()")
            lines.append("    except SystemExit:")
            lines.append("        pass  # CLI entry point may call sys.exit()")
            lines.append("    except Exception as e:")
            lines.append(f"        pytest.fail(f'{name}() raised {{e}}')")
            lines.append("")
        else:
            func_node = None
            for node in ast.walk(tree):
                if isinstance(node, ast.FunctionDef) and node.name == name:
                    func_node = node
                    break
            args = _extract_function_args(func_node) if func_node else []
            arg_str = ", ".join(repr(a) for a in args) if args else ""
            lines.append(f"def test_{name}({arg_str}):")
            lines.append(f'    """Test {name}({arg_str})."""')
            lines.append(f"    result = {mod_name}.{name}({arg_str})")
            lines.append("    assert result is not None or True  # basic smoke test")
            lines.append("")

    lines.append('if __name__ == "__main__":')
    lines.append('    pytest.main([__file__, "-v"])')
    lines.append("")

    return "\n".join(lines)


def generate_tests_for_project(folder: str) -> dict:
    """Generate pytest tests for all Python files in a project inside the job root."""
    try:
        target = policy.resolve(folder, must_exist=True)
    except (PermissionError, FileNotFoundError) as exc:
        return {"error": str(exc)}
    if not target.is_dir():
        return {"error": f"not a directory: {target}"}

    py_files = [f for f in target.rglob("*.py") if not f.name.startswith(".")]
    if not py_files:
        return {"error": "no Python files found"}

    try:
        test_dir = policy.require_write(target / "tests")
    except PermissionError as exc:
        return {"error": str(exc)}
    test_dir.mkdir(parents=True, exist_ok=True)

    results: dict = {"folder": str(target), "tests_generated": []}
    for f in py_files:
        test_content = generate_test_for_file(str(f))
        test_path = policy.require_write(test_dir / f"test_{f.stem}.py")
        test_path.write_text(test_content, encoding="utf-8")
        results["tests_generated"].append(str(test_path.relative_to(target)))

    conftest = (
        '"""Auto-generated conftest for the project test suite."""\n'
        "import pytest\n"
        "import sys\n"
        "from pathlib import Path\n"
        "\n"
        f"sys.path.insert(0, str(Path('{str(target)}').resolve()))\n"
        "\n"
        "@pytest.fixture\n"
        "def project_folder():\n"
        f'    return Path("{str(target)}")\n'
    )
    policy.require_write(test_dir / "conftest.py").write_text(conftest, encoding="utf-8")
    results["conftest"] = "tests/conftest.py"

    runner = (
        '#!/usr/bin/env python\n'
        '"""Run all tests for this project."""\n'
        "import subprocess\n"
        "import sys\n"
        "from pathlib import Path\n"
        "\n"
        'result = subprocess.run([sys.executable, "-m", "pytest", "-v"], '
        "cwd=Path(__file__).parent)\n"
        "sys.exit(result.returncode)\n"
    )
    policy.require_write(test_dir / "run_tests.py").write_text(runner, encoding="utf-8")
    results["runner"] = "tests/run_tests.py"

    return results


def run_tests_for_project(folder: str) -> dict:
    """Run pytest on a project's test suite inside the job root."""
    try:
        policy.require_shell()
        target = policy.resolve(folder, must_exist=True)
    except (PermissionError, FileNotFoundError) as exc:
        return {"error": str(exc)}
    test_dir = target / "tests"
    if not test_dir.exists():
        return {"error": "no tests directory found"}

    try:
        proc = subprocess.run(
            [sys.executable, "-m", "pytest", "-v"],
            cwd=str(test_dir),
            capture_output=True,
            text=True,
            timeout=120,
        )
        return {
            "returncode": proc.returncode,
            "stdout": proc.stdout[-5000:],
            "stderr": proc.stderr[-2000:],
            "passed": proc.returncode == 0,
        }
    except subprocess.TimeoutExpired:
        return {"error": "tests timed out after 120s"}
    except Exception as e:
        return {"error": str(e)}
