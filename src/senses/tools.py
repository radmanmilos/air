"""Sense tools for the agent: see, speak, listen."""
from __future__ import annotations

from src.core.ollama_client import OllamaClient
from src.core.router import Router
from src.senses.stt import listen as _listen, transcribe_file
from src.senses.tts import speak as _speak


_client = OllamaClient()


def describe_image(path: str, question: str = "Describe this image in detail.") -> str:
    try:
        b64 = OllamaClient.image_to_b64(path)
    except Exception as e:
        return f"ERROR: {e}"
    resp = _client.chat(
        model=Router().pick("default"),
        messages=[{"role": "user", "content": question, "images": [b64]}],
        timeout=600,
    )
    return OllamaClient.extract_text(resp) or "(no description)"


def speak(text: str, output_path: str = "") -> str:
    return _speak(text, output_path=output_path or None)


def listen(seconds: float = 5.0) -> str:
    try:
        return _listen(seconds=float(seconds))
    except Exception as e:
        return f"ERROR: {e}"


def transcribe(path: str) -> str:
    return transcribe_file(path)