import type { ChunkRecord, DocumentRecord, IndexedChunk } from "./types";
import { contentHash, embed, estimateTokens, tokenize } from "./text";
import { seedDocuments, seedSections } from "./corpus";

const ENTITY_LEXICON = [
  "helios", "nimbus", "forge", "pulse", "northstar", "okta", "workday",
  "ciso", "cissp", "pto", "vacation", "kubernetes", "postgres", "oidc",
  "engineering certification policy", "tuition assistance",
  "architecture review board", "incident commander", "ciso",
  "us-east-1", "eu-west-1", "austin", "bengaluru", "london",
];

export function extractEntities(text: string): string[] {
  const lower = text.toLowerCase();
  const found = new Set<string>();
  for (const e of ENTITY_LEXICON) {
    if (lower.includes(e)) found.add(titleCaseEntity(e));
  }
  const proper = text.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3}\b/g) ?? [];
  for (const p of proper) {
    if (p.length >= 3 && p.length < 48) found.add(p);
  }
  const codes = text.match(/\b[A-Z]{2,}(?:-[A-Z0-9]+)+\b/g) ?? [];
  for (const c of codes) found.add(c);
  return [...found].slice(0, 24);
}

function titleCaseEntity(e: string): string {
  if (e === "pto" || e === "oidc" || e === "ciso" || e === "cissp") return e.toUpperCase();
  if (e.includes(" ")) {
    return e.replace(/\b\w/g, (m) => m.toUpperCase());
  }
  return e.charAt(0).toUpperCase() + e.slice(1);
}

export function chunkDocument(doc: DocumentRecord, sections?: { section: string; page: number; body: string }[]): ChunkRecord[] {
  const secs =
    sections ??
    doc.content.split(/^## /m).filter(Boolean).map((block, i) => {
      const nl = block.indexOf("\n");
      const section = nl === -1 ? `Section ${i + 1}` : block.slice(0, nl).trim();
      const body = nl === -1 ? block : block.slice(nl).trim();
      return { section, page: i + 1, body };
    });

  const chunks: ChunkRecord[] = [];
  let ordinal = 0;
  for (const sec of secs) {
    const pieces = splitWindow(sec.body, 900, 120);
    for (const piece of pieces) {
      const id = `${doc.id}::${ordinal}`;
      chunks.push({
        id,
        documentId: doc.id,
        content: piece,
        title: doc.title,
        section: sec.section,
        page: sec.page,
        sourceUri: doc.sourceUri,
        contentHash: contentHash(piece),
        entities: extractEntities(`${doc.title} ${sec.section} ${piece}`),
        tokenCount: estimateTokens(piece),
        ordinal,
      });
      ordinal += 1;
    }
  }
  return chunks;
}

function splitWindow(text: string, maxChars: number, overlap: number): string[] {
  if (text.length <= maxChars) return [text.trim()].filter(Boolean);
  const paras = text.split(/\n{2,}/);
  const out: string[] = [];
  let buf = "";
  for (const p of paras) {
    if ((buf + "\n\n" + p).length > maxChars && buf) {
      out.push(buf.trim());
      const tail = buf.slice(-overlap);
      buf = tail + "\n\n" + p;
    } else {
      buf = buf ? buf + "\n\n" + p : p;
    }
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}

export function toIndexed(doc: DocumentRecord, chunk: ChunkRecord): IndexedChunk {
  const embText = `${doc.title} ${chunk.section} ${chunk.content}`;
  return {
    ...chunk,
    docTitle: doc.title,
    collection: doc.collection,
    version: doc.version,
    validFrom: doc.validFrom,
    validTo: doc.validTo,
    classification: doc.classification,
    status: doc.status,
    embedding: embed(embText),
  };
}

export function buildSeedIndex(): { documents: DocumentRecord[]; chunks: IndexedChunk[] } {
  const documents = seedDocuments();
  const sections = seedSections();
  const chunks: IndexedChunk[] = [];
  for (const doc of documents) {
    const seed = sections.find((s) => s.id === doc.id);
    const raw = chunkDocument(doc, seed?.sections);
    for (const c of raw) chunks.push(toIndexed(doc, c));
  }
  return { documents, chunks };
}

export function ingestPlainText(input: {
  title: string;
  filename: string;
  collection: DocumentRecord["collection"];
  text: string;
  author?: string;
}): { document: DocumentRecord; chunks: IndexedChunk[] } {
  const now = new Date().toISOString();
  const id = `doc-user-${contentHash(input.title + now).slice(0, 10)}`;
  const document: DocumentRecord = {
    id,
    title: input.title,
    filename: input.filename || `${input.title.replace(/\s+/g, "-").toLowerCase()}.txt`,
    collection: input.collection,
    version: 1,
    content: input.text,
    sourceUri: `upload://${input.filename || id}`,
    contentHash: contentHash(input.text),
    pageCount: Math.max(1, Math.ceil(input.text.length / 1800)),
    validFrom: now.slice(0, 10),
    validTo: null,
    supersededBy: null,
    classification: "internal",
    author: input.author ?? "Uploaded",
    createdAt: now,
    updatedAt: now,
    status: "indexed",
  };
  const raw = chunkDocument(document);
  return { document, chunks: raw.map((c) => toIndexed(document, c)) };
}

export function queryTerms(q: string): string[] {
  return tokenize(q);
}
