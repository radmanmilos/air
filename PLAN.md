# Plan — Making Good AIs (living document)

This file is the working plan. Updated as work progresses. See `VISION.md` for the goal.

## Status legend
- [ ] not started
- [~] in progress
- [x] done

---

## Phase 0 — Discovery & setup ✅
- [x] Inspect installed Ollama models and capabilities (qwen3.5:4b has vision+tools+thinking)
- [x] Verify tool-calling works via /api/chat (tested, clean tool_calls returned)
- [x] Verify vision works via /api/chat images (tested, correct "Red")
- [x] Check hardware (RTX 3060 6GB, 16GB RAM, Ryzen 7 5800H)
- [x] Create VISION.md + PLAN.md

## Phase 1 — Brain + Arms (MVP) [x]
Goal: agent can take a goal, use tools (files/shell/web), and complete a task end-to-end via CLI.
- [x] Project skeleton (src/, tests/, config, requirements)
- [x] `core/ollama_client.py` — chat, embeddings, model listing
- [x] `core/router.py` — capability-based model selection
- [x] `tools/registry.py` — schema + dispatch
- [x] `tools/files.py` — read/write/list/search/move
- [x] `tools/shell.py` — run command (approval gate)
- [x] `tools/web.py` — search + fetch
- [x] `core/agent_loop.py` — ReAct loop
- [x] `main.py` + CLI (typer) — `run`, `chat`, `models`, `inspect`
- [x] Smoke test: "list files in this folder" via agent (passed)
- [x] Git tools + run_tests tool (bonus for self-improvement)

## Phase 2 — Memory [x]
Goal: handle inputs larger than context; remember across sessions.
- [x] `memory/conversation.py` — sliding window
- [x] Pull `nomic-embed-text`
- [x] `memory/vector_store.py` — chromadb + embeddings (RAG)
- [x] Chunking for code/text
- [x] Persist memory to disk
- [x] Memory tools (remember/recall/index_file) registered

## Phase 3 — Senses (see/speak/listen) [x]
Goal: full multimodal loop.
- [x] Vision tool (describe_image) — uses qwen3.5 natively
- [x] `senses/stt.py` — faster-whisper (listen)
- [x] `senses/tts.py` — piper/pyttsx3 (speak)
- [x] `interfaces/voice_mode.py` — listen -> think -> speak loop
- [ ] Mic/speaker device config (basic works)

## Phase 4 — Legs (autonomy) [x]
Goal: unattended complex tasks.
- [x] `autonomy/planner.py` — goal -> steps (deepseek-r1)
- [x] `autonomy/executor.py` — run steps, retry, checkpoint
- [x] `autonomy/critic.py` — self-check + redo
- [x] `autonomy/scheduler.py` — background/long tasks
- [x] Safety: approval gates, allowlists, sandboxed cwd
- [x] Git tools: status, diff, branch, commit (for self-improvement)
- [x] Test runner tool: run pytest, report pass/fail
- [x] Self-improve workflow (Phase 6) implemented and tested (needs tuning)
- [x] Multi-model orchestration optimization: PerfOrch-style parallel execution; performance benchmarking per task/model; hybrid routing
  - [x] Benchmark harness (src/autonomy/benchmark.py)
  - [x] Parallel executor (Orchestrator.run_parallel)
  - [x] Hybrid router (Orchestrator.run_hybrid, Router.pick_fastest)
  - [x] Ollama resilience (auto-restart, 5-min wait)

## Phase 7 — Project Execution (NEW) [x]
Goal: build complete client projects from requirements with plan→execute→verify→iterate.
- [x] `autonomy/project_executor.py` — decompose, execute, verify, retry, state persistence
- [x] `autonomy/task_decomposer.py` — break goals into steps, model routing per step type
- [x] `autonomy/result_verifier.py` — critique step results, verify final deliverables
- [x] `autonomy/multi_agent.py` — architect/coder/reviewer/integrator role collaboration
- [x] `autonomy/test_generator.py` — auto-generate pytest tests for projects
- [x] `autonomy/templates.py` — project scaffolding (file_search, cli_tool, api_service, documentation)
- [x] `autonomy/doc_generator.py` — auto-generate README/ARCHITECTURE/API docs
- [x] `tools/project_tools.py` — 6 project management tools
- [x] `tools/code_analysis.py` — 4 code analysis tools (lint, deps, pip install, line count)
- [x] `tools/plugin_system.py` — dynamic plugin discovery/loading
- [x] `mgai.py` — auto-detects external folders, uses ProjectExecutor for project work
- [x] `src/main.py` — project-execute, project-status, project-plan, project-resume CLI commands

## Phase 6 — Self-improvement (the agent grows itself) [x]
Goal: agent works on this project's own codebase safely.
- [x] Self-improvement workflow: read -> plan -> branch -> edit -> test -> commit
- [x] Guardrails: never commit to main; require tests green; max diff size
- [x] Agent can update PLAN.md checkboxes as it completes work
- [ ] Rollback on test failure (partial)
- [x] Human approval gate for self-modification (configurable, auto in self-improve)
- [x] Proven: created tests/test_router.py with 10 passing tests autonomously

## Phase 5 — Integration
Goal: usable from other projects.
- [x] `interfaces/api.py` — FastAPI server (import OK, /health, /models, /tools/list verified)
- [x] Web UI (minimal) — dashboard in src/interfaces/api_ui.py (HTML + /health, /models, /tools/list verified)
- [x] Docs + examples (docs/README.md, quickstart.md, examples/)
- [x] Packaging (pip install -e .) — pyproject.toml, mgai entry point installed

## Decisions log
- 2026-11-06: Python as implementation language (ecosystem fit).
- 2026-11-06: qwen3.5:4b is primary brain (vision+tools+thinking in 3.3GB).
- 2026-11-06: Routing is sequential (6GB VRAM, one big model at a time).
- 2026-11-06: TTS = piper, STT = faster-whisper (offline, small). (pending user confirm)
- 2026-11-06: Context cap 32k interactive; RAG for larger.

## Notes / blockers
- Python 3.14 very new; whisper/piper wheels may need 3.12 venv. Revisit if install fails.
- Sub-cycle 3a complete: benchmark harness implemented and tested (commit fbe1c95).
- Protect file: Plan document - only update checkboxes here, never delete sections or reorder.
- 2026-11-08: Correction: self_reflection.py exists (merged from mini-cycle-a). test_planner/test_critic basic tests used live Ollama; fixed by mocking. Current: 29 passed, 1 skipped, 0 failed (offline).
- 2026-11-08: Ollama resilience added: client now auto-restarts Ollama (up to 5 min) on connection failure. OLLAMA_MODELS env points to a dir with only qwen2.5-coder; other models in E:\AIModels. For full functionality, point OLLAMA_MODELS at the dir containing all needed models.
- 2026-11-09: Project Execution Engine added (Phase 7): decompose→execute→verify→iterate with state persistence, code analysis tools, dependency-ordered step execution. 36 tools total. No protected files modified.
- 2026-11-09: Cutting-edge additions: multi-agent role collaboration (architect/coder/reviewer/integrator), auto-test generation, project scaffolding templates (file_search/cli_tool/api_service/documentation), auto-documentation (README/ARCHITECTURE/API), dynamic plugin system. 44 tools total.
