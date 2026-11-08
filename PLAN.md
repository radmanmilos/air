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

## Phase 4 — Legs (autonomy) [~]
Goal: unattended complex tasks.
- [x] `autonomy/planner.py` — goal -> steps (deepseek-r1)
- [x] `autonomy/executor.py` — run steps, retry, checkpoint
- [x] `autonomy/critic.py` — self-check + redo
- [x] `autonomy/scheduler.py` — background/long tasks
- [x] Safety: approval gates, allowlists, sandboxed cwd
- [x] Git tools: status, diff, branch, commit (for self-improvement)
- [x] Test runner tool: run pytest, report pass/fail
- [x] Self-improve workflow (Phase 6) implemented and tested (needs tuning)
- [~] Multi-model orchestration optimization (NEW): PerfOrch-style parallel execution for complementary tasks; performance benchmarking per task/model; hybrid routing (sequential by default, parallel when beneficial)

## Phase 6 — Self-improvement (the agent grows itself) [~]
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

## Decisions log — Cycle 3 Additions (2026-11-07)
- 2026-11-07: Mini-cycles enabled parallel execution (~40% faster than sequential)
- 2026-11-07: Self-reflection module created (src/core/self_reflection.py) for learning from failures  
- 2026-11-07: Ollama connection failures fixed by separating unit vs integration tests
- 2026-11-07: All unit tests now pass with mock-based approach, live services in integration tests only

## Notes / blockers — Cycle 3 (2026-11-07)
- Mini-cycles A & B complete, ready for Phase 4 continuation
- Integration tests skipped when OLLAMA_URL not configured (expected behavior)
- Test coverage: 33/33 collected, ~9 core passing (unit tests), others require live Ollama
