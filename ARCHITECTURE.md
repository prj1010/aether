# Aether architecture

Aether is an adaptive enterprise knowledge engine. It does the minimum retrieval and reasoning required for a reliable, cited answer.

This preview is the live engine. Typed SDKs live in `sdk/python` (`aether-rag`) and `sdk/go` and share the same retrieval contracts. A future `enterpriserag` publish would wrap those packages.

## Comparison

| | LinearRAG | LogicRAG | MemPalace | Aether |
|---|---|---|---|---|
| Purpose | Relation-free GraphRAG at corpus scale | Query-time logic graphs for multi-hop RAG | Hierarchical verbatim memory | Adaptive knowledge engine |
| Strength | No LLM graph build; linear cost; entity–sentence bridging | Dependency planning without a pre-built KG | L0–L3 palace, temporal graph, local-first | Chooses fast vs deep per query; citations; inspector |
| Weakness | Graph on every query; research code | Extra LLM rounds; GPL research code | Memory, not a document RAG | In-process index (laptop scale) |
| We reuse | Entity–chunk linking, semantic bridging, PPR-style expansion ideas | Warm-up vs dependency path, subquery linearization | Palace layers, wake/recall/search protocol | — |
| We replace | Always-on graph; SpaCy NER; copied code | Always-on LLM planner | Embedding MemPalace itself | Original implementation (GPL-3 sources not copied) |

## Layers

```
UI (Ask, Knowledge, Inspector, Memory, Analytics, Eval, Compliance)
        │
   server functions
        │
   Orchestrator  ── Memory palace (L0–L3)   ← separate from document shards
        │
   Query plan (cheap rules; deep path only when needed)
        │
   ACL  →  Shard router  →  parallel mini-indexes  →  RRF merge
        │
   Retrieval: sparse BM25 · hashed dense · hybrid · graph expansion
        │
   Rerank → MMR context → contradiction check → confidence
        │
   Generator (pluggable LLM · extractive fallback) with untrusted-document boundary
```

Sharding is a routing and scaling layer around the existing engine. It does not replace ingestion, hybrid retrieval, LinearRAG, LogicRAG, MemPalace, or the APIs.

## Compliance

Compliance is an evidence layer around the same engine — not a second index. The loop matches AICertify’s five steps:

1. **Create a regulations set** — named, listable.
2. **Select targets** — `eu_ai_act`, `nist_ai_rmf`, `operational`.
3. **Wrap the application** — Aether, generator name, version, metadata.
4. **Evaluate** — live interactions (input + output from the Northstar index) plus declared organisation facts and measured retrieval evidence.
5. **Get the report** — HTML, markdown, JSON.

A **contract** splits facts an organisation must declare (intended use, human oversight, no social scoring) from facts the engine can **measure** (provenance on every chunk, golden recall vs baseline, injection flags, citation counts, shard ACL). Executable allow/deny policies then cover a Northstar-relevant slice of the EU AI Act, the NIST AI RMF functions, and operational OPA-style rules (citations required, untrusted evidence, memory isolation, no social scoring).

Interactions are live asks, not canned Q&A: policy lookup, vacation lookup, an injection attempt, an out-of-corpus refuse, and a social-comparison probe. The Python SDK exposes the same five-step surface as `aether.certify.regulations` / `aether.certify.application`.

The loop is inspired by [AICertify](https://github.com/Principled-Evolution/aicertify) (Apache-2.0) and GOPAL’s executable-policy idea. Policies are original Aether TypeScript (and a Python SDK port); GOPAL Rego is not copied and Open Policy Agent is not required at runtime. A passing report is evidence for this advisory knowledge desk. It is not CE marking, a notified-body assessment, or legal advice.



## Generator

`src/lib/rag/llm.ts` is a vendor-neutral chat client. Retrieval, graph expansion, rerank, and citations do not depend on any model. Configure `LLM_PROVIDER` plus a key, or let auto-detect pick the first vendor key present. Supported: OpenAI, Azure OpenAI, Anthropic (native messages API), Groq, Gemini, Mistral, OpenRouter, Together, xAI, Ollama, and any OpenAI-compatible `LLM_BASE_URL`. If nothing is configured or the call fails, generation falls back to extractive snippets with citations.

## Adaptive policy

- Factual / short / named policy → **fast**: hybrid → rerank → answer
- Multi-hop / temporal / low confidence → **deep**: sub-questions + entity graph
- Memory cues → palace search mixed into context
- Exact codes (`SEV-1`, quoted titles) → sparse-heavy

## Sharding

Northstar is partitioned **tenant → collection**. A corpus smaller than eight documents, or a single collection, stays one shard. Hash sharding is only a load-balance fallback when a collection exceeds 800 chunks or when routing has no metadata/entity signal.

Each shard is a mini-index: chunks, hashed embeddings, BM25, entity–chunk graph, provenance, and a compact profile (centroid, keywords, entities, time range). Status is `healthy | degraded | offline | rebuilding | migrating`. Replicas are chosen independently after shard selection; they are not extra shards.

### Router

Security constraints are absolute. Scoring then weights:

| Signal | Weight |
|---|---|
| Semantic profile | 0.28 |
| Metadata / domain | 0.18 |
| Entities | 0.18 |
| Temporal window | 0.10 |
| Freshness | 0.08 |
| Historical hits | 0.10 |
| Health | 0.08 |

Adaptive mode starts with 1–3 shards. Evidence is judged from rerank scores, density, and source spread — never from router confidence alone. If evidence is thin, the router expands by two shards per round, then falls back to every authorized shard. LogicRAG independently routes each sub-question and unions the sets. LinearRAG walks graphs only on searched shards, with targeted cross-shard entity hops. Memory is never mixed into document shards.

Parallel hits are **fused with reciprocal rank fusion** (k=60), then the existing global reranker. Failed shards are skipped, confidence is reduced, and the failure is recorded on the trace.

Routing is cached on `tenant + collections + normalized query + mode + index version + config version` and dropped on ingest.

## Security

Retrieved chunks are wrapped as untrusted data. Injection patterns are flagged. Unauthorized or bait documents cannot override system policy. Authorization before context is the production rule; this preview corpus is a shared office demo without accounts. Shard ACL filters tenant, collection, classification, and lifecycle before any retrieval.

## Observability

Every ask writes a retrieval trace (classification, shard routing, timings, candidate scores, graph seeds, generation tokens) and an OpenTelemetry span tree (`aether.ask` plus child spans for classify, retrieve, rerank, generate). Ingest and compliance evaluation emit `aether.ingest` and `aether.compliance.evaluate`. Analytics never logs raw document text. Evaluation reports sharded Recall@k / MRR against the unsharded baseline; routing is not allowed to drop recall.

Spans live in an in-process ring and export over OTLP/HTTP when `OTEL_EXPORTER_OTLP_ENDPOINT` is set. Metrics: `aether.ask.duration`, `aether.ask.count`, `aether.ask.tokens`, `aether.ingest.count`, `aether.error.count`.

## Attribution

LinearRAG, arXiv:2510.10114 (ICLR’26). LogicRAG, arXiv:2508.06105 (AAAI’26). MemPalace, mempalaceofficial.com. Concepts only; licenses of the research repos are GPL-3.
