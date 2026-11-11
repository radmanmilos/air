"""Short-term conversation memory with sliding window + summarization trigger."""
from __future__ import annotations

from collections import deque


class ConversationMemory:
    def __init__(self, max_messages: int = 40):
        self.max_messages = max_messages
        self.messages: list[dict] = []
        self.summary: str = ""

    def add(self, role: str, content: str) -> None:
        self.messages.append({"role": role, "content": content})
        if len(self.messages) > self.max_messages:
            # drop oldest (keep system if present)
            self.messages = self.messages[-self.max_messages:]

    def get(self) -> list[dict]:
        out = []
        if self.summary:
            out.append({"role": "system", "content": f"Summary of earlier conversation: {self.summary}"})
        out.extend(self.messages)
        return out

    def clear(self) -> None:
        self.messages = []
        self.summary = ""
