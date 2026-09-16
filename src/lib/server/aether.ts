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
  removeDocumentFromEngine,
  searchEngine,
  updateDocumentInEngine,
} from "@/lib/rag/engine";
import { extractUploadedFile, titleFromFilename } from "@/lib/rag/extract-upload";
import { GOLDEN_EVAL, runGoldenEval } from "@/lib/rag/evaluate";
import {
  FRAMEWORKS,
  POLICIES,
  lastComplianceReport,
  runCompliance,
  NORTHSTAR_DECLARED,
  COMPLIANCE_STEPS,
  type FrameworkId,
} from "@/lib/rag/compliance";
import { LLM_PROVIDERS, publicLlmStatus } from "@/lib/rag/llm";
import { otelSnapshot } from "@/lib/otel/sdk";
import {
  DEFAULT_OPERATOR_PROMPT,
  getOperatorPrompt,
  setOperatorPrompt,
} from "@/lib/rag/security";
import type { CollectionId, MemoryItem } from "@/lib/rag/types";

const COLLECTIONS: CollectionId[] = [
  "policy",
  "architecture",
  "people",
  "security",
  "product",
  "operations",
];

function asCollection(value: string): CollectionId {
  return (COLLECTIONS as string[]).includes(value) ? (value as CollectionId) : "operations";
}

const hydrateRef = globalThis as typeof globalThis & { __aetherUploadsHydrated__?: boolean };

async function hydrateUploads() {
  if (hydrateRef.__aetherUploadsHydrated__) return;
  hydrateRef.__aetherUploadsHydrated__ = true;
  try {
    const sql = await getSql();
    const rows = await sql<{
      id: string;
      title: string;
      filename: string;
      collection: string;
      content: string;
    }>`select id, title, filename, collection, content from documents where id like ${"doc-user-%"}`;
    for (const row of rows) {
      addDocumentToEngine({
        id: String(row.id),
        title: String(row.title),
        filename: String(row.filename),
        collection: asCollection(String(row.collection)),
        text: String(row.content),
      });
    }
  } catch {
    /* empty corpus is fine */
  }
}

async function persistUploaded(d: {
  id: string;
  title: string;
  filename: string;
  collection: string;
  version: number;
  content: string;
  sourceUri: string;
  contentHash: string;
  pageCount: number;
  validFrom: string;
  validTo: string | null;
  supersededBy: string | null;
  classification: string;
  author: string;
  status: string;
}) {
  try {
    const sql = await getSql();
    await sql`
      insert into documents (
        id, title, filename, collection, version, content, source_uri, content_hash,
        page_count, valid_from, valid_to, superseded_by, classification, author, status
      ) values (
        ${d.id}, ${d.title}, ${d.filename}, ${d.collection}, ${d.version}, ${d.content},
        ${d.sourceUri}, ${d.contentHash}, ${d.pageCount}, ${d.validFrom}, ${d.validTo},
        ${d.supersededBy}, ${d.classification}, ${d.author}, ${d.status}
      )
      on conflict (id) do update set
        title = excluded.title,
        filename = excluded.filename,
        collection = excluded.collection,
        version = excluded.version,
        content = excluded.content,
        source_uri = excluded.source_uri,
        content_hash = excluded.content_hash,
        page_count = excluded.page_count,
        valid_from = excluded.valid_from,
        valid_to = excluded.valid_to,
        superseded_by = excluded.superseded_by,
        classification = excluded.classification,
        author = excluded.author,
        status = excluded.status,
        updated_at = now()
    `;
  } catch {
    /* persistence is best-effort on PGLite */
  }
}

async function deletePersisted(id: string) {
  try {
    const sql = await getSql();
    await sql`delete from documents where id = ${id}`;
  } catch {
    /* persistence is best-effort on PGLite */
  }
}

function indexText(input: {
  title: string;
  filename: string;
  collection: CollectionId;
  text: string;
}) {
  const text = input.text.slice(0, 80_000);
  if (!text.trim()) throw new Error("Nothing to index — the file had no extractable text.");
  const title = input.title.slice(0, 160) || titleFromFilename(input.filename);
  const added = addDocumentToEngine({
    title,
    filename: input.filename.slice(0, 120),
    collection: input.collection,
    text,
  });
  void persistUploaded(added.document);
  return { id: added.document.id, chunkCount: added.chunkCount, title: added.document.title };
}

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
