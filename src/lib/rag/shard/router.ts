import type { CollectionId, QueryPlan } from "../types";
import { embed, hash32, tokenize } from "../text";
import { extractEntities } from "../ingest";
import { classifyQuery } from "../plan";
import { authorizedShards, cosineToProfile, type ShardRegistry } from "./registry";
import { getCachedRoute, routingCacheKey, setCachedRoute } from "./cache";
import {
  DEFAULT_BUDGETS,
  DEFAULT_SCOPE,
  DEFAULT_WEIGHTS,
  type RouteDecision,
  type RouterWeights,
  type SecurityScope,
  type ShardBudgets,
  type ShardScore,
} from "./types";

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

const COLLECTION_ALIASES: Record<CollectionId, string[]> = {
  policy: [
    "policy",
    "reimbursement",
    "vacation",
    "pto",
    "leave",
    "stipend",
    "parental",
    "remote",
    "certification",
    "tuition",
  ],
  architecture: ["architecture", "helios", "nimbus", "forge", "adr", "production", "failover"],
  people: ["people", "learning", "development", "certification", "guidelines", "catalog", "ld"],
  security: ["security", "ciso", "injection", "prompt", "cissp"],
  product: ["product", "pulse", "retention", "enterprise", "log"],
  operations: ["operations", "incident", "sev", "notify", "customer", "sev-1"],
};

export function scoreShards(
  reg: ShardRegistry,
  query: string,
  plan: QueryPlan,
  scope: SecurityScope = DEFAULT_SCOPE,
  weights: RouterWeights = DEFAULT_WEIGHTS,
): { ranked: ShardScore[]; skipped: { shardId: string; reason: string }[] } {
  const skipped: { shardId: string; reason: string }[] = [];
  const qEmb = embed(query);
  const qTokens = tokenize(query);
  const qEnt = extractEntities(query).map((e) => e.toLowerCase());
  const ranked: ShardScore[] = [];
  const live = new Set(authorizedShards(reg, scope).map((s) => s.record.id));

  for (const s of reg.shards.values()) {
    if (!live.has(s.record.id)) {
      const reason =
        s.record.tenant !== scope.tenant
          ? "acl:tenant"
          : s.record.status === "offline" || s.record.status === "rebuilding"
            ? `lifecycle:${s.record.status}`
            : scope.collections?.length && s.record.domain !== "mixed" && !scope.collections.includes(s.record.domain)
              ? "acl:collection"
              : scope.maxClassification
                ? "acl:classification"
                : "acl";
      skipped.push({ shardId: s.record.id, reason });
      continue;
    }

    const semantic = clamp01((cosineToProfile(qEmb, s.record.profile) + 1) / 2);
    const kw = new Set(s.record.profile.keywords);
    const kwHits = qTokens.filter((t) => kw.has(t)).length;
    const aliases = s.record.domain === "mixed" ? [] : (COLLECTION_ALIASES[s.record.domain] ?? []);
    const aliasHits = qTokens.filter((t) => aliases.includes(t)).length;
    const domainHit = s.record.domain !== "mixed" && qTokens.includes(s.record.domain) ? 0.3 : 0;
    const metadata = clamp01(
      (kwHits / Math.max(1, qTokens.length)) * 0.5 + (aliasHits / Math.max(1, qTokens.length)) * 0.4 + domainHit,
    );
    const entHits = qEnt.filter((e) => s.record.profile.entities.includes(e) || s.graph.entityToChunks.has(e)).length;
    const entity = clamp01(entHits / Math.max(1, qEnt.length || 1));
    const now = "2026-09-11";
    const inRange = s.record.timeRange.from <= now && s.record.timeRange.to >= "2020-01-01";
    const temporal = plan.kind === "temporal" ? (inRange ? 0.7 : 0.3) : 0.5;
    const freshness = s.record.timeRange.to >= "2025-01-01" ? 0.7 : 0.4;
    let historical = 0;
    if (qTokens.length) {
      let h = 0;
      for (const t of qTokens) h += reg.historical.get(t)?.get(s.record.id) ?? 0;
      historical = clamp01(h / (4 * qTokens.length));
    }
    const health = s.record.status === "degraded" ? s.record.health * 0.6 : s.record.health;
    const breakdown = { semantic, metadata, entity, temporal, freshness, historical, health };
    const score =
      weights.semantic * semantic +
      weights.metadata * metadata +
      weights.entity * entity +
      weights.temporal * temporal +
      weights.freshness * freshness +
      weights.historical * historical +
      weights.health * health;
    const reasons: string[] = [];
    if (semantic > 0.55) reasons.push("semantic profile");
    if (metadata > 0.25) reasons.push("keyword/domain");
    if (entity > 0.2) reasons.push("entity overlap");
    if (plan.kind === "temporal") reasons.push("temporal window");
    if (s.record.status === "degraded") reasons.push("degraded replica");
    ranked.push({ shardId: s.record.id, score, reasons, breakdown });
  }

  ranked.sort((a, b) => b.score - a.score);

  if (ranked.length > 1) {
    const spread = (ranked[0]?.score ?? 0) - (ranked[ranked.length - 1]?.score ?? 0);
    const noSignal = ranked.every((r) => r.breakdown.metadata < 0.08 && r.breakdown.entity < 0.08);
    if (spread < 0.04 && noSignal) {
      const h = hash32(query);
      ranked.sort((a, b) => {
        const ha = (h ^ hash32(a.shardId)) >>> 0;
        const hb = (h ^ hash32(b.shardId)) >>> 0;
        return ha - hb;
      });
      for (const r of ranked) r.reasons.push("hash load-balance");
    }
  }

  return { ranked, skipped };
}

