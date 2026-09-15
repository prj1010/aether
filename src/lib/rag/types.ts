export type QueryPath = "fast" | "deep";

export type QueryKind =
  | "factual"
  | "semantic"
  | "exact"
  | "multi_hop"
  | "temporal"
  | "memory"
  | "ambiguous";

export type RetrievalStrategy =
  | "dense"
  | "sparse"
  | "hybrid"
  | "graph"
  | "memory"
  | "metadata";

export type ConfidenceBand = "high" | "medium" | "low" | "insufficient";

export type CollectionId =
  | "policy"
  | "architecture"
  | "people"
  | "security"
  | "product"
  | "operations";

export interface DocumentRecord {
  id: string;
  title: string;
  filename: string;
  collection: CollectionId;
  version: number;
  content: string;
  sourceUri: string;
  contentHash: string;
  pageCount: number;
  validFrom: string;
  validTo: string | null;
  supersededBy: string | null;
  classification: "public" | "internal" | "confidential";
  author: string;
  createdAt: string;
  updatedAt: string;
  status: "indexed" | "deprecated" | "draft";
}

export interface ChunkRecord {
  id: string;
  documentId: string;
  content: string;
  title: string;
  section: string;
  page: number;
  sourceUri: string;
  contentHash: string;
  entities: string[];
  tokenCount: number;
  ordinal: number;
}

export interface IndexedChunk extends ChunkRecord {
  docTitle: string;
  collection: CollectionId;
  version: number;
  validFrom: string;
  validTo: string | null;
  classification: DocumentRecord["classification"];
  status: DocumentRecord["status"];
  embedding: Float32Array;
}

export interface Citation {
  n: number;
  chunkId: string;
  documentId: string;
  title: string;
  filename: string;
  section: string;
  page: number;
  excerpt: string;
  score: number;
  validFrom: string;
  validTo: string | null;
  version: number;
}

export interface Candidate {
  chunk: IndexedChunk;
  sparse: number;
  dense: number;
  hybrid: number;
  graph: number;
  rerank: number;
  reasons: string[];
  shardId?: string;
}

export interface SubQuestion {
  id: string;
  text: string;
  dependsOn: string[];
  kind: QueryKind;
}

export interface QueryPlan {
  kind: QueryKind;
  path: QueryPath;
  strategies: RetrievalStrategy[];
  reason: string;
  subquestions: SubQuestion[];
  useMemory: boolean;
  useGraph: boolean;
}

export interface Conflict {
  topic: string;
  a: { title: string; excerpt: string; validFrom: string; version: number };
  b: { title: string; excerpt: string; validFrom: string; version: number };
  resolution: string;
}

export interface Confidence {
  score: number;
  band: ConfidenceBand;
  factors: { name: string; value: number; note: string }[];
}

export interface TimingSpan {
  name: string;
  ms: number;
}

export interface RetrievalTrace {
  id: string;
  query: string;
  plan: QueryPlan;
  candidates: {
    chunkId: string;
    title: string;
    section: string;
    page: number;
    sparse: number;
    dense: number;
    hybrid: number;
    graph: number;
    rerank: number;
    reasons: string[];
    shardId?: string;
  }[];
  graph: {
    seeds: string[];
    hops: number;
    expandedEntities: string[];
    expandedChunks: number;
  };
  contextChunkIds: string[];
  contradictions: Conflict[];
  confidence: Confidence;
  timings: TimingSpan[];
  generation: {
    model: string;
    usedLlm: boolean;
    inputTokens: number;
    outputTokens: number;
    latencyMs: number;
  };
  injectionFlags: string[];
  createdAt: string;
  sharding?: {
    routed: {
      shardId: string;
      score: number;
      reasons: string[];
    }[];
    searched: string[];
    expanded: boolean;
    expansionRounds: number;
    skipped: { shardId: string; reason: string }[];
    merge: { inputs: number; unique: number; rrf: boolean };
    cacheHit: boolean;
    crossShardEntities: string[];
    failures: string[];
    mode: "adaptive" | "all" | "single";
  };
}

export interface AnswerResult {
  answer: string;
  citations: Citation[];
  confidence: Confidence;
  path: QueryPath;
  kind: QueryKind;
  latencyMs: number;
  contradictions: Conflict[];
  followups: string[];
  trace: RetrievalTrace;
  refused: boolean;
}

export interface MemoryItem {
  id: string;
  layer: "L0" | "L1" | "L2" | "L3";
  wing: string;
  room: string;
  closet: string;
  content: string;
  createdAt: string;
  lastAccess: string;
}

export interface EvalExample {
  id: string;
  question: string;
  expectedAnswer: string;
  expectedSources: string[];
  kind: QueryKind;
}

export interface EvalRunResult {
  id: string;
  question: string;
  kind: QueryKind;
  predictedSources: string[];
  hit: boolean;
  reciprocalRank: number;
  recallAt5: number;
  path: QueryPath;
  latencyMs: number;
  confidence: number;
}

export const COLLECTION_LABEL: Record<CollectionId, string> = {
  policy: "Policy",
  architecture: "Architecture",
  people: "People",
  security: "Security",
  product: "Product",
  operations: "Operations",
};
