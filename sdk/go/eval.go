package aether

import (
	"fmt"
	"time"
)

type EvalExampleResult struct {
	ID               string
	Question         string
	Hit              bool
	ReciprocalRank   float64
	RecallAt5        float64
	PredictedSources []string
	Path             string
	LatencyMs        int
}

type EvalReport struct {
	Results       []EvalExampleResult
	RecallAt5     float64
	MRR           float64
	MeanLatencyMs float64
}

func (r EvalReport) String() string {
	hits := 0
	for _, x := range r.Results {
		if x.Hit {
			hits++
		}
	}
	return fmt.Sprintf("Recall@k %.0f%% · MRR %.2f · %d/%d hits · %.0f ms", r.RecallAt5*100, r.MRR, hits, len(r.Results), r.MeanLatencyMs)
}

// RunGoldenEval scores retrieval Recall and MRR on the built-in suite.
func RunGoldenEval(e *Engine) EvalReport {
	if e == nil {
		e = NewNorthstar()
	}
	var results []EvalExampleResult
	for _, ex := range loadGolden() {
		t0 := time.Now()
		hits := e.Search(ex.Question, 8)
		var predicted []string
		seen := map[string]struct{}{}
		for _, h := range hits {
			if _, ok := seen[h.DocumentID]; ok {
				continue
			}
			seen[h.DocumentID] = struct{}{}
			predicted = append(predicted, h.DocumentID)
		}
		best := -1
		for i, id := range predicted {
			for _, src := range ex.ExpectedSources {
				if src == id && (best < 0 || i < best) {
					best = i
				}
			}
		}
		hit := best >= 0
		rr := 0.0
		if hit {
			rr = 1 / float64(best+1)
		}
		at := 0
		for _, src := range ex.ExpectedSources {
			for _, id := range predicted {
				if id == src {
					at++
					break
				}
			}
		}
		rec := 0.0
		if len(ex.ExpectedSources) > 0 {
			rec = float64(at) / float64(len(ex.ExpectedSources))
		}
		results = append(results, EvalExampleResult{
			ID: ex.ID, Question: ex.Question, Hit: hit, ReciprocalRank: rr, RecallAt5: rec,
			PredictedSources: predicted, Path: classifyQuery(ex.Question).Path,
			LatencyMs: int(time.Since(t0).Milliseconds()),
		})
	}
	n := float64(len(results))
	if n == 0 {
		n = 1
	}
	sumR, sumM, sumL := 0.0, 0.0, 0.0
	for _, r := range results {
		sumR += r.RecallAt5
		sumM += r.ReciprocalRank
		sumL += float64(r.LatencyMs)
	}
	return EvalReport{Results: results, RecallAt5: sumR / n, MRR: sumM / n, MeanLatencyMs: sumL / n}
}