export function routeShards(opts: {
  registry: ShardRegistry;
  query: string;
  plan: QueryPlan;
  scope?: SecurityScope;
  mode?: "adaptive" | "all";
  budgets?: ShardBudgets;
  weights?: RouterWeights;
}): RouteDecision {
  const scope = opts.scope ?? DEFAULT_SCOPE;
  const mode = opts.mode ?? "adaptive";
  const budgets = opts.budgets ?? DEFAULT_BUDGETS;
  const cacheKey = routingCacheKey(scope, opts.query, opts.registry.indexVersion, mode);
  const cached = getCachedRoute(cacheKey, opts.registry.indexVersion);
  if (cached) return cached;

  const { ranked, skipped } = scoreShards(opts.registry, opts.query, opts.plan, scope, opts.weights);
  const live = authorizedShards(opts.registry, scope).map((s) => s.record.id);
  const rankedLive = ranked.filter((r) => live.includes(r.shardId));

  let picked: string[];
  let logicUnion = false;
  if (mode === "all" || opts.registry.single) {
    picked = rankedLive.map((r) => r.shardId);
  } else if (opts.plan.subquestions.length > 0) {
    logicUnion = true;
    const ids = new Set<string>();
    for (const sq of opts.plan.subquestions) {
      const subPlan = classifyQuery(sq.text);
      const sub = scoreShards(opts.registry, sq.text, subPlan, scope, opts.weights).ranked;
      for (const r of sub.slice(0, 2)) ids.add(r.shardId);
    }
    for (const r of rankedLive.slice(0, 2)) ids.add(r.shardId);
    picked = [...ids].slice(0, budgets.maxShards);
  } else {
    picked = rankedLive.slice(0, Math.max(1, budgets.initialShards)).map((r) => r.shardId);
  }

  const decision: RouteDecision = {
    picked,
    ranked: rankedLive,
    skipped,
    cacheHit: false,
    mode: opts.registry.single ? "single" : mode,
    logicUnion,
  };
  setCachedRoute(cacheKey, opts.registry.indexVersion, decision);
  return decision;
}

export function nextExpansion(decision: RouteDecision, already: Set<string>, batch: number): string[] {
  const out: string[] = [];
  for (const r of decision.ranked) {
    if (already.has(r.shardId)) continue;
    out.push(r.shardId);
    if (out.length >= batch) break;
  }
  return out;
}
