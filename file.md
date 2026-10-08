# Local AI Model Pipeline — Docs, Multi-API Research, Verify, Train, Run Offline

**Goal:** Build a knowledge corpus from your documents and trusted references, use cloud APIs (OpenAI → Claude → Perplexity) only during preparation, then train / adapt a model you can run **locally with no internet**, so every question is answered from **your** model and your data.

---

## What this guide covers

1. Collect and clean your source documents  
2. Use **OpenAI** to search and expand knowledge from those docs  
3. Use **Claude** to revise, structure, and improve the training material  
4. Use **Perplexity** to verify references and catch wrong or fake citations  
5. Prepare a clean dataset for local training / fine-tuning  
6. Train (or adapt) a model on your machine  
7. Serve the model offline and answer questions from it only  

---

## Important reality check (read this first)

| Approach | What it is | Offline? | Best for |
|----------|------------|----------|----------|
| **RAG (retrieval)** | Your docs stay as files; a local model answers only from retrieved chunks | Yes (after models + docs are downloaded) | Fast, accurate citations, easy updates |
| **Fine-tuning (LoRA / QLoRA)** | Teach a base model your style, domain language, and Q&A patterns | Yes | Domain tone, formats, specialized QA |
| **Full training from scratch** | Train billions of parameters yourself | Practically no for most people | Research labs only — **not recommended** |

**Recommended path for most people:**  
**Prepare clean data with OpenAI + Claude + Perplexity → fine-tune a small open model with LoRA → optionally add local RAG** so answers stay grounded in your documents.

This repo’s AI Lab already has a local RAG path (MiniLM embeddings + citations). Use that for “answer only from my docs.” Use this `file.md` pipeline when you also want a **custom local model** trained on curated material.

---

## End-to-end architecture

```text
┌─────────────────────────────────────────────────────────────┐
│  PHASE A — ONLINE (one-time / batch prep)                   │
│                                                             │
│  Your docs (PDF, MD, TXT, DOCX)                             │
│           │                                                 │
│           ▼                                                 │
│  [1] OpenAI  — search / expand / draft Q&A from docs        │
│           │                                                 │
│           ▼                                                 │
│  [2] Claude  — revise, structure, remove fluff, fix style   │
│           │                                                 │
│           ▼                                                 │
│  [3] Perplexity — verify every reference & claim            │
│           │                                                 │
│           ▼                                                 │
│  Clean dataset (JSONL) + verified references index          │
└────────────────────────────┬────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│  PHASE B — LOCAL / OFFLINE                                  │
│                                                             │
│  Download open base model once (Llama, Qwen, Mistral, …)    │
│           │                                                 │
│           ▼                                                 │
│  Fine-tune with LoRA/QLoRA on your JSONL                    │
│           │                                                 │
│           ▼                                                 │
│  Export GGUF / merge adapters → Ollama / llama.cpp / vLLM   │
│           │                                                 │
│           ▼                                                 │
│  Ask questions → answers come from YOUR local model         │
│  (optional: local RAG so answers cite your docs)            │
└─────────────────────────────────────────────────────────────┘
```

Cloud APIs are used **only in Phase A**. After Phase B, you can unplug the network.

---

## Phase A — Prepare high-quality training data with APIs

### A0. Folder layout

```text
local-ai-lab/
├── raw_docs/              # original PDFs, notes, manuals
├── extracted/             # plain text / markdown from docs
├── openai_out/            # search + draft Q&A from OpenAI
├── claude_out/            # revised, structured training rows
├── perplexity_out/        # verification reports
├── dataset/
│   ├── train.jsonl        # final training set
│   ├── eval.jsonl         # held-out questions for testing
│   └── references.json    # verified sources only
├── scripts/               # your pipeline scripts
└── models/                # local base + fine-tuned weights
```

### A1. Extract text from your documents

- Prefer clean text: Markdown, TXT, or well-extracted PDF text.  
- Split long files into chunks (e.g. 500–1500 tokens) with overlap.  
- Keep metadata: `source_file`, `page`, `section_title`, `date`.  

Example chunk record:

```json
{
  "id": "doc-01-p12-c03",
  "source_file": "company-handbook.pdf",
  "page": 12,
  "section": "Leave policy",
  "text": "Employees may take up to 20 days of paid leave per year..."
}
```

### A2. OpenAI — search and draft knowledge

**Role of OpenAI in this pipeline:** expand coverage, draft candidate Q&A, and suggest related topics to research from your chunks.

Typical jobs:

1. **Search / expand** — given a chunk, ask: “What related questions would a user ask? What terms should I look up next?”  
2. **Draft Q&A pairs** — turn each chunk into `instruction` / `input` / `output` rows for training.  
3. **Optional web-assisted search** — if you use OpenAI tools/browsing (or you provide search results yourself), collect candidate URLs and summaries **tagged as unverified** until Perplexity checks them.

Example prompt pattern (conceptual):

