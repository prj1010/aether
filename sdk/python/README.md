# Aether Python SDK

Model-agnostic enterprise RAG engine. Same retrieval as the Aether app: hybrid BM25 + hashed dense, relation-free entity graph, cited answers, extractive fallback.

```python
from aether import Engine

engine = Engine.northstar()
answer = engine.ask("What is the vacation policy?")
print(answer.text)
for c in answer.citations:
    print(f"[{c.n}] {c.title} p.{c.page}")
```

## Install from GitHub

**Requires** Python 3.10+.

From the repo root, the conventional pip file is [`requirements.txt`](../../requirements.txt):

```bash
git clone https://github.com/prj1010/aether.git
cd aether
pip install -r requirements.txt
```

Clone, then install this package editable:

```bash
git clone https://github.com/prj1010/aether.git
cd aether/sdk/python
pip install -e .
# or
pip install -r requirements.txt
# or
uv pip install -e .
```

Install without cloning, straight from git:

```bash
pip install "git+https://github.com/prj1010/aether.git#subdirectory=sdk/python"
# same pin as the root requirements.txt:
pip install -r https://raw.githubusercontent.com/prj1010/aether/main/requirements.txt
```

A tagged / branch pin:

```bash
pip install "git+https://github.com/prj1010/aether.git@main#subdirectory=sdk/python"
```

Dev extras (pytest):

```bash
pip install -r sdk/python/requirements-dev.txt
```

## Colab

Colab caches the previous `aether-rag` install. If `list_available()` raises `TypeError: string indices must be integers`, the kernel still has **0.1.0**. Reinstall **0.1.1+**, drop the old module from `sys.modules`, then re-run. Do not skip the uninstall / `--no-cache-dir` flags.

```python
%pip uninstall -y aether-rag
%pip install --upgrade --force-reinstall --no-cache-dir \
  -r https://raw.githubusercontent.com/prj1010/aether/main/requirements.txt

import sys
for _m in [m for m in sys.modules if m == "aether" or m.startswith("aether.")]:
    del sys.modules[_m]

import aether
from aether.certify import regulations
print("aether", aether.__version__)  # expect 0.1.1+
print(regulations.create("northstar").list_available())
```

Then the five-step certify cell.

## CLI

After install:

```bash
aether ask "What is our certification reimbursement policy?"
aether search "Forge architecture" -k 5
aether eval
aether status
```

From a clone, without installing the script on `PATH`:

```bash
git clone https://github.com/prj1010/aether.git
cd aether/sdk/python
python -m aether.cli ask "What is the vacation policy?"
python -m aether.cli eval
```

## Generator

Retrieval does not depend on a vendor. Set any of:

```bash
export OPENAI_API_KEY=sk-...
# or ANTHROPIC_API_KEY, GROQ_API_KEY, GEMINI_API_KEY, XAI_API_KEY, ...
# or local:
export LLM_PROVIDER=ollama
export LLM_MODEL=llama3.1
```

No key → extractive answers from retrieved chunks.

## API

| Method | What it does |
|---|---|
| `Engine.northstar()` | Seeded Northstar Systems corpus |
| `Engine.empty()` | Blank index |
| `engine.ask(q)` | Adaptive retrieve → cite → answer |
| `engine.search(q, k)` | Ranked chunks |
| `engine.ingest(title, text)` | Add a document |
| `run_golden_eval()` | Recall / MRR on the golden suite |
| `aether certify` | Compliance-as-code: EU AI Act, NIST AI RMF, operational policies |

## Compliance (AICertify-shaped)

Same five-step loop as AICertify, original Aether policies, live Northstar interactions. Does not pip-install `aicertify` and does not copy GOPAL Rego.

```python
from aether.certify import regulations, application

regulations_set = regulations.create("my_regulations")
print("Available:", [r["id"] for r in regulations_set.list_available()])
regulations_set.add("eu_ai_act")
regulations_set.add("nist_ai_rmf")
regulations_set.add("operational")

app = application.create(
    name="Aether",
    model_name="extractive",
    model_version="1.0",
    model_metadata={"purpose": "Northstar knowledge desk"},
)

report = app.evaluate(
    regulations=regulations_set,
    report_format="html",
    output_dir="reports",
)
print(report)
print(app.get_report())
```

CLI: `aether certify --format html --out reports`
