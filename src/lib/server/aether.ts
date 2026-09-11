import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import {
  addDocumentToEngine,
  askEngine,
  engineStats,
  getEngineDocument,
  getTrace,
  listEngineDocuments,
  recentTraces,
  searchEngine,
} from "@/lib/rag/engine";
import { GOLDEN_EVAL, runGoldenEval } from "@/lib/rag/evaluate";
import { LLM_PROVIDERS, publicLlmStatus } from "@/lib/rag/llm";
import type { CollectionId, MemoryItem } from "@/lib/rag/types";

async function recordMetric(row: {
  id: string;
  kind: string;
  path: string;
  latencyMs: number;
  confidence: number;
  citationCount: number;
  usedLlm: boolean;
}) {
  try {
    const sql = await getSql();
    await sql`
      insert into query_metrics (id, kind, path, latency_ms, confidence, citation_count, used_llm)
      values (${row.id}, ${row.kind}, ${row.path}, ${row.latencyMs}, ${row.confidence}, ${row.citationCount}, ${row.usedLlm ? 1 : 0})
    `;
  } catch {
    // Metrics are best-effort; never fail an answer.
  }
}

export const getOverview = createServerFn({ method: "GET" }).handler(async () => {
  const stats = engineStats();
  let metrics: {
    requests: number;
    p50: number;
    p95: number;
    meanConfidence: number;
    llmShare: number;
  } = { requests: stats.traces, p50: 0, p95: 0, meanConfidence: 0, llmShare: 0 };
  try {
    const sql = await getSql();
    const rows = await sql<{
      latency_ms: number;
      confidence: number;
      used_llm: number;
    }>`select latency_ms, confidence, used_llm from query_metrics order by created_at desc limit 200`;
    if (rows.length) {
      const lat = rows.map((r) => Number(r.latency_ms)).sort((a, b) => a - b);
      metrics = {
        requests: rows.length,
        p50: lat[Math.floor(lat.length * 0.5)] ?? 0,
        p95: lat[Math.floor(lat.length * 0.95)] ?? lat[lat.length - 1] ?? 0,
        meanConfidence:
          rows.reduce((s, r) => s + Number(r.confidence), 0) / rows.length,
        llmShare: rows.filter((r) => Number(r.used_llm) === 1).length / rows.length,
      };
    }
  } catch {
    /* empty */
  }
  return { stats, metrics };
});

export const getGeneratorStatus = createServerFn({ method: "GET" }).handler(async () => {
  return { ...publicLlmStatus(), providers: LLM_PROVIDERS };
});

export const listDocs = createServerFn({ method: "GET" }).handler(async () => {
  return listEngineDocuments().map((d) => ({
    id: d.id,
    title: d.title,
    filename: d.filename,
    collection: d.collection,
    version: d.version,
    pageCount: d.pageCount,
    validFrom: d.validFrom,
    validTo: d.validTo,
    status: d.status,
    classification: d.classification,
    author: d.author,
    chunkHint: d.content.length,
  }));
});

export const getDoc = createServerFn({ method: "POST" })
  .validator((input: { id: string }) => input)
  .handler(async ({ data }) => {
    const found = getEngineDocument(data.id);
    if (!found) return null;
    return {
      document: found.document,
      chunks: found.chunks.map((c) => ({
        id: c.id,
        section: c.section,
        page: c.page,
        content: c.content,
        entities: c.entities,
        tokenCount: c.tokenCount,
      })),
    };
  });

export const askKnowledge = createServerFn({ method: "POST" })
  .validator(
    (input: {
      query: string;
      memory?: MemoryItem[];
      forcePath?: "fast" | "deep" | "adaptive";
    }) => input,
  )
  .handler(async ({ data }) => {
    const result = await askEngine({
      query: data.query.slice(0, 2000),
      memory: data.memory ?? [],
      forcePath: data.forcePath ?? "adaptive",
    });
    await recordMetric({
      id: result.trace.id,
      kind: result.kind,
      path: result.path,
      latencyMs: result.latencyMs,
      confidence: result.confidence.score,
      citationCount: result.citations.length,
      usedLlm: result.trace.generation.usedLlm,
    });
    return result;
  });

export const searchKnowledge = createServerFn({ method: "POST" })
  .validator((input: { query: string }) => input)
  .handler(async ({ data }) => {
    return searchEngine(data.query.slice(0, 500), 16);
  });

export const ingestDocument = createServerFn({ method: "POST" })
  .validator(
    (input: {
      title: string;
      filename: string;
      collection: CollectionId;
      text: string;
    }) => input,
  )
  .handler(async ({ data }) => {
    const text = data.text.slice(0, 80_000);
    const title = data.title.slice(0, 160) || "Untitled";
    const added = addDocumentToEngine({
      title,
      filename: data.filename.slice(0, 120),
      collection: data.collection,
      text,
    });
    try {
      const sql = await getSql();
      const d = added.document;
      await sql`
        insert into documents (
          id, title, filename, collection, version, content, source_uri, content_hash,
          page_count, valid_from, valid_to, superseded_by, classification, author, status
        ) values (
          ${d.id}, ${d.title}, ${d.filename}, ${d.collection}, ${d.version}, ${d.content},
          ${d.sourceUri}, ${d.contentHash}, ${d.pageCount}, ${d.validFrom}, ${d.validTo},
          ${d.supersededBy}, ${d.classification}, ${d.author}, ${d.status}
        )
      `;
    } catch {
      /* persistence optional */
    }
    return { id: added.document.id, chunkCount: added.chunkCount, title: added.document.title };
  });

export const listTraces = createServerFn({ method: "GET" }).handler(async () => {
  return recentTraces(24);
});

export const fetchTrace = createServerFn({ method: "POST" })
  .validator((input: { id: string }) => input)
  .handler(async ({ data }) => {
    return getTrace(data.id) ?? null;
  });

export const runEvalSuite = createServerFn({ method: "POST" }).handler(async () => {
  return runGoldenEval();
});

export const listGolden = createServerFn({ method: "GET" }).handler(async () => {
  return GOLDEN_EVAL;
});

export const submitRating = createServerFn({ method: "POST" })
  .validator(
    (input: {
      question: string;
      expectedAnswer?: string;
      actualAnswer: string;
      rating: "correct" | "partial" | "incorrect";
    }) => input,
  )
  .handler(async ({ data }) => {
    const sql = await getSql();
    const id = `rt_${Date.now().toString(36)}`;
    await sql`
      insert into eval_ratings (id, question, expected_answer, actual_answer, rating)
      values (${id}, ${data.question}, ${data.expectedAnswer ?? ""}, ${data.actualAnswer}, ${data.rating})
    `;
    return { id };
  });

export const listRatings = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const sql = await getSql();
    return await sql<{
      id: string;
      question: string;
      rating: string;
      created_at: string;
    }>`select id, question, rating, created_at from eval_ratings order by created_at desc limit 40`;
  } catch {
    return [];
  }
});
