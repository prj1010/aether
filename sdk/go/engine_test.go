package aether

import "testing"

func TestGoldenEval(t *testing.T) {
	r := RunGoldenEval(nil)
	if r.RecallAt5 != 1 || r.MRR != 1 {
		t.Fatalf("want perfect retrieval, got %s", r)
	}
	for _, x := range r.Results {
		if !x.Hit {
			t.Errorf("miss %s %s predicted=%v", x.ID, x.Question, x.PredictedSources)
		}
	}
}

func TestVacationSearch(t *testing.T) {
	e := NewNorthstar()
	hits := e.Search("What is the vacation policy?", 5)
	found := false
	for _, h := range hits {
		if h.DocumentID == "doc-leave" {
			found = true
		}
	}
	if !found {
		t.Fatalf("expected doc-leave in vacation search, got %#v", hits)
	}
}

func TestMultiHopClassifiesDeep(t *testing.T) {
	p := classifyQuery("Which architecture was adopted after the team moved from Helios to Nimbus, and what were the reasons?")
	if p.Path != "deep" || p.Kind != "multi_hop" {
		t.Fatalf("got %+v", p)
	}
}

func TestIngest(t *testing.T) {
	e := NewEmpty()
	e.Ingest("Widget Policy", "Widgets are reimbursed at 42 percent.", "policy")
	hits := e.Search("widget reimbursement", 3)
	if len(hits) == 0 || !contains(hits[0].Excerpt, "42") {
		t.Fatalf("expected ingest hit, got %#v", hits)
	}
}

func contains(s, sub string) bool {
	return len(s) >= len(sub) && (s == sub || len(sub) == 0 || (len(s) > 0 && (func() bool {
		for i := 0; i+len(sub) <= len(s); i++ {
			if s[i:i+len(sub)] == sub {
				return true
			}
		}
		return false
	})()))
}
