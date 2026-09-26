# AI Lab — Project Details & Features

**Product name:** AI Lab  
**Repo folder:** `phase1-ai-lab`  
**Stack:** Next.js (App Router) · TypeScript · Groq · LangGraph · Zod · Redis · Docker n8n · local JSON stores  
**Portfolio positioning:** Applied AI automation studio (RAG · agents · workflows · HITL · ops)

---

## One-sentence pitch

AI Lab is a full-stack practice product that turns LLMs into **reliable automation**: document RAG with citations, tool-using research agents, n8n webhooks, human approval with edit, usage/cost tracking, and LLM guardrails.

---

## Architecture (high level)

```text
Browser (Studio / n8n page / Approvals / Ops)
        │
        ▼
Next.js API routes  ←── auth (x-practice-key) + rate limit + guardrails
        │
        ├── Groq (chat / tools / strong|fast routing)
        ├── Local MiniLM embeddings (RAG)
        ├── data/*.json (docs, threads, store, usage)
        ├── Redis / Upstash (RAG answer cache)
        └── n8n (Docker) ──HTTP──► automation APIs ──► /approve ──► Gmail|outbox
```

---

## In-app pages

| Route | Purpose |
|-------|---------|
| `/` (Studio) | Mode workspace: chat, docs tools, automation API, RAG, research agent |
| `/n8n` | n8n project hub — architecture, 4 importable workflows, run steps |
| `/approve` | Human-in-the-loop queue — edit draft fields, save, approve, reject |
| `/admin` (Ops) | Usage, cost, model routing table, guardrail settings |

Global nav: **Studio · n8n Workflows · Approvals · Ops**

---

## Feature catalog

### A) Core LLM tools (Studio)

| Feature | What it does |
|---------|----------------|
| Streaming chat | SSE token stream; conversations persist locally |
| Summarizer | Condense long text |
| Email writer | Draft emails with structured-friendly output |
| Grammar | Rewrite / correct text |
| Resume analyzer | Score / strengths / gaps (Zod-validated JSON) |
| Blog generator | Title, outline, draft |
| PDF summarizer | Upload PDF → extract text → summarize |
| Extraction | Invoice/form JSON → Zod → local store |

### B) Knowledge — RAG

| Feature | What it does |
|---------|----------------|
| PDF ingest | Chunk (basic / sentence-window / auto-merge modes) |
| Local embeddings | MiniLM via `@xenova/transformers` |
| Ask with citations | Retrieve Top-K + min score; answer only from context |
| Weak retrieval refusal | Returns “I don’t know…” when scores are low |
| Answer cache | Memory → Redis (`REDIS_URL`) → optional Upstash |
| Async ingest | Background job + progress polling |
| Eval set | Default question set + triad-style scoring run |

### C) Research agent

| Feature | What it does |
|---------|----------------|
| Tools | `list_documents`, `search_docs`, `draft_email` |
| Engines | **LangGraph** (`createReactAgent` + `MemorySaver`) or **Manual ReAct** loop |
| Thread memory | `threadId` — follow-ups keep context |
| Visible steps | tool_call → tool_result → final |
| HITL drafts | `draft_email` queues `/approve` (never auto-sends) |
| Engine info panel | Explains loop / memory / graph differences |

### D) Automation & n8n

| Feature | What it does |
|---------|----------------|
| Support webhook | Ticket → draft reply → pending approval |
| Email automation | Structured email + optional approval |
| CRM lead | Parse lead → local CRM |
| Meeting summary | Transcript → summary + tasks |
| In-app Automation tab | Call the same APIs without n8n |
| Docker Compose | `n8n` (:5678) + `redis` (:6379) |
| Workflow JSON templates | `n8n/workflows/*.json` (4 flows) |
| `/n8n` page | Product-facing explanation of the n8n project |

### E) Human approval

| Feature | What it does |
|---------|----------------|
| Queue UI | Pending items from support / email / agent |
| Manual edit | Change To, Subject, Body, Channel before decide |
| Save edits | Persist without sending |
| Approve | Gmail (if configured) or local outbox |
| Reject | Mark rejected, no send |

### F) Operations & production habits

| Feature | What it does |
|---------|----------------|
| Practice auth | `PRACTICE_API_KEY` / `x-practice-key` |
| Rate limiting | Per-key requests/minute |
| Usage log + Ops dashboard | Tokens, estimated cost, by route/model |
| Model routing | Task → fast (`AI_MODEL_FAST`) or strong (`AI_MODEL_STRONG`) |
| Guardrails | Injection patterns, blocked topics, max input/output, `max_tokens`, `requestId` |

