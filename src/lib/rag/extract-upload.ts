import { inflateRawSync, inflateSync } from "node:zlib";

const TEXT_EXT = new Set(["txt", "md", "markdown", "csv", "json", "html", "htm", "log", "xml"]);
const MAX_BYTES = 2_000_000;

export function supportedUploadLabel(): string {
  return ".txt, .md, .csv, .json, .html, .pdf, .docx";
}

export function extractUploadedFile(filename: string, bytes: Uint8Array): string {
  if (bytes.byteLength > MAX_BYTES) {
    throw new Error("File is over 2 MB. Split it or paste the relevant section.");
  }
  const buf = Buffer.from(bytes);
  const ext = (filename.split(".").pop() ?? "").toLowerCase();
  if (!ext) throw new Error("Add a file extension so Aether knows how to read it.");
  if (TEXT_EXT.has(ext)) {
    const raw = stripBom(buf.toString("utf8"));
    return ext === "html" || ext === "htm" ? stripTags(raw) : raw;
  }
  if (ext === "pdf") return extractPdf(buf);
  if (ext === "docx") return extractDocx(buf);
  throw new Error(`Unsupported type .${ext}. Use ${supportedUploadLabel()}.`);
}

function stripBom(s: string): string {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&/g, "&")
    .replace(/</g, "<")
    .replace(/>/g, ">")
    .replace(/\s+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function indexOfAscii(buf: Buffer, needle: string, from: number): number {
  return buf.indexOf(needle, from);
}

function extractPdf(buf: Buffer): string {
  const parts: string[] = [];
  let i = 0;
  while (i < buf.length) {
    const streamIdx = indexOfAscii(buf, "stream", i);
    if (streamIdx < 0) break;
    let start = streamIdx + 6;
    if (buf[start] === 13) start += 1;
    if (buf[start] === 10) start += 1;
    const endIdx = indexOfAscii(buf, "endstream", start);
    if (endIdx < 0) break;
    const header = buf.subarray(Math.max(0, streamIdx - 480), streamIdx).toString("latin1");
    const payload = buf.subarray(start, endIdx);
    let decoded: Buffer | null = payload;
    if (/\/FlateDecode/.test(header)) {
      decoded = inflatePdf(payload);
    }
    if (decoded) {
      const text = decodePdfOperators(decoded.toString("latin1"));
      if (text.trim()) parts.push(text);
    }
    i = endIdx + 9;
  }
  if (parts.join("").replace(/\s/g, "").length < 20) {
    const fallback = decodePdfOperators(buf.toString("latin1"));
    if (fallback.trim()) parts.push(fallback);
  }
  const text = cleanExtracted(parts.join("\n"));
  if (text.replace(/\s/g, "").length < 12) {
    throw new Error("No extractable text in that PDF (it may be a scan). Upload a .txt or .md instead.");
  }
  return text;
}

function inflatePdf(payload: Buffer): Buffer | null {
  try {
    return inflateSync(payload);
  } catch {
    try {
      return inflateRawSync(payload);
    } catch {
      return null;
    }
  }
}

function decodePdfOperators(src: string): string {
  const out: string[] = [];
  const tj = src.matchAll(/\(((?:\\.|[^\\)])*)\)\s*Tj/g);
  for (const m of tj) out.push(unescapePdf(m[1] ?? ""));
  const tjArr = src.matchAll(/\[(.*?)\]\s*TJ/g);
  for (const m of tjArr) {
    const inner = m[1] ?? "";
    const bits = inner.matchAll(/\(((?:\\.|[^\\)])*)\)/g);
    for (const b of bits) out.push(unescapePdf(b[1] ?? ""));
  }
  return out.join(" ");
}

function unescapePdf(s: string): string {
  if (s.startsWith("\xFE\xFF") || s.startsWith("þÿ")) {
    const buf = Buffer.from(s, "latin1");
    try {
      return buf.subarray(2).toString("utf16le").replace(/\0/g, "");
    } catch {
      /* fall through */
    }
  }
  return s
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\b/g, " ")
    .replace(/\\f/g, " ")
    .replace(/\\([()\\])/g, "$1")
    .replace(/\\([0-7]{1,3})/g, (_, oct: string) => String.fromCharCode(parseInt(oct, 8)));
}

function extractDocx(buf: Buffer): string {
  const xml = unzipEntry(buf, "word/document.xml");
  if (!xml) throw new Error("That .docx has no document.xml — try exporting as .txt or .md.");
  const text = xml
    .toString("utf8")
    .replace(/<w:tab\/>/g, "\t")
    .replace(/<w:br\/>/g, "\n")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&/g, "&")
    .replace(/</g, "<")
    .replace(/>/g, ">")
    .replace(/"/g, '"');
  const cleaned = cleanExtracted(text);
  if (cleaned.replace(/\s/g, "").length < 12) {
    throw new Error("No extractable text in that Word file. Paste the body instead.");
  }
  return cleaned;
}

function unzipEntry(buf: Buffer, suffix: string): Buffer | null {
  let offset = 0;
  while (offset < buf.length - 30) {
    const sig = buf.readUInt32LE(offset);
    if (sig === 0x02014b50 || sig === 0x06054b50) break;
    if (sig !== 0x04034b50) {
      offset += 1;
      continue;
    }
    const method = buf.readUInt16LE(offset + 8);
    const flags = buf.readUInt16LE(offset + 6);
    const compSize = buf.readUInt32LE(offset + 18);
    const nameLen = buf.readUInt16LE(offset + 26);
    const extraLen = buf.readUInt16LE(offset + 28);
    const name = buf.toString("utf8", offset + 30, offset + 30 + nameLen).replace(/\\/g, "/");
    const dataStart = offset + 30 + nameLen + extraLen;
    if (flags & 0x8) {
      offset = dataStart;
      continue;
    }
    const data = buf.subarray(dataStart, dataStart + compSize);
    if (name.endsWith(suffix)) {
      if (method === 0) return Buffer.from(data);
      if (method === 8) return inflateRawSync(data);
    }
    offset = dataStart + compSize;
  }
  return null;
}

function cleanExtracted(s: string): string {
  return s
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[^\S\n]{2,}/g, " ")
    .trim();
}

export function titleFromFilename(filename: string): string {
  const base = filename.replace(/^.*[\\/]/, "").replace(/\.[^.]+$/, "");
  return base.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim() || "Untitled";
}
