"""File tools, jailed to the job root by :mod:`air_local.policy`."""
from __future__ import annotations

import os
import re
from pathlib import Path

from air_local import policy


def _error(exc: Exception) -> str:
    return f"ERROR: {exc}"


def read_file(path: str, max_chars: int = 20000) -> str:
    """Read a text file inside the job root."""
    try:
        p = policy.resolve(path, must_exist=True)
    except (PermissionError, FileNotFoundError) as exc:
        return _error(exc)
    if p.is_dir():
        return f"ERROR: {p} is a directory"
    text = p.read_text(encoding="utf-8", errors="replace")
    if len(text) > max_chars:
        text = text[:max_chars] + f"\n...[truncated, {len(text)} total chars]"
    return text


def write_file(path: str, content: str) -> str:
    """Overwrite a file inside the job root, creating parent directories."""
    try:
        p = policy.require_write(path)
    except PermissionError as exc:
        return _error(exc)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(content, encoding="utf-8")
    return f"Wrote {len(content)} chars to {p}"


def append_file(path: str, content: str) -> str:
    """Append to a file inside the job root, creating it when missing."""
    try:
        p = policy.require_write(path)
    except PermissionError as exc:
        return _error(exc)
    p.parent.mkdir(parents=True, exist_ok=True)
    with open(p, "a", encoding="utf-8") as f:
        f.write(content)
    return f"Appended {len(content)} chars to {p}"


def list_dir(path: str = ".") -> str:
    """List files and directories inside the job root."""
    try:
        p = policy.resolve(path, must_exist=True)
    except (PermissionError, FileNotFoundError) as exc:
        return _error(exc)
    if not p.is_dir():
        return f"ERROR: not a directory: {p}"
    entries = []
    for entry in sorted(p.iterdir()):
        kind = "dir" if entry.is_dir() else "file"
        size = "" if entry.is_dir() else f" ({entry.stat().st_size} bytes)"
        entries.append(f"{kind:4} {entry.name}{size}")
    return "\n".join(entries) if entries else "(empty)"


def search_files(pattern: str, path: str = ".", max_results: int = 50) -> str:
    """Search file contents by regex inside the job root."""
    try:
        p = policy.resolve(path, must_exist=True)
    except (PermissionError, FileNotFoundError) as exc:
        return _error(exc)
    try:
        regex = re.compile(pattern, re.IGNORECASE)
    except re.error as exc:
        return f"ERROR: invalid regex: {exc}"
    hits: list[str] = []
    for root, dirs, files in os.walk(p):
        dirs[:] = [d for d in dirs if d != ".git"]
        for fn in files:
            fp = Path(root) / fn
            try:
                text = fp.read_text(encoding="utf-8", errors="ignore")
            except Exception:
                continue
            for i, line in enumerate(text.splitlines(), 1):
                if regex.search(line):
                    hits.append(f"{fp}:{i}: {line.strip()[:200]}")
                    if len(hits) >= max_results:
                        return "\n".join(hits)
    return "\n".join(hits) if hits else "(no matches)"


def file_info(path: str) -> str:
    """Return metadata for a file or directory inside the job root."""
    try:
        p = policy.resolve(path, must_exist=True)
    except (PermissionError, FileNotFoundError) as exc:
        return _error(exc)
    st = p.stat()
    return f"path={p}\nsize={st.st_size} bytes\nis_dir={p.is_dir()}\nis_file={p.is_file()}"
