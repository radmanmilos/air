"""File tools (arms)."""
from __future__ import annotations

import os
import re
from pathlib import Path

from src.core.guardrails import is_protected

ROOT = Path(".").resolve()


def _safe(path: str) -> Path:
    p = (ROOT / path).resolve() if not Path(path).is_absolute() else Path(path).resolve()
    # allow reading anywhere but writes restricted to ROOT by default; here just resolve
    return p


def read_file(path: str, max_chars: int = 20000) -> str:
    p = _safe(path)
    if not p.exists():
        return f"ERROR: file not found: {p}"
    if p.is_dir():
        return f"ERROR: {p} is a directory"
    text = p.read_text(encoding="utf-8", errors="replace")
    if len(text) > max_chars:
        text = text[:max_chars] + f"\n...[truncated, {len(text)} total chars]"
    return text


def write_file(path: str, content: str, allow_protected: bool = False) -> str:
    if is_protected(path) and not allow_protected:
        return f"BLOCKED: '{path}' is a protected file. Refusing to overwrite."
    p = _safe(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(content, encoding="utf-8")
    return f"Wrote {len(content)} chars to {p}"


def append_file(path: str, content: str, allow_protected: bool = False) -> str:
    if is_protected(path) and not allow_protected:
        return f"BLOCKED: '{path}' is a protected file. Refusing to append."
    p = _safe(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    with open(p, "a", encoding="utf-8") as f:
        f.write(content)
    return f"Appended {len(content)} chars to {p}"


def list_dir(path: str = ".") -> str:
    p = _safe(path)
    if not p.exists():
        return f"ERROR: not found: {p}"
    if not p.is_dir():
        return f"ERROR: not a directory: {p}"
    entries = []
    for e in sorted(p.iterdir()):
        kind = "dir" if e.is_dir() else "file"
        size = "" if e.is_dir() else f" ({e.stat().st_size} bytes)"
        entries.append(f"{kind:4} {e.name}{size}")
    return "\n".join(entries) if entries else "(empty)"


def search_files(pattern: str, path: str = ".", max_results: int = 50) -> str:
    p = _safe(path)
    regex = re.compile(pattern, re.IGNORECASE)
    hits = []
    for root, _, files in os.walk(p):
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
    p = _safe(path)
    if not p.exists():
        return f"ERROR: not found: {p}"
    st = p.stat()
    return f"path={p}\nsize={st.st_size} bytes\nis_dir={p.is_dir()}\nis_file={p.is_file()}"
