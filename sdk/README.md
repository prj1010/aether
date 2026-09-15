# Aether SDKs

Language bindings for the Aether retrieval engine. They share the Northstar seed corpus and the golden eval suite in `data/`.

Clone once, then pick a language:

```bash
git clone https://github.com/prj1010/aether.git
cd aether
```

| SDK | Path | From clone | From git URL |
|---|---|---|---|
| Python | [`python/`](python/) | `pip install -e sdk/python` | `pip install "git+https://github.com/prj1010/aether.git#subdirectory=sdk/python"` |
| Go | [`go/`](go/) | `cd sdk/go && go test ./...` | `go get github.com/prj1010/aether/sdk/go@main` |

Both expose `ask`, `search`, `ingest`, and `eval`. The Python SDK also exposes AICertify’s five-step loop as `aether.certify` (`regulations.create` → `application.create` → `evaluate` → `get_report`). The generator is model-agnostic (OpenAI, Azure, Anthropic, Groq, Gemini, Ollama, …). No key → extractive answers.

Golden eval on both: **Recall@k 100% · MRR 1.00**.

Full steps: [Python README](python/README.md) · [Go README](go/README.md).
