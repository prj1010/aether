from __future__ import annotations

import math
from dataclasses import dataclass

from .text import tokenize
from .types import IndexedChunk

K1 = 1.5
B = 0.75


@dataclass
class Bm25Index:
    N: int
    avgdl: float
    df: dict[str, int]
    tfs: dict[str, dict[str, int]]
    dl: dict[str, int]


def build_bm25(chunks: list[IndexedChunk]) -> Bm25Index:
    df: dict[str, int] = {}
    tfs: dict[str, dict[str, int]] = {}
    dl: dict[str, int] = {}
    total = 0
    for c in chunks:
        tokens = tokenize(f"{c.title} {c.section} {c.content}")
        dl[c.id] = len(tokens)
        total += len(tokens)
        tf: dict[str, int] = {}
        for t in tokens:
            tf[t] = tf.get(t, 0) + 1
        tfs[c.id] = tf
        for t in tf:
            df[t] = df.get(t, 0) + 1
    return Bm25Index(
        N=len(chunks),
        avgdl=(total / len(chunks)) if chunks else 0,
        df=df,
        tfs=tfs,
        dl=dl,
    )


def bm25_score(index: Bm25Index, chunk_id: str, query_tokens: list[str]) -> float:
    tf = index.tfs.get(chunk_id)
    doc_len = index.dl.get(chunk_id, 0)
    if not tf or not query_tokens:
        return 0.0
    score = 0.0
    seen: set[str] = set()
    for term in query_tokens:
        if term in seen:
            continue
        seen.add(term)
        f = tf.get(term, 0)
        if f == 0:
            continue
        n = index.df.get(term, 0)
        idf = math.log(1 + (index.N - n + 0.5) / (n + 0.5))
        denom = f + K1 * (1 - B + B * (doc_len / (index.avgdl or 1)))
        score += idf * ((f * (K1 + 1)) / denom)
    return score


def bm25_search(
    index: Bm25Index, chunks: list[IndexedChunk], query: str, k: int = 40
) -> list[tuple[IndexedChunk, float]]:
    q = tokenize(query)
    scored = [(chunk, bm25_score(index, chunk.id, q)) for chunk in chunks]
    scored.sort(key=lambda x: x[1], reverse=True)
    return scored[:k]
