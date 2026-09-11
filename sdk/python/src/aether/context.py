from __future__ import annotations

from .rerank import mmr_select
from .text import round4, snippet
from .types import Candidate, Citation, Confidence, Conflict, IndexedChunk

TOKEN_BUDGET = 2800


def assemble_context(cands: list[Candidate], k: int = 8) -> tuple[list[Candidate], list[Citation], list[Conflict], Confidence]:
    diverse = mmr_select([c for c in cands if c.rerank >= 0.18], min(k, len(cands)))
    selected: list[Candidate] = []
    tokens = 0
    for c in diverse:
        if tokens + c.chunk.token_count > TOKEN_BUDGET and len(selected) >= 3:
            break
        selected.append(c)
        tokens += c.chunk.token_count
    citations = [
        Citation(
            n=i + 1,
            chunk_id=c.chunk.id,
            document_id=c.chunk.document_id,
            title=c.chunk.doc_title,
            filename=c.chunk.source_uri.split("/")[-1] or c.chunk.doc_title,
            section=c.chunk.section,
            page=c.chunk.page,
            excerpt=snippet(c.chunk.content, 280),
            score=round4(c.rerank),
            valid_from=c.chunk.valid_from,
            valid_to=c.chunk.valid_to,
            version=c.chunk.version,
        )
        for i, c in enumerate(selected)
    ]
    contradictions = _detect_conflicts([c.chunk for c in selected])
    confidence = _score_confidence(selected, contradictions)
    return selected, citations, contradictions, confidence


def _detect_conflicts(chunks: list[IndexedChunk]) -> list[Conflict]:
    arch = [
        c
        for c in chunks
        if c.collection == "architecture"
        and (
            re_search(r"current production architecture", c.content)
            or re_search(r"current platform", c.section)
        )
    ]
    live = [c for c in arch if c.status == "indexed"]
    dead = [c for c in arch if c.status == "deprecated"]
    if live and dead:
        a, b = dead[0], live[0]
        return [
            Conflict(
                topic="Current production architecture",
                a={"title": a.doc_title, "excerpt": snippet(a.content, 180), "validFrom": a.valid_from, "version": a.version},
                b={"title": b.doc_title, "excerpt": snippet(b.content, 180), "validFrom": b.valid_from, "version": b.version},
                resolution=f"{b.doc_title} ({b.valid_from}) supersedes {a.doc_title} ({a.valid_from}).",
            )
        ]
    return []


def re_search(pat: str, text: str) -> bool:
    import re

    return bool(re.search(pat, text, re.I))


def _score_confidence(selected: list[Candidate], conflicts: list[Conflict]) -> Confidence:
    top = selected[0].rerank if selected else 0.0
    second = selected[1].rerank if len(selected) > 1 else 0.0
    gap = top - second
    coverage = min(1.0, len(selected) / 4)
    agreement = 0.55 if conflicts else 0.9
    density = (
        sum(c.rerank for c in selected[:3]) / min(3, len(selected)) if selected else 0.0
    )
    raw = 0.4 * top + 0.2 * min(1.0, gap * 3) + 0.15 * coverage + 0.15 * agreement + 0.1 * density
    score = max(0.0, min(0.99, raw))
    band = "high" if score >= 0.9 else "medium" if score >= 0.7 else "low" if score >= 0.5 else "insufficient"
    return Confidence(
        score=round4(score),
        band=band,  # type: ignore[arg-type]
        factors=[
            {"name": "top relevance", "value": round4(top), "note": "Best reranked chunk"},
            {"name": "score gap", "value": round4(gap), "note": "Separation from runner-up"},
            {"name": "citation coverage", "value": round4(coverage), "note": f"{len(selected)} context chunks"},
            {"name": "source agreement", "value": round4(agreement), "note": "conflict detected" if conflicts else "no conflict"},
            {"name": "evidence density", "value": round4(density), "note": "Mean top-3 rerank"},
        ],
    )
