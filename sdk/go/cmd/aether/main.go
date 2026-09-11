package main

import (
	"encoding/json"
	"fmt"
	"os"
	"strings"

	aether "github.com/prj1010/aether/sdk/go"
)

func main() {
	if len(os.Args) < 2 {
		fmt.Fprintf(os.Stderr, "usage: aether <ask|search|eval|status> [question]\n")
		os.Exit(2)
	}
	switch os.Args[1] {
	case "status":
		b, _ := json.MarshalIndent(aether.PublicLlmStatus(), "", "  ")
		fmt.Println(string(b))
	case "eval":
		r := aether.RunGoldenEval(nil)
		fmt.Println(r.String())
		for _, x := range r.Results {
			mark := "ok"
			if !x.Hit {
				mark = "miss"
			}
			fmt.Printf("  [%s] %s  %s\n", mark, x.ID, x.Question)
		}
		if r.MRR < 0.99 {
			os.Exit(1)
		}
	case "ask", "search":
		if len(os.Args) < 3 {
			fmt.Fprintf(os.Stderr, "question required\n")
			os.Exit(2)
		}
		q := strings.Join(os.Args[2:], " ")
		eng := aether.NewNorthstar()
		if os.Args[1] == "search" {
			for _, h := range eng.Search(q, 8) {
				fmt.Printf("%.3f  %s  %s / %s\n", h.Score, h.DocumentID, h.Title, h.Section)
			}
			return
		}
		ans := eng.Ask(q)
		fmt.Println(ans.Text)
		fmt.Printf("\n— %s/%s · %s · confidence %.2f · %d ms\n", ans.Path, ans.Kind, ans.Model, ans.Confidence.Score, ans.LatencyMs)
		for _, c := range ans.Citations {
			fmt.Printf("  [%d] %s · %s p.%d\n", c.N, c.Title, c.Section, c.Page)
		}
	default:
		fmt.Fprintf(os.Stderr, "unknown command %s\n", os.Args[1])
		os.Exit(2)
	}
}
