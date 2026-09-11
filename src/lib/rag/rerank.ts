import type { Candidate, IndexedChunk } from "./types";
import { cosine, embed, minMaxNormalize, tokenize } from "./text";
import { scanInjection } from "./security";

export function hybridCandidates(
  chunks: IndexedChunk[],
  sparseScores: Map<string, number>,
  query: string,
  k = 40,
): Candidate[] {
  const qEmb = embed(query);
  const qTokens = new Set(tokenize(query));
  const denseRaw: number[] = [];
  const sparseRaw: number[] = [];
  const rows: { chunk: IndexedChunk; dense: number; sparse: number }[] = [];
  for (const chunk of chunks) {
    const dense = cosine(qEmb, chunk.embedding);
    const sparse = sparseScores.get(chunk.id) ?? 0;
    rows.push({ chunk, dense, sparse });
    denseRaw.push(dense);
    sparseRaw.push(sparse);
  }
  const dN = minMaxNormalize(denseRaw);
  const sN = minMaxNormalize(sparseRaw);
  const out: Candidate[] = rows.map((r, i) => {
    const dense = dN[i]!;
    const sparse = sN[i]!;
    const hybrid = 0.52 * sparse + 0.48 * dense;
    const reasons: string[] = [];
    if (sparse > 0.6) reasons.push("strong lexical match");
    if (dense > 0.55) reasons.push("semantic neighborhood");
    const titleHit = tokenize(r.chunk.title).some((t) => qTokens.has(t));
    if (titleHit) reasons.push("title overlap");
    return {
      chunk: r.chunk,
      sparse,
      dense,
      hybrid,
      graph: 0,
      rerank: hybrid,
      reasons,
    };
  });
  out.sort((a, b) => b.hybrid - a.hybrid);
  return out.slice(0, k);
}

export function applyGraphBoost(cands: Candidate[], graphChunkIds: Set<string>, weight = 0.22): void {
  for (const c of cands) {
    if (graphChunkIds.has(c.chunk.id)) {
      c.graph = Math.min(1, c.graph + weight);
      c.reasons.push("graph expansion");
    }
  }
}

export function rerank(cands: Candidate[], query: string, now = "2026-09-11"): Candidate[] {
  const qTokens = new Set(tokenize(query));
  const scored = cands.map((c) => {
    let extra = 0;
    const titleTokens = tokenize(c.chunk.title);
    const titleHits = titleTokens.filter((t) => qTokens.has(t)).length;
    if (titleHits) extra += 0.08 * Math.min(3, titleHits);
    const entHits = c.chunk.entities.filter((e) =>
      query.toLowerCase().includes(e.toLowerCase()),
    ).length;
    if (entHits) extra += 0.05 * Math.min(4, entHits);
    if (c.chunk.status === "deprecated") extra -= 0.12;
    if (c.chunk.validTo && c.chunk.validTo < now) extra -= 0.1;
    if (c.chunk.validFrom > "2025-01-01") extra += 0.04;
    if (c.chunk.classification === "confidential") extra += 0.01;
    const bait = scanInjection(c.chunk.content).length > 0;
    const queryWantsBait = /inject|ignore previous|vendor faq|system prompt/i.test(query);
    if (bait && !queryWantsBait) {
      extra -= 0.85;
      c.reasons.push("untrusted injection downranked");
    }
    const rerank = Math.max(0, Math.min(1.15, c.hybrid + c.graph + extra));
    return { ...c, rerank };
  });
  scored.sort((a, b) => b.rerank - a.rerank);
  return scored;
}

export function mmrSelect(cands: Candidate[], k: number, lambda = 0.72): Candidate[] {
  const selected: Candidate[] = [];
  const rest = [...cands];
  while (selected.length < k && rest.length) {
    let bestI = 0;
    let best = -Infinity;
    for (let i = 0; i < rest.length; i++) {
      const c = rest[i]!;
      let maxSim = 0;
      for (const s of selected) {
        const sim = cosine(c.chunk.embedding, s.chunk.embedding);
        if (sim > maxSim) maxSim = sim;
      }
      const mmr = lambda * c.rerank - (1 - lambda) * maxSim;
      if (mmr > best) {
        best = mmr;
        bestI = i;
      }
    }
    selected.push(rest.splice(bestI, 1)[0]!);
  }
  return selected;
}