```text
You are a dataset builder.
Given this document chunk and metadata, produce 3–5 Q&A pairs
that a local assistant should answer ONLY from this material.
For each pair include:
- question
- answer (grounded in the chunk)
- citation_hint (source_file + page/section)
- confidence (high|medium|low)
Do not invent facts not present in the chunk.
```

Store raw OpenAI output under `openai_out/` as JSON, e.g.:

```json
{
  "chunk_id": "doc-01-p12-c03",
  "pairs": [
    {
      "question": "How many paid leave days do employees get per year?",
      "answer": "Up to 20 days of paid leave per year.",
      "citation_hint": "company-handbook.pdf p.12 Leave policy",
      "confidence": "high",
      "suggested_references": []
    }
  ]
}
```

**API keys (env):**

```bash
OPENAI_API_KEY=sk-...
# optional model choice
OPENAI_MODEL=gpt-4.1-mini
```

### A3. Claude — revision and quality control

**Role of Claude:** edit OpenAI drafts into clean, consistent training data.

Claude should:

- Fix grammar and clarity  
- Enforce a single answer style (short, cited, no fluff)  
- Merge duplicates  
- Reject pairs that invent facts not in the chunk  
- Convert everything to your final JSONL schema  
- Add refusal rows (“I don’t know from the provided documents”) for out-of-scope questions  

Example revision prompt pattern:

```text
You are a senior editor for a private RAG/fine-tune dataset.
Revise these Q&A pairs:
1) Keep only facts supported by the source chunk.
2) Make answers concise and consistent.
3) Preserve citation_hint.
4) Flag any hallucinated claim as DROP.
Return JSON only.
```

Save revised rows to `claude_out/`.

**API keys (env):**

```bash
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-sonnet-4-5
```

### A4. Perplexity — verify references (critical)

**Role of Perplexity:** fact-check URLs, titles, authors, dates, and claims so you never train on bad or fake references.

For every external reference Claude/OpenAI proposed:

1. Ask Perplexity to confirm the source exists and matches the claim.  
2. Mark each reference: `verified` | `corrected` | `rejected`.  
3. Only `verified` / `corrected` entries go into `dataset/references.json`.  
4. If a training answer depended on a rejected source, **drop or rewrite** that row before training.

Example verification record:

```json
{
  "claim": "ISO 27001 requires annual internal audits.",
  "proposed_url": "https://example.com/iso27001",
  "status": "corrected",
  "verified_url": "https://www.iso.org/standard/27001",
  "notes": "Original blog URL was inaccurate; official ISO page preferred.",
  "safe_for_training": true
}
```

**API keys (env):**

```bash
PERPLEXITY_API_KEY=pplx-...
PERPLEXITY_MODEL=sonar-pro
```

**Rule:** No row enters `train.jsonl` unless:

- It is grounded in your local docs, **or**  
- Every external reference it uses is Perplexity-verified.

### A5. Build the final training files

**`dataset/train.jsonl`** (one JSON object per line), common chat format:

```json
{"messages":[{"role":"system","content":"You are a private local assistant. Answer only from the user's domain knowledge. If unsure, say you do not know."},{"role":"user","content":"How many paid leave days do employees get?"},{"role":"assistant","content":"Up to 20 days of paid leave per year. Source: company-handbook.pdf, p.12."}]}
```

**`dataset/eval.jsonl`:** hold out ~10–20% of questions. Never train on these; use them to score the local model later.

**`dataset/references.json`:** only verified sources.

---

## Phase B — Train / adapt a model and run offline

### B1. Choose a base model (open weights)

Pick a size that fits your GPU/CPU:

| Hardware | Suggested base models |
|----------|------------------------|
| CPU only / 8–16 GB RAM | TinyLlama, Phi-3-mini GGUF Q4, Qwen2.5-1.5B Q4 |
| 8–12 GB VRAM | Qwen2.5-7B / Llama-3.1-8B / Mistral-7B (QLoRA) |
| 24 GB+ VRAM | 13B–32B class with LoRA |

Download the model **once** while online; keep weights under `models/`.

### B2. Fine-tune with LoRA / QLoRA (recommended)

Tools commonly used:

- **Axolotl**, **Unsloth**, **LLaMA-Factory**, or **Hugging Face TRL + PEFT**

Conceptually:

```text
base_model + LoRA adapters trained on train.jsonl
        →
merged model or adapter pack
        →
export to GGUF for Ollama / llama.cpp
```

Practical tips:

- Start with **1–3 epochs**, low learning rate.  
- Mix in some general chat examples so the model does not forget basic language.  
- Include refusal examples so it does not invent company facts.  
- After training, score on `eval.jsonl` (exact match / LLM-as-judge / human review).

### B3. Serve locally with no internet

Popular offline runtimes:

