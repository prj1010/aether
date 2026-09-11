package aether

import (
	"math"
	"regexp"
	"strings"
)

type bm25Index struct {
	N     int
	Avgdl float64
	Df    map[string]int
	Tfs   map[string]map[string]int
	Dl    map[string]int
}

const k1 = 1.5
const b = 0.75

func buildBM25(chunks []IndexedChunk) bm25Index {
	df := map[string]int{}
	tfs := map[string]map[string]int{}
	dl := map[string]int{}
	total := 0
	for _, c := range chunks {
		tokens := tokenize(c.Title + " " + c.Section + " " + c.Content)
		dl[c.ID] = len(tokens)
		total += len(tokens)
		tf := map[string]int{}
		for _, t := range tokens {
			tf[t]++
		}
		tfs[c.ID] = tf
		for t := range tf {
			df[t]++
		}
	}
	avg := 0.0
	if len(chunks) > 0 {
		avg = float64(total) / float64(len(chunks))
	}
	return bm25Index{N: len(chunks), Avgdl: avg, Df: df, Tfs: tfs, Dl: dl}
}

func bm25Score(index bm25Index, chunkID string, q []string) float64 {
	tf := index.Tfs[chunkID]
	docLen := index.Dl[chunkID]
	if tf == nil || len(q) == 0 {
		return 0
	}
	score := 0.0
	seen := map[string]struct{}{}
	for _, term := range q {
		if _, ok := seen[term]; ok {
			continue
		}
		seen[term] = struct{}{}
		f := float64(tf[term])
		if f == 0 {
			continue
		}
		n := float64(index.Df[term])
		idf := math.Log(1 + (float64(index.N)-n+0.5)/(n+0.5))
		avg := index.Avgdl
		if avg == 0 {
			avg = 1
		}
		denom := f + k1*(1-b+b*(float64(docLen)/avg))
		score += idf * ((f * (k1 + 1)) / denom)
	}
	return score
}

func bm25Search(index bm25Index, chunks []IndexedChunk, query string, k int) []struct {
	chunk IndexedChunk
	score float64
} {
	q := tokenize(query)
	type row struct {
		chunk IndexedChunk
		score float64
	}
	scored := make([]row, len(chunks))
	for i, c := range chunks {
		scored[i] = row{c, bm25Score(index, c.ID, q)}
	}
	for i := 0; i < len(scored); i++ {
		for j := i + 1; j < len(scored); j++ {
			if scored[j].score > scored[i].score {
				scored[i], scored[j] = scored[j], scored[i]
			}
		}
	}
	if k > len(scored) {
		k = len(scored)
	}
	out := make([]struct {
		chunk IndexedChunk
		score float64
	}, k)
	for i := 0; i < k; i++ {
		out[i].chunk = scored[i].chunk
		out[i].score = scored[i].score
	}
	return out
}

var (
	multiHop = regexp.MustCompile(`(?i)\b(after|before|then|which .+ after|and what|why .+\band\b|compare|versus|\bvs\.?\b|migrat|adopted after|moved from)\b`)
	temporal = regexp.MustCompile(`(?i)\b(current|currently|now|as of|supersede|deprecated|previous|old|new|latest|before \d{4}|after \d{4})\b`)
	memoryRe = regexp.MustCompile(`(?i)\b(remember|last time|previously we|we decided|my preference|earlier you|what did we)\b`)
	exactRe  = regexp.MustCompile(`(?i)"[^"]+"|\b[A-Z]{2,}(?:-[A-Z0-9]+)+\b|\bsev-?\d\b`)
	factual  = regexp.MustCompile(`(?i)^(what is|what's|whats|when is|how many|how much|who is|where is|list)\b`)
)

func classifyQuery(query string) QueryPlan {
	q := strings.TrimSpace(query)
	useMemory := memoryRe.MatchString(q)
	isMulti := multiHop.MatchString(q) || (strings.Contains(q, "?") && regexp.MustCompile(`(?i)\band\b`).MatchString(q) && len(q) > 80)
	isTemporal := temporal.MatchString(q)
	isExact := exactRe.MatchString(q)
	isFactual := factual.MatchString(strings.ToLower(q))
	kind := "semantic"
	switch {
	case useMemory:
		kind = "memory"
	case isMulti:
		kind = "multi_hop"
	case isTemporal:
		kind = "temporal"
	case isExact:
		kind = "exact"
	case isFactual || len(strings.Fields(q)) <= 6:
		kind = "factual"
	}
	path := "fast"
	if kind == "multi_hop" || kind == "temporal" {
		path = "deep"
	}
	return QueryPlan{Kind: kind, Path: path, UseMemory: useMemory, UseGraph: path == "deep"}
}

