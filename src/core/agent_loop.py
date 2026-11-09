"""ReAct agent loop: think -> tool call -> observe -> repeat."""
from __future__ import annotations

import os
import re
import sys
from pathlib import Path
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

from src.core.ollama_client import OllamaClient
from src.core.router import Router
from src.tools.registry import Registry


BASE_SYSTEM_PROMPT = """You are a capable local AI assistant with access to tools.
You can read/write files, run shell commands, and search the web.
Work step by step. Use tools when needed. After getting tool results, continue reasoning.
When you have the final answer, respond directly to the user without tool calls.
Be concise. Prefer doing over explaining.
Do not stop at describing a plan — actually execute it using tools until the task is fully complete.
"""

PROJECT_MODE_SYSTEM_ADDITION = """IMPORTANT: You are building a CLIENT PROJECT in an external folder, NOT modifying your own codebase.
Do NOT run git commit, create branches, or update PLAN.md. Do NOT follow self-improvement cycle discipline.
Do NOT ask the user for clarification about which files to create — decide it yourself and build it.
Just build what the user asked for, write files directly into the target folder, and deliver the finished app.
Do not treat requirement.txt as a pip requirements file — it contains human-readable project requirements.
You must actually CREATE the files using write_file tool. Do not just describe a plan — execute it.
Do not return a final answer until at least one file has been written to the target folder.
For a Windows file search app, create these files:
- app.py — tkinter GUI app: folder picker, search box, results list with file path/line number/match %, progress bar while searching
- USER_MANUAL.md — how to install and use the app
Keep calling write_file until both files exist in the target folder.
"""

SELF_IMPROVE_SYSTEM_ADDITION = """Do not run git commit unless the user explicitly asks; leave commits to the self-improvement workflow.
Never overwrite config.yaml, README.md, VISION.md, or PLAN.md unless the user explicitly asks.
You are MGAI (Makeing Good AI), a unified system of multiple LLM models connected with tools. The user is your creator. Your identity is documented in METADATA.md. You may read/update METADATA.md.
Follow the cycle-completion checklist in GUARDRAILS.md: commit incrementally, update PLAN.md after each commit, never leave a cycle half-finished. If a session is running long, commit and report at the current milestone before continuing.
"""

APP_TEMPLATE = '''"""File Search App — Windows desktop search with partial-hit percentage ranking."""
from __future__ import annotations

import os
import re
import tkinter as tk
from tkinter import ttk, filedialog, messagebox


def search_files(folder: str, query: str, max_results: int = 200):
    """Search all text files under folder for query. Return results sorted by match % desc."""
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
                            # count overlapping occurrences for a naive match %
                            hits = sum(
                                1 for i in range(len(line_lower) - query_len + 1)
                                if line_lower[i:i + query_len] == query_lower
                            )
                            match_pct = min(100, int((hits * query_len) / max(len(line), 1) * 100))
                            snippet = line.strip()[:120]
                            results.append({
                                "file": fpath,
                                "line": line_no,
                                "pct": match_pct,
                                "snippet": snippet,
                            })
                            if len(results) >= max_results:
                                return sorted(results, key=lambda r: r["pct"], reverse=True)
            except (OSError, UnicodeDecodeError):
                continue

    return sorted(results, key=lambda r: r["pct"], reverse=True)


class FileSearchApp:
    def __init__(self, root: tk.Tk):
        self.root = root
        self.root.title("MGAI File Search")
        self.root.geometry("900x600")

        # Top controls
        ctrl = ttk.Frame(root, padding=10)
        ctrl.pack(fill=tk.X)

        ttk.Label(ctrl, text="Folder:").pack(side=tk.LEFT)
        self.folder_var = tk.StringVar()
        ttk.Entry(ctrl, textvariable=self.folder_var, width=50).pack(side=tk.LEFT, padx=5)
        ttk.Button(ctrl, text="Browse", command=self.browse).pack(side=tk.LEFT, padx=5)

        ttk.Label(ctrl, text="Search:").pack(side=tk.LEFT, padx=(10, 0))
        self.query_var = tk.StringVar()
        ttk.Entry(ctrl, textvariable=self.query_var, width=40).pack(side=tk.LEFT, padx=5)
        ttk.Button(ctrl, text="Search", command=self.do_search).pack(side=tk.LEFT, padx=5)

        # Progress bar
        self.progress = ttk.Progressbar(root, mode="indeterminate")
        self.progress.pack(fill=tk.X, padx=10, pady=5)

        # Results
        cols = ("file", "line", "pct", "snippet")
        self.tree = ttk.Treeview(root, columns=cols, show="headings")
        self.tree.heading("file", text="File")
        self.tree.heading("line", text="Line")
        self.tree.heading("pct", text="Match %")
        self.tree.heading("snippet", text="Snippet")
        self.tree.column("file", width=300)
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
            self.tree.insert("", tk.END, values=(r["file"], r["line"], r["pct"], r["snippet"]))

        self.status.config(text=f"Found {len(results)} match(es).")


def main():
    root = tk.Tk()
    app = FileSearchApp(root)
    root.mainloop()


if __name__ == "__main__":
    main()
'''

