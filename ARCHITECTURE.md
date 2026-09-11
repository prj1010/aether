# Aether architecture

Aether is an adaptive enterprise knowledge engine. It does the minimum retrieval and reasoning required for a reliable, cited answer.

This preview is the live engine. The public API is TypeScript in this app; a future `enterpriserag` Python package would wrap the same contracts.

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
UI (Ask, Knowledge, Inspector, Memory, Analytics, Eval)
        │
   server functions
        │
   Orchestrator  ── Memory palace (L0–L3)
        │
   Query plan (cheap rules; deep path only when needed)
        │
   Retrieval: sparse BM25 · hashed dense · hybrid · graph expansion
        │
   Rerank → MMR context → contradiction check → confidence
        │
   Generator (pluggable LLM · extractive fallback) with untrusted-document boundary
```

## Generator

`src/lib/rag/llm.ts` is a vendor-neutral chat client. Retrieval, graph expansion, rerank, and citations do not depend on any model. Configure `LLM_PROVIDER` plus a key, or let auto-detect pick the first vendor key present. Supported: OpenAI, Azure OpenAI, Anthropic (native messages API), Groq, Gemini, Mistral, OpenRouter, Together, xAI, Ollama, and any OpenAI-compatible `LLM_BASE_URL`. If nothing is configured or the call fails, generation falls back to extractive snippets with citations.

## Adaptive policy

- Factual / short / named policy → **fast**: hybrid → rerank → answer
- Multi-hop / temporal / low confidence → **deep**: sub-questions + entity graph
- Memory cues → palace search mixed into context
- Exact codes (`SEV-1`, quoted titles) → sparse-heavy

## Security

Retrieved chunks are wrapped as untrusted data. Injection patterns are flagged. Unauthorized or bait documents cannot override system policy. Authorization before context is the production rule; this preview corpus is a shared office demo without accounts.

## Observability

Every ask writes a trace: classification, timings, candidate scores, graph seeds, generation tokens. Analytics never logs raw document text.

## Attribution

LinearRAG, arXiv:2510.10114 (ICLR’26). LogicRAG, arXiv:2508.06105 (AAAI’26). MemPalace, mempalaceofficial.com. Concepts only; licenses of the research repos are GPL-3.
