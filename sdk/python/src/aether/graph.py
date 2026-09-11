from __future__ import annotations

from dataclasses import dataclass

from .ingest import extract_entities
from .text import cosine, embed, tokenize
from .types import IndexedChunk


def _norm_entity(e: str) -> str:
    return re_sub(e)


def re_sub(e: str) -> str:
    import re

    return re.sub(r"[^a-z0-9]+", " ", e.lower()).strip()


@dataclass
class SemanticGraph:
    entity_to_chunks: dict[str, set[str]]
    chunk_to_entities: dict[str, list[str]]


def build_graph(chunks: list[IndexedChunk]) -> SemanticGraph:
    entity_to_chunks: dict[str, set[str]] = {}
    chunk_to_entities: dict[str, list[str]] = {}
    for c in chunks:
        ents = list(dict.fromkeys(_norm_entity(e) for e in c.entities if _norm_entity(e)))
        chunk_to_entities[c.id] = ents
        for e in ents:
            entity_to_chunks.setdefault(e, set()).add(c.id)
    return SemanticGraph(entity_to_chunks, chunk_to_entities)


def seed_entities(query: str, graph: SemanticGraph) -> list[str]:
    from_lex = [_norm_entity(e) for e in extract_entities(query)]
    tokens = tokenize(query)
    seeds: list[str] = []
    seen: set[str] = set()
    for e in from_lex:
        if e in graph.entity_to_chunks and e not in seen:
            seen.add(e)
            seeds.append(e)
    for ent in graph.entity_to_chunks:
        if len(ent) < 3:
            continue
        if any(t in ent or ent in t for t in tokens) and ent not in seen:
            seen.add(ent)
            seeds.append(ent)
        if len(seeds) >= 12:
            break
    return seeds[:12]


def expand_graph(
    query: str,
    seeds: list[str],
    graph: SemanticGraph,
    chunks_by_id: dict[str, IndexedChunk],
    hops: int = 2,
) -> tuple[list[str], list[str], int]:
    q_emb = embed(query)
    visited_chunks: set[str] = set()
    visited_entities: set[str] = set(seeds)
    frontier = list(seeds)
    for _ in range(hops):
        nxt: list[str] = []
        for ent in frontier:
            chunk_ids = graph.entity_to_chunks.get(ent)
            if not chunk_ids:
                continue
            ranked = []
            for cid in chunk_ids:
                ch = chunks_by_id.get(cid)
                if ch:
                    ranked.append((cid, cosine(q_emb, ch.embedding)))
            ranked.sort(key=lambda x: x[1], reverse=True)
            for cid, _score in ranked[:6]:
                if cid in visited_chunks:
                    continue
                visited_chunks.add(cid)
                for e in graph.chunk_to_entities.get(cid, []):
                    if e not in visited_entities:
                        visited_entities.add(e)
                        nxt.append(e)
        frontier = nxt[:16]
        if not frontier:
            break
    return list(visited_chunks), list(visited_entities), hops