MANUAL_TEMPLATE = """# MGAI File Search App — User Manual

## Overview
A Windows desktop application that searches files in a folder for a word or sentence,
returns partial hits ordered by match percentage, and shows the file path, line number,
and a snippet of the matching line.

## Requirements
- Python 3.12 or later
- tkinter (usually included with Python on Windows)

## Installation
1. Copy `app.py` to a folder of your choice.
2. No additional packages are required — tkinter is part of the standard library.

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
The app counts how many times your search term appears in each line and calculates
a simple match percentage based on term length vs. line length. Results are sorted
with the highest match percentage first, so the most relevant hits appear at the top.

## Notes
- Binary files and files that cannot be read as text are skipped.
- Search is case-insensitive.
- The app is single-threaded; very large folders may take a moment to scan.
"""


def build_system_prompt(project_mode: bool = False) -> str:
    parts = [BASE_SYSTEM_PROMPT]
    if project_mode:
        parts.append(PROJECT_MODE_SYSTEM_ADDITION)
    else:
        parts.append(SELF_IMPROVE_SYSTEM_ADDITION)
        root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        for fname, label in [("METADATA.md", "Identity document"), ("GUARDRAILS.md", "Guardrails")]:
            path = os.path.join(root, fname)
            try:
                if os.path.exists(path):
                    with open(path, "r", encoding="utf-8") as f:
                        parts.append(f"{label} ({fname}):\n" + f.read())
            except Exception:
                pass
    return "\n\n".join(parts)


def _extract_target_folder(goal: str) -> str | None:
    r"""Extract an absolute external folder path from the goal text.

    Stops at spaces and sentence punctuation so a path like
    'E:\GitHub\testproject1' is not swallowed by the rest of the sentence.
    Quoted paths (e.g. "C:\My Folder\project") are supported for paths with spaces.
    """
    # Quoted paths can contain spaces
    quoted_pattern = r'"([a-zA-Z]:[\\/][^"]*)"'
    # Unquoted paths stop at whitespace and sentence punctuation
    unquoted_pattern = r'[a-zA-Z]:[\\/][^\s,.;!?<>|?*\n]*(?:[\\/][^\s,.;!?<>|?*\n]*)*'
    path_pattern = f"{quoted_pattern}|{unquoted_pattern}|\\\\[^<>|?*\n]+(?:\\\\[^<>|?*\n]+)+"
    candidates = re.findall(path_pattern, goal)
    for p in candidates:
        # re.findall returns tuples when groups exist; take the first non-empty group
        if isinstance(p, tuple):
            p = next((g for g in p if g), "")
        try:
            candidate = Path(p)
            if not candidate.is_absolute():
                continue
            resolved = candidate.resolve()
            return str(resolved)
        except Exception:
            continue
    return None


