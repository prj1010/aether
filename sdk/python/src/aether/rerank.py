from __future__ import annotations

import re

from .security import scan_injection
from .text import cosine, embed, min_max_normalize, tokenize
from .types import Candidate, IndexedChunk


def hybrid_candidates(
    chunks: list[IndexedChunk],
    sparse_scores: dict[str, float],
    query: str,
    k: int = 40,
) -> list[Candidate]:
    q_emb = embed(query)
    q_tokens = set(tokenize(query))
    rows = []
    dense_raw: list[float] = []
    sparse_raw: list[float] = []
    for chunk in chunks:
        dense = cosine(q_emb, chunk.embedding)
        sparse = sparse_scores.get(chunk.id, 0.0)
        rows.append((chunk, dense, sparse))
        dense_raw.append(dense)
        sparse_raw.append(sparse)
    d_n = min_max_normalize(dense_raw)
    s_n = min_max_normalize(sparse_raw)
    out: list[Candidate] = []
    for i, (chunk, _d, _s) in enumerate(rows):
        dense, sparse = d_n[i], s_n[i]
        hybrid = 0.52 * sparse + 0.48 * dense
        reasons: list[str] = []
        if sparse > 0.6:
            reasons.append("strong lexical match")
        if dense > 0.55:
            reasons.append("semantic neighborhood")
        if any(t in q_tokens for t in tokenize(chunk.title)):
            reasons.append("title overlap")
        out.append(
            Candidate(
                chunk=chunk,
                sparse=sparse,
                dense=dense,
                hybrid=hybrid,
                graph=0.0,
                rerank=hybrid,
                reasons=reasons,
            )
        )
    out.sort(key=lambda c: c.hybrid, reverse=True)
    return out[:k]


def apply_graph_boost(cands: list[Candidate], graph_chunk_ids: set[str], weight: float = 0.25) -> None:
    for c in cands:
        if c.chunk.id in graph_chunk_ids:
            c.graph = min(1.0, c.graph + weight)
            c.reasons.append("graph expansion")


def rerank(cands: list[Candidate], query: str, now: str = "2026-09-11") -> list[Candidate]:
    q_tokens = set(tokenize(query))
    query_wants_bait = bool(re.search(r"inject|ignore previous|vendor faq|system prompt", query, re.I))
    scored: list[Candidate] = []
    for c in cands:
        extra = 0.0
        title_hits = sum(1 for t in tokenize(c.chunk.title) if t in q_tokens)
        if title_hits:
            extra += 0.08 * min(3, title_hits)
        ent_hits = sum(1 for e in c.chunk.entities if e.lower() in query.lower())
        if ent_hits:
            extra += 0.05 * min(4, ent_hits)
        if c.chunk.status == "deprecated":
            extra -= 0.12
        if c.chunk.valid_to and c.chunk.valid_to < now:
            extra -= 0.1
        if c.chunk.valid_from > "2025-01-01":
            extra += 0.04
        if c.chunk.classification == "confidential":
            extra += 0.01
        bait = len(scan_injection(c.chunk.content)) > 0
        if bait and not query_wants_bait:
            extra -= 0.85
            c.reasons.append("untrusted injection downranked")
        c.rerank = max(0.0, min(1.15, c.hybrid + c.graph + extra))
        scored.append(c)
    scored.sort(key=lambda x: x.rerank, reverse=True)
    return scored


def mmr_select(cands: list[Candidate], k: int, lam: float = 0.72) -> list[Candidate]:
    selected: list[Candidate] = []
    rest = list(cands)
    while len(selected) < k and rest:
        best_i, best = 0, float("-inf")
        for i, c in enumerate(rest):
            max_sim = 0.0
            for s in selected:
                sim = cosine(c.chunk.embedding, s.chunk.embedding)
                if sim > max_sim:
                    max_sim = sim
            mmr = lam * c.rerank - (1 - lam) * max_sim
            if mmr > best:
                best, best_i = mmr, i
        selected.append(rest.pop(best_i))
    return selected
