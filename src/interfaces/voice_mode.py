"""Voice mode: listen -> think -> speak loop."""
from __future__ import annotations

import sys
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

from src.core.agent_loop import Agent
from src.core.ollama_client import OllamaClient
from src.core.router import Router
from src.tools.builtin import build_registry
from src.senses.stt import listen
from src.senses.tts import speak


def run_voice_loop(seconds: float = 5.0, model: str | None = None):
    client = OllamaClient()
    registry = build_registry()
    agent = Agent(client=client, router=Router(), registry=registry, verbose=False)
    print("Voice mode. Ctrl+C to exit.")
    while True:
        try:
            print("\nListening...")
            text = listen(seconds=seconds)
            print(f"You said: {text}")
            if not text.strip():
                continue
            if text.strip().lower() in ("exit", "quit", "stop"):
                speak("Goodbye.")
                break
            reply = agent.run(text, model=model)
            print(f"AI: {reply}")
            speak(reply)
        except KeyboardInterrupt:
            speak("Goodbye.")
            break
        except Exception as e:
            print(f"Error: {e}")