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

## Phase 2 — Memory
Goal: handle inputs larger than context; remember across sessions.
- [ ] `memory/conversation.py` — sliding window + summarization
- [ ] Pull `nomic-embed-text`
- [ ] `memory/vector_store.py` — chromadb + embeddings (RAG)
- [ ] Chunking for code/text
- [ ] Persist memory to disk

## Phase 3 — Senses (see/speak/listen)
Goal: full multimodal loop.
- [ ] Vision tool (describe image / OCR) — uses qwen3.5 natively
- [ ] `senses/stt.py` — faster-whisper (listen)
- [ ] `senses/tts.py` — piper (speak)
- [ ] `interfaces/voice_mode.py` — listen -> think -> speak loop
- [ ] Mic/speaker device config

## Phase 4 — Legs (autonomy)
Goal: unattended complex tasks.
- [ ] `autonomy/planner.py` — goal -> steps (deepseek-r1)
- [ ] `autonomy/executor.py` — run steps, retry, checkpoint
- [ ] `autonomy/critic.py` — self-check + redo
- [ ] `autonomy/scheduler.py` — background/long tasks
- [ ] Safety: approval gates, allowlists, sandboxed cwd
- [ ] Git tools: status, diff, branch, commit (for self-improvement)
- [ ] Test runner tool: run pytest, report pass/fail

## Phase 6 — Self-improvement (the agent grows itself)
Goal: agent works on this project's own codebase safely.
- [ ] Self-improvement workflow: read -> plan -> branch -> edit -> test -> commit
- [ ] Guardrails: never commit to main; require tests green; max diff size
- [ ] Agent can update PLAN.md checkboxes as it completes work
- [ ] Rollback on test failure
- [ ] Human approval gate for self-modification (configurable)

## Phase 5 — Integration
Goal: usable from other projects.
- [ ] `interfaces/api.py` — FastAPI server
- [ ] Web UI (minimal)
- [ ] Docs + examples
- [ ] Packaging (pip install -e .)

## Decisions log
- 2026-11-06: Python as implementation language (ecosystem fit).
- 2026-11-06: qwen3.5:4b is primary brain (vision+tools+thinking in 3.3GB).
- 2026-11-06: Routing is sequential (6GB VRAM, one big model at a time).
- 2026-11-06: TTS = piper, STT = faster-whisper (offline, small). (pending user confirm)
- 2026-11-06: Context cap 32k interactive; RAG for larger.

## Notes / blockers
- Python 3.14 very new; whisper/piper wheels may need 3.12 venv. Revisit if install fails.
- (add as encountered)
