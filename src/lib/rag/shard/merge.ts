import type { Candidate, IndexedChunk } from "../types";
import { minMaxNormalize } from "../text";
import { bm25Search, type Bm25Index } from "../sparse";
import { hybridCandidates } from "../rerank";
import type { MergeStats } from "./types";

const RRF_K = 60;

export function reciprocalRankFusion(lists: Candidate[][]): { candidates: Candidate[]; stats: MergeStats } {
  const inputs = lists.reduce((n, l) => n + l.length, 0);
  const ranks = new Map<string, { cand: Candidate; rrf: number; lists: number }>();
  for (const list of lists) {
    list.forEach((c, i) => {
      const cur = ranks.get(c.chunk.id);
      const add = 1 / (RRF_K + i + 1);
      if (cur) {
        cur.rrf += add;
        cur.lists += 1;
        if (c.hybrid > cur.cand.hybrid) {
          cur.cand = { ...c, reasons: [...new Set([...c.reasons, "rrf-merge"])] };
        } else if (!cur.cand.reasons.includes("rrf-merge")) {
          cur.cand.reasons.push("rrf-merge");
        }
      } else {
        ranks.set(c.chunk.id, { cand: { ...c, reasons: [...c.reasons, "rrf-merge"] }, rrf: add, lists: 1 });
      }
    });
  }
  const rows = [...ranks.values()];
  const norm = minMaxNormalize(rows.map((r) => r.rrf));
  const candidates = rows
    .map((r, i) => {
      const fused = 0.65 * r.cand.hybrid + 0.35 * (norm[i] ?? 0);
      return {
        ...r.cand,
        hybrid: fused,
        rerank: fused,
      };
    })
    .sort((a, b) => b.hybrid - a.hybrid);
  return {
    candidates,
    stats: { inputs, unique: candidates.length, rrf: true },
  };
}

/**
 * Dedup shard hits, then rescore the union with the global BM25 + hybrid
 * so per-shard min-max cannot inflate a weak collection. RRF is a light bonus.
 */
export function rescoreUnion(
  lists: Candidate[][],
  query: string,
  corpusChunks: IndexedChunk[],
  bm25: Bm25Index,
): { candidates: Candidate[]; stats: MergeStats } {
  const shardOf = new Map<string, string>();
  const rrf = new Map<string, number>();
  const ids = new Set<string>();
  let inputs = 0;
  for (const list of lists) {
    list.forEach((c, i) => {
      inputs += 1;
      ids.add(c.chunk.id);
      if (c.shardId && !shardOf.has(c.chunk.id)) shardOf.set(c.chunk.id, c.shardId);
      rrf.set(c.chunk.id, (rrf.get(c.chunk.id) ?? 0) + 1 / (RRF_K + i + 1));
    });
  }
  const chunks = corpusChunks.filter((c) => ids.has(c.id));
  if (!chunks.length) {
    return { candidates: [], stats: { inputs, unique: 0, rrf: true } };
  }
  const sparseHits = bm25Search(bm25, chunks, query, 80);
  const sparseMap = new Map(sparseHits.map((h) => [h.chunk.id, h.score]));
  const cands = hybridCandidates(chunks, sparseMap, query, Math.min(40, chunks.length));
  const rrfN = minMaxNormalize(cands.map((c) => rrf.get(c.chunk.id) ?? 0));
  const candidates = cands
    .map((c, i) => {
      c.shardId = shardOf.get(c.chunk.id) ?? c.shardId;
      if (!c.reasons.includes("rrf-merge")) c.reasons.push("rrf-merge");
      const fused = 0.9 * c.hybrid + 0.1 * (rrfN[i] ?? 0);
      c.hybrid = fused;
      c.rerank = fused;
      return c;
    })
    .sort((a, b) => b.hybrid - a.hybrid);
  return { candidates, stats: { inputs, unique: candidates.length, rrf: true } };
}

export function evidenceSufficient(cands: Candidate[], kind: string): boolean {
  const top = cands[0]?.rerank ?? cands[0]?.hybrid ?? 0;
  const viable = cands.filter((c) => (c.rerank || c.hybrid) >= 0.18);
  const density =
    viable.slice(0, 3).reduce((s, c) => s + (c.rerank || c.hybrid), 0) / Math.max(1, Math.min(3, viable.length));
  const docs = new Set(viable.slice(0, 8).map((c) => c.chunk.documentId));
  if (top < 0.34) return false;
  if (viable.length < 2) return false;
  if (density < 0.28) return false;
  if ((kind === "multi_hop" || kind === "temporal") && docs.size < 2 && top < 0.7) return false;
  return true;
}
