# MGAI Quick Start Guide

## Prerequisites

- Python 3.12 or 3.14 (tested on both)
- Ollama running with these models installed:
  - `qwen3.5:4b` (primary brain, vision+tools enabled)
  - `nomic-embed-text` (for RAG memory)

## Installation

### From Source

```bash
pip install -e .
```

Or with venv (recommended for Python 3.14 wheels):

```bash
python -m venv venv
source venv/Scripts/activate  # Windows
# or: source venv/bin/activate  # Linux/Mac
pip install "nvidia-ml-py" faster-whisper piper-webspeech pyaudio
pip install -e .
```

### Verify Installation

```bash
mgai models      # List available Ollama models
mgai inspect     # Check hardware and model capabilities
mgai run "hello world"  # Simple test
```

## Using MGAI as an Agent

The `run` command executes tasks autonomously via the ReAct loop:

```bash
# Basic task
mgai run "list files in this directory"

# Interactive chat mode (agent answers questions)
mgai chat "What's in this folder?"

# Show all tools available
mgai models --show-tools

# List installed Ollama models
mgai models
```

## Voice Mode

```bash
mgai voice  # Continuous listen -> think -> speak loop
```

Voice mode uses faster-whisper (STT) and Piper (TTS). Configure microphone/speaker devices in config.yaml if needed.

## API Usage

Run the FastAPI server:

```bash
python -m src.interfaces.api --port 8000
```

Then make requests to:
- `GET /health` - Health check
- `POST /models` - List models
- `GET /tools/list` - Available tools schema
- `POST /chat` - Chat with agent

See examples for usage patterns.

## Examples

Run example scripts in the `examples/` directory:
- Example 1: Full agent task execution
- Example 2: Voice interaction loop
- Example 3: API client

For self-improvement workflows, run:
```bash
mgai self-improve "add a feature to..."
```

---

*Last updated: 2026-11-08*
