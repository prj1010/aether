import type { IndexedChunk } from "./types";
import { tokenize } from "./text";

export interface Bm25Index {
  N: number;
  avgdl: number;
  df: Map<string, number>;
  tfs: Map<string, Map<string, number>>;
  dl: Map<string, number>;
}

const K1 = 1.5;
const B = 0.75;

export function buildBm25(chunks: IndexedChunk[]): Bm25Index {
  const df = new Map<string, number>();
  const tfs = new Map<string, Map<string, number>>();
  const dl = new Map<string, number>();
  let total = 0;
  for (const c of chunks) {
    const tokens = tokenize(`${c.title} ${c.section} ${c.content}`);
    dl.set(c.id, tokens.length);
    total += tokens.length;
    const tf = new Map<string, number>();
    for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
    tfs.set(c.id, tf);
    for (const t of tf.keys()) df.set(t, (df.get(t) ?? 0) + 1);
  }
  return {
    N: chunks.length,
    avgdl: chunks.length ? total / chunks.length : 0,
    df,
    tfs,
    dl,
  };
}

export function bm25Score(index: Bm25Index, chunkId: string, queryTokens: string[]): number {
  const tf = index.tfs.get(chunkId);
  const docLen = index.dl.get(chunkId) ?? 0;
  if (!tf || queryTokens.length === 0) return 0;
  let score = 0;
  const seen = new Set<string>();
  for (const term of queryTokens) {
    if (seen.has(term)) continue;
    seen.add(term);
    const f = tf.get(term) ?? 0;
    if (f === 0) continue;
    const n = index.df.get(term) ?? 0;
    const idf = Math.log(1 + (index.N - n + 0.5) / (n + 0.5));
    const denom = f + K1 * (1 - B + B * (docLen / (index.avgdl || 1)));
    score += idf * ((f * (K1 + 1)) / denom);
  }
  return score;
}

export function bm25Search(
  index: Bm25Index,
  chunks: IndexedChunk[],
  query: string,
  k = 40,
): { chunk: IndexedChunk; score: number }[] {
  const q = tokenize(query);
  const scored = chunks.map((chunk) => ({ chunk, score: bm25Score(index, chunk.id, q) }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, k);
}
