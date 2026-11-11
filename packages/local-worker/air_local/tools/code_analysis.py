"""Code analysis tools â€” lint, complexity, security scanning for projects."""
from __future__ import annotations

import ast
import re
import subprocess
import sys
from pathlib import Path
from typing import Any

from air_local import policy
from air_local.tools.registry import Registry, Tool


def analyze_code(args: dict[str, Any]) -> str:
    """Analyze Python code for issues (lint, complexity, security).

    Parameters:
        path: File or folder path to analyze
    """
    path = args.get("path", "")
    if not path:
        return "ERROR: 'path' is required"

    try:
        p = policy.resolve(path, must_exist=True)
    except (PermissionError, FileNotFoundError) as exc:
        return f"ERROR: {exc}"

    results: list[str] = []

    targets: list[Path] = []
    if p.is_file():
        targets = [p]
    elif p.is_dir():
        targets = [f for f in p.rglob("*.py") if not f.name.startswith(".")]

    for fpath in targets:
        try:
            text = fpath.read_text(encoding="utf-8", errors="replace")
        except Exception as e:
            results.append(f"  {fpath}: ERROR reading file: {e}")
            continue

        issues: list[str] = []

        if "eval(" in text:
            issues.append("SECURITY: use of eval() detected")
        if "exec(" in text:
            issues.append("SECURITY: use of exec() detected")
        if "subprocess" in text and "shell=True" in text:
            issues.append("SECURITY: subprocess with shell=True detected")
        if "print(" in text and fpath.name != "__init__.py":
            issues.append("STYLE: print() used instead of logging")

        try:
            tree = ast.parse(text)
            max_depth = 0
            for node in ast.walk(tree):
                if isinstance(node, (ast.If, ast.For, ast.While, ast.Try, ast.With)):
                    max_depth += 1
            if max_depth > 10:
                issues.append(f"COMPLEXITY: high nesting depth (~{max_depth})")
        except SyntaxError as e:
            issues.append(f"SYNTAX ERROR: {e}")

        if issues:
            results.append(f"  {fpath}:")
            for issue in issues:
                results.append(f"    - {issue}")
        else:
            results.append(f"  {fpath}: OK")

    if not results:
        return "No Python files found to analyze."
    return "\n".join(results)


def check_dependencies(args: dict[str, Any]) -> str:
    """Check if required packages from requirements.txt are installed.

    Parameters:
        path: Path to requirements.txt or project folder
    """
    path = args.get("path", "requirements.txt")
    try:
        p = policy.resolve(path, must_exist=True)
    except (PermissionError, FileNotFoundError):
        try:
            p = policy.resolve(Path(path) / "requirements.txt", must_exist=True)
        except (PermissionError, FileNotFoundError):
            return f"ERROR: requirements.txt not found at {path}"

    try:
        text = p.read_text(encoding="utf-8", errors="replace")
    except Exception as e:
        return f"ERROR: cannot read {p}: {e}"

    packages: list[str] = []
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        pkg = re.split(r"[<>=!\[\]]", line)[0].strip()
        if pkg:
            packages.append(pkg)

    if not packages:
        return "No packages found in requirements.txt."

    missing: list[str] = []
    installed: list[str] = []

    import importlib
    for pkg in packages:
        try:
            importlib.import_module(pkg.replace("-", "_"))
            installed.append(pkg)
        except ImportError:
            missing.append(pkg)

    lines = [f"Checked {len(packages)} packages from {p}"]
    lines.append(f"  Installed: {len(installed)}")
    if missing:
        lines.append(f"  Missing: {len(missing)}")
        for m in missing:
            lines.append(f"    - {m}")
        lines.append("")
        lines.append("Install missing: pip install " + " ".join(missing))
    else:
        lines.append("  All packages installed!")

    return "\n".join(lines)


def install_packages(args: dict[str, Any]) -> str:
    """Install missing packages via pip.

    Parameters:
        path: Path to requirements.txt or folder containing it
        packages: Optional list of specific packages to install
    """
    path = args.get("path", "")
    packages = args.get("packages", [])

    if packages:
        cmd = [sys.executable, "-m", "pip", "install"] + packages
    elif path:
        p = Path(path)
        if p.is_dir():
            p = p / "requirements.txt"
        if not p.exists():
            return f"ERROR: requirements.txt not found at {path}"
        cmd = [sys.executable, "-m", "pip", "install", "-r", str(p)]
    else:
        return "ERROR: specify either 'path' or 'packages'"

    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
        out: list[str] = []
        if proc.stdout:
            out.append(proc.stdout[-4000:])
        if proc.stderr:
            out.append(proc.stderr[-2000:])
        out.append(f"EXIT CODE: {proc.returncode}")
        return "\n".join(out)
    except subprocess.TimeoutExpired:
        return "ERROR: pip install timed out after 300s"
    except Exception as e:
        return f"ERROR: {e}"


def count_lines(args: dict[str, Any]) -> str:
    """Count lines of code/text in a project folder.

    Parameters:
        path: Folder path to analyze
    """
    path = args.get("path", ".")
    try:
        p = policy.resolve(path, must_exist=True)
    except (PermissionError, FileNotFoundError) as exc:
        return f"ERROR: {exc}"

    total = 0
    by_ext: dict[str, int] = {}
    for f in p.rglob("*"):
        if not f.is_file() or f.name.startswith("."):
            continue
        if f.suffix.lower() in (".py", ".js", ".ts", ".md", ".txt", ".yaml", ".yml"):
            try:
                lines = f.read_text(encoding="utf-8", errors="replace").splitlines()
                n = len(lines)
                total += n
                by_ext[f.suffix.lower()] = by_ext.get(f.suffix.lower(), 0) + n
            except Exception:
                continue

    lines = [f"Total lines of code/text: {total}"]
    for ext, count in sorted(by_ext.items()):
        lines.append(f"  {ext}: {count}")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Registry registration
# ---------------------------------------------------------------------------

def register_tools(registry: Registry) -> None:
    registry.register(Tool(
        name="analyze_code",
        description="Analyze Python code for lint, complexity, and security issues.",
        parameters={
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "File or folder path to analyze"}
            },
            "required": ["path"]
        },
        func=analyze_code,
    ))
    registry.register(Tool(
        name="check_dependencies",
        description="Check if required packages from requirements.txt are installed.",
        parameters={
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Path to requirements.txt or project folder"}
            },
            "required": ["path"]
        },
        func=check_dependencies,
    ))
    registry.register(Tool(
        name="count_lines",
        description="Count lines of code/text in a project folder.",
        parameters={
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Folder path to analyze"}
            },
            "required": ["path"]
        },
        func=count_lines,
    ))
