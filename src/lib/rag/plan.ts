import type { QueryKind, QueryPath, QueryPlan, RetrievalStrategy, SubQuestion } from "./types";

const MULTI_HOP =
  /\b(after|before|then|which .+ after|and what|why .+\band\b|compare|versus|\bvs\.?\b|migrat|adopted after|moved from)\b/i;
const TEMPORAL =
  /\b(current|currently|now|as of|supersede|deprecated|previous|old|new|latest|before \d{4}|after \d{4})\b/i;
const MEMORY = /\b(remember|last time|previously we|we decided|my preference|earlier you|what did we)\b/i;
const EXACT = /"[^"]+"|\b[A-Z]{2,}(?:-[A-Z0-9]+)+\b|\bsev-?\d\b/i;
const FACTUAL = /^(what is|what's|whats|when is|how many|how much|who is|where is|list)\b/i;

export function classifyQuery(query: string): QueryPlan {
  const q = query.trim();
  const useMemory = MEMORY.test(q);
  const isMulti = MULTI_HOP.test(q) || (q.includes("?") && /\band\b/i.test(q) && q.length > 80);
  const isTemporal = TEMPORAL.test(q);
  const isExact = EXACT.test(q);
  const isFactual = FACTUAL.test(q.toLowerCase());

  let kind: QueryKind;
  if (useMemory) kind = "memory";
  else if (isMulti) kind = "multi_hop";
  else if (isTemporal) kind = "temporal";
  else if (isExact) kind = "exact";
  else if (isFactual || q.split(/\s+/).length <= 6) kind = "factual";
  else kind = "semantic";

  const path: QueryPath = kind === "multi_hop" || kind === "temporal" ? "deep" : "fast";

  const strategies: RetrievalStrategy[] = [];
  if (kind === "exact") strategies.push("sparse", "metadata");
  else if (kind === "semantic") strategies.push("dense", "hybrid");
  else if (kind === "memory") strategies.push("memory", "hybrid");
  else strategies.push("hybrid");
  if (path === "deep") strategies.push("graph");

  const useGraph = path === "deep";
  const subquestions = path === "deep" ? decompose(q) : [];

  const reason =
    path === "deep"
      ? "Query has temporal or multi-hop structure. Deep path: dependency plan + graph expansion."
      : kind === "exact"
        ? "Exact terminology detected. Sparse retrieval is sufficient."
        : "Simple factual or semantic question. Fast path: hybrid retrieve → rerank → answer.";

  return { kind, path, strategies, reason, subquestions, useMemory, useGraph };
}

function decompose(query: string): SubQuestion[] {
  const subs: SubQuestion[] = [];
  const after = query.match(/after (?:the team )?(?:moved from|migrating from|leaving) ([^,?.]+?)(?: to ([^,?.]+))?/i);
  if (after) {
    const from = after[1]?.trim();
    const to = after[2]?.trim();
    if (from) {
      subs.push({
        id: "q1",
        text: `What was ${from}?`,
        dependsOn: [],
        kind: "factual",
      });
    }
    if (to) {
      subs.push({
        id: "q2",
        text: `When did the team move from ${from} to ${to}?`,
        dependsOn: ["q1"],
        kind: "temporal",
      });
      subs.push({
        id: "q3",
        text: `Which architecture was adopted after ${to}?`,
        dependsOn: ["q2"],
        kind: "temporal",
      });
    } else if (from) {
      subs.push({
        id: "q2",
        text: `What came after ${from}?`,
        dependsOn: ["q1"],
        kind: "temporal",
      });
    }
  }
  if (/\breasons?\b|\bwhy\b/i.test(query)) {
    subs.push({
      id: `q${subs.length + 1}`,
      text: "Why was the later architecture adopted?",
      dependsOn: subs.length ? [subs[subs.length - 1]!.id] : [],
      kind: "semantic",
    });
  }
  if (subs.length === 0) {
    const parts = query
      .split(/\band\b|\bthen\b|;/i)
      .map((s) => s.replace(/[?]/g, "").trim())
      .filter((s) => s.split(/\s+/).length >= 3)
      .slice(0, 4);
    parts.forEach((p, i) => {
      subs.push({
        id: `q${i + 1}`,
        text: p.endsWith("?") ? p : p + "?",
        dependsOn: i === 0 ? [] : [`q${i}`],
        kind: "factual",
      });
    });
  }
  if (subs.length === 0) {
    subs.push({ id: "q1", text: query, dependsOn: [], kind: "semantic" });
  }
  return subs;
}

export function shouldDeepen(topHybrid: number, plan: QueryPlan): boolean {
  if (plan.path === "deep") return true;
  return topHybrid < 0.32;
}
