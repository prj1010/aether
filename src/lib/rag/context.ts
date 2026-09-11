import type { Candidate, Citation, Conflict, Confidence, IndexedChunk } from "./types";
import { snippet } from "./text";
import { mmrSelect } from "./rerank";

const TOKEN_BUDGET = 2800;

export function assembleContext(cands: Candidate[], k = 8): {
  selected: Candidate[];
  citations: Citation[];
  contradictions: Conflict[];
  confidence: Confidence;
} {
  const diverse = mmrSelect(
    cands.filter((c) => c.rerank >= 0.18),
    Math.min(k, cands.length),
  );
  const selected: Candidate[] = [];
  let tokens = 0;
  for (const c of diverse) {
    if (tokens + c.chunk.tokenCount > TOKEN_BUDGET && selected.length >= 3) break;
    selected.push(c);
    tokens += c.chunk.tokenCount;
  }

  const citations: Citation[] = selected.map((c, i) => ({
    n: i + 1,
    chunkId: c.chunk.id,
    documentId: c.chunk.documentId,
    title: c.chunk.docTitle,
    filename: c.chunk.sourceUri.split("/").pop() ?? c.chunk.docTitle,
    section: c.chunk.section,
    page: c.chunk.page,
    excerpt: snippet(c.chunk.content, 280),
    score: round4(c.rerank),
    validFrom: c.chunk.validFrom,
    validTo: c.chunk.validTo,
    version: c.chunk.version,
  }));

  const contradictions = detectConflicts(selected.map((c) => c.chunk));
  const confidence = scoreConfidence(selected, contradictions);

  return { selected, citations, contradictions, confidence };
}

function detectConflicts(chunks: IndexedChunk[]): Conflict[] {
  const byTopic = new Map<string, IndexedChunk[]>();
  for (const c of chunks) {
    const key = c.collection === "architecture" ? "architecture" : c.documentId;
    const arr = byTopic.get(key) ?? [];
    arr.push(c);
    byTopic.set(key, arr);
  }
  const conflicts: Conflict[] = [];
  const arch = (byTopic.get("architecture") ?? []).filter(
    (c) => /current production architecture/i.test(c.content) || /current platform/i.test(c.section),
  );
  const live = arch.filter((c) => c.status === "indexed");
  const dead = arch.filter((c) => c.status === "deprecated");
  if (live.length && dead.length) {
    const a = dead[0]!;
    const b = live[0]!;
    conflicts.push({
      topic: "Current production architecture",
      a: {
        title: a.docTitle,
        excerpt: snippet(a.content, 180),
        validFrom: a.validFrom,
        version: a.version,
      },
      b: {
        title: b.docTitle,
        excerpt: snippet(b.content, 180),
        validFrom: b.validFrom,
        version: b.version,
      },
      resolution: `${b.docTitle} (${b.validFrom}) supersedes ${a.docTitle} (${a.validFrom}).`,
    });
  }
  return conflicts;
}

function scoreConfidence(selected: Candidate[], conflicts: Conflict[]): Confidence {
  const top = selected[0]?.rerank ?? 0;
  const second = selected[1]?.rerank ?? 0;
  const gap = top - second;
  const coverage = Math.min(1, selected.length / 4);
  const agreement = conflicts.length ? 0.55 : 0.9;
  const density = selected.length
    ? selected.slice(0, 3).reduce((s, c) => s + c.rerank, 0) / Math.min(3, selected.length)
    : 0;
  const raw = 0.4 * top + 0.2 * Math.min(1, gap * 3) + 0.15 * coverage + 0.15 * agreement + 0.1 * density;
  const score = Math.max(0, Math.min(0.99, raw));
  const band =
    score >= 0.9 ? "high" : score >= 0.7 ? "medium" : score >= 0.5 ? "low" : "insufficient";
  return {
    score: round4(score),
    band,
    factors: [
      { name: "top relevance", value: round4(top), note: "Best reranked chunk" },
      { name: "score gap", value: round4(gap), note: "Separation from runner-up" },
      { name: "citation coverage", value: round4(coverage), note: `${selected.length} context chunks` },
      { name: "source agreement", value: round4(agreement), note: conflicts.length ? "conflict detected" : "no conflict" },
      { name: "evidence density", value: round4(density), note: "Mean top-3 rerank" },
    ],
  };
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}
