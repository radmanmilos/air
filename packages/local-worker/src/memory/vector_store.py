"""Long-term vector memory (RAG) using chromadb + Ollama embeddings."""
from __future__ import annotations

from pathlib import Path

import chromadb

from src.core.ollama_client import OllamaClient
from src.core.router import Router


class VectorStore:
    def __init__(self, persist_dir: str = ".agent/memory", collection: str = "memory"):
        Path(persist_dir).mkdir(parents=True, exist_ok=True)
        self.client = chromadb.PersistentClient(path=persist_dir)
        self.collection = self.client.get_or_create_collection(name=collection)
        self.ollama = OllamaClient()
        self.embed_model = Router().pick("embed")

    def _embed(self, texts: list[str]) -> list[list[float]]:
        return self.ollama.embed(self.embed_model, texts)

    def add(self, text: str, metadata: dict | None = None, id: str | None = None) -> str:
        import uuid
        doc_id = id or str(uuid.uuid4())
        self.collection.add(
            ids=[doc_id],
            documents=[text],
            embeddings=self._embed([text]),
            metadatas=[metadata or {}],
        )
        return doc_id

    def add_chunks(self, chunks: list[str], metadata: dict | None = None) -> int:
        ids = []
        import uuid
        for c in chunks:
            ids.append(str(uuid.uuid4()))
        self.collection.add(
            ids=ids,
            documents=chunks,
            embeddings=self._embed(chunks),
            metadatas=[metadata or {} for _ in chunks],
        )
        return len(chunks)

    def query(self, text: str, top_k: int = 6) -> list[dict]:
        res = self.collection.query(query_embeddings=self._embed([text]), n_results=top_k)
        out = []
        docs = res.get("documents", [[]])[0]
        metas = res.get("metadatas", [[]])[0]
        dists = res.get("distances", [[]])[0]
        for d, m, dist in zip(docs, metas, dists):
            out.append({"text": d, "metadata": m, "distance": dist})
        return out

    def count(self) -> int:
        return self.collection.count()


def chunk_text(text: str, size: int = 1200, overlap: int = 200) -> list[str]:
    chunks = []
    i = 0
    n = len(text)
    while i < n:
        chunks.append(text[i:i + size])
        i += size - overlap
        if i >= n:
            break
    return [c for c in chunks if c.strip()]
