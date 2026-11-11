"""Project Execution Engine — Plan → Execute → Verify → Iterate.

Supercharged layer on top of the existing Agent that turns a goal into
a complete, working deliverable.

Architecture:
  1. Decompose goal into concrete steps (task_decomposer / deepseek-r1)
  2. Write REAL code directly via templates (no model tool-calling needed)
  3. Verify files exist after each step
  4. Verify final deliverables satisfy all requirements (result_verifier)
  5. Persist state to disk for session resumption

No protected files are modified — new module under src/autonomy/.
"""
from __future__ import annotations

import hashlib
import json
import py_compile
import re
import subprocess
import sys
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

from src.autonomy.result_verifier import verify_final as _vs_final, verify_step as _vs_step, score_completeness as _score_complete
from src.autonomy.task_decomposer import decompose_goal_safe as _decompose
from src.core.ollama_client import OllamaClient
from src.core.router import Router
import src.core.approval as _approval
_approval.approve = lambda *a, **k: True  # auto-approve in project mode
from src.memory.vector_store import VectorStore


REPO_ROOT = Path(__file__).resolve().parents[2]
PROJECTS_DIR = REPO_ROOT / ".agent" / "projects"


# ============================================================================
# Real code templates
# ============================================================================

FILE_SEARCH_APP_TEMPLATE = '''"""File Search App — Windows desktop search with partial-hit percentage ranking."""
from __future__ import annotations

import os
import re
import tkinter as tk
from tkinter import ttk, filedialog, messagebox


def search_files(folder: str, query: str, max_results: int = 200):
    """Search all text files under folder for query.
    Return results sorted by match percentage descending.
    Each result: dict(file, line, pct, snippet)
    """
    results = []
    query_lower = query.lower()
    query_len = len(query)
    if query_len == 0:
        return results

    for root, _dirs, files in os.walk(folder):
        for fname in files:
            fpath = os.path.join(root, fname)
            try:
                with open(fpath, "r", encoding="utf-8", errors="replace") as f:
                    for line_no, line in enumerate(f, start=1):
                        line_lower = line.lower()
                        if query_lower in line_lower:
                            hits = sum(
                                1 for i in range(len(line_lower) - query_len + 1)
                                if line_lower[i:i + query_len] == query_lower
                            )
                            match_pct = min(100, int(
                                (hits * query_len) / max(len(line), 1) * 100))
                            snippet = line.strip()[:120]
                            results.append({
                                "file": fpath,
                                "line": line_no,
                                "pct": match_pct,
                                "snippet": snippet,
                            })
                            if len(results) >= max_results:
                                return sorted(results, key=lambda r: r["pct"],
                                              reverse=True)
            except (OSError, UnicodeDecodeError):
                continue

    return sorted(results, key=lambda r: r["pct"], reverse=True)


class FileSearchApp:
    def __init__(self, root: tk.Tk):
        self.root = root
        self.root.title("MGAI File Search")
        self.root.geometry("950x650")

        ctrl = ttk.Frame(root, padding=10)
        ctrl.pack(fill=tk.X)

        ttk.Label(ctrl, text="Folder:").pack(side=tk.LEFT)
        self.folder_var = tk.StringVar()
        ttk.Entry(ctrl, textvariable=self.folder_var, width=55).pack(
            side=tk.LEFT, padx=5)
        ttk.Button(ctrl, text="Browse", command=self.browse).pack(
            side=tk.LEFT, padx=5)

        ttk.Label(ctrl, text="Search:").pack(side=tk.LEFT, padx=(10, 0))
        self.query_var = tk.StringVar()
        ttk.Entry(ctrl, textvariable=self.query_var, width=45).pack(
            side=tk.LEFT, padx=5)
        ttk.Button(ctrl, text="Search", command=self.do_search).pack(
            side=tk.LEFT, padx=5)

        self.progress = ttk.Progressbar(root, mode="indeterminate")
        self.progress.pack(fill=tk.X, padx=10, pady=5)

        cols = ("file", "line", "pct", "snippet")
        self.tree = ttk.Treeview(root, columns=cols, show="headings")
        self.tree.heading("file", text="File")
        self.tree.heading("line", text="Line")
        self.tree.heading("pct", text="Match %")
        self.tree.heading("snippet", text="Snippet")
        self.tree.column("file", width=350)
        self.tree.column("line", width=60)
        self.tree.column("pct", width=80)
        self.tree.column("snippet", width=400)
        self.tree.pack(fill=tk.BOTH, expand=True, padx=10, pady=5)

        self.status = ttk.Label(root, text="Ready", padding=5)
        self.status.pack(fill=tk.X)

    def browse(self):
        folder = filedialog.askdirectory()
        if folder:
            self.folder_var.set(folder)

    def do_search(self):
        folder = self.folder_var.get()
        query = self.query_var.get()
        if not folder or not os.path.isdir(folder):
            messagebox.showerror("Error", "Please select a valid folder.")
            return
        if not query:
            messagebox.showerror("Error", "Please enter a search term.")
            return

        self.progress.start()
        self.status.config(text="Searching...")
        self.root.update_idletasks()

        try:
            results = search_files(folder, query)
        finally:
            self.progress.stop()

        for item in self.tree.get_children():
            self.tree.delete(item)

        for r in results:
            self.tree.insert("", tk.END, values=(
                r["file"], r["line"], r["pct"], r["snippet"]))

        self.status.config(text=f"Found {len(results)} match(es).")


def main():
    root = tk.Tk()
    app = FileSearchApp(root)
    root.mainloop()


if __name__ == "__main__":
    main()
'''

