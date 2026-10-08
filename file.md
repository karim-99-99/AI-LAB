# Master Playbook — Local AI + Automation (What You Should Do)

**Classification:** PRIVATE / CONFIDENTIAL  
**Version:** V1-LC  
**Primary machine:** MacBook Pro 16″ (M5 Max · 128GB · 8TB)  
**Principle:** Local-First / Secure / Modular / AI-Agnostic / Future-Ready

This file is your **single checklist**. It merges:

1. Building a **private local model** from your docs (OpenAI → Claude → Perplexity → fine-tune → offline Q&A)  
2. **Addendum A** — scheduled research automation on macOS (Launchd + AnythingLLM + Encrypted Archive)  
3. Your **hardware inventory** (reviewed from `automation/PROJECT_HARDWARE.md` + `automation/ADDENDUM_A.md`)

---

## 0) What you are building (big picture)

You want two capabilities on the same Mac:

| Capability | What it does | When internet is needed |
|------------|--------------|-------------------------|
| **A. Local trained / adapted model** | Answers questions from **your** knowledge after you prepare data with cloud APIs | Only while preparing data & downloading the base model |
| **B. Addendum A automation** | Runs research tasks on a schedule, saves encrypted reports | Only if the AnythingLLM workspace is allowed to use external tools; Local-Only workspaces stay offline |

```text
YOUR DOCS + REFERENCES
        │
        ▼
┌─ PHASE 1 — ONLINE PREP ─────────────────────────────────┐
│  OpenAI  = search / expand / draft Q&A                   │
│  Claude  = revise / clean / structure dataset            │
│  Perplexity = verify every reference is real & correct   │
└───────────────────────────┬──────────────────────────────┘
                            ▼
                   Clean train.jsonl
                            │
                            ▼
┌─ PHASE 2 — LOCAL TRAIN & SERVE (MacBook Pro 16″) ───────┐
│  Fine-tune open model (LoRA) → Ollama / AnythingLLM      │
│  Ask questions → answers from YOUR local model           │
│  Optional RAG so answers cite your docs                  │
└───────────────────────────┬──────────────────────────────┘
                            ▼
┌─ PHASE 3 — ADDENDUM A AUTOMATION ───────────────────────┐
│  Launchd → tasks.json → AnythingLLM workspace            │
│  → Encrypted Research Archive + Execution Logs           │
└──────────────────────────────────────────────────────────┘
```

---

## 1) Your hardware (reviewed) — where each device fits

Reviewed from `automation/PROJECT_HARDWARE.md`:

| Device | Spec | What you should use it for |
|--------|------|----------------------------|
| **MacBook Pro 16″** | M5 Max · 18-core CPU · 40-core GPU · **128GB** · **8TB** · Silver | **Main host.** AnythingLLM, Launchd automation, fine-tuning, Encrypted Archive, models, logs |
| **MacBook Pro 14″** | M5 Pro · 18-core CPU · 48GB · 2TB · Silver | Travel / secondary work. Clone repo if needed; do **not** duplicate live Keychain secrets carelessly |
| **iPhone 18 Pro** | 512GB · Silver | **Review only.** No auto Email/Telegram sharing of research |
| **iPad Pro 13″** | M5 · 512GB · Wi-Fi + Cellular · Silver | **Reading archived reports only.** No automated external sync |

**Rule:** Automation + Local-Only workspaces run on the **16″**. Phones/tablets are viewers, not automation nodes.

---

## 2) Order of work (do this in sequence)

Follow these stages in order. Do not skip security setup.

| Stage | Name | Done when |
|-------|------|-----------|
| **1** | Install local stack on 16″ | AnythingLLM + Ollama (or equivalent) running on localhost |
| **2** | Secure secrets (Keychain) | API keys & archive passphrase only in Keychain |
| **3** | Collect & chunk your documents | `raw_docs/` + `extracted/` ready |
| **4** | OpenAI search/draft | `openai_out/` Q&A drafts exist |
| **5** | Claude revision | `claude_out/` clean rows exist |
| **6** | Perplexity verify references | `references.json` only verified sources |
| **7** | Build dataset | `train.jsonl` + `eval.jsonl` ready |
| **8** | Fine-tune & export local model | Model answers offline from your domain |
| **9** | Wire model into AnythingLLM workspaces | Chat works locally for your workspaces |
| **10** | Enable Addendum A automation | Launchd runs daily + US-close tasks; reports encrypted |
| **11** | Acceptance test | All checkboxes in §11 pass |

