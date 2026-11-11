# Project Execution Engine

MGAI's supercharged project execution system turns a high-level goal into a complete,
working deliverable through a **plan → execute → verify → iterate** cycle.

## Architecture

```
Goal → Decompose → Execute Steps → Verify Each Step → Retry Failed → Final Verify → Deliverable
```

## Components

| Module | Purpose | Model Used |
|--------|---------|------------|
| `src/autonomy/task_decomposer.py` | Break goals into concrete steps | deepseek-r1:1.5b (reasoner) |
| `src/autonomy/project_executor.py` | Orchestrate plan→execute→verify→iterate | qwen2.5-coder:7b (code) / qwen3.5:4b (general) |
| `src/autonomy/result_verifier.py` | Critique step results, verify final deliverables | deepseek-r1:1.5b (reasoner) |
| `src/autonomy/multi_agent.py` | Architect → Coder → Reviewer → Integrator pipeline | all models |
| `src/autonomy/test_generator.py` | Auto-generate pytest tests for projects | — |
| `src/autonomy/templates.py` | Project scaffolding (file_search, cli_tool, api_service, documentation) | — |
| `src/autonomy/doc_generator.py` | Auto-generate README/ARCHITECTURE/API docs | — |
| `src/tools/project_tools.py` | Expose project ops as agent tools | — |
| `src/tools/code_analysis.py` | Lint, complexity, security, deps, pip install, line count | — |
| `src/tools/plugin_system.py` | Dynamic plugin discovery/loading | — |

## How It Works

### 1. Goal Decomposition
The agent reads your `requirement.txt` and breaks the project into small, ordered steps using the deepseek-r1:1.5b reasoner model.

### 2. Multi-Agent Collaboration (Cutting Edge)
MGAI spawns specialized agent roles that collaborate:
- **Architect** — designs system structure, picks tech stack, defines file layout
- **Coder** — implements actual code files
- **Reviewer** — critiques code quality, security, completeness
- **Integrator** — merges agent outputs into a coherent deliverable

### 3. Dependency Analysis
Steps are analyzed for file dependencies. Independent steps are grouped into waves for efficient execution.

### 4. Step Execution
Each step writes real code (not stubs). The multi-agent team designs and implements; templates serve as fallback.

### 5. Step Verification
Each step result is critiqued by deepseek-r1:1.5b. Failed steps are retried (up to 5 attempts).

### 6. Final Verification
All deliverables are checked against original requirements before the project is marked complete.

### 7. State Persistence
Project state is saved to `.agent/projects/<key>/state.json`. Interrupted projects resume from the last checkpoint.

## CLI Commands

```bash
# Execute a project (reads requirement.txt from folder)
python -m src.main project-execute E:\GitHub\testproject1

# Check project status
python -m src.main project-status E:\GitHub\testproject1

# Decompose a goal into steps (no execution)
python -m src.main project-plan E:\GitHub\testproject1 "Build a file search app"

# Resume an interrupted project
python -m src.main project-resume E:\GitHub\testproject1
```

## Interactive Mode (mgai)

When you start `mgai` and mention an external folder path, MGAI automatically enters project mode:

```
you> build a file search app in E:\GitHub\testproject1
```

MGAI will detect the external folder, enter project mode, read `requirement.txt`, decompose the goal, execute each step with verification, and report completion.

## Available Tools (44 total)

| Category | Tools |
|----------|-------|
| **Project** | project_init, project_plan, project_execute, project_status, project_resume, project_files |
| **Code Analysis** | analyze_code, check_dependencies, install_packages, count_lines |
| **Testing** | generate_tests, run_project_tests |
| **Scaffolding** | list_templates, scaffold_project |
| **Documentation** | generate_docs |
| **Plugins** | list_plugins, load_plugins, create_sample_plugin |
| **Files** | read_file, write_file, append_file, list_dir, search_files, file_info |
| **Shell** | run_shell |
| **Web** | web_search, web_fetch |
| **Git** | git_status, git_diff, git_branch, git_commit, git_log, run_tests |
| **Memory** | remember, recall, index_file, memory_count |
| **Senses** | describe_image, speak, listen, transcribe_file |
| **Ollama** | ensure_ollama_online, is_ollama_online |
| **Guardrails** | check_guardrails |

## Test Projects

- `E:\GitHub\testproject1` — File search application (Windows GUI with progress bar)
- `E:\GitHub\testproject2` — MGAI operations documentation (markdown)

## Plugin System

Drop a `.py` file into `plugins/` with a `register(registry)` function to add custom tools to MGAI. Plugins are auto-discovered and loaded.

```python
# plugins/my_tool.py
def register(registry):
    registry.register(Tool(
        name="my_custom_tool",
        description="My custom tool",
        parameters={"type": "object", "properties": {}, "required": []},
        func=my_func,
    ))
```

## Design Principles

1. **Small models, big system** — 4B–7B models with good tooling outperform larger models alone
2. **Verify don't trust** — Every step is critiqued before moving on
3. **Resume anywhere** — State is persisted; interrupted projects continue from checkpoint
4. **No protected files** — Execution engine never modifies MGAI's own protected source files
5. **Local-first** — Everything runs on your machine via Ollama
6. **Multi-agent collaboration** — Specialized roles (architect/coder/reviewer/integrator) produce better results than single-agent
