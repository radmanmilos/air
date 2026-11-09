# MGAI — Making Good AIs

A local-first AI agent system that turns small, weak locally-hosted models (4B–7B on an RTX 3060 with 6GB VRAM) into capable, autonomous assistants that can plan, build, test, and deliver real software projects end-to-end.

> **The models don't need to be huge — the system around them does.** MGAI builds the body, senses, and habits; the model provides the brain.

## What MGAI Can Do

| Capability | Description |
|------------|-------------|
| **Project Execution** | Decompose a goal into steps, write real code, verify results, retry failures, persist state for resumption |
| **Multi-Agent Collaboration** | Architect → Coder → Reviewer → Integrator pipeline for complex projects |
| **Auto-Test Generation** | Generate pytest test suites for any Python project |
| **Project Scaffolding** | Bootstrap from templates (file_search, cli_tool, api_service, documentation) |
| **Auto-Documentation** | Generate README.md, ARCHITECTURE.md, API.md from code |
| **Plugin System** | Drop-in third-party tools via `plugins/` directory |
| **Code Analysis** | Lint, complexity, security scanning, dependency checking, pip install |
| **Memory** | Sliding-window conversation + ChromaDB vector store (RAG) |
| **Multimodal** | Vision, STT (faster-whisper), TTS (piper/pyttsx3) |
| **Interfaces** | CLI, FastAPI API, web UI dashboard, voice mode |

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Interfaces: CLI · FastAPI · Web UI · Voice Mode        │
├─────────────────────────────────────────────────────────┤
│  Autonomy: Project Executor · Multi-Agent Team ·        │
│  Planner · Executor · Critic · Orchestrator · Scheduler │
├─────────────────────────────────────────────────────────┤
│  Tools (44): Files · Shell · Web · Git · Memory ·       │
│  Senses · Project · Code Analysis · Tests · Templates · │
│  Docs · Plugins                                         │
├─────────────────────────────────────────────────────────┤
│  Memory: Sliding Window + ChromaDB Vector Store (RAG)   │
├─────────────────────────────────────────────────────────┤
│  Core: Ollama Client · Router · ReAct Agent Loop ·      │
│  Approval Gate · Guardrails                             │
└─────────────────────────────────────────────────────────┘
```

**Models** (run locally via Ollama):
- `qwen3.5:4b` (3.3GB) — Primary brain: vision + tools + thinking
- `qwen2.5-coder:7b` (4.7GB) — Code specialist
- `deepseek-r1:1.5b` (1.1GB) — Fast reasoning/planning
- `nomic-embed-text` — Memory embeddings

## Quickstart

```powershell
# Clone the repo
git clone https://github.com/radmanmilos/MakingGoodAIs.git
cd MakingGoodAIs

# Install dependencies
pip install -e .

# Start Ollama and pull models
ollama pull qwen3.5:4b
ollama pull qwen2.5-coder:7b
ollama pull deepseek-r1:1.5b

# Run MGAI
.\mgai.bat
# or
python mgai.py
```

Then in the interactive prompt:
```
you> build a file search app in E:\GitHub\testproject1
```

MGAI auto-detects external folders, enters project mode, reads `requirement.txt`, decomposes the goal, writes real code, verifies results, and delivers the finished app.

## CLI Commands

```powershell
# Execute a project (reads requirement.txt from folder)
python -m src.main project-execute E:\GitHub\testproject1

# Check project status
python -m src.main project-status E:\GitHub\testproject1

# Decompose a goal into steps (no execution)
python -m src.main project-plan E:\GitHub\testproject1 "Build a web scraper"

# Resume an interrupted project
python -m src.main project-resume E:\GitHub\testproject1

# List available project templates
python -m src.main list-templates  # via tool: list_templates

# Scaffold from a template
python -m src.main scaffold-project file_search E:\GitHub\myproject
```

## Project Templates

| Template | Description |
|----------|-------------|
| `file_search` | Windows desktop file search with partial-hit ranking + progress bar |
| `cli_tool` | Command-line tool with argparse |
| `api_service` | FastAPI REST web service |
| `documentation` | Markdown documentation project |

## Example Projects

- **`E:\GitHub\testproject1`** — Windows file search application (tkinter GUI, progress bar, user manual)
- **`E:\GitHub\testproject2`** — MGAI operations documentation (markdown)

## Plugin System

Drop a `.py` file into `plugins/` with a `register(registry)` function to add custom tools:

```python
# plugins/my_tool.py
from src.tools.registry import Registry, Tool

def my_tool(name: str = "world") -> str:
    return f"Hello, {name}!"

def register(registry: Registry) -> None:
    registry.register(Tool(
        name="plugin_greet",
        description="Greet someone via an MGAI plugin.",
        parameters={
            "type": "object",
            "properties": {
                "name": {"type": "string", "description": "Name to greet", "default": "world"}
            },
            "required": []
        },
        func=my_tool,
    ))
```

Plugins are auto-discovered and loaded on startup.

## Design Principles

1. **Local-first** — Everything runs on your machine via Ollama. No cloud required.
2. **Small & cheap** — Target 4B–7B models (~6GB VRAM, ~16GB RAM).
3. **Useful** — Complete real tasks end-to-end, not just chat.
4. **Transparent** — Tool calls, plans, and logs are visible to the user.
5. **Extensible** — Adding a tool, model, or sense is a small, documented change.
6. **Verify don't trust** — Every step is critiqued before moving on.
7. **Resume anywhere** — Project state is persisted; interrupted projects continue from checkpoint.

## Repository Structure

```
MakingGoodAIs/
├── mgai.py                  # Interactive launcher
├─ mgai.bat                  # Windows batch launcher
├─ pyproject.toml            # Package configuration
├─ requirements.txt          # Python dependencies
├─ config.yaml               # MGAI configuration
├─ README.md                 # This file
├─ VISION.md                 # Project vision and goals
├─ PLAN.md                   # Living project plan
├─ GUARDRAILS.md             # What MGAI may and may not change
├─ HOW_TO_START.md           # Terminal instructions
├─ docs/                     # Documentation
│   ├─ PROJECT_EXECUTION.md  # Project execution system docs
│   ├─ README.md
│   ├─ quickstart.md
│   └─ examples/
├─ src/
│   ├─ main.py               # CLI entry point
│   ├─ core/                 # Ollama client, router, agent loop, guardrails
│   ├─ tools/                # 44 built-in tools + plugin system
│   ├─ autonomy/             # Planner, executor, critic, project executor,
│   │                         multi-agent, test generator, templates, doc generator
│   ├─ memory/               # Sliding window + ChromaDB (RAG)
│   ├─ senses/               # STT, TTS, vision
│   └─ interfaces/           # FastAPI API, web UI, voice mode
└─ tests/                    # Test suite (34 tests)
```

## License

MIT License

---

*Made with MGAI — Making Good AIs, one project at a time.*