---

## 3) Stage 1 — Install local stack (MacBook Pro 16″)

### Steps

1. Install **AnythingLLM** desktop (or local server) and confirm API is on `http://127.0.0.1:3001` (or your chosen localhost port).  
2. Install **Ollama** (or LM Studio / llama.cpp) for local models.  
3. Create at least two workspaces that match `automation/config/tasks.json`:  
   - `global-markets`  
   - `us-equities`  
4. Decide which workspaces are **Local-Only** (no external tools / no web). Mark them clearly; later set `"local_only": true` in `tasks.json` for those.  
5. Clone this repo to a stable path, e.g. `~/Projects/AI-LAB`.

### Folder layout you should create for training data

```text
~/Projects/AI-LAB/
├── file.md                          # this playbook
├── automation/                      # Addendum A (already in repo)
│   ├── config/tasks.json
│   ├── prompts/
│   ├── scripts/
│   ├── launchd/
│   ├── logs/execution/
│   └── archive/
└── local-ai-lab/                    # create this for the train pipeline
    ├── raw_docs/
    ├── extracted/
    ├── openai_out/
    ├── claude_out/
    ├── perplexity_out/
    ├── dataset/
    │   ├── train.jsonl
    │   ├── eval.jsonl
    │   └── references.json
    └── models/
```

---

## 4) Stage 2 — Security first (mandatory)

Reviewed from `automation/ADDENDUM_A.md` security section.

### What you must do

1. **Never** put API keys in git, `tasks.json`, or screenshots.  
2. Store secrets in **macOS Keychain** using the repo helper:

```bash
cd ~/Projects/AI-LAB

# AnythingLLM API key
./automation/scripts/keychain.sh set ailab.anythingllm api-key

# Passphrase for Encrypted Research Archive
./automation/scripts/keychain.sh set ailab.research-archive passphrase
```

3. For the **online prep** phase only (OpenAI / Claude / Perplexity), keep those keys in Keychain or a local untracked `.env` that is gitignored — never commit them.  
4. Confirm: no Email / Telegram / external auto-share is configured for automation.

| Secret | Keychain service | Account |
|--------|------------------|---------|
| AnythingLLM API key | `ailab.anythingllm` | `api-key` |
| Archive passphrase | `ailab.research-archive` | `passphrase` |

---

## 5) Stage 3 — Collect documents

### Steps

1. Put all source PDFs / notes / manuals into `local-ai-lab/raw_docs/`.  
2. Extract text to Markdown/TXT under `local-ai-lab/extracted/`.  
3. Chunk long docs (about 500–1500 tokens) with overlap.  
4. Keep metadata on every chunk: `source_file`, `page`, `section`, `date`.

Example chunk:

```json
{
  "id": "doc-01-p12-c03",
  "source_file": "company-handbook.pdf",
  "page": 12,
  "section": "Leave policy",
  "text": "Employees may take up to 20 days of paid leave per year..."
}
```

---

## 6) Stage 4 — OpenAI (search + draft Q&A)

**Job of OpenAI:** search/expand topics from your chunks and draft training Q&A.

### Steps

1. Set `OPENAI_API_KEY` (local only).  
2. For each chunk, ask OpenAI to produce 3–5 grounded Q&A pairs.  
3. Save JSON under `local-ai-lab/openai_out/`.  
4. Tag any suggested web URLs as **unverified** until Stage 6.

Prompt pattern:

```text
You are a dataset builder.
Given this document chunk, produce 3–5 Q&A pairs
a local assistant should answer ONLY from this material.
Include: question, answer, citation_hint, confidence (high|medium|low).
Do not invent facts not present in the chunk.
```

---

## 7) Stage 5 — Claude (revision)

**Job of Claude:** clean OpenAI drafts into consistent training rows.

### Steps

