import type {
  AnswerResult,
  Candidate,
  DocumentRecord,
  IndexedChunk,
  MemoryItem,
  RetrievalTrace,
  TimingSpan,
} from "./types";
import { assembleContext } from "./context";
import { seedDocuments } from "./corpus";
import { buildGraph, expandGraph, seedEntities, type SemanticGraph } from "./graph";
import { generateAnswer } from "./generate";
import { buildSeedIndex, extractEntities, ingestPlainText } from "./ingest";
import { classifyQuery, shouldDeepen } from "./plan";
import { applyGraphBoost, hybridCandidates, rerank } from "./rerank";
import { scanInjection } from "./security";
import { bm25Search, buildBm25, type Bm25Index } from "./sparse";
import { tokenize } from "./text";
import {
  DEFAULT_BUDGETS,
  DEFAULT_SCOPE,
  authorizedShards,
  buildRegistry,
  evidenceSufficient,
  invalidateRoutingCache,
  maybeRebalance,
  nextExpansion,
  recordShardHit,
  rescoreUnion,
  retrieveFromShard,
  retrieveParallel,
  routeShards,
  type SecurityScope,
  type ShardRegistry,
} from "./shard";

export interface EngineState {
  documents: DocumentRecord[];
  chunks: IndexedChunk[];
  bm25: Bm25Index;
  graph: SemanticGraph;
  chunksById: Map<string, IndexedChunk>;
  traces: RetrievalTrace[];
  shards: ShardRegistry;
}

const globalRef = globalThis as typeof globalThis & { __aetherEngine__?: EngineState };

export function getEngine(): EngineState {
  if (!globalRef.__aetherEngine__) {
    globalRef.__aetherEngine__ = createEngine();
  }
  return globalRef.__aetherEngine__;
}

export function resetEngine(): EngineState {
  invalidateRoutingCache();
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
    shards: buildRegistry(documents, chunks),
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
  next.shards.indexVersion = engine.shards.indexVersion + 1;
  invalidateRoutingCache();
  globalRef.__aetherEngine__ = next;
  return { document, chunkCount: chunks.length };
}

function mark(name: string, t0: number, spans: TimingSpan[]): number {
  const now = Date.now();
  spans.push({ name, ms: now - t0 });
  return now;
}

function tagShard(cands: Candidate[], shardId: string): Candidate[] {
  for (const c of cands) {
    if (!c.shardId) c.shardId = shardId;
  }
  return cands;
}

async function retrieveSharded(
  engine: EngineState,
  query: string,
  plan: ReturnType<typeof classifyQuery>,
  shardMode: "adaptive" | "all",
  scope: SecurityScope,
  spans: TimingSpan[],
  t0: number,
): Promise<{
  cands: Candidate[];
  sharding: NonNullable<RetrievalTrace["sharding"]>;
  t: number;
}> {
  let t = t0;
  const route = routeShards({
    registry: engine.shards,
    query,
    plan,
    scope,
    mode: shardMode,
  });
  t = mark("shard.route", t, spans);

  const searched = new Set<string>(route.picked);
  const failures: string[] = [];
  const lists: Candidate[][] = [];
  const live = authorizedShards(engine.shards, scope);

  const first = live.filter((s) => searched.has(s.record.id));
  {
    const part = await retrieveParallel(first, query, 24, scope);
    lists.push(...part.lists);
    failures.push(...part.failures);
  }
  t = mark("shard.retrieve", t, spans);

  let { candidates: cands, stats } = rescoreUnion(lists, query, engine.chunks, engine.bm25);
  t = mark("shard.merge", t, spans);

  let expansionRounds = 0;
  let expanded = false;
  const budgets = DEFAULT_BUDGETS;
  while (
    shardMode === "adaptive" &&
    !engine.shards.single &&
    !evidenceSufficient(cands, plan.kind) &&
    expansionRounds < budgets.maxExpansionRounds &&
    searched.size < budgets.maxShards
  ) {
    const more = nextExpansion(route, searched, budgets.expandBatch);
    if (!more.length) break;
    expanded = true;
    expansionRounds += 1;
    for (const id of more) searched.add(id);
    const extra = live.filter((s) => more.includes(s.record.id));
    const part = await retrieveParallel(extra, query, 24, scope);
    lists.push(...part.lists);
    failures.push(...part.failures);
    ({ candidates: cands, stats } = rescoreUnion(lists, query, engine.chunks, engine.bm25));
  }

  if (
    shardMode === "adaptive" &&
    !engine.shards.single &&
    !evidenceSufficient(cands, plan.kind)
  ) {
    const rest = live.filter((s) => !searched.has(s.record.id));
    if (rest.length) {
      expanded = true;
      expansionRounds += 1;
      for (const s of rest) searched.add(s.record.id);
      const part = await retrieveParallel(rest, query, 24, scope);
      lists.push(...part.lists);
      failures.push(...part.failures);
      ({ candidates: cands, stats } = rescoreUnion(lists, query, engine.chunks, engine.bm25));
    }
  }

  t = mark("shard.expand", t, spans);

  const sharding: NonNullable<RetrievalTrace["sharding"]> = {
    routed: route.ranked.map((r) => ({ shardId: r.shardId, score: round4(r.score), reasons: r.reasons })),
    searched: [...searched],
    expanded,
    expansionRounds,
    skipped: route.skipped,
    merge: stats,
    cacheHit: route.cacheHit,
    crossShardEntities: [],
    failures,
    mode: route.mode,
  };
  return { cands, sharding, t };
}

