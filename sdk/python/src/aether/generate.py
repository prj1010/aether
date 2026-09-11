from __future__ import annotations

import re
import time

from .llm import complete_chat
from .security import SYSTEM_PROMPT, wrap_untrusted
from .text import snippet
from .types import Candidate, Conflict, MemoryItem


def generate_answer(
    query: str,
    selected: list[Candidate],
    contradictions: list[Conflict],
    memory: list[MemoryItem],
    confidence_band: str,
) -> dict:
    started = time.time()
    if confidence_band == "insufficient" or not selected:
        return {
            "answer": "I couldn't find enough evidence in the available enterprise knowledge base to answer this reliably. Try a more specific policy name, or inspect retrieval to see what was considered.",
            "model": "extractive",
            "used_llm": False,
            "input_tokens": 0,
            "output_tokens": 40,
            "latency_ms": int((time.time() - started) * 1000),
            "followups": [
                "What documents are in the knowledge base?",
                "Show the retrieval inspector for this query",
            ],
        }
    user = _user_prompt(query, selected, contradictions, memory)
    llm = complete_chat(SYSTEM_PROMPT, user)
    if not llm:
        return _extractive(selected, contradictions, int((time.time() - started) * 1000))
    answer, followups = _split_followups(llm.text)
    return {
        "answer": answer,
        "model": llm.model,
        "used_llm": True,
        "input_tokens": llm.input_tokens,
        "output_tokens": llm.output_tokens,
        "latency_ms": int((time.time() - started) * 1000),
        "followups": followups,
    }


def _user_prompt(query: str, selected: list[Candidate], contradictions: list[Conflict], memory: list[MemoryItem]) -> str:
    docs = []
    for i, c in enumerate(selected):
        head = f"[{i+1}] {c.chunk.doc_title} · {c.chunk.section} · p.{c.chunk.page} · v{c.chunk.version} · valid_from {c.chunk.valid_from}"
        docs.append(head + "\n" + wrap_untrusted(c.chunk.content, c.chunk.source_uri))
    mem = ""
    if memory:
        mem = "\n<memory>\n" + "\n".join(f"{m.layer} {m.wing}/{m.room}: {m.content}" for m in memory[:8]) + "\n</memory>\n"
    conflicts = ""
    if contradictions:
        conflicts = "\nKnown conflicts:\n" + "\n".join(f"- {c.topic}: {c.resolution}" for c in contradictions) + "\n"
    return f"Question:\n{query}\n{mem}\nEvidence:\n" + "\n\n".join(docs) + f"{conflicts}\n\nWrite the answer with citations like [1]."


def _extractive(selected: list[Candidate], contradictions: list[Conflict], latency_ms: int) -> dict:
    lines = [f"{snippet(c.chunk.content, 220)} [{i+1}]" for i, c in enumerate(selected[:3])]
    answer = "\n\n".join(lines)
    if contradictions:
        answer += f"\n\nConflict detected. {contradictions[0].resolution}"
    return {
        "answer": answer,
        "model": "extractive",
        "used_llm": False,
        "input_tokens": 0,
        "output_tokens": max(1, len(answer) // 4),
        "latency_ms": latency_ms,
        "followups": [],
    }


def _split_followups(text: str) -> tuple[str, list[str]]:
    followups: list[str] = []
    kept: list[str] = []
    for line in text.split("\n"):
        m = re.match(r"\s*(?:Follow-up:\s*)(.+)", line, re.I)
        if m:
            followups.append(re.sub(r"^[-*]\s*", "", m.group(1).strip()))
        else:
            kept.append(line)
    return "\n".join(kept).strip(), followups[:3]
