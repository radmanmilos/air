"""Speech-to-text using faster-whisper."""
from __future__ import annotations

import numpy as np

try:
    import sounddevice as sd
    _HAS_SD = True
except Exception:
    _HAS_SD = False

from faster_whisper import WhisperModel

_model = None


def _model_instance(size: str = "base"):
    global _model
    if _model is None:
        _model = WhisperModel(size, device="cpu", compute_type="int8")
    return _model


def transcribe_file(path: str, model_size: str = "base") -> str:
    model = _model_instance(model_size)
    segments, info = model.transcribe(path, beam_size=1)
    return " ".join(s.text.strip() for s in segments).strip()


def listen(seconds: float = 5.0, sample_rate: int = 16000, model_size: str = "base") -> str:
    if not _HAS_SD:
        return "ERROR: sounddevice not installed"
    audio = sd.rec(int(seconds * sample_rate), samplerate=sample_rate, channels=1, dtype="float32")
    sd.wait()
    audio = np.squeeze(audio)
    # write to temp wav
    import wave, struct, tempfile, os
    fd, path = tempfile.mkstemp(suffix=".wav")
    os.close(fd)
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sample_rate)
        pcm = (audio * 32767).astype(np.int16)
        w.writeframes(pcm.tobytes())
    text = transcribe_file(path, model_size)
    try:
        os.remove(path)
    except Exception:
        pass
    return text