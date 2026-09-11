import { GOLDEN_EVAL } from "./corpus";
import { searchEngine } from "./engine";
import { classifyQuery } from "./plan";
import type { EvalRunResult } from "./types";

export async function runGoldenEval(): Promise<{
  results: EvalRunResult[];
  recallAt5: number;
  mrr: number;
  meanLatency: number;
}> {
  const results: EvalRunResult[] = [];
  for (const ex of GOLDEN_EVAL) {
    const t0 = Date.now();
    const hits = searchEngine(ex.question, 8);
    const predicted = unique(hits.map((h) => h.documentId));
    const ranks = ex.expectedSources.map((src) => predicted.indexOf(src)).filter((i) => i >= 0);
    const best = ranks.length ? Math.min(...ranks) : -1;
    const hit = best >= 0;
    const reciprocalRank = hit ? 1 / (best + 1) : 0;
    const hitsAt5 = ex.expectedSources.filter((s) => predicted.slice(0, 8).includes(s)).length;
    const recallAt5 = ex.expectedSources.length ? hitsAt5 / ex.expectedSources.length : 0;
    results.push({
      id: ex.id,
      question: ex.question,
      kind: ex.kind,
      predictedSources: predicted,
      hit,
      reciprocalRank,
      recallAt5,
      path: classifyQuery(ex.question).path,
      latencyMs: Date.now() - t0,
      confidence: hits[0]?.score ?? 0,
    });
  }
  const recallAt5 = mean(results.map((r) => r.recallAt5));
  const mrr = mean(results.map((r) => r.reciprocalRank));
  const meanLatency = mean(results.map((r) => r.latencyMs));
  return { results, recallAt5, mrr, meanLatency };
}

function unique(xs: string[]): string[] {
  return [...new Set(xs)];
}

function mean(xs: number[]): number {
  if (!xs.length) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

export { GOLDEN_EVAL };