| Runtime | Why use it |
|---------|------------|
| **Ollama** | Simple CLI + local HTTP API |
| **llama.cpp** | Fast GGUF on CPU/GPU |
| **LM Studio** | Desktop UI |
| **vLLM / TGI** | Higher throughput on GPU servers |

Example with Ollama after you create a Modelfile pointing at your GGUF:

```bash
ollama create my-domain-assistant -f Modelfile
ollama run my-domain-assistant
```

Then disconnect the network. Questions should still work if:

- Model weights are on disk  
- Your docs / vector index (if using RAG) are on disk  
- No tool calls require external APIs

### B4. Optional: local RAG on top of your fine-tuned model

Even after fine-tuning, **RAG is safer for factual answers**:

1. Embed your `extracted/` docs with a local embedding model (e.g. MiniLM — already used in AI Lab).  
2. On each question: retrieve Top-K chunks → send them as context to your local model.  
3. Instruct the model: “Answer only from context; cite sources; otherwise say I don’t know.”

This matches the AI Lab RAG behavior and keeps the offline model honest.

---

## Suggested orchestration workflow (batch)

Run this as a scripted pipeline (Python, n8n, or your AI Lab automation):

```text
1. ingest_docs()           → extracted/
2. openai_search_and_qa()  → openai_out/
3. claude_revise()         → claude_out/
4. perplexity_verify()     → perplexity_out/ + references.json
5. build_jsonl()           → dataset/train.jsonl + eval.jsonl
6. (human spot-check)      → approve dataset
7. finetune_lora()         → models/adapters/
8. export_gguf()           → models/gguf/
9. serve_ollama()          → local chat / API
10. eval_offline()         → score against eval.jsonl
```

You can wire steps 2–4 with n8n webhooks while online, then run 7–10 on a machine that stays offline after model download.

---

## Environment variables summary

```bash
# Phase A — cloud prep only
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4.1-mini

ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=claude-sonnet-4-5

PERPLEXITY_API_KEY=
PERPLEXITY_MODEL=sonar-pro

# Phase B — local (no cloud keys required at runtime)
LOCAL_MODEL_PATH=./models/gguf/my-domain-assistant.Q4_K_M.gguf
LOCAL_EMBEDDING_MODEL=Xenova/all-MiniLM-L6-v2
OLLAMA_HOST=http://127.0.0.1:11434
```

Never bake API keys into training data or into the local Modelfile.

---

## Quality gates before you trust offline answers

| Gate | Pass criteria |
|------|----------------|
| Reference gate | 100% of external refs in training set are Perplexity-verified |
| Grounding gate | Spot-check: answers cite doc id / page when claiming facts |
| Eval gate | Model scores acceptably on `eval.jsonl` |
| Refusal gate | Unknown topics get “I don’t know” instead of invented facts |
| Offline gate | App works with network disabled |

---

## Cost & risk notes

- **OpenAI / Claude / Perplexity cost money** — use them in batch, cache results, avoid re-running verified rows.  
- **Do not train on copyrighted text you are not allowed to use.** Prefer your own docs and properly licensed sources.  
- **Fine-tuning does not magically memorize a whole library.** For large document sets, pair fine-tuning with local RAG.  
- **Verification is mandatory.** Unchecked web snippets are a common way models learn false citations.

---

## Minimal “happy path” if you want the shortest version

1. Put your PDFs in `raw_docs/`.  
2. Extract text → chunk.  
3. **OpenAI:** generate grounded Q&A from chunks.  
4. **Claude:** revise and drop hallucinations.  
5. **Perplexity:** verify any external references; keep only clean rows.  
6. Build `train.jsonl` / `eval.jsonl`.  
7. QLoRA fine-tune a 7B–8B open model.  
8. Export to GGUF → run with Ollama offline.  
9. Ask questions; answers come from your local model (add local RAG for citations).  

---

## How this relates to AI Lab in this repo

| Need | Use |
|------|-----|
| Answer from my uploaded PDFs with citations today | AI Lab **RAG** (`AI_LAB_PROJECT.md`) |
| Multi-step research + human approval | AI Lab **research agent** + **Approvals** |
| Custom offline model trained on curated docs | This guide (`file.md`) Phase A + B |
| Orchestrate OpenAI → Claude → Perplexity batch jobs | AI Lab **n8n** workflows or scripts |

---

## Checklist

- [ ] Documents collected and extracted  
- [ ] OpenAI search / Q&A drafts generated  
- [ ] Claude revision completed  
- [ ] Perplexity verified all external references  
- [ ] `train.jsonl` + `eval.jsonl` + `references.json` ready  
- [ ] Base model downloaded  
- [ ] LoRA/QLoRA fine-tune finished  
- [ ] Model exported and served locally (Ollama / llama.cpp)  
- [ ] Offline test passed (no internet)  
- [ ] Eval questions answered correctly from your model  

---

*Pipeline summary: Docs → OpenAI (search/draft) → Claude (revise) → Perplexity (verify refs) → clean dataset → local fine-tune → offline Q&A from your model.*
