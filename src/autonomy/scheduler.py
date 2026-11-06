"""Simple background task scheduler using threads."""
from __future__ import annotations

import threading
import uuid


class Scheduler:
    def __init__(self):
        self.tasks: dict[str, threading.Thread] = {}
        self.results: dict[str, object] = {}

    def submit(self, fn, *args, **kwargs) -> str:
        tid = str(uuid.uuid4())[:8]
        def worker():
            try:
                self.results[tid] = fn(*args, **kwargs)
            except Exception as e:
                self.results[tid] = f"ERROR: {e}"
        t = threading.Thread(target=worker, daemon=True)
        self.tasks[tid] = t
        t.start()
        return tid

    def status(self, tid: str) -> str:
        t = self.tasks.get(tid)
        if t is None:
            return "unknown"
        if t.is_alive():
            return "running"
        return "done"

    def result(self, tid: str):
        return self.results.get(tid)