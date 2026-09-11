from __future__ import annotations

import math
import re

STOP = {
    "a", "an", "the", "and", "or", "of", "to", "in", "on", "for", "with", "at", "by", "from",
    "is", "are", "was", "were", "be", "been", "being", "as", "that", "this", "these", "those",
    "it", "its", "we", "our", "you", "your", "they", "their", "i", "me", "my", "not", "no",
    "but", "if", "then", "than", "so", "such", "into", "over", "after", "before", "about",
    "what", "which", "who", "whom", "when", "where", "why", "how", "do", "does", "did",
    "can", "could", "should", "would", "will", "may", "might", "must", "have", "has", "had",
}

EMBED_DIM = 256
_NON_TOKEN = re.compile(r"[^a-z0-9+#.\-]+")
_WS = re.compile(r"\s+")


def normalize(text: str) -> str:
    return _WS.sub(" ", _NON_TOKEN.sub(" ", text.lower())).strip()


def tokenize(text: str) -> list[str]:
    n = normalize(text)
    if not n:
        return []
    return [t for t in n.split(" ") if len(t) > 1 and t not in STOP]


def hash32(s: str) -> int:
    h = 2166136261
    for ch in s:
        h ^= ord(ch)
        h = (h * 16777619) & 0xFFFFFFFF
    return h


def content_hash(text: str) -> str:
    h1 = hash32(text)
    h2 = hash32(text[::-1])
    return f"{h1:08x}{h2:08x}"


def estimate_tokens(text: str) -> int:
    return max(1, math.ceil(len(text) / 4))


def snippet(text: str, max_len: int = 220) -> str:
    t = _WS.sub(" ", text).strip()
    if len(t) <= max_len:
        return t
    cut = t[: max_len - 1]
    cut = re.sub(r"\s+\S*$", "", cut)
    return cut + "…"


def embed(text: str) -> list[float]:
    vec = [0.0] * EMBED_DIM
    tokens = tokenize(text)
    if not tokens:
        return vec
    for i, t in enumerate(tokens):
        h = hash32(t)
        bucket = h % EMBED_DIM
        sign = 1 if (h & 1) else -1
        vec[bucket] += sign
        if i + 1 < len(tokens):
            h2 = hash32(t + "_" + tokens[i + 1])
            vec[h2 % EMBED_DIM] += 1 if (h2 & 1) else -1
        if len(t) >= 4:
            tri = hash32(t[:3])
            vec[tri % EMBED_DIM] += 0.35 * (1 if (tri & 1) else -1)
    n = sum(v * v for v in vec)
    inv = (1 / math.sqrt(n)) if n > 0 else 1.0
    return [v * inv for v in vec]


def cosine(a: list[float], b: list[float]) -> float:
    n = min(len(a), len(b))
    return sum(a[i] * b[i] for i in range(n))


def min_max_normalize(values: list[float]) -> list[float]:
    if not values:
        return values
    lo, hi = min(values), max(values)
    span = hi - lo
    if span <= 1e-9:
        return [1.0 if hi > 0 else 0.0 for _ in values]
    return [(v - lo) / span for v in values]


def round4(n: float) -> float:
    return round(n * 10000) / 10000
