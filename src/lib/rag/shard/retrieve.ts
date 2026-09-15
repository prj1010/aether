import type { Candidate } from "../types";
import { bm25Search } from "../sparse";
import { hybridCandidates } from "../rerank";
import { withinClassification, type SecurityScope, type ShardState } from "./types";

export function retrieveFromShard(
  shard: ShardState,
  query: string,
  k = 24,
  scope?: SecurityScope,
): Candidate[] {
  if (!shard.chunks.length) return [];
  if (shard.record.status === "offline" || shard.record.status === "rebuilding") return [];
  const sparseHits = bm25Search(shard.bm25, shard.chunks, query, 50);
  const sparseMap = new Map(sparseHits.map((h) => [h.chunk.id, h.score]));
  const cands = hybridCandidates(shard.chunks, sparseMap, query, k);
  const out: Candidate[] = [];
  for (const c of cands) {
    if (scope && !withinClassification(c.chunk.classification, scope.maxClassification)) continue;
    c.shardId = shard.record.id;
    c.reasons.push(`shard:${shard.record.id}`);
    out.push(c);
  }
  return out;
}

export async function retrieveParallel(
  shards: ShardState[],
  query: string,
  k = 24,
  scope?: SecurityScope,
): Promise<{ lists: Candidate[][]; failures: string[] }> {
  const failures: string[] = [];
  const lists = await Promise.all(
    shards.map(async (s) => {
      try {
        return retrieveFromShard(s, query, k, scope);
      } catch (err) {
        failures.push(`${s.record.id}: ${err instanceof Error ? err.message : String(err)}`);
        return [] as Candidate[];
      }
    }),
  );
  return { lists, failures };
}
