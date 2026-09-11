from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

QueryPath = Literal["fast", "deep"]
QueryKind = Literal["factual", "semantic", "exact", "multi_hop", "temporal", "memory", "ambiguous"]
CollectionId = Literal["policy", "architecture", "people", "security", "product", "operations"]
ConfidenceBand = Literal["high", "medium", "low", "insufficient"]


@dataclass
class Document:
    id: str
    title: str
    filename: str
    collection: CollectionId
    version: int
    content: str
    source_uri: str
    content_hash: str
    page_count: int
    valid_from: str
    valid_to: str | None
    superseded_by: str | None
    classification: str
    author: str
    created_at: str
    updated_at: str
    status: str


@dataclass
class IndexedChunk:
    id: str
    document_id: str
    content: str
    title: str
    section: str
    page: int
    source_uri: str
    content_hash: str
    entities: list[str]
    token_count: int
    ordinal: int
    doc_title: str
    collection: CollectionId
    version: int
    valid_from: str
    valid_to: str | None
    classification: str
    status: str
    embedding: list[float]


@dataclass
class Candidate:
    chunk: IndexedChunk
    sparse: float
    dense: float
    hybrid: float
    graph: float
    rerank: float
    reasons: list[str] = field(default_factory=list)


@dataclass
class Citation:
    n: int
    chunk_id: str
    document_id: str
    title: str
    filename: str
    section: str
    page: int
    excerpt: str
    score: float
    valid_from: str
    valid_to: str | None
    version: int


@dataclass
class Conflict:
    topic: str
    a: dict
    b: dict
    resolution: str


@dataclass
class Confidence:
    score: float
    band: ConfidenceBand
    factors: list[dict]


@dataclass
class SubQuestion:
    id: str
    text: str
    depends_on: list[str]
    kind: QueryKind


@dataclass
class QueryPlan:
    kind: QueryKind
    path: QueryPath
    strategies: list[str]
    reason: str
    subquestions: list[SubQuestion]
    use_memory: bool
    use_graph: bool


@dataclass
class MemoryItem:
    id: str
    layer: str
    wing: str
    room: str
    closet: str
    content: str


@dataclass
class Answer:
    text: str
    citations: list[Citation]
    confidence: Confidence
    path: QueryPath
    kind: QueryKind
    latency_ms: int
    contradictions: list[Conflict]
    followups: list[str]
    model: str
    used_llm: bool
    refused: bool
    injection_flags: list[str]
    trace_id: str