1. Set `ANTHROPIC_API_KEY` (local only).  
2. Send OpenAI drafts + original chunk to Claude.  
3. Claude must: fix style, drop hallucinations, merge duplicates, keep citations, add “I don’t know” refusal examples.  
4. Save clean rows under `local-ai-lab/claude_out/`.

---

## 8) Stage 6 — Perplexity (verify references)

**Job of Perplexity:** prove every external reference is real and matches the claim.

### Steps

1. Set `PERPLEXITY_API_KEY` (local only).  
2. For each external URL/claim from Stages 4–5, verify with Perplexity.  
3. Mark each as `verified` | `corrected` | `rejected`.  
4. Write only safe sources to `local-ai-lab/dataset/references.json`.  
5. Drop or rewrite any training row that depended on a rejected source.

**Hard rule:** nothing enters `train.jsonl` unless it is grounded in your local docs **or** every external reference is verified.

---

## 9) Stage 7 — Build the training files

### Steps

1. Convert Claude-approved rows into chat JSONL.  
2. Split ~80–90% → `train.jsonl`, ~10–20% → `eval.jsonl` (never train on eval).  
3. Spot-check 20 random rows yourself.

`train.jsonl` line example:

```json
{"messages":[{"role":"system","content":"You are a private local assistant. Answer only from the user's domain knowledge. If unsure, say you do not know."},{"role":"user","content":"How many paid leave days do employees get?"},{"role":"assistant","content":"Up to 20 days of paid leave per year. Source: company-handbook.pdf, p.12."}]}
```

---

## 10) Stage 8 — Fine-tune on the 16″ and run offline

Your 128GB unified memory can run strong local models. Prefer **LoRA / QLoRA**, not training from scratch.

### Steps

1. Download an open base model once (e.g. Qwen2.5-7B / Llama-3.1-8B or larger if you want).  
2. Fine-tune with Unsloth, LLaMA-Factory, Axolotl, or HF TRL+PEFT on `train.jsonl` (1–3 epochs).  
3. Export to **GGUF** (or merge adapters).  
4. Load into **Ollama** (and/or AnythingLLM as the workspace model).  
5. Turn Wi‑Fi off and ask eval questions — answers must still work.  
6. (Recommended) Add **local RAG** over `extracted/` so factual answers stay cited.

```bash
ollama create my-domain-assistant -f Modelfile
ollama run my-domain-assistant
```

| Approach | Use when |
|----------|----------|
| **RAG** | You need citations and easy doc updates |
| **Fine-tune** | You need domain style / fixed Q&A patterns |
| **Both** | Best accuracy for a private offline assistant |
| **Train from scratch** | Do **not** — not practical for this project |

---

## 11) Stage 9–10 — Addendum A automation (full steps)

Reviewed from `automation/ADDENDUM_A.md` + `automation/README.md`.

### 11.1 Goal

- Run research tasks automatically on a schedule  
- Send each task to the configured AnythingLLM workspace + model  
- Save results in the **Encrypted Research Archive**  
- Log every run  
- **No** Cloud Scheduler, **no** custom backend, **no** auto Email/Telegram  

### 11.2 Initial tasks (already in `tasks.json`)

| Task ID | Schedule | Workspace slug |
|---------|----------|----------------|
| `daily-global-market-brief` | Daily **08:00** (`Asia/Riyadh` by default) | `global-markets` |
| `us-market-close` | Weekdays **16:05** `America/New_York` | `us-equities` |

Edit times, prompts, models anytime in:

- `automation/config/tasks.json`  
- `automation/prompts/`  

### 11.3 Install automation on the 16″

```bash
cd ~/Projects/AI-LAB

# 1) Secrets (if not done in Stage 2)
./automation/scripts/keychain.sh set ailab.anythingllm api-key
./automation/scripts/keychain.sh set ailab.research-archive passphrase

# 2) Edit LaunchAgent paths
# Open automation/launchd/com.ailab.research.automation.plist
# Replace EVERY /Users/SHARED/REPLACE_WITH_REPO with your real path
# Example: /Users/you/Projects/AI-LAB

# 3) Install LaunchAgent
cp automation/launchd/com.ailab.research.automation.plist ~/Library/LaunchAgents/
# (copy after editing, or edit the copy under ~/Library/LaunchAgents/)
launchctl unload ~/Library/LaunchAgents/com.ailab.research.automation.plist 2>/dev/null || true
launchctl load ~/Library/LaunchAgents/com.ailab.research.automation.plist

# 4) Manual test (live)
./automation/scripts/run-task.sh daily-global-market-brief --force
./automation/scripts/run-task.sh us-market-close --force

# 5) Dry-run acceptance (no live API)
AILAB_DRY_RUN=1 ./automation/tests/e2e-test.sh
```

