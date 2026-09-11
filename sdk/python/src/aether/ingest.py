from __future__ import annotations

import re
from datetime import datetime, timezone

from .text import content_hash, embed, estimate_tokens
from .types import CollectionId, Document, IndexedChunk

ENTITY_LEXICON = [
    "helios", "nimbus", "forge", "pulse", "northstar", "okta", "workday",
    "ciso", "cissp", "pto", "vacation", "kubernetes", "postgres", "oidc",
    "engineering certification policy", "tuition assistance",
    "architecture review board", "incident commander",
    "us-east-1", "eu-west-1", "austin", "bengaluru", "london",
]


def extract_entities(text: str) -> list[str]:
    lower = text.lower()
    found: list[str] = []
    seen: set[str] = set()
    for e in ENTITY_LEXICON:
        if e in lower:
            tc = _title_case_entity(e)
            if tc not in seen:
                seen.add(tc)
                found.append(tc)
    for p in re.findall(r"\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3}\b", text):
        if 3 <= len(p) < 48 and p not in seen:
            seen.add(p)
            found.append(p)
    for c in re.findall(r"\b[A-Z]{2,}(?:-[A-Z0-9]+)+\b", text):
        if c not in seen:
            seen.add(c)
            found.append(c)
    return found[:24]


def _title_case_entity(e: str) -> str:
    if e in ("pto", "oidc", "ciso", "cissp"):
        return e.upper()
    if " " in e:
        return re.sub(r"\b\w", lambda m: m.group(0).upper(), e)
    return e[:1].upper() + e[1:]


def chunk_document(
    doc: Document, sections: list[dict] | None = None
) -> list[dict]:
    if sections is None:
        blocks = [b for b in re.split(r"^## ", doc.content, flags=re.M) if b]
        sections = []
        for i, block in enumerate(blocks):
            nl = block.find("\n")
            section = f"Section {i+1}" if nl == -1 else block[:nl].strip()
            body = block if nl == -1 else block[nl:].strip()
            sections.append({"section": section, "page": i + 1, "body": body})
    chunks = []
    ordinal = 0
    for sec in sections:
        for piece in _split_window(sec["body"], 900, 120):
            chunks.append(
                {
                    "id": f"{doc.id}::{ordinal}",
                    "document_id": doc.id,
                    "content": piece,
                    "title": doc.title,
                    "section": sec["section"],
                    "page": sec["page"],
                    "source_uri": doc.source_uri,
                    "content_hash": content_hash(piece),
                    "entities": extract_entities(f"{doc.title} {sec['section']} {piece}"),
                    "token_count": estimate_tokens(piece),
                    "ordinal": ordinal,
                }
            )
            ordinal += 1
    return chunks


def _split_window(text: str, max_chars: int, overlap: int) -> list[str]:
    if len(text) <= max_chars:
        return [text.strip()] if text.strip() else []
    paras = re.split(r"\n{2,}", text)
    out: list[str] = []
    buf = ""
    for p in paras:
        if buf and len(buf + "\n\n" + p) > max_chars:
            out.append(buf.strip())
            buf = buf[-overlap:] + "\n\n" + p
        else:
            buf = p if not buf else buf + "\n\n" + p
    if buf.strip():
        out.append(buf.strip())
    return out


def to_indexed(doc: Document, chunk: dict) -> IndexedChunk:
    emb_text = f"{doc.title} {chunk['section']} {chunk['content']}"
    return IndexedChunk(
        id=chunk["id"],
        document_id=chunk["document_id"],
        content=chunk["content"],
        title=chunk["title"],
        section=chunk["section"],
        page=chunk["page"],
        source_uri=chunk["source_uri"],
        content_hash=chunk["content_hash"],
        entities=chunk["entities"],
        token_count=chunk["token_count"],
        ordinal=chunk["ordinal"],
        doc_title=doc.title,
        collection=doc.collection,  # type: ignore[arg-type]
        version=doc.version,
        valid_from=doc.valid_from,
        valid_to=doc.valid_to,
        classification=doc.classification,
        status=doc.status,
        embedding=embed(emb_text),
    )


def ingest_plain_text(
    title: str,
    text: str,
    collection: CollectionId = "policy",
    filename: str = "",
    author: str = "Uploaded",
) -> tuple[Document, list[IndexedChunk]]:
    now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    doc_id = f"doc-user-{content_hash(title + now)[:10]}"
    slug = re.sub(r"\s+", "-", title).lower()
    filename = filename or f"{slug}.txt"
    document = Document(
        id=doc_id,
        title=title,
        filename=filename,
        collection=collection,
        version=1,
        content=text,
        source_uri=f"upload://{filename}",
        content_hash=content_hash(text),
        page_count=max(1, (len(text) + 1799) // 1800),
        valid_from=now[:10],
        valid_to=None,
        superseded_by=None,
        classification="internal",
        author=author,
        created_at=now,
        updated_at=now,
        status="indexed",
    )
    raw = chunk_document(document)
    return document, [to_indexed(document, c) for c in raw]
