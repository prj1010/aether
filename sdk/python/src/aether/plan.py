from __future__ import annotations

import re

from .types import QueryKind, QueryPath, QueryPlan, SubQuestion

MULTI_HOP = re.compile(
    r"\b(after|before|then|which .+ after|and what|why .+\band\b|compare|versus|\bvs\.?\b|migrat|adopted after|moved from)\b",
    re.I,
)
TEMPORAL = re.compile(
    r"\b(current|currently|now|as of|supersede|deprecated|previous|old|new|latest|before \d{4}|after \d{4})\b",
    re.I,
)
MEMORY = re.compile(
    r"\b(remember|last time|previously we|we decided|my preference|earlier you|what did we)\b",
    re.I,
)
EXACT = re.compile(r'"[^"]+"|\b[A-Z]{2,}(?:-[A-Z0-9]+)+\b|\bsev-?\d\b', re.I)
FACTUAL = re.compile(r"^(what is|what's|whats|when is|how many|how much|who is|where is|list)\b", re.I)


def classify_query(query: str) -> QueryPlan:
    q = query.strip()
    use_memory = bool(MEMORY.search(q))
    is_multi = bool(MULTI_HOP.search(q)) or ("?" in q and bool(re.search(r"\band\b", q, re.I)) and len(q) > 80)
    is_temporal = bool(TEMPORAL.search(q))
    is_exact = bool(EXACT.search(q))
    is_factual = bool(FACTUAL.search(q.lower()))

    kind: QueryKind
    if use_memory:
        kind = "memory"
    elif is_multi:
        kind = "multi_hop"
    elif is_temporal:
        kind = "temporal"
    elif is_exact:
        kind = "exact"
    elif is_factual or len(q.split()) <= 6:
        kind = "factual"
    else:
        kind = "semantic"

    path: QueryPath = "deep" if kind in ("multi_hop", "temporal") else "fast"
    strategies: list[str] = []
    if kind == "exact":
        strategies.extend(["sparse", "metadata"])
    elif kind == "semantic":
        strategies.extend(["dense", "hybrid"])
    elif kind == "memory":
        strategies.extend(["memory", "hybrid"])
    else:
        strategies.append("hybrid")
    if path == "deep":
        strategies.append("graph")

    use_graph = path == "deep"
    subquestions = _decompose(q) if path == "deep" else []
    reason = (
        "Query has temporal or multi-hop structure. Deep path: dependency plan + graph expansion."
        if path == "deep"
        else (
            "Exact terminology detected. Sparse retrieval is sufficient."
            if kind == "exact"
            else "Simple factual or semantic question. Fast path: hybrid retrieve → rerank → answer."
        )
    )
    return QueryPlan(
        kind=kind,
        path=path,
        strategies=strategies,
        reason=reason,
        subquestions=subquestions,
        use_memory=use_memory,
        use_graph=use_graph,
    )


def should_deepen(top_hybrid: float, plan: QueryPlan) -> bool:
    if plan.path == "deep":
        return True
    return top_hybrid < 0.32


def _decompose(query: str) -> list[SubQuestion]:
    subs: list[SubQuestion] = []
    after = re.search(
        r"after (?:the team )?(?:moved from|migrating from|leaving) ([^,?.]+?)(?: to ([^,?.]+))?",
        query,
        re.I,
    )
    if after:
        frm = (after.group(1) or "").strip()
        to = (after.group(2) or "").strip()
        if frm:
            subs.append(SubQuestion("q1", f"What was {frm}?", [], "factual"))
        if to:
            subs.append(SubQuestion("q2", f"When did the team move from {frm} to {to}?", ["q1"], "temporal"))
            subs.append(SubQuestion("q3", f"Which architecture was adopted after {to}?", ["q2"], "temporal"))
        elif frm:
            subs.append(SubQuestion("q2", f"What came after {frm}?", ["q1"], "temporal"))
    if re.search(r"\breasons?\b|\bwhy\b", query, re.I):
        dep = [subs[-1].id] if subs else []
        subs.append(SubQuestion(f"q{len(subs)+1}", "Why was the later architecture adopted?", dep, "semantic"))
    if not subs:
        parts = [
            re.sub(r"[?]", "", p).strip()
            for p in re.split(r"\band\b|\bthen\b|;", query, flags=re.I)
        ]
        parts = [p for p in parts if len(p.split()) >= 3][:4]
        for i, p in enumerate(parts):
            text = p if p.endswith("?") else p + "?"
            subs.append(SubQuestion(f"q{i+1}", text, [] if i == 0 else [f"q{i}"], "factual"))
    if not subs:
        subs.append(SubQuestion("q1", query, [], "semantic"))
    return subs
