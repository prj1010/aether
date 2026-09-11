# Aether Go SDK

Model-agnostic enterprise RAG engine. Same retrieval as the Aether app: hybrid BM25 + hashed dense, relation-free entity graph, cited answers, extractive fallback.

```go
import aether "github.com/prj1010/aether/sdk/go"

eng := aether.NewNorthstar()
ans := eng.Ask("What is the vacation policy?")
fmt.Println(ans.Text)
for _, c := range ans.Citations {
    fmt.Printf("[%d] %s p.%d\n", c.N, c.Title, c.Page)
}
```

## Install

```bash
go get github.com/prj1010/aether/sdk/go
```

From this repo:

```bash
cd sdk/go
go test ./...
go run ./cmd/aether ask "What is our certification reimbursement policy?"
```

## CLI

```bash
go run ./cmd/aether ask "What is the vacation policy?"
go run ./cmd/aether search "Forge architecture"
go run ./cmd/aether eval
go run ./cmd/aether status
```

## Generator

Retrieval does not depend on a vendor. Set `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GROQ_API_KEY`, `GEMINI_API_KEY`, `XAI_API_KEY`, or:

```bash
export LLM_PROVIDER=ollama
export LLM_MODEL=llama3.1
```

No key → extractive answers from retrieved chunks.
