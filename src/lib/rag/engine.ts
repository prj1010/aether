import type {
  AnswerResult,
  DocumentRecord,
  IndexedChunk,
  MemoryItem,
  RetrievalTrace,
  TimingSpan,
} from "./types";
import { assembleContext } from "./context";
import { seedDocuments } from "./corpus";
import { expandGraph, buildGraph, seedEntities, type SemanticGraph } from "./graph";
import { generateAnswer } from "./generate";
import { buildSeedIndex, ingestPlainText } from "./ingest";
import { classifyQuery, shouldDeepen } from "./plan";
import { applyGraphBoost, hybridCandidates, rerank } from "./rerank";
import { scanInjection } from "./security";
import { bm25Search, buildBm25, type Bm25Index } from "./sparse";
import { tokenize } from "./text";

export interface EngineState {
  documents: DocumentRecord[];
  chunks: IndexedChunk[];
  bm25: Bm25Index;
  graph: SemanticGraph;
  chunksById: Map<string, IndexedChunk>;
  traces: RetrievalTrace[];
}

const globalRef = globalThis as typeof globalThis & { __aetherEngine__?: EngineState };

export function getEngine(): EngineState {
  if (!globalRef.__aetherEngine__) {
    globalRef.__aetherEngine__ = createEngine();
  }
  return globalRef.__aetherEngine__;
}

export function resetEngine(): EngineState {
  globalRef.__aetherEngine__ = createEngine();
  return globalRef.__aetherEngine__;
}

function createEngine(): EngineState {
  const { documents, chunks } = buildSeedIndex();
  return assemble(documents, chunks);
}

function assemble(documents: DocumentRecord[], chunks: IndexedChunk[]): EngineState {
  return {
    documents,
    chunks,
    bm25: buildBm25(chunks),
    graph: buildGraph(chunks),
    chunksById: new Map(chunks.map((c) => [c.id, c])),
    traces: [],
  };
}

export function addDocumentToEngine(input: {
  title: string;
  filename: string;
  collection: DocumentRecord["collection"];
  text: string;
}): { document: DocumentRecord; chunkCount: number } {
  const engine = getEngine();
  const { document, chunks } = ingestPlainText(input);
  const documents = [...engine.documents, document];
  const allChunks = [...engine.chunks, ...chunks];
  const traces = engine.traces;
  const next = assemble(documents, allChunks);
  next.traces = traces;
  globalRef.__aetherEngine__ = next;
  return { document, chunkCount: chunks.length };
}

function mark(name: string, t0: number, spans: TimingSpan[]): number {
  const now = Date.now();
  spans.push({ name, ms: now - t0 });
  return now;
}