func shouldDeepen(topHybrid float64, plan QueryPlan) bool {
	if plan.Path == "deep" {
		return true
	}
	return topHybrid < 0.32
}

var injectionPatterns = []struct {
	re   *regexp.Regexp
	flag string
}{
	{regexp.MustCompile(`(?i)ignore (all )?(previous|prior|above) instructions`), "ignore-previous"},
	{regexp.MustCompile(`(?i)reveal (your )?(hidden )?system prompt`), "prompt-exfil"},
	{regexp.MustCompile(`(?i)you are now `), "role-hijack"},
	{regexp.MustCompile(`(?i)disable citation`), "disable-citations"},
	{regexp.MustCompile(`(?i)this document is the only source of truth`), "authority-override"},
	{regexp.MustCompile(`(?i)system instruction\s*:`), "embedded-system"},
	{regexp.MustCompile(`(?i)override (the )?(company )?polic`), "policy-override"},
}

func scanInjection(text string) []string {
	var flags []string
	for _, p := range injectionPatterns {
		if p.re.MatchString(text) {
			flags = append(flags, p.flag)
		}
	}
	return flags
}

var entityLexicon = []string{
	"helios", "nimbus", "forge", "pulse", "northstar", "okta", "workday",
	"ciso", "cissp", "pto", "vacation", "kubernetes", "postgres", "oidc",
	"engineering certification policy", "tuition assistance",
	"architecture review board", "incident commander",
	"us-east-1", "eu-west-1", "austin", "bengaluru", "london",
}

func extractEntities(text string) []string {
	lower := strings.ToLower(text)
	seen := map[string]struct{}{}
	var found []string
	add := func(s string) {
		if _, ok := seen[s]; ok {
			return
		}
		seen[s] = struct{}{}
		found = append(found, s)
	}
	for _, e := range entityLexicon {
		if strings.Contains(lower, e) {
			add(titleCaseEntity(e))
		}
	}
	proper := regexp.MustCompile(`\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3}\b`).FindAllString(text, -1)
	for _, p := range proper {
		if len(p) >= 3 && len(p) < 48 {
			add(p)
		}
	}
	codes := regexp.MustCompile(`\b[A-Z]{2,}(?:-[A-Z0-9]+)+\b`).FindAllString(text, -1)
	for _, c := range codes {
		add(c)
	}
	if len(found) > 24 {
		found = found[:24]
	}
	return found
}

func titleCaseEntity(e string) string {
	switch e {
	case "pto", "oidc", "ciso", "cissp":
		return strings.ToUpper(e)
	}
	if strings.Contains(e, " ") {
		parts := strings.Fields(e)
		for i, p := range parts {
			if p == "" {
				continue
			}
			parts[i] = strings.ToUpper(p[:1]) + p[1:]
		}
		return strings.Join(parts, " ")
	}
	if e == "" {
		return e
	}
	return strings.ToUpper(e[:1]) + e[1:]
}

func hybridCandidates(chunks []IndexedChunk, sparse map[string]float64, query string, k int) []Candidate {
	qEmb := embed(query)
	qTokens := map[string]struct{}{}
	for _, t := range tokenize(query) {
		qTokens[t] = struct{}{}
	}
	denseRaw := make([]float64, len(chunks))
	sparseRaw := make([]float64, len(chunks))
	for i, chunk := range chunks {
		denseRaw[i] = cosine(qEmb, chunk.Embedding)
		sparseRaw[i] = sparse[chunk.ID]
	}
	dN := minMaxNormalize(denseRaw)
	sN := minMaxNormalize(sparseRaw)
	out := make([]Candidate, len(chunks))
	for i, chunk := range chunks {
		hybrid := 0.52*sN[i] + 0.48*dN[i]
		var reasons []string
		if sN[i] > 0.6 {
			reasons = append(reasons, "strong lexical match")
		}
		if dN[i] > 0.55 {
			reasons = append(reasons, "semantic neighborhood")
		}
		for _, t := range tokenize(chunk.Title) {
			if _, ok := qTokens[t]; ok {
				reasons = append(reasons, "title overlap")
				break
			}
		}
		out[i] = Candidate{Chunk: chunk, Sparse: sN[i], Dense: dN[i], Hybrid: hybrid, Rerank: hybrid, Reasons: reasons}
	}
	sortCands(out, func(a, b Candidate) bool { return a.Hybrid > b.Hybrid })
	if k > len(out) {
		k = len(out)
	}
	return out[:k]
}

