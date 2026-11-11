# Vision — Making Good AIs

## The Goal

Take small, weak, locally-hosted models (the ones that "can't do much") and give them everything they need to become **real, useful AI assistants** that can work *beside* the user and execute complex tasks — while staying **small, local, and not resource-demanding**.

The models don't need to be huge if the *system around them* is good. We build the body, senses, and habits; the model provides the brain.

## The Metaphor (what we are building)

- **Head (thinking)** — reasoning, planning, self-correction. *(deepseek-r1:1.5b, qwen3.5:4b thinking)*
- **Eyes (seeing)** — image understanding. *(qwen3.5:4b native vision)*
- **Ears (listening)** — speech-to-text. *(faster-whisper)*
- **Mouth (speaking)** — text-to-speech. *(piper)*
- **Arms (reaching)** — tools: read/write files, run commands, search the web, edit code. *(tool layer)*
- **Legs (standing on their own)** — autonomy: plan -> execute -> verify -> retry; memory; background tasks; serve other projects. *(agent loop + memory + scheduler + API)*

## Self-improvement (the ultimate goal)

The agent must be able to work on *this project* (its own codebase) and improve itself:
- Read its own source and tests.
- Propose and apply code changes (via git branches, never on main directly).
- Run the test suite; only commit if tests pass.
- Update PLAN.md as it completes work.
- Ask for human approval before destructive or large changes (configurable).

This is the "legs" reaching their final form: an AI that stands on its own and grows.

## Non-negotiables

1. **Local-first.** Everything runs on the user's machine. No cloud required (cloud is an optional fallback slot, never a dependency).
2. **Small & cheap.** Target 4B-7B models, ~6 GB VRAM, ~16 GB RAM. One big model in VRAM at a time.
3. **Useful.** Must complete real tasks end-to-end (fix a bug, build a small app, research a topic), not just chat.
4. **Transparent.** The user can see what the agent did (tool calls, plans, logs). No black box.
5. **Extensible.** Adding a new tool, model, or sense is a small, documented change.

## Success criteria (how we know it works)

- "Read this repo and fix the failing test" completes unattended.
- "Build me a small web app that does X" produces a runnable project.
- Voice mode: speak a request -> agent acts -> speaks back.
- Memory: agent remembers facts/preferences across sessions.
- Runs on the existing hardware (RTX 3060 6GB, 16GB RAM) without OOM.
- **Self-improvement:** once working, the agent can read its own code, plan an improvement, edit files, run tests, and commit — without human help. It can grow itself.

## Current hardware

- GPU: NVIDIA RTX 3060 Laptop, 6 GB VRAM
- RAM: 16 GB (Ryzen 7 5800H, 8c/16t)
- OS: Windows 11

## Installed models (Ollama)

- `qwen3.5:4b` (3.3 GB) — brain: vision + tools + thinking. **Primary.**
- `qwen2.5-coder:7b` (4.7 GB) — code specialist.
- `deepseek-r1:1.5b` (1.1 GB) — fast reasoner.

See `PLAN.md` for progress.
