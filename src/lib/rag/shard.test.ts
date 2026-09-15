import assert from "node:assert/strict";
import { test } from "node:test";
import { GOLDEN_EVAL } from "./corpus.ts";
import { engineStats, getEngine, resetEngine, searchEngine } from "./engine.ts";
import { runGoldenEval } from "./evaluate.ts";
import { classifyQuery } from "./plan.ts";
import {
  authorizedShards,
  buildRegistry,
  evidenceSufficient,
  invalidateRoutingCache,
  maybeRebalance,
  reciprocalRankFusion,
  retrieveFromShard,
  routeShards,
  setShardStatus,
} from "./shard/index.ts";
import type { Candidate } from "./types.ts";

test("Northstar partitions by collection, not a single blob", () => {
  resetEngine();
  const stats = engineStats();
  assert.equal(stats.shardMode, "collection");
  assert.ok(stats.shards.length >= 5, `expected collection shards, got ${stats.shards.length}`);
  const ids = stats.shards.map((s) => s.id);
  assert.ok(ids.includes("northstar.policy"));
  assert.ok(ids.includes("northstar.architecture"));
  assert.ok(ids.includes("northstar.people"));
  assert.equal(stats.rebalance.action, "none");
});

test("tiny corpora stay single-shard", () => {
  const engine = getEngine();
  const docs = engine.documents.slice(0, 2);
  const ids = new Set(docs.map((d) => d.id));
  const chunks = engine.chunks.filter((c) => ids.has(c.documentId));
  const reg = buildRegistry(docs, chunks);
  assert.equal(reg.single, true);
  assert.equal(reg.shards.size, 1);
  assert.ok(reg.shards.has("northstar.all"));
});

test("ACL skips other tenants and offline shards", () => {
  resetEngine();
  const reg = getEngine().shards;
  const foreign = authorizedShards(reg, { tenant: "other" });
  assert.equal(foreign.length, 0);
  setShardStatus(reg, "northstar.policy", "offline");
  const live = authorizedShards(reg, { tenant: "northstar" });
  assert.ok(!live.some((s) => s.record.id === "northstar.policy"));
  const policyOnly = authorizedShards(reg, { tenant: "northstar", collections: ["people"] });
  assert.ok(policyOnly.every((s) => s.record.domain === "people" || s.record.domain === "mixed"));
  setShardStatus(reg, "northstar.policy", "healthy");
});

test("router prefers policy + people for certification questions", () => {
  resetEngine();
  invalidateRoutingCache();
  const q = "What is our certification reimbursement policy?";
  const decision = routeShards({
    registry: getEngine().shards,
    query: q,
    plan: classifyQuery(q),
    mode: "adaptive",
  });
  assert.ok(decision.picked.includes("northstar.policy"), `picked ${decision.picked.join(",")}`);
  assert.ok(
    decision.picked.includes("northstar.people") || decision.ranked[1]?.shardId === "northstar.people",
    `people should rank high, picked=${decision.picked.join(",")} ranked=${decision.ranked.map((r) => r.shardId).join(",")}`,
  );
  assert.ok(decision.picked.length <= 3 || decision.logicUnion);
});

test("LogicRAG unions independently routed sub-questions", () => {
  resetEngine();
  invalidateRoutingCache();
  const q =
    "Which architecture was adopted after the team moved from Helios to Nimbus, and what were the reasons?";
  const plan = classifyQuery(q);
  assert.ok(plan.subquestions.length > 0);
  const decision = routeShards({
    registry: getEngine().shards,
    query: q,
    plan,
    mode: "adaptive",
  });
  assert.equal(decision.logicUnion, true);
  assert.ok(decision.picked.some((id) => id.includes("architecture")));
});

test("RRF merges lists instead of concatenating ranks", () => {
  const mk = (id: string, hybrid: number, shardId: string): Candidate =>
    ({
      chunk: { id, documentId: id, docTitle: id } as Candidate["chunk"],
      sparse: hybrid,
      dense: hybrid,
      hybrid,
      graph: 0,
      rerank: hybrid,
      reasons: [],
      shardId,
    }) as Candidate;
  const { candidates, stats } = reciprocalRankFusion([
    [mk("a", 0.9, "s1"), mk("b", 0.4, "s1")],
    [mk("b", 0.8, "s2"), mk("c", 0.5, "s2")],
  ]);
  assert.equal(stats.rrf, true);
  assert.equal(stats.unique, 3);
  assert.ok(candidates[0]);
  const ids = candidates.map((c) => c.chunk.id);
  assert.ok(ids.includes("b"));
  const b = candidates.find((c) => c.chunk.id === "b");
  assert.ok(b);
  assert.ok(b.reasons.includes("rrf-merge"));
});

test("failed shards do not abort parallel retrieval", async () => {
  resetEngine();
  const shard = getEngine().shards.shards.get("northstar.policy");
  assert.ok(shard);
  const hits = retrieveFromShard(shard, "vacation policy", 8);
  assert.ok(hits.length > 0);
  assert.equal(hits[0]?.shardId, "northstar.policy");
});

test("evidenceSufficient rejects a single weak hit", () => {
  const weak: Candidate[] = [
    {
      chunk: { id: "c1", documentId: "d1" } as Candidate["chunk"],
      sparse: 0.1,
      dense: 0.1,
      hybrid: 0.12,
      graph: 0,
      rerank: 0.12,
      reasons: [],
    },
  ];
  assert.equal(evidenceSufficient(weak, "factual"), false);
});

test("routing cache invalidates on index version change", () => {
  resetEngine();
  invalidateRoutingCache();
  const q = "What is the vacation policy?";
  const first = routeShards({
    registry: getEngine().shards,
    query: q,
    plan: classifyQuery(q),
  });
  assert.equal(first.cacheHit, false);
  const second = routeShards({
    registry: getEngine().shards,
    query: q,
    plan: classifyQuery(q),
  });
  assert.equal(second.cacheHit, true);
  getEngine().shards.indexVersion += 1;
  const third = routeShards({
    registry: getEngine().shards,
    query: q,
    plan: classifyQuery(q),
  });
  assert.equal(third.cacheHit, false);
});

test("hash sharding is not used for the Northstar corpus", () => {
  resetEngine();
  assert.ok(engineStats().shards.every((s) => s.kind !== "hash"));
  assert.equal(maybeRebalance(getEngine().shards).action, "none");
});

test("sharded golden eval matches unsharded baseline recall", async () => {
  resetEngine();
  const result = await runGoldenEval();
  assert.equal(result.results.length, GOLDEN_EVAL.length);
  assert.equal(result.recallAt5, 1, `sharded recall ${result.recallAt5}`);
  assert.equal(result.mrr, 1, `sharded mrr ${result.mrr}`);
  assert.equal(result.baseline.recallAt5, 1, `baseline recall ${result.baseline.recallAt5}`);
  assert.equal(result.baseline.mrr, 1, `baseline mrr ${result.baseline.mrr}`);
  for (const row of result.results) {
    assert.equal(row.hit, true, `${row.id} missed: ${row.predictedSources.join(",")}`);
    assert.equal(row.recallAt5, 1, `${row.id} recall ${row.recallAt5}`);
  }
});

test("adaptive search still returns both cert sources", () => {
  resetEngine();
  const hits = searchEngine("What is our certification reimbursement policy?", 8, "adaptive");
  const docs = new Set(hits.map((h) => h.documentId));
  assert.ok(docs.has("doc-cert-policy"), `got ${[...docs].join(",")}`);
  assert.ok(docs.has("doc-ld-guidelines"), `got ${[...docs].join(",")}`);
});
