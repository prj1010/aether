# Aether Go SDK

Model-agnostic enterprise RAG engine. Same retrieval as the Aether app: hybrid BM25 + hashed dense, relation-free entity graph, cited answers, extractive fallback.

```go
package main

import (
	"fmt"

	aether "github.com/prj1010/aether/sdk/go"
)

func main() {
	eng := aether.NewNorthstar()
	ans := eng.Ask("What is the vacation policy?")
	fmt.Println(ans.Text)
	for _, c := range ans.Citations {
		fmt.Printf("[%d] %s p.%d\n", c.N, c.Title, c.Page)
	}
}
```

## Install from GitHub

**Requires** Go 1.22+.

### As a module dependency

```bash
go get github.com/prj1010/aether/sdk/go@main
```

In your `go.mod`:

```
require github.com/prj1010/aether/sdk/go v0.0.0-0
```

`go get` fills in the pseudo-version from [github.com/prj1010/aether](https://github.com/prj1010/aether).

### Clone and run locally

```bash
git clone https://github.com/prj1010/aether.git
cd aether/sdk/go
go test ./...
go run ./cmd/aether ask "What is our certification reimbursement policy?"
```

Point another module at the clone:

```bash
git clone https://github.com/prj1010/aether.git
cd your-app
go mod edit -replace github.com/prj1010/aether/sdk/go=../aether/sdk/go
go get github.com/prj1010/aether/sdk/go@main
```

## CLI

From a clone:

```bash
git clone https://github.com/prj1010/aether.git
cd aether/sdk/go
go run ./cmd/aether ask "What is the vacation policy?"
go run ./cmd/aether search "Forge architecture"
go run ./cmd/aether eval
go run ./cmd/aether status
```

Build a binary:

```bash
git clone https://github.com/prj1010/aether.git
cd aether/sdk/go
go build -o aether ./cmd/aether
./aether ask "What is the vacation policy?"
```

## Generator

Retrieval does not depend on a vendor. Set `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GROQ_API_KEY`, `GEMINI_API_KEY`, `XAI_API_KEY`, or:

```bash
export LLM_PROVIDER=ollama
export LLM_MODEL=llama3.1
```

No key → extractive answers from retrieved chunks.
