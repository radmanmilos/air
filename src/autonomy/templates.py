"""Project Scaffolding Templates.

Pre-built project templates for common application types. MGAI can scaffold
a new project from a template, then customize it based on requirements.

No protected files modified.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path
from typing import Any, Dict, List

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass


# ---------------------------------------------------------------------------
# Template definitions
# ---------------------------------------------------------------------------

TEMPLATES: Dict[str, Dict[str, str]] = {
    "file_search": {
        "description": "Windows desktop file search app with partial-hit ranking",
        "files": {
            "app.py": '''"""File Search App — Windows desktop search with partial-hit ranking."""
from __future__ import annotations

import os
import re
import tkinter as tk
from tkinter import ttk, filedialog, messagebox


def search_files(folder: str, query: str, max_results: int = 200):
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
''',
            "USER_MANUAL.md": """# File Search App — User Manual

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

## Notes
- Binary files and files that cannot be read as text are skipped.
- Search is case-insensitive.
""",
        },
    },
    "cli_tool": {
        "description": "Command-line tool with argparse",
        "files": {
            "main.py": '''"""CLI Tool — MGAI generated."""
from __future__ import annotations

import argparse
import sys


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="MGAI CLI tool")
    parser.add_argument("input", help="Input file or value")
    parser.add_argument("--output", "-o", help="Output file path")
    parser.add_argument("--verbose", "-v", action="store_true",
                        help="Verbose output")
    args = parser.parse_args(argv)

    if args.verbose:
        print(f"Processing: {args.input}")

    result = f"Processed: {args.input}"

    if args.output:
        with open(args.output, "w", encoding="utf-8") as f:
            f.write(result)
    else:
        print(result)

    return 0


if __name__ == "__main__":
    sys.exit(main())
''',
            "USER_MANUAL.md": """# CLI Tool — User Manual

## Overview
A command-line tool generated by MGAI.

## Usage
```
python main.py <input> [--output <file>] [--verbose]
```

## Options
- `input`: Input file or value to process
- `--output, -o`: Write result to file instead of stdout
- `--verbose, -v`: Enable verbose output
""",
        },
    },
    "api_service": {
        "description": "FastAPI web service",
        "files": {
            "main.py": '''"""FastAPI Service — MGAI generated."""
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
''',
            "USER_MANUAL.md": """# FastAPI Service — User Manual

## Overview
A REST API service generated by MGAI using FastAPI.

## Installation
```
pip install fastapi uvicorn
```

## Usage
```
python -m uvicorn main:app --reload
```

## Endpoints
- `GET /` — Service status
- `POST /process` — Process text (JSON body: `{"text": "..."}`)
- `GET /health` — Health check
""",
        },
    },
    "documentation": {
        "description": "Documentation project (markdown)",
        "files": {
            "README.md": """# Project

## Overview
TODO: Describe this project.

## Installation
TODO: Installation instructions.

## Usage
TODO: Usage instructions.

## License
TODO: License information.
""",
        },
    },
}


def list_templates() -> List[Dict[str, str]]:
    """Return list of available templates."""
    return [{"name": k, "description": v["description"]}
            for k, v in TEMPLATES.items()]


def scaffold_project(template_name: str, folder_path: str) -> dict:
    """Scaffold a new project from a template."""
    if template_name not in TEMPLATES:
        available = ", ".join(TEMPLATES.keys())
        return {"error": f"unknown template '{template_name}'. "
                         f"Available: {available}"}

    template = TEMPLATES[template_name]
    folder = Path(folder_path)
    folder.mkdir(parents=True, exist_ok=True)

    written: List[str] = []
    for fname, content in template["files"].items():
        fpath = folder / fname
        fpath.write_text(content, encoding="utf-8")
        written.append(str(fpath.relative_to(folder)))

    return {
        "template": template_name,
        "description": template["description"],
        "folder": str(folder),
        "files_written": written,
    }


def get_template(template_name: str) -> Dict[str, Any] | None:
    """Get a template definition by name."""
    return TEMPLATES.get(template_name)
