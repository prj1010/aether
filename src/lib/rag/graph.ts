import type { IndexedChunk } from "./types";
import { cosine, embed, tokenize } from "./text";
import { extractEntities } from "./ingest";

/**
 * Relation-free semantic graph, inspired by LinearRAG (ICLR'26) concepts:
 * entity ↔ chunk bipartite links, no LLM-extracted relations, linear
 * construction. Original implementation — not a copy of the research repo.
 */
export interface SemanticGraph {
  entityToChunks: Map<string, Set<string>>;
  chunkToEntities: Map<string, string[]>;
  entityNorm: Map<string, string>;
}

function normEntity(e: string): string {
  return e.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function buildGraph(chunks: IndexedChunk[]): SemanticGraph {
  const entityToChunks = new Map<string, Set<string>>();
  const chunkToEntities = new Map<string, string[]>();
  const entityNorm = new Map<string, string>();
  for (const c of chunks) {
    const ents = c.entities.map(normEntity).filter(Boolean);
    const unique = [...new Set(ents)];
    chunkToEntities.set(c.id, unique);
    for (const e of unique) {
      entityNorm.set(e, e);
      let set = entityToChunks.get(e);
      if (!set) {
        set = new Set();
        entityToChunks.set(e, set);
      }
      set.add(c.id);
    }
  }
  return { entityToChunks, chunkToEntities, entityNorm };
}

export function seedEntities(query: string, graph: SemanticGraph): string[] {
  const fromLex = extractEntities(query).map(normEntity);
  const tokens = tokenize(query);
  const seeds = new Set<string>();
  for (const e of fromLex) {
    if (graph.entityToChunks.has(e)) seeds.add(e);
  }
  for (const [ent] of graph.entityToChunks) {
    if (ent.length < 3) continue;
    if (tokens.some((t) => ent.includes(t) || t.includes(ent))) seeds.add(ent);
  }
  return [...seeds].slice(0, 12);
}

export function expandGraph(opts: {
  query: string;
  seeds: string[];
  graph: SemanticGraph;
  chunksById: Map<string, IndexedChunk>;
  hops?: number;
}): { chunkIds: string[]; expandedEntities: string[]; hops: number } {
  const hops = opts.hops ?? 2;
  const qEmb = embed(opts.query);
  const visitedChunks = new Set<string>();
  const visitedEntities = new Set<string>(opts.seeds);
  let frontier = [...opts.seeds];

  for (let h = 0; h < hops; h++) {
    const next: string[] = [];
    for (const ent of frontier) {
      const chunkIds = opts.graph.entityToChunks.get(ent);
      if (!chunkIds) continue;
      const ranked = [...chunkIds]
        .map((id) => {
          const ch = opts.chunksById.get(id);
          if (!ch) return null;
          return { id, score: cosine(qEmb, ch.embedding) };
        })
        .filter((x): x is { id: string; score: number } => x !== null)
        .sort((a, b) => b.score - a.score)
        .slice(0, 6);
      for (const r of ranked) {
        if (visitedChunks.has(r.id)) continue;
        visitedChunks.add(r.id);
        const ents = opts.graph.chunkToEntities.get(r.id) ?? [];
        for (const e of ents) {
          if (!visitedEntities.has(e)) {
            visitedEntities.add(e);
            next.push(e);
          }
        }
      }
    }
    frontier = next.slice(0, 16);
    if (frontier.length === 0) break;
  }

  return {
    chunkIds: [...visitedChunks],
    expandedEntities: [...visitedEntities],
    hops,
  };
}
