# AI Lab — Applied AI Automation Platform

Production-style AI automation studio built with **Next.js**, **TypeScript**, and the **Groq** LLM API.

**Live demo:** https://ai-lab-alpha-five.vercel.app  
**Author:** [Karim Khamis](https://www.karimkhamis.com)

> RAG with citations · LangGraph research agent · human-in-the-loop approvals · n8n webhooks · usage dashboard · LLM guardrails

---

## What it does

| Area | Features |
|------|----------|
| **RAG** | PDF ingest → local MiniLM embeddings → Top-K retrieval → answers with citations (and refusal when context is weak) |
| **Research agent** | LangGraph or manual ReAct loop · tools (`list_documents`, `search_docs`, `draft_email`) · thread memory · visible steps |
| **Human-in-the-loop** | Editable approval queue for AI-drafted emails → Approve (Gmail/outbox) or Reject |
| **n8n** | 4 webhook workflows (support, CRM lead, email, meeting summary) calling this API |
| **Ops** | Auth + rate limit · model routing (fast/strong) · Redis cache · usage/cost log · prompt-injection guardrails |

Full feature list: [`AI_LAB_PROJECT.md`](./AI_LAB_PROJECT.md)  
Local research automation (Addendum A): [`automation/README.md`](./automation/README.md) · hardware: [`automation/PROJECT_HARDWARE.md`](./automation/PROJECT_HARDWARE.md)

---

## Quick start

```bash
cp .env.example .env.local
# set GROQ_API_KEY, PRACTICE_API_KEY, NEXT_PUBLIC_PRACTICE_API_KEY

npm install
npm run dev -- -p 3001
```

- Studio: http://localhost:3001  
- Approvals: http://localhost:3001/approve  
- Ops: http://localhost:3001/admin  
- n8n hub: http://localhost:3001/n8n  

Optional local stack (n8n + Redis):

```bash
docker compose -f n8n/docker-compose.yml up -d
```

Default `AI_LAB_BASE_URL` in compose points at the **live Vercel app**. Override for local:

```powershell
$env:AI_LAB_BASE_URL = "http://host.docker.internal:3001"
docker compose -f n8n/docker-compose.yml up -d --force-recreate n8n
```

---

## Stack

- Next.js 16 (App Router) · TypeScript · Tailwind CSS  
- Groq (`openai/gpt-oss-20b` / `openai/gpt-oss-120b`)  
- LangGraph · Zod · `@xenova/transformers` (embeddings)  
- Redis / Upstash (optional cache) · Docker n8n · Nodemailer (optional Gmail)

---

## Deploy

Already deployed on Vercel. To redeploy from this folder:

```bash
npx vercel deploy --prod --yes
```

See **Live deployment** notes in [`AI_LAB_PROJECT.md`](./AI_LAB_PROJECT.md) (ephemeral `/tmp` storage on serverless, native-deps tracing, `maxDuration`, etc.).

---

## License

Private portfolio project — all rights reserved unless otherwise noted.
