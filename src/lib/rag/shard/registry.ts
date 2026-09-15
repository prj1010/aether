import type { CollectionId, DocumentRecord, IndexedChunk } from "../types";
import { buildBm25 } from "../sparse";
import { buildGraph } from "../graph";
import { cosine, EMBED_DIM, hash32, tokenize } from "../text";
import {
  withinClassification,
  type SecurityScope,
  type ShardKind,
  type ShardProfile,
  type ShardRecord,
  type ShardState,
  type ShardStatus,
} from "./types";

const SMALL_CORPUS = 8;
const SPLIT_CHUNKS = 800;
const MERGE_CHUNKS = 2;

export interface ShardRegistry {
  tenant: string;
  indexVersion: number;
  shards: Map<string, ShardState>;
  entityToShards: Map<string, Set<string>>;
  historical: Map<string, Map<string, number>>;
  single: boolean;
}

function nowIso(): string {
  return new Date().toISOString();
}

function centroid(chunks: IndexedChunk[]): Float32Array {
  const v = new Float32Array(EMBED_DIM);
  if (!chunks.length) return v;
  const n = Math.min(chunks.length, 48);
  for (let i = 0; i < n; i++) {
    const e = chunks[i]!.embedding;
    for (let d = 0; d < EMBED_DIM; d++) v[d]! += e[d]!;
  }
  const invN = 1 / n;
  let mag = 0;
  for (let d = 0; d < EMBED_DIM; d++) {
    v[d]! *= invN;
    mag += v[d]! * v[d]!;
  }
  const inv = mag > 0 ? 1 / Math.sqrt(mag) : 1;
  for (let d = 0; d < EMBED_DIM; d++) v[d]! *= inv;
  return v;
}

function topTerms(chunks: IndexedChunk[], k: number): string[] {
  const df = new Map<string, number>();
  for (const c of chunks) {
    const seen = new Set<string>();
    for (const t of tokenize(`${c.title} ${c.section} ${c.content}`)) {
      if (seen.has(t)) continue;
      seen.add(t);
      df.set(t, (df.get(t) ?? 0) + 1);
    }
  }
  return [...df.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, k)
    .map(([t]) => t);
}

function topEntities(chunks: IndexedChunk[], k: number): string[] {
  const c = new Map<string, number>();
  for (const ch of chunks) {
    for (const e of ch.entities) c.set(e.toLowerCase(), (c.get(e.toLowerCase()) ?? 0) + 1);
  }
  return [...c.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, k)
    .map(([e]) => e);
}

function timeRange(docs: DocumentRecord[]): { from: string; to: string } {
  if (!docs.length) return { from: "1970-01-01", to: "9999-12-31" };
  const from = docs.reduce((m, d) => (d.validFrom < m ? d.validFrom : m), docs[0]!.validFrom);
  const to = docs.reduce((m, d) => {
    const t = d.validTo ?? d.validFrom;
    return t > m ? t : m;
  }, docs[0]!.validFrom);
  return { from, to };
}

function profileOf(
  chunks: IndexedChunk[],
  docs: DocumentRecord[],
  domain: CollectionId | "mixed",
): ShardProfile {
  const collections: Record<string, number> = {};
  for (const d of docs) collections[d.collection] = (collections[d.collection] ?? 0) + 1;
  if (domain !== "mixed") collections[domain] = docs.length;
  return {
    centroid: centroid(chunks),
    keywords: topTerms(chunks, 24),
    entities: topEntities(chunks, 20),
    collections,
    timeRange: timeRange(docs),
  };
}

function makeShard(
  id: string,
  tenant: string,
  domain: CollectionId | "mixed",
  kind: ShardKind,
  docs: DocumentRecord[],
  chunks: IndexedChunk[],
  indexVersion: number,
): ShardState {
  const profile = profileOf(chunks, docs, domain);
  const record: ShardRecord = {
    id,
    tenant,
    domain,
    project: domain === "mixed" ? "northstar" : domain,
    region: "local",
    kind,
    timeRange: profile.timeRange,
    docCount: docs.length,
    chunkCount: chunks.length,
    embeddingModel: "hashed-ngram",
    embeddingDim: EMBED_DIM,
    indexVersion,
    status: "healthy",
    health: 1,
    replicas: 1,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    profile,
  };
  return {
    record,
    chunks,
    documentIds: new Set(docs.map((d) => d.id)),
    bm25: buildBm25(chunks),
    graph: buildGraph(chunks),
    chunksById: new Map(chunks.map((c) => [c.id, c])),
  };
}

