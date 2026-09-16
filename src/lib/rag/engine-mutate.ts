import { ingestPlainText } from "./ingest";
import { buildGraph } from "./graph";
import { buildBm25 } from "./sparse";
import { invalidateRoutingCache, buildRegistry } from "./shard";
import { getEngine, type EngineState } from "./engine";
import { withSpan } from "../otel/instrument";
import type { DocumentRecord, IndexedChunk } from "./types";

function commit(documents: DocumentRecord[], chunks: IndexedChunk[], traces: EngineState["traces"], indexBump: number) {
  const engine = getEngine();
  engine.documents = documents;
  engine.chunks = chunks;
  engine.bm25 = buildBm25(chunks);
  engine.graph = buildGraph(chunks);
  engine.chunksById = new Map(chunks.map((c) => [c.id, c]));
  engine.traces = traces;
  engine.shards = buildRegistry(documents, chunks);
  engine.shards.indexVersion = indexBump;
  invalidateRoutingCache();
}

export function updateDocumentInEngine(input: {
  id: string;
  title: string;
  filename?: string;
  collection: DocumentRecord["collection"];
  text: string;
}): { document: DocumentRecord; chunkCount: number } {
  const engine = getEngine();
  const existing = engine.documents.find((d) => d.id === input.id);
  if (!existing) throw new Error("Document not found.");
  const text = input.text.slice(0, 80_000);
  if (!text.trim()) throw new Error("Nothing to index — the body is empty.");
  const { document, chunks } = ingestPlainText({
    id: existing.id,
    title: input.title.slice(0, 160) || existing.title,
    filename: (input.filename || existing.filename).slice(0, 120),
    collection: input.collection,
    text,
    author: existing.author,
    version: existing.version + 1,
    createdAt: existing.createdAt,
    validFrom: existing.validFrom,
    classification: existing.classification,
  });
  const documents = engine.documents.map((d) => (d.id === existing.id ? document : d));
  const allChunks = [...engine.chunks.filter((c) => c.documentId !== existing.id), ...chunks];
  commit(documents, allChunks, engine.traces, engine.shards.indexVersion + 1);
  void withSpan(
    "aether.doc.update",
    {
      "aether.doc.id": document.id,
      "aether.doc.collection": document.collection,
      "aether.doc.version": document.version,
      "aether.doc.chunks": chunks.length,
    },
    async () => undefined,
  );
  return { document, chunkCount: chunks.length };
}

export function removeDocumentFromEngine(id: string): { id: string; title: string } {
  const engine = getEngine();
  const existing = engine.documents.find((d) => d.id === id);
  if (!existing) throw new Error("Document not found.");
  const documents = engine.documents.filter((d) => d.id !== id);
  const allChunks = engine.chunks.filter((c) => c.documentId !== id);
  commit(documents, allChunks, engine.traces, engine.shards.indexVersion + 1);
  void withSpan(
    "aether.doc.delete",
    { "aether.doc.id": id, "aether.doc.collection": existing.collection },
    async () => undefined,
  );
  return { id: existing.id, title: existing.title };
}