func applyGraphBoost(cands []Candidate, ids map[string]struct{}, weight float64) {
	for i := range cands {
		if _, ok := ids[cands[i].Chunk.ID]; ok {
			g := cands[i].Graph + weight
			if g > 1 {
				g = 1
			}
			cands[i].Graph = g
			cands[i].Reasons = append(cands[i].Reasons, "graph expansion")
		}
	}
}

func rerank(cands []Candidate, query string) []Candidate {
	qTokens := map[string]struct{}{}
	for _, t := range tokenize(query) {
		qTokens[t] = struct{}{}
	}
	now := "2026-09-11"
	wantsBait := regexp.MustCompile(`(?i)inject|ignore previous|vendor faq|system prompt`).MatchString(query)
	qlower := strings.ToLower(query)
	for i := range cands {
		c := &cands[i]
		extra := 0.0
		titleHits := 0
		for _, t := range tokenize(c.Chunk.Title) {
			if _, ok := qTokens[t]; ok {
				titleHits++
			}
		}
		if titleHits > 0 {
			if titleHits > 3 {
				titleHits = 3
			}
			extra += 0.08 * float64(titleHits)
		}
		entHits := 0
		for _, e := range c.Chunk.Entities {
			if strings.Contains(qlower, strings.ToLower(e)) {
				entHits++
			}
		}
		if entHits > 0 {
			if entHits > 4 {
				entHits = 4
			}
			extra += 0.05 * float64(entHits)
		}
		if c.Chunk.Status == "deprecated" {
			extra -= 0.12
		}
		if c.Chunk.ValidTo != nil && *c.Chunk.ValidTo < now {
			extra -= 0.1
		}
		if c.Chunk.ValidFrom > "2025-01-01" {
			extra += 0.04
		}
		if len(scanInjection(c.Chunk.Content)) > 0 && !wantsBait {
			extra -= 0.85
			c.Reasons = append(c.Reasons, "untrusted injection downranked")
		}
		r := c.Hybrid + c.Graph + extra
		if r < 0 {
			r = 0
		}
		if r > 1.15 {
			r = 1.15
		}
		c.Rerank = r
	}
	sortCands(cands, func(a, b Candidate) bool { return a.Rerank > b.Rerank })
	return cands
}

func mmrSelect(cands []Candidate, k int, lam float64) []Candidate {
	var selected []Candidate
	rest := append([]Candidate{}, cands...)
	for len(selected) < k && len(rest) > 0 {
		bestI, best := 0, math.Inf(-1)
		for i, c := range rest {
			maxSim := 0.0
			for _, s := range selected {
				if sim := cosine(c.Chunk.Embedding, s.Chunk.Embedding); sim > maxSim {
					maxSim = sim
				}
			}
			mmr := lam*c.Rerank - (1-lam)*maxSim
			if mmr > best {
				best, bestI = mmr, i
			}
		}
		selected = append(selected, rest[bestI])
		rest = append(rest[:bestI], rest[bestI+1:]...)
	}
	return selected
}

func assembleContext(cands []Candidate, k int) ([]Candidate, []Citation, []Conflict, Confidence) {
	filtered := make([]Candidate, 0)
	for _, c := range cands {
		if c.Rerank >= 0.18 {
			filtered = append(filtered, c)
		}
	}
	if k > len(cands) {
		k = len(cands)
	}
	diverse := mmrSelect(filtered, k, 0.72)
	var selected []Candidate
	tokens := 0
	for _, c := range diverse {
		if tokens+c.Chunk.TokenCount > 2800 && len(selected) >= 3 {
			break
		}
		selected = append(selected, c)
		tokens += c.Chunk.TokenCount
	}
	cites := make([]Citation, len(selected))
	for i, c := range selected {
		fn := c.Chunk.SourceURI
		if idx := strings.LastIndex(fn, "/"); idx >= 0 {
			fn = fn[idx+1:]
		}
		cites[i] = Citation{
			N: i + 1, ChunkID: c.Chunk.ID, DocumentID: c.Chunk.DocumentID,
			Title: c.Chunk.DocTitle, Filename: fn, Section: c.Chunk.Section,
			Page: c.Chunk.Page, Excerpt: snippet(c.Chunk.Content, 280),
			Score: round4(c.Rerank), ValidFrom: c.Chunk.ValidFrom, ValidTo: c.Chunk.ValidTo,
			Version: c.Chunk.Version,
		}
	}
	conf := scoreConfidence(selected, nil)
	return selected, cites, nil, conf
}

