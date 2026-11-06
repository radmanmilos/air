# How to Start — Making Good AIs

Step-by-step for a fresh terminal.

## 1. Open a terminal
PowerShell or CMD. Go to the project:
```powershell
cd E:\GitHub\MakeingGoodAIs
```

## 2. Check Python
```powershell
python --version
```
Should print 3.14.x (or 3.12.x). If `python` is not found, install Python from python.org and re-open the terminal.

## 3. Check Ollama is running
```powershell
ollama list
```
You should see `qwen3.5:4b`, `qwen2.5-coder:7b`, `deepseek-r1:1.5b`, `nomic-embed-text`.
If you get "connection refused", start Ollama in another window:
```powershell
ollama serve
```
Leave that window open.

## 4. Verify the project imports
```powershell
python -c "from src.tools.builtin import build_registry; print('ok', len(build_registry().names()), 'tools')"
```

## 5. Run the agent
```powershell
# Unattended (auto-approves tool calls):
python -m src.main run "List the files in this folder and summarize the project" -y

# Interactive chat:
python -m src.main chat

# Voice mode (mic -> think -> speak):
python -m src.main voice

# Plan only (no execution):
python -m src.main plan "Add a feature X"

# Agent improves this project itself:
python -m src.main self-improve "Add unit tests for the memory module"
```

## 6. Run the test suite
```powershell
python -m pytest -q
```

## 7. Useful commands
```powershell
python -m src.main models          # show models + routing
python -m src.main inspect qwen3.5:4b
git status                        # see what the agent changed
git log --oneline -10             # recent commits
```

## Troubleshooting

- **"connection refused" to Ollama**: run `ollama serve` in a separate terminal.
- **Slow first response**: normal — model loads into VRAM on first call (~10-20s). Later calls are faster.
- **Unicode errors in console**: run `chcp 65001` first, or the app already reconfigures stdout to UTF-8.
- **A package missing**: `python -m pip install -r requirements.txt`
- **VRAM out of memory**: only one big model fits at a time; close other GPU apps. Reduce context in `config.yaml`.
- **Reset to clean state**: `git stash` then `git checkout master`.

## Files to read first
1. `VISION.md` — the goal and success criteria.
2. `PLAN.md` — what is done and what is next.
3. `config.yaml` — model routing and settings.