function addEntityHomes(entityToShards: Map<string, Set<string>>, id: string, s: ShardState): void {
  for (const e of s.record.profile.entities) {
    let set = entityToShards.get(e);
    if (!set) {
      set = new Set();
      entityToShards.set(e, set);
    }
    set.add(id);
  }
  for (const [ent] of s.graph.entityToChunks) {
    let set = entityToShards.get(ent);
    if (!set) {
      set = new Set();
      entityToShards.set(ent, set);
    }
    set.add(id);
  }
}

export function buildRegistry(
  documents: DocumentRecord[],
  chunks: IndexedChunk[],
  tenant = "northstar",
  indexVersion = 1,
): ShardRegistry {
  const shards = new Map<string, ShardState>();
  const byCollection = new Map<CollectionId, DocumentRecord[]>();
  for (const d of documents) {
    const arr = byCollection.get(d.collection) ?? [];
    arr.push(d);
    byCollection.set(d.collection, arr);
  }
  const single = documents.length < SMALL_CORPUS || byCollection.size <= 1;
  if (single) {
    shards.set(
      `${tenant}.all`,
      makeShard(`${tenant}.all`, tenant, "mixed", "collection", documents, chunks, indexVersion),
    );
  } else {
    const chunksByDoc = new Map<string, IndexedChunk[]>();
    for (const c of chunks) {
      const arr = chunksByDoc.get(c.documentId) ?? [];
      arr.push(c);
      chunksByDoc.set(c.documentId, arr);
    }
    for (const [collection, docs] of byCollection) {
      const part = docs.flatMap((d) => chunksByDoc.get(d.id) ?? []);
      if (!part.length) continue;
      if (part.length > SPLIT_CHUNKS) {
        const buckets: IndexedChunk[][] = [[], []];
        const docBucket = new Map<string, number>();
        for (const c of part) {
          let b = docBucket.get(c.documentId);
          if (b == null) {
            b = hash32(c.documentId) % 2;
            docBucket.set(c.documentId, b);
          }
          buckets[b]!.push(c);
        }
        buckets.forEach((bucket, i) => {
          if (!bucket.length) return;
          const ids = new Set(bucket.map((c) => c.documentId));
          const subDocs = docs.filter((d) => ids.has(d.id));
          const id = `${tenant}.${collection}.h${i}`;
          shards.set(id, makeShard(id, tenant, collection, "hash", subDocs, bucket, indexVersion));
        });
      } else {
        const id = `${tenant}.${collection}`;
        shards.set(id, makeShard(id, tenant, collection, "collection", docs, part, indexVersion));
      }
    }
  }

  const entityToShards = new Map<string, Set<string>>();
  for (const [id, s] of shards) addEntityHomes(entityToShards, id, s);

  return { tenant, indexVersion, shards, entityToShards, historical: new Map(), single };
}

export function authorizedShards(reg: ShardRegistry, scope: SecurityScope): ShardState[] {
  const out: ShardState[] = [];
  for (const s of reg.shards.values()) {
    if (s.record.tenant !== scope.tenant) continue;
    if (s.record.status === "offline" || s.record.status === "rebuilding") continue;
    if (scope.collections?.length) {
      if (s.record.domain !== "mixed" && !scope.collections.includes(s.record.domain)) continue;
    }
    if (scope.maxClassification) {
      const any = s.chunks.some((c) => withinClassification(c.classification, scope.maxClassification));
      if (!any) continue;
    }
    out.push(s);
  }
  return out;
}

export function setShardStatus(reg: ShardRegistry, id: string, status: ShardStatus, health?: number): void {
  const s = reg.shards.get(id);
  if (!s) return;
  s.record.status = status;
  if (health != null) s.record.health = health;
  s.record.updatedAt = nowIso();
}

export function recordShardHit(reg: ShardRegistry, queryTokens: string[], shardIds: string[]): void {
  for (const tok of queryTokens.slice(0, 8)) {
    let row = reg.historical.get(tok);
    if (!row) {
      row = new Map();
      reg.historical.set(tok, row);
    }
    for (const id of shardIds) row.set(id, (row.get(id) ?? 0) + 1);
  }
}

export function maybeRebalance(reg: ShardRegistry): { action: "none" | "split" | "merge"; shardId?: string } {
  for (const s of reg.shards.values()) {
    if (s.record.chunkCount > SPLIT_CHUNKS) return { action: "split", shardId: s.record.id };
    if (s.record.chunkCount <= MERGE_CHUNKS && s.record.kind === "hash") {
      return { action: "merge", shardId: s.record.id };
    }
  }
  return { action: "none" };
}

export function shardIdForChunk(reg: ShardRegistry, chunkId: string): string | undefined {
  for (const [id, s] of reg.shards) {
    if (s.chunksById.has(chunkId)) return id;
  }
  return undefined;
}

export function cosineToProfile(queryEmb: Float32Array, profile: ShardProfile): number {
  return cosine(queryEmb, profile.centroid);
}
