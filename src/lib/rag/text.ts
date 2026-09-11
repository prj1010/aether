const STOP = new Set([
  "a","an","the","and","or","of","to","in","on","for","with","at","by","from",
  "is","are","was","were","be","been","being","as","that","this","these","those",
  "it","its","we","our","you","your","they","their","i","me","my","not","no",
  "but","if","then","than","so","such","into","over","after","before","about",
  "what","which","who","whom","when","where","why","how","do","does","did",
  "can","could","should","would","will","may","might","must","have","has","had",
]);

export function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9+#.\-]+/g, " ").replace(/\s+/g, " ").trim();
}

export function tokenize(text: string): string[] {
  const n = normalize(text);
  if (!n) return [];
  return n.split(" ").filter((t) => t.length > 1 && !STOP.has(t));
}

export function tokenizeKeepStops(text: string): string[] {
  const n = normalize(text);
  if (!n) return [];
  return n.split(" ").filter((t) => t.length > 0);
}

export function hash32(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function contentHash(text: string): string {
  const h1 = hash32(text);
  const h2 = hash32(text.split("").reverse().join(""));
  return (h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0"));
}

export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+(?=[A-Z0-9])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function snippet(text: string, max = 220): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return t.slice(0, max - 1).replace(/\s+\S*$/, "") + "…";
}

export const EMBED_DIM = 256;

export function embed(text: string): Float32Array {
  const vec = new Float32Array(EMBED_DIM);
  const tokens = tokenize(text);
  if (tokens.length === 0) return vec;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!;
    const h = hash32(t);
    const bucket = h % EMBED_DIM;
    const sign = h & 1 ? 1 : -1;
    vec[bucket]! += sign;
    if (i + 1 < tokens.length) {
      const h2 = hash32(t + "_" + tokens[i + 1]);
      vec[h2 % EMBED_DIM]! += h2 & 1 ? 1 : -1;
    }
    if (t.length >= 4) {
      const tri = hash32(t.slice(0, 3));
      vec[tri % EMBED_DIM]! += 0.35 * (tri & 1 ? 1 : -1);
    }
  }
  let n = 0;
  for (let i = 0; i < EMBED_DIM; i++) n += vec[i]! * vec[i]!;
  const inv = n > 0 ? 1 / Math.sqrt(n) : 1;
  for (let i = 0; i < EMBED_DIM; i++) vec[i]! *= inv;
  return vec;
}

export function cosine(a: Float32Array, b: Float32Array): number {
  let s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) s += a[i]! * b[i]!;
  return s;
}

export function minMaxNormalize(values: number[]): number[] {
  if (values.length === 0) return values;
  let min = Infinity;
  let max = -Infinity;
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const span = max - min;
  if (span <= 1e-9) return values.map(() => (max > 0 ? 1 : 0));
  return values.map((v) => (v - min) / span);
}
