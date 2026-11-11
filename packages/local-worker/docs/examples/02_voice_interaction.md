# Example 2: Voice Interaction Loop

This example demonstrates the continuous listen -> think -> speak loop using MGAI's voice capabilities.

## Prerequisites

- Working microphone and speakers (or headphones)
- Configured in `config.yaml` audio settings
- Ollama models with speech-capable brain (qwen3.5 supports vision+tools)

## How It Works

1. **Listen**: Uses faster-whisper (`senses/stt.py`) to transcribe speech
2. **Think**: Agent processes input and generates response using ReAct loop
3. **Speak**: Returns text via Piper TTS (`senses/tts.py`) or pyttsx3
4. **Loop**: Continuously listens for user input

## Config Options in config.yaml

```yaml
voice:
  stt_model: "faster-whisper"  # whisper-large-v3 recommended
  tts_model: "piper"           # Default model: "cmu-llama-68k" or custom
  device_list: ["default"]      # Microphone/speaker indices
```

## Run in Command Line

```bash
mgai voice
```

Or with timeout (stop after N seconds):
```bash
timeout 30 bash -c "mgai voice"
```

## API Endpoint for Voice

POST to `/voice` with JSON body:
```json
{
  "stream": true,      // Stream continuous speech vs batch transcript
  "language": "en",     // Language code (e.g., "es", "fr")
  "max_chars": 1024     // Max response length
}
```

## Use Cases

- **Conversational assistant**: Continuous dialogue with MGAI
- **Smart home control**: Voice commands to run shell tasks
- **Meeting notes**: Dictation → transcription summary by agent

---

*Voice mode requires audio hardware support. Configure devices in config.yaml.*