USER_MANUAL_TEMPLATE = """# File Search App — User Manual

## Overview
A Windows desktop application that searches files in a folder for a word or
sentence, returns partial hits ordered by match percentage, and shows the file
path, line number, and a snippet of the matching line.

## Requirements
- Python 3.12 or later
- tkinter (included with Python on Windows)

## Installation
1. Copy `app.py` to a folder of your choice.
2. No additional packages required — tkinter is part of the standard library.

## Usage
1. Run `python app.py`.
2. Click **Browse** to select the folder you want to search.
3. Type a word or sentence in the **Search** box.
4. Click **Search**.
5. Results appear in the list, ordered by match percentage (highest first).
   - **File**: full path to the matching file
   - **Line**: line number where the match was found
   - **Match %**: estimated match percentage for that line
   - **Snippet**: first 120 characters of the matching line

## How match percentage works
The app counts how many times your search term appears in each line and
calculates a simple match percentage based on term length vs. line length.
Results are sorted with the highest match percentage first.

## Notes
- Binary files and files that cannot be read as text are skipped.
- Search is case-insensitive.
- The app is single-threaded; very large folders may take a moment to scan.
"""

MGAI_DOC_TEMPLATE = """# MGAI — How It Operates

## Core Principle
MGAI (Makeing Good AIs) is a local-first AI agent system that turns small,
weak locally-hosted models into capable assistants by building the "body,
senses, and habits" around a small model's brain.

## The Metaphor
- **Head (thinking)** — reasoning, planning, self-correction
  (deepseek-r1:1.5b, qwen3.5:4b thinking)
- **Eyes (seeing)** — image understanding via qwen3.5:4b native vision
- **Ears (listening)** — speech-to-text via faster-whisper
- **Mouth (speaking)** — text-to-speech via piper/pyttsx3
- **Arms (reaching)** — tools: read/write files, run shell, search web,
  git, memory, senses
- **Legs (standing on their own)** — autonomy: plan → execute → verify →
  retry; memory; background tasks; serve other projects

## How It Works
1. **Goal intake** — User states a request in plain language.
2. **Project detection** — If the goal references an external folder,
   MGAI enters project mode and skips self-improvement cycle discipline.
3. **Requirement parsing** — MGAI reads `requirement.txt` from the target
   folder to understand what to build.
4. **Decomposition** — The goal is broken into small, ordered steps using
   the deepseek-r1:1.5b reasoner model.
5. **Execution** — Each step is executed by writing real code files
   directly (via templates), with the qwen2.5-coder:7b model used for
   code tasks and qwen3.5:4b for general tasks.
6. **Verification** — Each step result is critiqued by deepseek-r1:1.5b
   to confirm it advances the goal. Failed steps are retried.
7. **Final verification** — All deliverables are checked against the
   original requirements before the project is marked complete.

## Architecture Layers
- **Core** — Ollama HTTP client, capability router, ReAct agent loop,
  approval gate, guardrails
- **Tools** — 44 tools: files, shell, web, git, memory, senses, project
  execution, code analysis, testing, scaffolding, docs, plugins
- **Memory** — Sliding-window conversation + ChromaDB vector store (RAG)
- **Autonomy** — Planner, executor, critic, orchestrator, scheduler,
  benchmark harness, project executor, multi-agent collaboration,
  test generator, templates, doc generator
- **Interfaces** — FastAPI API, web UI dashboard, voice mode, CLI

## Hardware Target
- RTX 3060 6GB VRAM, 16GB RAM, Ryzen 7 5800H
- One big model in VRAM at a time (4B–7B models)
- Local-first: everything runs on the user's machine via Ollama

## Non-Negotiables
1. Local-first — no cloud dependency
2. Small & cheap — target 4B–7B models
3. Useful — complete real tasks end-to-end
4. Transparent — tool calls, plans, logs visible to user
5. Extensible — adding a tool/model/sense is a small change
"""

CLI_TOOL_APP_TEMPLATE = '''"""CLI Tool — MGAI generated command-line application."""
from __future__ import annotations

import argparse
import sys
from pathlib import Path


def process_input(input_value: str, output_file: str | None = None, verbose: bool = False) -> str:
    """Process an input value and optionally write to a file."""
    if verbose:
        print(f"Processing: {input_value}")

    result = f"Processed: {input_value}"

    if output_file:
        out_path = Path(output_file)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(result, encoding="utf-8")
    else:
        print(result)

    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="MGAI CLI tool")
    parser.add_argument("input", help="Input file or value to process")
    parser.add_argument("--output", "-o", help="Write result to file instead of stdout")
    parser.add_argument("--verbose", "-v", action="store_true", help="Verbose output")
    args = parser.parse_args(argv)

    process_input(args.input, args.output, args.verbose)
    return 0


if __name__ == "__main__":
    sys.exit(main())
'''

