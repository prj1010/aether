export type {
  Classification,
  RouteDecision,
  SecurityScope,
  ShardBudgets,
  ShardRecord,
  ShardState,
  ShardStatus,
  ShardingTrace,
} from "./types";
export { CLASS_RANK, DEFAULT_BUDGETS, DEFAULT_SCOPE, DEFAULT_WEIGHTS, withinClassification } from "./types";
export {
  authorizedShards,
  buildRegistry,
  maybeRebalance,
  recordShardHit,
  setShardStatus,
  type ShardRegistry,
} from "./registry";
export { routeShards, nextExpansion, scoreShards } from "./router";
export { evidenceSufficient, reciprocalRankFusion, rescoreUnion } from "./merge";
export { retrieveFromShard, retrieveParallel } from "./retrieve";
export { invalidateRoutingCache, routingCacheKey } from "./cache";
