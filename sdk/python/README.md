# Aether Python SDK

Model-agnostic enterprise RAG engine. Same retrieval as the Aether app: hybrid BM25 + hashed dense, relation-free entity graph, cited answers, extractive fallback.

```python
from aether import Engine

engine = Engine.northstar()
answer = engine.ask("What is the vacation policy?")
print(answer.text)
for c in answer.citations:
    print(f"[{c.n}] {c.title} p.{c.page}")
```

## Install

From this repo:

```bash
cd sdk/python
pip install -e .
# or
uv pip install -e .
```

## CLI

```bash
aether ask "What is our certification reimbursement policy?"
aether search "Forge architecture" -k 5
aether eval
aether status
```

## Generator

Retrieval does not depend on a vendor. Set any of:

```bash
export OPENAI_API_KEY=sk-...
# or ANTHROPIC_API_KEY, GROQ_API_KEY, GEMINI_API_KEY, XAI_API_KEY, ...
# or local:
export LLM_PROVIDER=ollama
export LLM_MODEL=llama3.1
```

No key → extractive answers from retrieved chunks.

## API

| Method | What it does |
|---|---|
| `Engine.northstar()` | Seeded Northstar Systems corpus |
| `Engine.empty()` | Blank index |
| `engine.ask(q)` | Adaptive retrieve → cite → answer |
| `engine.search(q, k)` | Ranked chunks |
| `engine.ingest(title, text)` | Add a document |
| `run_golden_eval()` | Recall / MRR on the golden suite |
