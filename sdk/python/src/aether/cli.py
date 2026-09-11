from __future__ import annotations

import argparse
import json
import sys

from .engine import Engine
from .evaluate import run_golden_eval
from .llm import public_llm_status


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="aether", description="Aether — model-agnostic enterprise RAG")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_ask = sub.add_parser("ask", help="Ask a question against the Northstar corpus")
    p_ask.add_argument("question", nargs="+")
    p_ask.add_argument("--path", choices=["adaptive", "fast", "deep"], default="adaptive")
    p_ask.add_argument("--json", action="store_true")

    p_search = sub.add_parser("search", help="Retrieve chunks without generating an answer")
    p_search.add_argument("question", nargs="+")
    p_search.add_argument("-k", type=int, default=8)

    sub.add_parser("eval", help="Run the golden retrieval suite")
    sub.add_parser("status", help="Show generator configuration (never prints keys)")

    args = parser.parse_args(argv)
    if args.cmd == "status":
        print(json.dumps(public_llm_status(), indent=2))
        return 0
    if args.cmd == "eval":
        report = run_golden_eval()
        print(report)
        for r in report.results:
            mark = "ok" if r.hit else "miss"
            print(f"  [{mark}] {r.id}  {r.question}")
        return 0 if report.mrr >= 0.99 else 1

    engine = Engine.northstar()
    q = " ".join(args.question)
    if args.cmd == "search":
        for h in engine.search(q, args.k):
            print(f"{h.score:.3f}  {h.document_id}  {h.title} / {h.section}")
            print(f"       {h.excerpt[:160].replace(chr(10), ' ')}")
        return 0

    ans = engine.ask(q, force_path=args.path)
    if args.json:
        print(
            json.dumps(
                {
                    "text": ans.text,
                    "path": ans.path,
                    "kind": ans.kind,
                    "model": ans.model,
                    "confidence": ans.confidence.score,
                    "citations": [
                        {"n": c.n, "title": c.title, "section": c.section, "page": c.page}
                        for c in ans.citations
                    ],
                },
                indent=2,
            )
        )
        return 0
    print(ans.text)
    print()
    print(f"— {ans.path}/{ans.kind} · {ans.model} · confidence {ans.confidence.score:.2f} · {ans.latency_ms} ms")
    for c in ans.citations:
        print(f"  [{c.n}] {c.title} · {c.section} p.{c.page}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