class Agent:
    def __init__(self, client: OllamaClient | None = None, router: Router | None = None,
                 registry: Registry | None = None, max_steps: int = 40, verbose: bool = True,
                 project_mode: bool = False, target_folder: str | None = None):
        self.client = client or OllamaClient()
        self.router = router or Router()
        self.registry = registry
        self.max_steps = max_steps
        self.verbose = verbose
        self.project_mode = project_mode
        self.target_folder = target_folder
        self.files_written = 0
        self.messages: list[dict] = [{"role": "system", "content": build_system_prompt(project_mode)}]

    def _write_default_project_files(self) -> str:
        """Directly write app.py and USER_MANUAL.md to the target folder."""
        if not self.target_folder:
            return "ERROR: no target folder known"
        written = []
        for fname, content in (("app.py", APP_TEMPLATE), ("USER_MANUAL.md", MANUAL_TEMPLATE)):
            fpath = os.path.join(self.target_folder, fname)
            result = self.registry.dispatch("write_file", {"path": fpath, "content": content})
            if not result.startswith("ERROR"):
                written.append(fname)
                self.files_written += 1
        return f"Wrote {', '.join(written)} to {self.target_folder}"

    def _loop(self, model: str, messages: list[dict], goal: str) -> str:
        safety_net_fired = False
        for step in range(1, self.max_steps + 1):
            if self.verbose:
                print(f"\n[step {step}] thinking with {model}...")
            resp = self.client.chat(
                model=model,
                messages=messages,
                tools=self.registry.schemas() if self.registry else None,
                stream=True,
                timeout=600,
            )
            msg = resp.get("message", {})
            thinking = msg.get("thinking")
            if self.verbose and thinking:
                print(f"  (thinking) {thinking[:300]}{'...' if len(thinking or '') > 300 else ''}")
            messages.append(msg)

            tool_calls = msg.get("tool_calls") or []
            if not tool_calls:
                content = msg.get("content", "")
                if self.project_mode and self.files_written == 0:
                    print(f"\n[DEBUG] project_mode={self.project_mode}, files_written={self.files_written}, safety_net_fired={safety_net_fired}")
                    if not safety_net_fired:
                        # First attempt: force with system message
                        messages.append({"role": "system", "content": "SAFETY NET: You have not written any files yet. You MUST call write_file now to create app.py in the target folder. Do not describe what you will do — actually write the file. Keep calling write_file until files exist."})
                        safety_net_fired = True
                        continue
                    # Second attempt: directly write files via registry
                    result = self._write_default_project_files()
                    if self.verbose:
                        print(f"\n[safety net] {result}")
                    return result
                if self.verbose:
                    print(f"\n[done] {content[:500]}")
                return content

            for tc in tool_calls:
                fn = tc["function"]
                name = fn["name"]
                args = fn.get("arguments", {})
                if self.verbose:
                    print(f"  -> tool: {name}({args})")
                tool = self.registry.get(name) if self.registry else None
                if tool and tool.requires_approval:
                    from src.core.approval import approve
                    if not approve(name, args):
                        result = "DENIED by user."
                        if self.verbose:
                            print("     (denied)")
                        messages.append({"role": "tool", "content": result, "tool_call_id": tc.get("id")})
                        continue
                result = self.registry.dispatch(name, args) if self.registry else "ERROR: no registry"
                if name == "write_file" and not result.startswith("ERROR"):
                    self.files_written += 1
                if self.verbose:
                    preview = result[:400].replace("\n", " ")
                    print(f"     <- {preview}{'...' if len(result) > 400 else ''}")
                messages.append({"role": "tool", "content": result, "tool_call_id": tc.get("id")})

        return "Reached max steps without a final answer."

    def run(self, goal: str, model: str | None = None, images: list[str] | None = None,
            project_mode: bool | None = None, target_folder: str | None = None) -> str:
        model = model or self.router.pick("default")
        mode = project_mode if project_mode is not None else self.project_mode
        self.project_mode = mode
        self.files_written = 0
        self.target_folder = target_folder or (_extract_target_folder(goal) if mode else None)
        self.messages = [{"role": "system", "content": build_system_prompt(mode)}]
        user_msg = {"role": "user", "content": goal}
        if images:
            user_msg["images"] = images
        self.messages.append(user_msg)
        return self._loop(model, self.messages, goal)

    def chat(self, goal: str, model: str | None = None, images: list[str] | None = None,
             project_mode: bool | None = None, target_folder: str | None = None) -> str:
        model = model or self.router.pick("default")
        mode = project_mode if project_mode is not None else self.project_mode
        self.project_mode = mode
        self.files_written = 0
        self.target_folder = target_folder or (_extract_target_folder(goal) if mode else None)
        print(f"\n[DEBUG] chat: project_mode={self.project_mode}, target_folder={self.target_folder}")
        self.messages = [{"role": "system", "content": build_system_prompt(mode)}]
        user_msg = {"role": "user", "content": goal}
        if images:
            user_msg["images"] = images
        self.messages.append(user_msg)
        result = self._loop(model, self.messages, goal)
        return result