export async function askEngine(opts: {
  query: string;
  memory?: MemoryItem[];
  forcePath?: "fast" | "deep" | "adaptive";
}): Promise<AnswerResult> {
  const tAll = Date.now();
  const engine = getEngine();
  const spans: TimingSpan[] = [];
  let t = tAll;

  const injectionFlags = scanInjection(opts.query);
  const plan = classifyQuery(opts.query);
  if (opts.forcePath === "fast") {
    plan.path = "fast";
    plan.useGraph = false;
  }
  if (opts.forcePath === "deep") {
    plan.path = "deep";
    plan.useGraph = true;
  }
  t = mark("query.classify", t, spans);

  const memoryHits =
    plan.useMemory && opts.memory
      ? opts.memory.filter((m) => {
          const q = tokenize(opts.query);
          const body = tokenize(m.content);
          return q.some((tkn) => body.includes(tkn));
        })
      : opts.memory?.slice(0, 4) ?? [];
  t = mark("memory.search", t, spans);

  const sparseHits = bm25Search(engine.bm25, engine.chunks, opts.query, 50);
  const sparseMap = new Map(sparseHits.map((h) => [h.chunk.id, h.score]));
  t = mark("retrieval.sparse", t, spans);

  let cands = hybridCandidates(engine.chunks, sparseMap, opts.query, 40);
  t = mark("retrieval.hybrid", t, spans);

  const topHybrid = cands[0]?.hybrid ?? 0;
  const deepen = opts.forcePath === "fast" ? false : shouldDeepen(topHybrid, plan);
  let graphMeta = { seeds: [] as string[], hops: 0, expandedEntities: [] as string[], expandedChunks: 0 };
  if (deepen) {
    plan.path = "deep";
    plan.useGraph = true;
    const seeds = seedEntities(opts.query, engine.graph);
    const expanded = expandGraph({
      query: opts.query,
      seeds,
      graph: engine.graph,
      chunksById: engine.chunksById,
      hops: 2,
    });
    applyGraphBoost(cands, new Set(expanded.chunkIds), 0.25);
    graphMeta = {
      seeds,
      hops: expanded.hops,
      expandedEntities: expanded.expandedEntities.slice(0, 24),
      expandedChunks: expanded.chunkIds.length,
    };
    t = mark("retrieval.graph", t, spans);
  }

  cands = rerank(cands, opts.query);
  t = mark("rerank", t, spans);

  const { selected, citations, contradictions, confidence } = assembleContext(cands, 8);
  t = mark("context.build", t, spans);

  const queryInject = injectionFlags.length > 0;
  const docFlags = selected.flatMap((s) =>
    scanInjection(s.chunk.content).map((f) => `${f}@${s.chunk.documentId}`),
  );
  const allFlags = [...injectionFlags, ...docFlags];

  const gen = await generateAnswer({
    query: opts.query,
    selected: queryInject ? selected.filter((s) => s.chunk.documentId !== "doc-injection-bait") : selected,
    citations,
    contradictions,
    memory: memoryHits,
    confidenceBand: confidence.band,
  });
  mark("generation", t, spans);

  const refused = /couldn't find enough evidence/i.test(gen.answer);
  const trace: RetrievalTrace = {
    id: `tr_${Date.now().toString(36)}`,
    query: opts.query,
    plan,
    candidates: cands.slice(0, 16).map((c) => ({
      chunkId: c.chunk.id,
      title: c.chunk.docTitle,
      section: c.chunk.section,
      page: c.chunk.page,
      sparse: round4(c.sparse),
      dense: round4(c.dense),
      hybrid: round4(c.hybrid),
      graph: round4(c.graph),
      rerank: round4(c.rerank),
      reasons: c.reasons,
    })),
    graph: graphMeta,
    contextChunkIds: selected.map((s) => s.chunk.id),
    contradictions,
    confidence,
    timings: spans,
    generation: {
      model: gen.model,
      usedLlm: gen.usedLlm,
      inputTokens: gen.inputTokens,
      outputTokens: gen.outputTokens,
      latencyMs: gen.latencyMs,
    },
    injectionFlags: allFlags,
    createdAt: new Date().toISOString(),
  };
  engine.traces.unshift(trace);
  if (engine.traces.length > 80) engine.traces.length = 80;

  return {
    answer: gen.answer,
    citations,
    confidence,
    path: plan.path,
    kind: plan.kind,
    latencyMs: Date.now() - tAll,
    contradictions,
    followups: gen.followups,
    trace,
    refused,
  };
}

export function searchEngine(query: string, k = 12) {
  const engine = getEngine();
  const sparseHits = bm25Search(engine.bm25, engine.chunks, query, 40);
  const sparseMap = new Map(sparseHits.map((h) => [h.chunk.id, h.score]));
  const cands = rerank(hybridCandidates(engine.chunks, sparseMap, query, 40), query);
  return cands.slice(0, k).map((c) => ({
    chunkId: c.chunk.id,
    documentId: c.chunk.documentId,
    title: c.chunk.docTitle,
    section: c.chunk.section,
    page: c.chunk.page,
    excerpt: c.chunk.content.slice(0, 240),
    score: round4(c.rerank),
    collection: c.chunk.collection,
  }));
}

export function listEngineDocuments() {
  return getEngine().documents;
}

export function getEngineDocument(id: string) {
  const engine = getEngine();
  const document = engine.documents.find((d) => d.id === id);
  if (!document) return null;
  const chunks = engine.chunks.filter((c) => c.documentId === id);
  return { document, chunks };
}

export function engineStats() {
  const e = getEngine();
  const entityCount = e.graph.entityToChunks.size;
  return {
    documents: e.documents.length,
    chunks: e.chunks.length,
    entities: entityCount,
    traces: e.traces.length,
    collections: countBy(e.documents.map((d) => d.collection)),
  };
}

export function recentTraces(limit = 20): RetrievalTrace[] {
  return getEngine().traces.slice(0, limit);
}

export function getTrace(id: string): RetrievalTrace | undefined {
  return getEngine().traces.find((t) => t.id === id);
}

function countBy(keys: string[]): Record<string, number> {
  const o: Record<string, number> = {};
  for (const k of keys) o[k] = (o[k] ?? 0) + 1;
  return o;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

export function ensureSeeded(): number {
  const e = getEngine();
  if (e.documents.length === 0) {
    resetEngine();
  }
  return getEngine().documents.length || seedDocuments().length;
}
