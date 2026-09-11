from __future__ import annotations

import time
from dataclasses import dataclass

from .corpus import load_golden
from .engine import Engine
from .plan import classify_query


@dataclass
class EvalExampleResult:
    id: str
    question: str
    hit: bool
    reciprocal_rank: float
    recall_at_5: float
    predicted_sources: list[str]
    path: str
    latency_ms: int


@dataclass
class EvalReport:
    results: list[EvalExampleResult]
    recall_at_5: float
    mrr: float
    mean_latency_ms: float

    def __str__(self) -> str:
        hits = sum(1 for r in self.results if r.hit)
        return f"Recall@k {self.recall_at_5:.0%} · MRR {self.mrr:.2f} · {hits}/{len(self.results)} hits · {self.mean_latency_ms:.0f} ms"


def run_golden_eval(engine: Engine | None = None) -> EvalReport:
    eng = engine or Engine.northstar()
    results: list[EvalExampleResult] = []
    for ex in load_golden():
        t0 = time.time()
        hits = eng.search(ex["question"], 8)
        predicted: list[str] = []
        for h in hits:
            if h.document_id not in predicted:
                predicted.append(h.document_id)
        ranks = [predicted.index(s) for s in ex["expectedSources"] if s in predicted]
        best = min(ranks) if ranks else -1
        hit = best >= 0
        rr = (1 / (best + 1)) if hit else 0.0
        hits_at = sum(1 for s in ex["expectedSources"] if s in predicted[:8])
        recall = hits_at / len(ex["expectedSources"]) if ex["expectedSources"] else 0.0
        results.append(
            EvalExampleResult(
                id=ex["id"],
                question=ex["question"],
                hit=hit,
                reciprocal_rank=rr,
                recall_at_5=recall,
                predicted_sources=predicted,
                path=classify_query(ex["question"]).path,
                latency_ms=int((time.time() - t0) * 1000),
            )
        )
    n = len(results) or 1
    return EvalReport(
        results=results,
        recall_at_5=sum(r.recall_at_5 for r in results) / n,
        mrr=sum(r.reciprocal_rank for r in results) / n,
        mean_latency_ms=sum(r.latency_ms for r in results) / n,
    )