function retrieveBaseline(engine: EngineState, query: string): Candidate[] {
  const sparseHits = bm25Search(engine.bm25, engine.chunks, query, 50);
  const sparseMap = new Map(sparseHits.map((h) => [h.chunk.id, h.score]));
  return tagShard(hybridCandidates(engine.chunks, sparseMap, query, 40), "northstar.all");
}

export async function askEngine(opts: {
  query: string;
  memory?: MemoryItem[];
  forcePath?: "fast" | "deep" | "adaptive";
  shardMode?: "adaptive" | "all";
  scope?: SecurityScope;
  forceExtractive?: boolean;
  recordTrace?: boolean;
}): Promise<AnswerResult> {
  const tAll = Date.now();
  const engine = getEngine();
  const spans: TimingSpan[] = [];
  let t = tAll;
  const scope = opts.scope ?? DEFAULT_SCOPE;
  const shardMode = opts.shardMode ?? "adaptive";

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

  const sharded = await retrieveSharded(engine, opts.query, plan, shardMode, scope, spans, t);
  t = sharded.t;
  let cands = sharded.cands;
  const sharding = sharded.sharding;

  const topHybrid = cands[0]?.hybrid ?? 0;
  const deepen = opts.forcePath === "fast" ? false : shouldDeepen(topHybrid, plan);
  let graphMeta = { seeds: [] as string[], hops: 0, expandedEntities: [] as string[], expandedChunks: 0 };
  if (deepen) {
    plan.path = "deep";
    plan.useGraph = true;
    const searchedStates = [...engine.shards.shards.values()].filter((s) =>
      sharding.searched.includes(s.record.id),
    );
    const allSeeds: string[] = [];
    const allExpanded = new Set<string>();
    const allEnts: string[] = [];
    let hops = 0;
    for (const shard of searchedStates) {
      const seeds = seedEntities(opts.query, shard.graph);
      allSeeds.push(...seeds);
      const expanded = expandGraph({
        query: opts.query,
        seeds,
        graph: shard.graph,
        chunksById: shard.chunksById,
        hops: 2,
      });
      hops = Math.max(hops, expanded.hops);
      for (const id of expanded.chunkIds) allExpanded.add(id);
      allEnts.push(...expanded.expandedEntities);
    }
    const qEnts = extractEntities(opts.query).map((e) => e.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim());
    const cross: string[] = [];
    for (const ent of qEnts) {
      if (!ent) continue;
      const homes = engine.shards.entityToShards.get(ent);
      if (!homes) continue;
      for (const sid of homes) {
        if (sharding.searched.includes(sid)) continue;
        const shard = engine.shards.shards.get(sid);
        if (!shard) continue;
        if (scope.collections?.length && shard.record.domain !== "mixed" && !scope.collections.includes(shard.record.domain)) {
          continue;
        }
        if (shard.record.tenant !== scope.tenant) continue;
        if (shard.record.status === "offline" || shard.record.status === "rebuilding") continue;
        const ids = shard.graph.entityToChunks.get(ent);
        if (!ids) continue;
        cross.push(ent);
        for (const id of ids) allExpanded.add(id);
        sharding.searched.push(sid);
      }
    }
    sharding.crossShardEntities = [...new Set(cross)];
    applyGraphBoost(cands, allExpanded, 0.25);
    graphMeta = {
      seeds: [...new Set(allSeeds)].slice(0, 12),
      hops,
      expandedEntities: [...new Set(allEnts)].slice(0, 24),
      expandedChunks: allExpanded.size,
    };
    t = mark("retrieval.graph", t, spans);
  }

  cands = rerank(cands, opts.query);
  t = mark("rerank", t, spans);

  const queryInject = injectionFlags.length > 0;
  if (queryInject) {
    cands = cands.filter((c) => c.chunk.documentId !== "doc-injection-bait");
  }

  const { selected, citations, contradictions, confidence } = assembleContext(cands, 8);
  t = mark("context.build", t, spans);

  if (sharding.failures.length) {
    confidence.score = Math.max(0, round4(confidence.score * 0.85));
    confidence.factors.push({
      name: "shard failure",
      value: sharding.failures.length,
      note: "Continued on authorized shards; confidence reduced",
    });
  }

  const docFlags = selected.flatMap((s) =>
    scanInjection(s.chunk.content).map((f) => `${f}@${s.chunk.documentId}`),
  );
  const allFlags = [...injectionFlags, ...docFlags];

  const gen = await generateAnswer({
    query: opts.query,
    selected,
    citations,
    contradictions,
    memory: memoryHits,
    confidenceBand: confidence.band,
    skipLlm: opts.forceExtractive,
  });
  mark("generation", t, spans);

  const citedShards = [
    ...new Set(selected.map((s) => s.shardId).filter((id): id is string => Boolean(id))),
  ];
  recordShardHit(engine.shards, tokenize(opts.query), citedShards);

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
      shardId: c.shardId,
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
    sharding,
  };
  if (opts.recordTrace !== false) {
    engine.traces.unshift(trace);
    if (engine.traces.length > 80) engine.traces.length = 80;
  }

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

