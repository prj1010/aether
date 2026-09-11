from __future__ import annotations

import time
from dataclasses import dataclass, field

from .context import assemble_context
from .corpus import build_seed_index
from .generate import generate_answer
from .graph import SemanticGraph, build_graph, expand_graph, seed_entities
from .ingest import ingest_plain_text
from .plan import classify_query, should_deepen
from .rerank import apply_graph_boost, hybrid_candidates, rerank
from .security import scan_injection
from .sparse import Bm25Index, bm25_search, build_bm25
from .text import round4, tokenize
from .types import Answer, CollectionId, Document, IndexedChunk, MemoryItem, QueryPath


@dataclass
class SearchHit:
    chunk_id: str
    document_id: str
    title: str
    section: str
    page: int
    excerpt: str
    score: float
    collection: str


@dataclass
class Engine:
    documents: list[Document] = field(default_factory=list)
    chunks: list[IndexedChunk] = field(default_factory=list)
    bm25: Bm25Index | None = field(default=None, repr=False)
    graph: SemanticGraph | None = field(default=None, repr=False)
    chunks_by_id: dict[str, IndexedChunk] = field(default_factory=dict, repr=False)

    @classmethod
    def northstar(cls) -> Engine:
        documents, chunks = build_seed_index()
        return cls.from_index(documents, chunks)

    @classmethod
    def empty(cls) -> Engine:
        return cls.from_index([], [])

    @classmethod
    def from_index(cls, documents: list[Document], chunks: list[IndexedChunk]) -> Engine:
        eng = cls(documents=documents, chunks=chunks)
        eng._rebuild()
        return eng

    def _rebuild(self) -> None:
        self.bm25 = build_bm25(self.chunks)
        self.graph = build_graph(self.chunks)
        self.chunks_by_id = {c.id: c for c in self.chunks}

    def ingest(
        self,
        title: str,
        text: str,
        collection: CollectionId = "policy",
        filename: str = "",
        author: str = "Uploaded",
    ) -> Document:
        doc, chunks = ingest_plain_text(title, text, collection, filename, author)
        self.documents.append(doc)
        self.chunks.extend(chunks)
        self._rebuild()
        return doc

    def search(self, query: str, k: int = 12) -> list[SearchHit]:
        assert self.bm25 is not None
        sparse_hits = bm25_search(self.bm25, self.chunks, query, 40)
        sparse_map = {c.id: s for c, s in sparse_hits}
        cands = rerank(hybrid_candidates(self.chunks, sparse_map, query, 40), query)
        return [
            SearchHit(
                chunk_id=c.chunk.id,
                document_id=c.chunk.document_id,
                title=c.chunk.doc_title,
                section=c.chunk.section,
                page=c.chunk.page,
                excerpt=c.chunk.content[:240],
                score=round4(c.rerank),
                collection=c.chunk.collection,
            )
            for c in cands[:k]
        ]

    def ask(
        self,
        query: str,
        memory: list[MemoryItem] | None = None,
        force_path: QueryPath | str = "adaptive",
    ) -> Answer:
        t_all = time.time()
        assert self.bm25 is not None and self.graph is not None
        injection_flags = scan_injection(query)
        plan = classify_query(query)
        if force_path == "fast":
            plan.path = "fast"
            plan.use_graph = False
        if force_path == "deep":
            plan.path = "deep"
            plan.use_graph = True

        mem = memory or []
        if plan.use_memory:
            qtok = tokenize(query)
            memory_hits = [m for m in mem if any(t in tokenize(m.content) for t in qtok)]
        else:
            memory_hits = mem[:4]

        sparse_hits = bm25_search(self.bm25, self.chunks, query, 50)
        sparse_map = {c.id: s for c, s in sparse_hits}
        cands = hybrid_candidates(self.chunks, sparse_map, query, 40)
        top_hybrid = cands[0].hybrid if cands else 0.0
        deepen = False if force_path == "fast" else should_deepen(top_hybrid, plan)
        if deepen:
            plan.path = "deep"
            plan.use_graph = True
            seeds = seed_entities(query, self.graph)
            chunk_ids, _ents, _hops = expand_graph(query, seeds, self.graph, self.chunks_by_id, 2)
            apply_graph_boost(cands, set(chunk_ids), 0.25)

        cands = rerank(cands, query)
        selected, citations, contradictions, confidence = assemble_context(cands, 8)
        if injection_flags:
            selected = [s for s in selected if s.chunk.document_id != "doc-injection-bait"]
        gen = generate_answer(query, selected, contradictions, memory_hits, confidence.band)
        refused = "couldn't find enough evidence" in gen["answer"].lower()
        return Answer(
            text=gen["answer"],
            citations=citations,
            confidence=confidence,
            path=plan.path,
            kind=plan.kind,
            latency_ms=int((time.time() - t_all) * 1000),
            contradictions=contradictions,
            followups=gen["followups"],
            model=gen["model"],
            used_llm=gen["used_llm"],
            refused=refused,
            injection_flags=injection_flags,
            trace_id=f"tr_{int(time.time()*1000):x}",
        )

    def stats(self) -> dict:
        entities = len(self.graph.entity_to_chunks) if self.graph else 0
        return {
            "documents": len(self.documents),
            "chunks": len(self.chunks),
            "entities": entities,
        }
