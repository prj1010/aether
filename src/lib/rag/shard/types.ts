import type { CollectionId, IndexedChunk, QueryPlan } from "../types";
import type { Bm25Index } from "../sparse";
import type { SemanticGraph } from "../graph";

export type ShardStatus = "healthy" | "degraded" | "offline" | "rebuilding" | "migrating";

export type ShardKind = "collection" | "time" | "hash" | "memory";

export type Classification = "public" | "internal" | "confidential";

export interface SecurityScope {
  tenant: string;
  collections?: CollectionId[];
  maxClassification?: Classification;
}

export interface ShardProfile {
  centroid: Float32Array;
  keywords: string[];
  entities: string[];
  collections: Record<string, number>;
  timeRange: { from: string; to: string };
}

export interface ShardRecord {
  id: string;
  tenant: string;
  domain: CollectionId | "mixed";
  project: string;
  region: string;
  kind: ShardKind;
  timeRange: { from: string; to: string };
  docCount: number;
  chunkCount: number;
  embeddingModel: string;
  embeddingDim: number;
  indexVersion: number;
  status: ShardStatus;
  health: number;
  replicas: number;
  createdAt: string;
  updatedAt: string;
  profile: ShardProfile;
}

export interface ShardState {
  record: ShardRecord;
  chunks: IndexedChunk[];
  documentIds: Set<string>;
  bm25: Bm25Index;
  graph: SemanticGraph;
  chunksById: Map<string, IndexedChunk>;
}

export interface ShardScore {
  shardId: string;
  score: number;
  reasons: string[];
  breakdown: {
    semantic: number;
    metadata: number;
    entity: number;
    temporal: number;
    freshness: number;
    historical: number;
    health: number;
  };
}

export interface RouteDecision {
  picked: string[];
  ranked: ShardScore[];
  skipped: { shardId: string; reason: string }[];
  cacheHit: boolean;
  mode: "adaptive" | "all" | "single";
  logicUnion: boolean;
}

export interface MergeStats {
  inputs: number;
  unique: number;
  rrf: boolean;
}

export interface ShardingTrace {
  routed: ShardScore[];
  searched: string[];
  expanded: boolean;
  expansionRounds: number;
  skipped: { shardId: string; reason: string }[];
  merge: MergeStats;
  cacheHit: boolean;
  crossShardEntities: string[];
  failures: string[];
  mode: RouteDecision["mode"];
}

export interface RouterWeights {
  semantic: number;
  metadata: number;
  entity: number;
  temporal: number;
  freshness: number;
  historical: number;
  health: number;
}

export interface ShardBudgets {
  initialShards: number;
  expandBatch: number;
  maxShards: number;
  maxExpansionRounds: number;
}

export const DEFAULT_WEIGHTS: RouterWeights = {
  semantic: 0.28,
  metadata: 0.18,
  entity: 0.18,
  temporal: 0.1,
  freshness: 0.08,
  historical: 0.1,
  health: 0.08,
};

export const DEFAULT_BUDGETS: ShardBudgets = {
  initialShards: 3,
  expandBatch: 2,
  maxShards: 8,
  maxExpansionRounds: 2,
};

export const DEFAULT_SCOPE: SecurityScope = { tenant: "northstar" };

export const INDEX_CONFIG_VERSION = "shard-router-v1";

export const CLASS_RANK: Record<Classification, number> = {
  public: 0,
  internal: 1,
  confidential: 2,
};

export function withinClassification(level: Classification, max?: Classification): boolean {
  if (!max) return true;
  return CLASS_RANK[level] <= CLASS_RANK[max];
}