---

## Tech details

- **UI:** Next.js App Router, Outfit + IBM Plex Mono, teal accent design tokens  
- **AI provider:** Groq (`openai/gpt-oss-20b` fast, `openai/gpt-oss-120b` strong by default)  
- **Validation:** Zod on structured AI outputs  
- **Persistence:** `data/store.json`, `data/agent-threads.json`, RAG store, `data/usage-log.json`  
- **Agents:** `@langchain/langgraph` + `@langchain/openai` (Groq base URL)  
- **Mail:** Nodemailer + Gmail App Password (optional)

---

## How to run

```bash
cd phase1-ai-lab
npm install
npm run dev -- -p 3001
```

Optional Docker (n8n + Redis):

```bash
docker compose -f n8n/docker-compose.yml up -d
```

- Studio: http://localhost:3001  
- n8n: http://localhost:5678  
- Approvals: http://localhost:3001/approve  
- Ops: http://localhost:3001/admin  

---

## Live deployment (Vercel)

- **Production:** https://ai-lab-alpha-five.vercel.app  
- Project: `ai-lab` (linked from `phase1-ai-lab/`, no Git integration — deploy from CLI)

```bash
cd phase1-ai-lab
npx vercel deploy --prod --yes      # redeploy after changes
npx vercel env ls production        # check env vars
npx vercel logs ai-lab-alpha-five.vercel.app
```

What was adapted for serverless:

| Concern | Handling |
|--------|----------|
| JSON stores (`data/*.json`) | `src/lib/data-dir.ts` → `/tmp` on Vercel (**ephemeral**: resets on cold start / redeploy). Set `DATA_DIR` or move to Upstash/Supabase for real persistence |
| Embedding model download | `@xenova/transformers` cache → `/tmp/transformers-cache` |
| Native deps (`onnxruntime-node`, `pdfjs-dist` worker, `@napi-rs/canvas`) | `outputFileTracingIncludes` in `next.config.ts` (+ excludes for non-Linux binaries to stay under 250MB) |
| Long tasks | `export const maxDuration = 60` on agent / RAG / PDF routes |
| Rate limit | per practice key **and** caller IP (browser key is public) |
| Redis | `REDIS_URL` not set on Vercel → in-memory cache. Add `UPSTASH_REDIS_REST_URL/TOKEN` for a shared cache |
| n8n | Still local Docker, but its HTTP nodes target the live app by default (`AI_LAB_BASE_URL` in `n8n/docker-compose.yml`; override for local dev). `/n8n` page link via `NEXT_PUBLIC_N8N_URL` |

---

## Demo script (portfolio / Loom)

1. Ingest a PDF in **RAG** → ask a question → show citations + cache HIT on repeat  
2. Run **Research agent** (LangGraph) → tools visible → draft email → amber “waiting for human”  
3. Open **Approvals** → edit body → Approve  
4. Open **n8n Workflows** page → explain webhook → AI Lab → approve  
5. Open **Ops** → show usage + guardrails; optionally show blocked injection goal  

---

## Env keys (see `.env.example`)

| Key | Role |
|-----|------|
| `GROQ_API_KEY` | Model calls |
| `PRACTICE_API_KEY` / `NEXT_PUBLIC_PRACTICE_API_KEY` | API auth |
| `AI_MODEL_FAST` / `AI_MODEL_STRONG` | Routing |
| `REDIS_URL` | Local Redis cache |
| `GMAIL_USER` / `GMAIL_APP_PASSWORD` | Real send on approve |
| `GUARD_*` | Guardrail limits / blocked topics |

---

## What this project proves (for employers)

1. You ship **LLM features inside a real product UI**, not notebooks only  
2. You understand **RAG + refusal + evals**  
3. You build **agents with tools, memory, and human gates**  
4. You connect **n8n orchestration** to your own APIs  
5. You care about **cost, auth, rate limits, and safety**

---

## Related docs in repo

- `n8n/README.md` — workflow import table  
- `n8n/DOCKER.md` — Docker Desktop setup  
- `../KARIM_AI_AUTOMATION_CAREER.md` — career titles & portfolio strategy  

---

*AI Lab — Applied AI Automation · Karim Khamis*