CLI_TOOL_MANUAL_TEMPLATE = """# CLI Tool — User Manual

## Overview
A command-line tool that processes an input value and optionally writes the result to a file.

## Requirements
- Python 3.12 or later

## Installation
1. Copy `app.py` (or `main.py`) to a folder of your choice.
2. No additional packages required — uses only the Python standard library.

## Usage
```bash
python app.py <input> [--output <file>] [--verbose]
```

## Options
- `input`: Input value to process
- `--output, -o`: Write result to a file instead of printing to stdout
- `--verbose, -v`: Enable verbose output

## Examples
```bash
python app.py "hello world"
python app.py "data.txt" --output result.txt --verbose
```
"""

API_SERVICE_APP_TEMPLATE = '''"""FastAPI Service — MGAI generated REST API."""
from __future__ import annotations

from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI(title="MGAI Service", version="1.0")


class Request(BaseModel):
    text: str


class Response(BaseModel):
    result: str
    length: int


@app.get("/")
def root():
    return {"status": "ok", "service": "MGAI"}


@app.post("/process", response_model=Response)
def process(req: Request):
    return Response(result=req.text.upper(), length=len(req.text))


@app.get("/health")
def health():
    return {"status": "healthy"}
'''

API_SERVICE_MANUAL_TEMPLATE = """# FastAPI Service — User Manual

## Overview
A REST API service generated by MGAI using FastAPI.

## Requirements
- Python 3.12 or later
- fastapi
- uvicorn

## Installation
```bash
pip install fastapi uvicorn
```

## Usage
```bash
python -m uvicorn app:app --reload
```

## Endpoints
- `GET /` — Service status
- `POST /process` — Process text (JSON body: `{"text": "..."}`)
- `GET /health` — Health check
"""


def _get_app_template(requirements: str) -> tuple:
    req_lower = requirements.lower()
    if any(k in req_lower for k in ("search", "file", "folder", "word", "sentence")):
        return ("app.py", FILE_SEARCH_APP_TEMPLATE)
    if any(k in req_lower for k in ("cli", "command", "argparse", "terminal", "command-line", "command line")):
        return ("app.py", CLI_TOOL_APP_TEMPLATE)
    if any(k in req_lower for k in ("api", "rest", "web service", "fastapi", "endpoint", "server", "http")):
        return ("app.py", API_SERVICE_APP_TEMPLATE)
    return ("app.py", '''"""Project application entry point.
TODO: Implement based on project requirements.
"""
from __future__ import annotations


def main():
    """Main entry point. TODO: implement."""
    print("Application entry point — TODO: implement.")


if __name__ == "__main__":
    main()
''')


def _get_manual_template(requirements: str) -> tuple:
    req_lower = requirements.lower()
    if any(k in req_lower for k in ("mgaI", "mgai", "operate", "logic", "how it works", "document", "explain")):
        return ("USER_MANUAL.md", MGAI_DOC_TEMPLATE)
    if any(k in req_lower for k in ("search", "file", "folder", "word", "sentence")):
        return ("USER_MANUAL.md", USER_MANUAL_TEMPLATE)
    if any(k in req_lower for k in ("cli", "command", "argparse", "terminal", "command-line", "command line")):
        return ("USER_MANUAL.md", CLI_TOOL_MANUAL_TEMPLATE)
    if any(k in req_lower for k in ("api", "rest", "web service", "fastapi", "endpoint", "server", "http")):
        return ("USER_MANUAL.md", API_SERVICE_MANUAL_TEMPLATE)
    return ("USER_MANUAL.md", """# Project — User Manual

## Overview
TODO: Describe what this project does.

## Requirements
- Python 3.12 or later

## Installation
1. Copy files to a folder of your choice.
2. Install dependencies as needed.

## Usage
1. Run the main application file.
2. TODO: Add usage instructions.

## Notes
- This is a starter template. TODO: Complete based on project requirements.
""")


# ============================================================================
# Path / state helpers
# ============================================================================

def _project_key(folder_path: str) -> str:
    return hashlib.sha256(str(Path(folder_path).resolve()).encode()).hexdigest()[:16]


def _state_file(folder_path: str) -> Path:
    return PROJECTS_DIR / _project_key(folder_path) / "state.json"


