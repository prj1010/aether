from __future__ import annotations

import json
from pathlib import Path

from .ingest import chunk_document, to_indexed
from .text import content_hash
from .types import Document, IndexedChunk

DATA = Path(__file__).resolve().parent / "data"


def load_seeds() -> list[dict]:
    return json.loads((DATA / "northstar.json").read_text(encoding="utf-8"))


def load_golden() -> list[dict]:
    return json.loads((DATA / "golden.json").read_text(encoding="utf-8"))


def seed_documents() -> list[Document]:
    now = "2026-09-01T00:00:00.000Z"
    docs: list[Document] = []
    for s in load_seeds():
        content = "\n\n".join(f"## {sec['section']}\n\n{sec['body']}" for sec in s["sections"])
        docs.append(
            Document(
                id=s["id"],
                title=s["title"],
                filename=s["filename"],
                collection=s["collection"],
                version=s["version"],
                content=content,
                source_uri=f"northstar://docs/{s['filename']}",
                content_hash=content_hash(content),
                page_count=s["pageCount"],
                valid_from=s["validFrom"],
                valid_to=s.get("validTo"),
                superseded_by=s.get("supersededBy"),
                classification=s["classification"],
                author=s["author"],
                created_at=s["validFrom"] + "T00:00:00.000Z",
                updated_at=now,
                status=s["status"],
            )
        )
    return docs


def build_seed_index() -> tuple[list[Document], list[IndexedChunk]]:
    documents = seed_documents()
    seeds = {s["id"]: s for s in load_seeds()}
    chunks: list[IndexedChunk] = []
    for doc in documents:
        sections = seeds[doc.id]["sections"]
        for raw in chunk_document(doc, sections):
            chunks.append(to_indexed(doc, raw))
    return documents, chunks
