"""Text-to-speech. Prefers piper (if a voice model is available), else pyttsx3 (Windows SAPI)."""
from __future__ import annotations

import os
import subprocess
import tempfile
import shutil

PIPER_MODEL = os.environ.get("PIPER_MODEL", "")  # path to .onnx voice


def _play(path: str) -> None:
    try:
        if os.name == "nt":
            import winsound
            winsound.PlaySound(path, winsound.SND_FILENAME)
        else:
            subprocess.run(["aplay", path], check=False)
    except Exception:
        pass


def speak(text: str, voice: str = "", output_path: str | None = None) -> str:
    model = voice or PIPER_MODEL
    # Try piper if model file present
    if model and os.path.exists(model):
        fd, path = tempfile.mkstemp(suffix=".wav")
        os.close(fd)
        try:
            with open(path, "wb") as f:
                subprocess.run(
                    ["python", "-m", "piper", "-m", model, "-f", path],
                    input=text.encode(),
                    check=True,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                )
        except Exception as e:
            return f"ERROR: piper failed: {e}"
        if output_path:
            os.replace(path, output_path)
            return output_path
        _play(path)
        try:
            os.remove(path)
        except Exception:
            pass
        return "spoken (piper)"
    # Fallback: pyttsx3
    try:
        import pyttsx3
        engine = pyttsx3.init()
        if output_path:
            engine.save_to_file(text, output_path)
            engine.runAndWait()
            return output_path
        engine.say(text)
        engine.runAndWait()
        return "spoken (pyttsx3)"
    except Exception as e:
        return f"ERROR: no TTS available: {e}"