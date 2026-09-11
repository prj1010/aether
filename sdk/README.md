# Aether SDKs

Language bindings for the Aether retrieval engine. They share the Northstar seed corpus and the golden eval suite in `data/`.

| SDK | Path | Install |
|---|---|---|
| Python | [`python/`](python/) | `pip install -e sdk/python` |
| Go | [`go/`](go/) | `go get github.com/prj1010/aether/sdk/go` |

Both expose `ask`, `search`, `ingest`, and `eval`. The generator is model-agnostic (OpenAI, Azure, Anthropic, Groq, Gemini, Ollama, …). No key → extractive answers.

Golden eval on both: **Recall@k 100% · MRR 1.00**.
