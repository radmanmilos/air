"""Memory tools for the agent."""
from __future__ import annotations

from src.memory.vector_store import VectorStore, chunk_text

_store = None


def _get_store() -> VectorStore:
    global _store
    if _store is None:
        _store = VectorStore()
    return _store


def remember(text: str) -> str:
    sid = _get_store().add(text, metadata={"kind": "fact"})
    return f"Remembered (id={sid[:8]})."


def recall(query: str, top_k: int = 6) -> str:
    results = _get_store().query(query, top_k=top_k)
    if not results:
        return "(no memories)"
    lines = []
    for r in results:
        lines.append(f"- {r['text'][:400]}")
    return "\n".join(lines)


def index_file(path: str) -> str:
    from src.tools.files import read_file
    content = read_file(path)
    if content.startswith("ERROR"):
        return content
    chunks = chunk_text(content)
    n = _get_store().add_chunks(chunks, metadata={"source": path})
    return f"Indexed {n} chunks from {path}."


def memory_count() -> str:
    return f"Memories stored: {_get_store().count()}"