export function searchEngine(query: string, k = 12, mode: "adaptive" | "all" | "baseline" = "adaptive") {
  const engine = getEngine();
  if (mode === "baseline") {
    const cands = rerank(retrieveBaseline(engine, query), query);
    return cands.slice(0, k).map((c) => toHit(c));
  }
  const plan = classifyQuery(query);
  const route = routeShards({
    registry: engine.shards,
    query,
    plan,
    scope: DEFAULT_SCOPE,
    mode: mode === "all" ? "all" : "adaptive",
  });
  const live = authorizedShards(engine.shards, DEFAULT_SCOPE);
  const searched = new Set(route.picked);
  const first = live.filter((s) => searched.has(s.record.id));
  const lists = first.map((s) => retrieveFromShard(s, query, 24, DEFAULT_SCOPE));
  let { candidates: cands } = rescoreUnion(lists, query, engine.chunks, engine.bm25);
  if (mode === "adaptive" && !engine.shards.single && !evidenceSufficient(cands, plan.kind)) {
    const rest = live.filter((s) => !searched.has(s.record.id));
    if (rest.length) {
      const extra = rest.map((s) => retrieveFromShard(s, query, 24, DEFAULT_SCOPE));
      ({ candidates: cands } = rescoreUnion([...lists, ...extra], query, engine.chunks, engine.bm25));
    }
  }
  cands = rerank(cands, query);
  return cands.slice(0, k).map((c) => toHit(c));
}

function toHit(c: Candidate) {
  return {
    chunkId: c.chunk.id,
    documentId: c.chunk.documentId,
    title: c.chunk.docTitle,
    section: c.chunk.section,
    page: c.chunk.page,
    excerpt: c.chunk.content.slice(0, 240),
    score: round4(c.rerank),
    collection: c.chunk.collection,
    shardId: c.shardId,
  };
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
  const rebalance = maybeRebalance(e.shards);
  return {
    documents: e.documents.length,
    chunks: e.chunks.length,
    entities: entityCount,
    traces: e.traces.length,
    collections: countBy(e.documents.map((d) => d.collection)),
    shards: [...e.shards.shards.values()].map((s) => ({
      id: s.record.id,
      domain: s.record.domain,
      kind: s.record.kind,
      docs: s.record.docCount,
      chunks: s.record.chunkCount,
      status: s.record.status,
      health: s.record.health,
      timeFrom: s.record.timeRange.from,
      timeTo: s.record.timeRange.to,
      keywords: s.record.profile.keywords.slice(0, 8),
    })),
    shardMode: e.shards.single ? "single" : "collection",
    indexVersion: e.shards.indexVersion,
    rebalance,
  };
}

export function listShards() {
  return engineStats().shards;
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