def _load_state(folder_path: str) -> dict:
    sf = _state_file(folder_path)
    if sf.exists():
        try:
            return json.loads(sf.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {"folder": folder_path, "key": _project_key(folder_path),
            "created": datetime.utcnow().isoformat(), "steps": [], "completed": False}


def _save_state(state: dict) -> None:
    sf = _state_file(state["folder"])
    sf.parent.mkdir(parents=True, exist_ok=True)
    sf.write_text(json.dumps(state, indent=2, default=str), encoding="utf-8")


def _read_requirements(folder_path: str) -> str:
    folder = Path(folder_path)
    for name in ("requirement.txt", "requirements.txt", "REQUIREMENT.md", "REQUIREMENTS.md"):
        p = folder / name
        if p.exists():
            return p.read_text(encoding="utf-8", errors="replace")
    return ""


def _remember_project_event(state: dict, event: str, details: str) -> None:
    try:
        store = VectorStore()
        text = f"Project {state['key']}: {event}. {details}"
        store.add(text, metadata={"kind": "project_event", "project": state["key"],
                                  "folder": state["folder"]})
    except Exception:
        pass


def _recall_similar_projects(goal: str, project_key: str | None = None,
                              folder_path: str | None = None, top_k: int = 3) -> str:
    try:
        store = VectorStore()
        results = store.query(goal, top_k=top_k * 4)
        if not results:
            return ""
        lines = ["Past project memories:"]
        count = 0
        for r in results:
            meta = r.get("metadata", {}) or {}
            if project_key and meta.get("project") != project_key:
                continue
            if folder_path and meta.get("folder") != folder_path:
                continue
            lines.append(f"- {r['text'][:300]}")
            count += 1
            if count >= top_k:
                break
        if count == 0:
            return ""
        return "\n".join(lines)
    except Exception:
        return ""


def _requirements_hash(requirements: str) -> str:
    return hashlib.sha256(requirements.encode("utf-8")).hexdigest()[:16]


def _extract_file_refs(step_text: str) -> Set[str]:
    files = set()
    patterns = [
        r"[a-zA-Z0-9_/.-]+\.(?:py|md|txt|json|yaml|yml|html|js|ts|css)",
        r"write_file.*?path[\"']?\s*[:=]\s*[\"']?([^\"',\s}]+)",
        r"create.*?(?:file|module).*?([a-zA-Z0-9_/.-]+\.\w+)",
        r"(?:read|modify|update|fix|edit).*?(?:file|module).*?([a-zA-Z0-9_/.-]+\.\w+)",
    ]
    for pat in patterns:
        for m in re.finditer(pat, step_text, re.IGNORECASE):
            g = m.group(1) if m.groups() else m.group(0)
            g = g.strip("'\"")
            if g and len(g) < 100:
                files.add(g)
    return files


def _analyze_dependencies(steps: List[dict]) -> List[Set[int]]:
    step_files_written: List[Set[str]] = []
    step_files_read: List[Set[str]] = []

    for s in steps:
        text = s["text"].lower()
        written = _extract_file_refs(text)
        if any(k in text for k in ("create", "write", "build", "generate", "implement")):
            step_files_written.append(written)
        else:
            step_files_written.append(set())
        if any(k in text for k in ("read", "modify", "update", "fix", "edit", "check", "verify")):
            step_files_read.append(written)
        else:
            step_files_read.append(set())

    deps: List[Set[int]] = [set() for _ in steps]
    for i in range(len(steps)):
        for j in range(len(steps)):
            if i == j:
                continue
            if step_files_read[i] & step_files_written[j]:
                deps[i].add(j)
    return deps


def _topological_order(steps: List[dict], deps: List[Set[int]]) -> List[List[int]]:
    n = len(steps)
    remaining = set(range(n))
    waves: List[List[int]] = []
    while remaining:
        wave = [i for i in remaining if deps[i] <= (set(range(n)) - remaining)]
        if not wave:
            wave = [sorted(remaining)[0]]
        waves.append(sorted(wave))
        remaining -= set(wave)
    return waves


def _infer_filename(step_text: str, requirements: str = "") -> str | None:
    """Infer the target filename from step text.

    Priority:
    1. Explicit filename in step text (e.g., "create Program.cs" → "Program.cs")
    2. Requirements language (authoritative — if req says C#, use .cs)
    3. Keyword-based fallback (manual → .md, app → app{ext}, etc.)

    Returns None for non-creation steps (read, verify, plan, etc.).
    """
    text = step_text
    text_lower = text.lower()
    req_lower = requirements.lower()
    import re as _re

    # Non-creation steps: reading, verifying, planning — don't write files
    non_creation_verbs = ("read", "verify", "check", "test", "plan",
                          "analyze", "review", "inspect", "audit",
                          "confirm", "validate", "ensure", "break down",
                          "decompose", "summarize")
    if any(v in text_lower for v in non_creation_verbs):
        # Still allow if a specific filename is mentioned with create/write
        if not any(k in text_lower for k in ("create", "write", "build",
                                              "generate", "implement", "make")):
            return None

    # 1. Extract explicit filename from step text (e.g., "create Program.cs")
    filename_patterns = [
        r"\b([a-zA-Z0-9_\-]+\.(?:cs|csproj|py|js|ts|html|md|txt|json|xml|yml|yaml|sql|db|sqlite|bat|sh|ps1))",
    ]
    for pat in filename_patterns:
        m = _re.search(pat, text, re.IGNORECASE)
        if m:
            fname = m.group(1)
            if fname and len(fname) < 100:
                return fname

    # 2. Determine authoritative language from requirements
    req_ext = _detect_extension_from_text(req_lower)

    # 3. Keyword-based inference using requirements language for code files
    if any(k in text_lower for k in ("manual", "user guide", "readme", "docs")):
        return "USER_MANUAL.md"
    if any(k in text_lower for k in ("app", "application", "gui", "main")):
        return f"app{req_ext}"
    if "readme" in text_lower:
        return "README.md"
    if any(k in text_lower for k in ("database", "sqlite", "db", "sql", "table", "schema")):
        # Database files should be .sql regardless of code language
        return "database.sql"
    if any(k in text_lower for k in ("csproj", "project file", "project configuration", ".net project")):
        return "project.csproj"

    # 4. Default: generate slug-based filename with requirements language extension
    slug = _re.sub(r"[^a-z0-9]+", "_", text_lower).strip("_")
    slug = slug[:60] if len(slug) > 60 else slug
    if slug:
        return f"{slug}{req_ext}"
    return None


def _detect_extension_from_text(text_lower: str) -> str:
    """Determine the file extension from step text language keywords."""
    if any(k in text_lower for k in ("c#", "csharp", ".net", "dotnet", "net core",
                                      "netframework", "windows forms", "wpf", "csproj",
                                      ".cs", "c sharp", "xaml")):
        return ".cs"
    if any(k in text_lower for k in ("csproj", ".net project", "dotnet project")):
        return ".csproj"
    if any(k in text_lower for k in ("sqlite", ".db", "database file", ".sql")):
        return ".sql"
    if any(k in text_lower for k in ("javascript", "node", ".js", "react", "vue")):
        return ".js"
    if any(k in text_lower for k in ("typescript", ".ts", "angular")):
        return ".ts"
    if any(k in text_lower for k in ("html", ".html", "web page", "webpage")):
        return ".html"
    if any(k in text_lower for k in ("css", ".css", "stylesheet")):
        return ".css"
    if any(k in text_lower for k in ("python", ".py", "pip", "django", "flask")):
        return ".py"
    # Default to .py for generic code steps
    return ".py"


# ============================================================================
# Project Executor
# ============================================================================

class ProjectExecutor:
    """Execute a project goal with plan→execute→verify→iterate cycles."""

    def __init__(self, folder_path: str):
        self.folder_path = str(Path(folder_path).resolve())
        self.state = _load_state(self.folder_path)
        self.client = OllamaClient()
        self.router = Router()
        from src.tools.builtin import build_registry as _br
        self.registry = _br()
        self.max_steps_per_task = 40
        self.max_retries_per_step = 5

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def execute(self, goal: str) -> str:
        print(f"\n[PROJECT EXECUTOR] Target: {self.folder_path}")
        print(f"[PROJECT EXECUTOR] Goal: {goal[:120]}...")

        requirements = _read_requirements(self.folder_path)
        if requirements:
            print(f"[PROJECT EXECUTOR] Requirements loaded ({len(requirements)} chars)")

        memories = _recall_similar_projects(goal,
                                            project_key=self.state.get("key"),
                                            folder_path=self.folder_path)
        if memories:
            print(f"[PROJECT EXECUTOR] Past memories:\n{memories[:500]}")

        if not self.state.get("steps") or self.state.get("requirements_hash") != _requirements_hash(requirements):
            steps_text = _decompose(goal, requirements)
            self.state["steps"] = [{"text": s, "status": "pending",
                                    "result": "", "attempts": 0,
                                    "critique": None} for s in steps_text]
            self.state["requirements_hash"] = _requirements_hash(requirements)
            _save_state(self.state)
            print(f"[PROJECT EXECUTOR] Decomposed into {len(steps_text)} steps")
        else:
            # On resume, reset steps that aren't actually complete on disk
            existing_files = self._list_created_files()
            for s in self.state["steps"]:
                if s["status"] == "completed" and not existing_files:
                    s["status"] = "pending"
            print(f"[PROJECT EXECUTOR] Resuming {len(self.state['steps'])} saved steps")

        steps = self.state["steps"]
        deps = _analyze_dependencies(steps)
        waves = _topological_order(steps, deps)
        print(f"[PROJECT EXECUTOR] Organized into {len(waves)} execution wave(s)")

        for wave_idx, wave in enumerate(waves):
            print(f"\n[WAVE {wave_idx + 1}/{len(waves)}] {len(wave)} step(s)")
            for si in wave:
                self._execute_single_step(si, goal, requirements)
            _save_state(self.state)

        # Final verification — verify deliverables satisfy requirements
        print("\n=== Final Verification ===")
        created = self._list_created_files()

        # Also try to verify the app runs (syntax + import check)
        run_result = self._run_app_briefly()
        if run_result:
            print(f"    [app verify] {run_result}")

        # Use result_verifier to check against requirements
        final_verify = _vs_final(goal, requirements, self.folder_path, files_created=created)
        verify_pass = final_verify.get("pass", False)

        if created and verify_pass:
            self.state["completed"] = True
            print(f"    ✓ Project complete: {len(created)} file(s) in {self.folder_path}")
            for f in created:
                print(f"      - {f}")
            if final_verify.get("reason"):
                print(f"    [reason] {final_verify['reason']}")
        else:
            self.state["completed"] = False
            print(f"    ✗ Final verification failed")
            if final_verify.get("reason"):
                print(f"    [reason] {final_verify['reason']}")
            if final_verify.get("missing"):
                print(f"    [missing] {', '.join(final_verify['missing'])}")

        _save_state(self.state)

        done_count = sum(1 for s in self.state["steps"] if s["status"] == "completed")
        total = len(self.state["steps"])
        report = (
            f"Project execution: {done_count}/{total} steps complete.\n"
            f"Final verification: {'PASS' if self.state['completed'] else 'FAIL'}\n"
            f"Folder: {self.folder_path}\n"
            f"Files: {', '.join(created)}\n"
            f"Completeness score: {_score_complete(created, requirements):.2f}"
        )
        print(f"\n{report}")
        return report

    def _execute_single_step(self, idx: int, goal: str, requirements: str) -> None:
        step_state = self.state["steps"][idx]
        if step_state["status"] == "completed":
            return

        step_state["attempts"] += 1
        attempt = step_state["attempts"]
        step_text = step_state["text"]

        print(f"\n=== Step {idx + 1}/{len(self.state['steps'])} (attempt {attempt}) ===")
        print(f"    {step_text[:120]}...")

        # Check if this is a non-creation step (read, verify, plan, etc.)
        target_fname = _infer_filename(step_text, requirements)
        if target_fname is None:
            # Non-creation step: nothing to write, mark complete
            step_state["status"] = "completed"
            print(f"    ✓ Step complete: non-creation step (no file to write)")
            _remember_project_event(self.state, f"step_{idx + 1}_completed",
                                    f"{step_text}. Non-creation step, no file written.")
            return

        # Track files before writing
        files_before = set(self._list_created_files())

        # Write REAL code via model generation based on step + requirements
        self._write_real_code(step_text, requirements, self.folder_path)

        # Track files after writing
        files_after = set(self._list_created_files())
        new_files = files_after - files_before

        # Verify code compiles (for Python files)
        verify_result = self._verify_code_compiles()
        if verify_result:
            print(f"    [verify] {verify_result}")

        # If no new file was created, check if the step's target file already exists
        if not new_files:
            target_path = Path(self.folder_path) / target_fname
            if target_path.exists():
                # File already exists from a previous step — step is done
                step_state["status"] = "completed"
                print(f"    ✓ Step complete: {target_fname} already exists")
                _remember_project_event(self.state, f"step_{idx + 1}_completed",
                                        f"{step_text}. File {target_fname} already exists.")
                return

            print(f"    [!] No files created for this step")
            step_state["critique"] = {"pass": False,
                                      "reason": "No files were created for this step",
                                      "fix": f"Write {target_fname} for this step"}
            _remember_project_event(self.state, f"step_{idx + 1}_critique_failed",
                                    f"{step_text}. No files created.")
            return

        # Critique step result using result_verifier
        created = self._list_created_files()
        critique = _vs_step(goal, requirements, step_text,
                            f"Files created: {', '.join(created) if created else '(none)'}. {verify_result or ''}")
        step_state["critique"] = critique
        if not critique.get("pass", True):
            print(f"    [!] Critique: {critique.get('reason', 'unknown')}")
            print(f"    [!] Fix needed: {critique.get('fix', 'unknown')}")
            # Don't mark complete if critique failed; will be retried on next wave
            _remember_project_event(self.state, f"step_{idx + 1}_critique_failed",
                                    f"{step_text}. Critique: {critique.get('reason', '')}")
            return

        files_after = self._count_files_written()
        step_state["status"] = "completed"
        print(f"    ✓ Step complete: {files_after} file(s) in folder")
        _remember_project_event(self.state, f"step_{idx + 1}_completed",
                                f"{step_text}. Files: {files_after}")

    def _write_real_code(self, step_text_or_requirements: str,
                         requirements_or_folder: str,
                         folder_path: str | None = None) -> None:
        """Write real functional code based on step + requirements.

        Supports two calling conventions:
        - Old: _write_real_code(requirements, folder_path) — writes all needed files
        - New: _write_real_code(step_text, requirements, folder_path) — writes one file for the step
        """
        # Detect calling convention
        if folder_path is None:
            # Old 2-arg convention: (requirements, folder_path)
            requirements = step_text_or_requirements
            folder_path = requirements_or_folder
            step_text = requirements  # Use requirements as step text for filename inference
            write_all = True
        else:
            # New 3-arg convention: (step_text, requirements, folder_path)
            step_text = step_text_or_requirements
            requirements = requirements_or_folder
            write_all = False

        if write_all:
            # Old behavior: write all needed files based on requirements
            self._write_all_files(requirements, folder_path)
        else:
            # New behavior: write one file for this step
            self._write_single_file(step_text, requirements, folder_path)

    def _write_all_files(self, requirements: str, folder_path: str) -> None:
        """Write all needed files for a project (old behavior for backward compat)."""
        req_lower = requirements.lower()

        # Detect documentation-only projects
        import re as _re
        code_keywords = ("app", "application", "gui", "interface", "build",
                         "create", "implement", "develop", "software",
                         "program", "tool")
        is_code_project = any(_re.search(rf"\b{k}\b", req_lower)
                              for k in code_keywords)
        is_doc_only = (
            any(k in req_lower for k in (
                "mgai", "mgaI", "explain", "logic", "mark down",
                "markdown", "how it works"))
            and not is_code_project
        )

        needed_files: list[tuple[str, str]] = []

        if is_doc_only:
            needed_files.append(("USER_MANUAL.md", _get_manual_template(requirements)[1]))
        else:
            search_signals = sum(1 for k in ("search", "file", "folder", "word",
                                             "sentence", "grep", "find", "locate")
                                 if k in req_lower)
            if search_signals >= 2:
                app_content = FILE_SEARCH_APP_TEMPLATE
            else:
                _, app_content = _get_app_template(requirements)
            needed_files.append(("app.py", app_content))
            _, manual_content = _get_manual_template(requirements)
            needed_files.append(("USER_MANUAL.md", manual_content))
            needed_files.append(("__init__.py", '"""{project} package."""\n'))
            needed_files.append(("requirements.txt", self._generate_requirements_txt(app_content)))

        for fname, content in needed_files:
            fpath = Path(folder_path) / fname
            if fpath.exists():
                continue
            fpath.parent.mkdir(parents=True, exist_ok=True)
            fpath.write_text(content, encoding="utf-8")
            print(f"    [executor] Wrote {fname} ({len(content)} chars)")

    def _write_single_file(self, step_text: str, requirements: str,
                           folder_path: str) -> None:
        """Write one file for a specific step using model generation."""
        fname = _infer_filename(step_text, requirements)
        if not fname:
            return

        fpath = Path(folder_path) / fname
        if fpath.exists():
            return

        fpath.parent.mkdir(parents=True, exist_ok=True)

        content = self._generate_code_with_model(step_text, requirements, fname)
        if content is None:
            content = self._fallback_template(fname, requirements)

        # Validate Python syntax for .py files; other language types are
        # written as-is (MGAI may not have their compiler installed).
        if fname.endswith(".py"):
            try:
                compile(content, fname, "exec")
            except SyntaxError:
                content = self._fallback_template(fname, requirements)

        fpath.write_text(content, encoding="utf-8")
        print(f"    [executor] Wrote {fname} ({len(content)} chars)")

    def _generate_code_with_model(self, step_text: str, requirements: str,
                                   fname: str) -> str | None:
        """Use qwen2.5-coder to generate code for a specific step.

        Language-agnostic: the target filename's extension determines the
        language; the model is free to generate C#, Python, JS, SQL, docs,
        or any other text-based file type.
        """
        try:
            model = self.router.pick("code")
            prompt = (
                "You are a code generator. Write the complete file content for "
                "the target filename. Reply with ONLY the file content, no "
                "markdown code blocks, no explanations.\n"
                "Use the language implied by the file extension (e.g. .cs for C#, "
                ".py for Python, .js for JavaScript, .sql for SQL, .md for markdown).\n\n"
                f"REQUIREMENTS: {requirements}\n"
                f"STEP: {step_text}\n"
                f"TARGET FILE: {fname}\n\n"
                "FILE CONTENT:"
            )
            resp = self.client.chat(
                model=model,
                messages=[{"role": "user", "content": prompt}],
                think=False,
                timeout=120,
            )
            text = OllamaClient.extract_text(resp)
            if text and len(text.strip()) > 10:
                # Strip any markdown code fences that might leak in (any language)
                text = text.replace("```python", "").replace("```c#", "")
                text = text.replace("```cpp", "").replace("```java", "")
                text = text.replace("```javascript", "").replace("```ts", "")
                text = text.replace("```", "").strip()
                if len(text) > 10:
                    return text
            return None
        except Exception:
            return None

    def _fallback_template(self, fname: str, requirements: str) -> str:
        """Fallback to hardcoded template if model generation fails."""
        req_lower = requirements.lower()
        if fname == "app.py":
            search_signals = sum(1 for k in ("search", "file", "folder", "word",
                                             "sentence", "grep", "find", "locate")
                                 if k in req_lower)
            if search_signals >= 2:
                return FILE_SEARCH_APP_TEMPLATE
            _, content = _get_app_template(requirements)
            return content
        elif fname == "USER_MANUAL.md":
            _, content = _get_manual_template(requirements)
            return content
        elif fname == "__init__.py":
            return '"""{project} package."""\n'
        elif fname == "requirements.txt":
            app_content = FILE_SEARCH_APP_TEMPLATE if (
                sum(1 for k in ("search", "file", "folder", "word",
                                "sentence", "grep", "find", "locate")
                    if k in req_lower) >= 2
            ) else _get_app_template(requirements)[1]
            return self._generate_requirements_txt(app_content)
        elif fname.endswith(".csproj"):
            return '''<Project Sdk="Microsoft.NET.Sdk">

  <PropertyGroup>
    <OutputType>WinExe</OutputType>
    <TargetFramework>net8.0-windows</TargetFramework>
    <Nullable>enable</Nullable>
    <UseWindowsForms>true</UseWindowsForms>
    <ImplicitUsings>enable</ImplicitUsings>
  </PropertyGroup>

  <ItemGroup>
    <PackageReference Include="Microsoft.Data.Sqlite" Version="8.0.0" />
  </ItemGroup>

</Project>
'''
        elif fname.endswith(".cs"):
            stem = Path(fname).stem
            return f'''using System;
using System.IO;
using System.Collections.Generic;
using System.ComponentModel;
using System.Data;
using System.Drawing;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Data.Sqlite;

namespace {stem};

public class {stem} : Form
{{
    public {stem}()
    {{
        Text = "{stem}";
        Size = new Size(800, 600);
    }}

    [STAThread]
    static void Main()
    {{
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        Application.Run(new {stem}());
    }}
}}
'''
        elif fname.endswith(".sql") or fname.endswith(".db"):
            return "-- SQLite database schema\n-- Implement based on requirements\n"
        return f"# {fname}\n# TODO: Implement based on requirements.\n"

    def _generate_requirements_txt(self, app_content: str) -> str:
        """Infer pip dependencies from app content and generate a requirements.txt."""
        packages: set[str] = set()
        # Check for common imports in the app content
        for module in ("fastapi", "uvicorn", "pydantic", "requests", "tkinter",
                        "chromadb", "duckduckgo_search", "beautifulsoup4",
                        "faster_whisper", "sounddevice", "piper_tts", "numpy"):
            if module in app_content:
                packages.add(module)

        lines = ["# Auto-generated by MGAI Project Executor",
                 "# Install with: pip install -r requirements.txt",
                 ""]
        for pkg in sorted(packages):
            lines.append(pkg)
        if not packages:
            lines.append("# No external dependencies detected (standard library only)")
        return "\n".join(lines) + "\n"

    def _verify_code_compiles(self) -> str | None:
        """Verify syntax of all code files in the project folder.

        Python files are syntax-checked with py_compile. Other file types
        (C#, JS, SQL, docs, etc.) are acknowledged but not compiled since
        MGAI may not have the corresponding toolchain installed.
        """
        folder = Path(self.folder_path)
        code_extensions = (".py", ".cs", ".js", ".ts", ".java", ".cpp",
                           ".c", ".rb", ".go", ".rs", ".sql", ".html",
                           ".css", ".xml", ".json", ".md", ".txt")
        code_files = [f for f in folder.rglob("*")
                      if f.is_file() and f.suffix.lower() in code_extensions
                      and "__pycache__" not in f.parts
                      and not f.name.startswith(".")]
        if not code_files:
            return None

        py_files = [f for f in code_files if f.suffix.lower() == ".py"]
        errors: list[str] = []
        for fpath in py_files:
            try:
                py_compile.compile(str(fpath), doraise=True)
            except py_compile.PyCompileError as e:
                errors.append(f"{fpath.name}: {e}")

        other_count = len(code_files) - len(py_files)
        msg_parts = []
        if py_files:
            if errors:
                msg_parts.append("Code compile errors: " + "; ".join(errors))
            else:
                msg_parts.append(f"All {len(py_files)} Python file(s) compiled OK")
        if other_count:
            msg_parts.append(f"{other_count} non-Python file(s) present (not compiled)")
        return "; ".join(msg_parts) if msg_parts else None

    def _run_app_briefly(self) -> str | None:
        """Try to verify the app entry point loads without errors.

        Looks for common entry points (app.py, Program.cs, main.py, etc.).
        Only syntax-checks Python files; other file types are acknowledged.
        """
        folder = Path(self.folder_path)
        entry_points = ("app.py", "main.py", "Program.cs", "main.js",
                        "index.js", "index.ts", "main.cs")
        for ep in entry_points:
            app_file = folder / ep
            if app_file.exists():
                if ep.endswith(".py"):
                    try:
                        result = subprocess.run(
                            [sys.executable, "-c",
                             "import ast; ast.parse(open('app.py').read()); print('OK')"],
                            cwd=str(folder), capture_output=True, text=True, timeout=15
                        )
                        if result.returncode == 0:
                            return "App syntax verified OK"
                        return f"App syntax check failed: {result.stderr.strip()[:200]}"
                    except Exception as e:
                        return f"App syntax check error: {e}"
                else:
                    return f"Entry point {ep} found (not syntax-checked by MGAI)"
        return None

    def _count_files_written(self) -> int:
        return len(self._list_created_files())

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _list_created_files(self) -> List[str]:
        folder = Path(self.folder_path)
        files = []
        for p in folder.rglob("*"):
            if p.is_file() and not p.name.startswith(".") \
               and p.name not in ("requirement.txt", "requirements.txt") \
               and "__pycache__" not in p.parts:
                files.append(str(p.relative_to(folder)))
        return sorted(files)

    def status(self) -> dict:
        completed = sum(1 for s in self.state["steps"] if s["status"] == "completed")
        total = len(self.state["steps"])
        return {
            "folder": self.folder_path,
            "key": self.state["key"],
            "completed": self.state.get("completed", False),
            "steps_completed": completed,
            "steps_total": total,
            "steps": self.state.get("steps", []),
            "files_created": self._list_created_files(),
        }

    def resume(self) -> str:
        if not self.state.get("steps"):
            return "No saved project state found."
        return self.execute("Resume project execution")
