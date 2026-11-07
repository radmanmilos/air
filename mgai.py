#!/usr/bin/env python
"""MGAI launcher: type 'mgai' and everything starts, greets, and awaits your prompt."""
from __future__ import annotations

import os
import sys
import subprocess
import time

ROOT = os.path.dirname(os.path.abspath(__file__))
os.chdir(ROOT)
sys.path.insert(0, ROOT)

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

BANNER = r"""
  __  __  ____    _    ___
 |  \/  |/ ___|  / \  |_ _|
 | |\/| | |  _  / _ \  | |
 | |  | | |_| |/ ___ \ | |
 |_|  |_|\____/_/   \_\___|

 Making Good AIs - local agent
"""


def step(msg):
    print(f"  -> {msg}")


def check_python():
    step(f"Python {sys.version.split()[0]} OK")


def ensure_ollama():
    try:
        out = subprocess.run(["ollama", "list"], capture_output=True, text=True, timeout=15)
        if out.returncode == 0:
            step("Ollama running OK")
            return True
    except Exception:
        pass
    step("Ollama not running - starting it...")
    try:
        subprocess.Popen(["ollama", "serve"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                         creationflags=subprocess.CREATE_NEW_PROCESS_GROUP if os.name == "nt" else 0)
        time.sleep(4)
        out = subprocess.run(["ollama", "list"], capture_output=True, text=True, timeout=15)
        if out.returncode == 0:
            step("Ollama started OK")
            return True
    except Exception as e:
        print(f"  !! Could not start Ollama: {e}")
    return False


def ensure_models():
    try:
        out = subprocess.run(["ollama", "list"], capture_output=True, text=True, timeout=15)
    except Exception:
        return
    installed = out.stdout.lower()
    needed = ["qwen3.5:4b", "nomic-embed-text"]
    for m in needed:
        if m.split(":")[0] not in installed:
            step(f"Pulling {m} (this may take a while)...")
            subprocess.run(["ollama", "pull", m], timeout=1800)


def ensure_deps():
    missing = []
    for mod in ["requests", "yaml", "typer", "rich", "chromadb"]:
        try:
            __import__(mod)
        except Exception:
            missing.append(mod)
    if missing:
        step(f"Installing missing deps: {', '.join(missing)}")
        subprocess.run([sys.executable, "-m", "pip", "install", "-r", "requirements.txt", "-q"], timeout=600)
    else:
        step("Dependencies OK")


def greet():
    print("  Hi! I'm MGAI. I'm ready to work beside you.")
    print("  Type your request and press Enter. Type 'exit' or 'quit' to leave.\n")


def main():
    print(BANNER)
    check_python()
    ensure_ollama()
    ensure_deps()
    ensure_models()
    print()
    greet()

    from src.core.agent_loop import Agent
    from src.core.ollama_client import OllamaClient
    from src.core.router import Router
    from src.tools.builtin import build_registry
    import src.core.approval as ap
    ap.approve = lambda *a, **k: True  # smooth interactive flow

    client = OllamaClient()
    registry = build_registry()
    max_steps = client.cfg.get("agent", {}).get("max_steps", 40)
    agent = Agent(client=client, router=Router(), registry=registry, verbose=True, max_steps=max_steps)

    while True:
        try:
            user = input("you> ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\nBye!")
            break
        if not user:
            continue
        if user.lower() in ("exit", "quit", "bye"):
            print("Bye!")
            break
        try:
            result = agent.chat(user)
            print(f"\nMGAI> {result}\n")
        except Exception as e:
            print(f"\n!! Error: {e}\n")


if __name__ == "__main__":
    main()
