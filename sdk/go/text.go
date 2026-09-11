package aether

import (
	"math"
	"regexp"
	"strings"
)

var stop = map[string]struct{}{
	"a": {}, "an": {}, "the": {}, "and": {}, "or": {}, "of": {}, "to": {}, "in": {}, "on": {},
	"for": {}, "with": {}, "at": {}, "by": {}, "from": {}, "is": {}, "are": {}, "was": {},
	"were": {}, "be": {}, "been": {}, "being": {}, "as": {}, "that": {}, "this": {}, "these": {},
	"those": {}, "it": {}, "its": {}, "we": {}, "our": {}, "you": {}, "your": {}, "they": {},
	"their": {}, "i": {}, "me": {}, "my": {}, "not": {}, "no": {}, "but": {}, "if": {}, "then": {},
	"than": {}, "so": {}, "such": {}, "into": {}, "over": {}, "after": {}, "before": {}, "about": {},
	"what": {}, "which": {}, "who": {}, "whom": {}, "when": {}, "where": {}, "why": {}, "how": {},
	"do": {}, "does": {}, "did": {}, "can": {}, "could": {}, "should": {}, "would": {}, "will": {},
	"may": {}, "might": {}, "must": {}, "have": {}, "has": {}, "had": {},
}

var nonToken = regexp.MustCompile(`[^a-z0-9+#.\-]+`)
var ws = regexp.MustCompile(`\s+`)

const embedDim = 256

func normalize(text string) string {
	return strings.TrimSpace(ws.ReplaceAllString(nonToken.ReplaceAllString(strings.ToLower(text), " "), " "))
}

func tokenize(text string) []string {
	n := normalize(text)
	if n == "" {
		return nil
	}
	out := make([]string, 0)
	for _, t := range strings.Split(n, " ") {
		if len(t) > 1 {
			if _, skip := stop[t]; !skip {
				out = append(out, t)
			}
		}
	}
	return out
}

func hash32(s string) uint32 {
	h := uint32(2166136261)
	for i := 0; i < len(s); i++ {
		h ^= uint32(s[i])
		h *= 16777619
	}
	return h
}

func contentHash(text string) string {
	h1 := hash32(text)
	rev := make([]byte, len(text))
	for i := 0; i < len(text); i++ {
		rev[i] = text[len(text)-1-i]
	}
	h2 := hash32(string(rev))
	return hex8(h1) + hex8(h2)
}

func hex8(v uint32) string {
	const digits = "0123456789abcdef"
	b := make([]byte, 8)
	for i := 7; i >= 0; i-- {
		b[i] = digits[v&0xf]
		v >>= 4
	}
	return string(b)
}

func estimateTokens(text string) int {
	n := int(math.Ceil(float64(len(text)) / 4))
	if n < 1 {
		return 1
	}
	return n
}

func snippet(text string, max int) string {
	t := strings.TrimSpace(ws.ReplaceAllString(text, " "))
	if len(t) <= max {
		return t
	}
	cut := t[:max-1]
	if i := strings.LastIndex(cut, " "); i > 0 {
		cut = cut[:i]
	}
	return cut + "…"
}

func embed(text string) []float64 {
	vec := make([]float64, embedDim)
	tokens := tokenize(text)
	if len(tokens) == 0 {
		return vec
	}
	for i, t := range tokens {
		h := hash32(t)
		sign := 1.0
		if h&1 == 0 {
			sign = -1
		}
		vec[h%embedDim] += sign
		if i+1 < len(tokens) {
			h2 := hash32(t + "_" + tokens[i+1])
			s2 := 1.0
			if h2&1 == 0 {
				s2 = -1
			}
			vec[h2%embedDim] += s2
		}
		if len(t) >= 4 {
			tri := hash32(t[:3])
			s3 := 1.0
			if tri&1 == 0 {
				s3 = -1
			}
			vec[tri%embedDim] += 0.35 * s3
		}
	}
	var n float64
	for _, v := range vec {
		n += v * v
	}
	inv := 1.0
	if n > 0 {
		inv = 1 / math.Sqrt(n)
	}
	for i := range vec {
		vec[i] *= inv
	}
	return vec
}

func cosine(a, b []float64) float64 {
	n := len(a)
	if len(b) < n {
		n = len(b)
	}
	var s float64
	for i := 0; i < n; i++ {
		s += a[i] * b[i]
	}
	return s
}

func minMaxNormalize(values []float64) []float64 {
	if len(values) == 0 {
		return values
	}
	lo, hi := values[0], values[0]
	for _, v := range values {
		if v < lo {
			lo = v
		}
		if v > hi {
			hi = v
		}
	}
	span := hi - lo
	out := make([]float64, len(values))
	if span <= 1e-9 {
		fill := 0.0
		if hi > 0 {
			fill = 1
		}
		for i := range out {
			out[i] = fill
		}
		return out
	}
	for i, v := range values {
		out[i] = (v - lo) / span
	}
	return out
}

func round4(n float64) float64 {
	return math.Round(n*10000) / 10000
}