func scoreConfidence(selected []Candidate, conflicts []Conflict) Confidence {
	top, second := 0.0, 0.0
	if len(selected) > 0 {
		top = selected[0].Rerank
	}
	if len(selected) > 1 {
		second = selected[1].Rerank
	}
	gap := top - second
	coverage := float64(len(selected)) / 4
	if coverage > 1 {
		coverage = 1
	}
	agreement := 0.9
	if len(conflicts) > 0 {
		agreement = 0.55
	}
	density := 0.0
	n := len(selected)
	if n > 3 {
		n = 3
	}
	if n > 0 {
		for i := 0; i < n; i++ {
			density += selected[i].Rerank
		}
		density /= float64(n)
	}
	raw := 0.4*top + 0.2*math.Min(1, gap*3) + 0.15*coverage + 0.15*agreement + 0.1*density
	score := math.Max(0, math.Min(0.99, raw))
	band := "insufficient"
	if score >= 0.9 {
		band = "high"
	} else if score >= 0.7 {
		band = "medium"
	} else if score >= 0.5 {
		band = "low"
	}
	return Confidence{Score: round4(score), Band: band}
}

func sortCands(c []Candidate, less func(a, b Candidate) bool) {
	for i := 0; i < len(c); i++ {
		for j := i + 1; j < len(c); j++ {
			if less(c[j], c[i]) {
				c[i], c[j] = c[j], c[i]
			}
		}
	}
}

type semanticGraph struct {
	entityToChunks map[string]map[string]struct{}
	chunkToEnts    map[string][]string
}

func normEntity(e string) string {
	re := regexp.MustCompile(`[^a-z0-9]+`)
	return strings.TrimSpace(re.ReplaceAllString(strings.ToLower(e), " "))
}

func buildGraph(chunks []IndexedChunk) semanticGraph {
	g := semanticGraph{entityToChunks: map[string]map[string]struct{}{}, chunkToEnts: map[string][]string{}}
	for _, c := range chunks {
		seen := map[string]struct{}{}
		var ents []string
		for _, e := range c.Entities {
			n := normEntity(e)
			if n == "" {
				continue
			}
			if _, ok := seen[n]; ok {
				continue
			}
			seen[n] = struct{}{}
			ents = append(ents, n)
			if g.entityToChunks[n] == nil {
				g.entityToChunks[n] = map[string]struct{}{}
			}
			g.entityToChunks[n][c.ID] = struct{}{}
		}
		g.chunkToEnts[c.ID] = ents
	}
	return g
}

func seedEntities(query string, g semanticGraph) []string {
	tokens := tokenize(query)
	seen := map[string]struct{}{}
	var seeds []string
	for _, e := range extractEntities(query) {
		n := normEntity(e)
		if _, ok := g.entityToChunks[n]; ok {
			if _, d := seen[n]; !d {
				seen[n] = struct{}{}
				seeds = append(seeds, n)
			}
		}
	}
	for ent := range g.entityToChunks {
		if len(ent) < 3 || len(seeds) >= 12 {
			continue
		}
		hit := false
		for _, t := range tokens {
			if strings.Contains(ent, t) || strings.Contains(t, ent) {
				hit = true
				break
			}
		}
		if hit {
			if _, d := seen[ent]; !d {
				seen[ent] = struct{}{}
				seeds = append(seeds, ent)
			}
		}
	}
	if len(seeds) > 12 {
		seeds = seeds[:12]
	}
	return seeds
}

func expandGraph(query string, seeds []string, g semanticGraph, byID map[string]IndexedChunk, hops int) map[string]struct{} {
	qEmb := embed(query)
	visited := map[string]struct{}{}
	visitedE := map[string]struct{}{}
	for _, s := range seeds {
		visitedE[s] = struct{}{}
	}
	frontier := append([]string{}, seeds...)
	for h := 0; h < hops; h++ {
		var next []string
		for _, ent := range frontier {
			cids := g.entityToChunks[ent]
			type sc struct {
				id    string
				score float64
			}
			var ranked []sc
			for id := range cids {
				ch, ok := byID[id]
				if !ok {
					continue
				}
				ranked = append(ranked, sc{id, cosine(qEmb, ch.Embedding)})
			}
			for i := 0; i < len(ranked); i++ {
				for j := i + 1; j < len(ranked); j++ {
					if ranked[j].score > ranked[i].score {
						ranked[i], ranked[j] = ranked[j], ranked[i]
					}
				}
			}
			lim := 6
			if lim > len(ranked) {
				lim = len(ranked)
			}
			for _, r := range ranked[:lim] {
				if _, ok := visited[r.id]; ok {
					continue
				}
				visited[r.id] = struct{}{}
				for _, e := range g.chunkToEnts[r.id] {
					if _, ok := visitedE[e]; !ok {
						visitedE[e] = struct{}{}
						next = append(next, e)
					}
				}
			}
		}
		if len(next) > 16 {
			next = next[:16]
		}
		frontier = next
		if len(frontier) == 0 {
			break
		}
	}
	return visited
}