What each run must do (Addendum A output rules):

1. Execute automatically (or via CLI)  
2. Use workspace + model from `tasks.json`  
3. Save dated report into encrypted archive  
4. Append execution log under `automation/logs/execution/`  
5. Record errors if anything fails  

### 11.4 How to add a future task (no rebuild)

1. Create `automation/prompts/my-new-task.md`  
2. Register it in `automation/prompts/library.json`  
3. Append a new object under `tasks` in `automation/config/tasks.json`  
4. Stop — Launchd already calls `run-due-tasks.sh` every minute  

n8n Local is **optional only**. Primary path = Launchd + scripts.

### 11.5 Where outputs go

```text
automation/archive/<task_id>/YYYY-MM-DD/<timestamp>-report.md.enc
automation/logs/execution/YYYY-MM.jsonl
```

---

## 12) Stage 11 — Acceptance test (you must prove all of this)

### Local model path

- [ ] Docs extracted and chunked  
- [ ] OpenAI drafts created  
- [ ] Claude revision done  
- [ ] Perplexity verified all external references  
- [ ] `train.jsonl` + `eval.jsonl` + `references.json` ready  
- [ ] Fine-tuned model runs in Ollama / AnythingLLM  
- [ ] Offline test: Wi‑Fi off, questions still answered from your model  
- [ ] Unknown questions get “I don’t know” (not invented facts)  

### Addendum A path (from ADDENDUM_A acceptance)

- [ ] Automation runs on schedule (Launchd loaded)  
- [ ] Reports land in Encrypted Research Archive  
- [ ] No credentials exposed in files or logs  
- [ ] Local-Only workspaces do not send data externally  
- [ ] New task can be added via `tasks.json` + prompt only  
- [ ] `AILAB_DRY_RUN=1 ./automation/tests/e2e-test.sh` passes  

---

## 13) Environment / keys summary

```bash
# Online prep only (Stages 4–6)
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
PERPLEXITY_API_KEY=

# Local runtime (Stages 8–10) — prefer Keychain for AnythingLLM
# Keychain: ailab.anythingllm / api-key
# Keychain: ailab.research-archive / passphrase
OLLAMA_HOST=http://127.0.0.1:11434
# AnythingLLM base URL is in automation/config/tasks.json (localhost only for local_only workspaces)
```

---

## 14) Related files in this repo

| File | Role |
|------|------|
| **`file.md` (this file)** | Full “what to do” playbook |
| `automation/ADDENDUM_A.md` | Formal Addendum A specification |
| `automation/PROJECT_HARDWARE.md` | Device inventory |
| `automation/README.md` | Short automation quick start |
| `automation/config/tasks.json` | Editable task registry |
| `automation/prompts/` | Central Prompt Library |
| `automation/scripts/` | run-task / archive / keychain / scheduler |
| `automation/launchd/` | macOS LaunchAgent |
| `automation/tests/e2e-test.sh` | End-to-end acceptance |
| `AI_LAB_PROJECT.md` | Existing AI Lab product features (RAG, n8n UI, etc.) |

---

## 15) One-page daily operating routine (after setup)

**Morning (auto):** Launchd runs `daily-global-market-brief` → encrypted archive.  
**After US close (auto):** Launchd runs `us-market-close` → encrypted archive.  
**When you ask a question:** Use your local AnythingLLM / Ollama model (optionally with RAG).  
**When you add research docs:** Re-run Stages 3–8 only for new material; do not rebuild automation.  
**When you need a new scheduled brief:** Add prompt + `tasks.json` entry only.

---

*End of master playbook. Pipeline: Docs → OpenAI → Claude → Perplexity → local fine-tune → offline answers → Launchd automation → Encrypted Research Archive.*
