# Project Execution Engine

MGAI's supercharged project execution system turns a high-level goal into a complete,
working deliverable through a **plan → execute → verify → iterate** cycle.

## Architecture

```
Goal → Decompose → Execute Steps → Verify Each Step → Retry Failed → Final Verify → Deliverable
```

### Components

| Module | Purpose | Model Used |
|--------|---------|------------|
| `src/autonomy/task_decomposer.py` | Break goals into concrete steps | deepseek-r1:1.5b (reasoner) |
| `src/autonomy/project_executor.py` | Orchestrate plan→execute→verify→iterate | qwen2.5-coder:7b (code) / qwen3.5:4b (general) |
| `src/autonomy/result_verifier.py` | Critique step results, verify final deliverables | deepseek-r1:1.5b (reasoner) |
| `src/tools/project_tools.py` | Expose project ops as agent tools | — |
| `src/tools/code_analysis.py` | Analyze code, check deps, install packages, count lines | — |

## How It Works

### 1. Goal Decomposition
The agent reads your `requirement.txt` and breaks the project into small, ordered steps using the deepseek-r1 reasoner. Each step is a single file-creation or file-modification action.

### 2. Dependency Analysis
Steps are analyzed for file dependencies. If Step B reads a file that Step A writes, Step B waits for Step A. Independent steps are grouped into waves.

### 3. Step Execution
Each step is executed by the MGAI agent using the best model for the task:
- **Code tasks** → qwen2.5-coder:7b
- **Planning/critique tasks** → deepseek-r1:1.5b
- **General tasks** → qwen3.5:4b

### 4. Step Verification
After each step, the result_verifier critiques whether the output meaningfully advances the step. If not, the step is retried (up to 5 attempts) with adapted instructions.

### 5. Final Verification
Once all steps complete, the verifier checks that all requirements are satisfied and lists any missing deliverables.

### 6. State Persistence
Project state is saved to `.agent/projects/<key>/state.json`. Interrupted projects can be resumed with `project-resume`.

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

MGAI will:
1. Detect the external folder → project mode
2. Read `requirement.txt` from that folder
3. Decompose the goal into steps
4. Execute each step with verification
5. Report completion

## Available Tools

| Tool | Description |
|------|-------------|
| `project_init` | Initialize a project folder with requirement.txt |
| `project_plan` | Decompose a goal into steps |
| `project_execute` | Run plan→execute→verify→iterate |
| `project_status` | Check saved project status |
| `project_resume` | Resume interrupted project |
| `project_files` | List files created in a project |
| `analyze_code` | Lint, complexity, security scan |
| `check_dependencies` | Verify installed packages |
| `install_packages` | Install missing pip packages |
| `count_lines` | Count lines of code/text |

## Test Projects

- `E:\GitHub\testproject1` — File search application (Windows GUI with progress bar)
- `E:\GitHub\testproject2` — MGAI operations documentation (markdown)

## Design Principles

1. **Small models, big system** — 4B-7B models with good tooling outperform larger models alone
2. **Verify don't trust** — Every step is critiqued before moving on
3. **Resume anywhere** — State is persisted; interrupted projects continue from last checkpoint
4. **No protected files** — The execution engine never modifies MGAI's own protected source files
5. **Local-first** — Everything runs on your machine via Ollama
