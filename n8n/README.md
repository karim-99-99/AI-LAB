# n8n workflow templates

**Start here:** [DOCKER.md](./DOCKER.md) — Docker Desktop setup (free Community).

Import these into n8n when it is running at http://localhost:5678.

| File | Hits |
|------|------|
| `support-ticket.json` | `POST /api/automation/support` |
| `email-automation.json` | `POST /api/automation/email` |
| `crm-lead.json` | `POST /api/automation/crm` |
| `meeting-summary.json` | `POST /api/automation/meeting` |

All HTTP nodes read two n8n env vars (no URLs are hardcoded):

- `AI_LAB_BASE_URL` — where AI Lab runs
- `PRACTICE_API_KEY` — sent as header `x-practice-key`

## Which AI Lab does n8n call?

`docker-compose.yml` defaults to the **live Vercel app**, so workflows work
even when `npm run dev` is off:

```
AI_LAB_BASE_URL=https://ai-lab-alpha-five.vercel.app
```

To target your **local dev server** instead, override before starting:

```powershell
# PowerShell
$env:AI_LAB_BASE_URL = "http://host.docker.internal:3001"
docker compose -f n8n/docker-compose.yml up -d
```

```bash
# bash
AI_LAB_BASE_URL=http://host.docker.internal:3001 docker compose -f n8n/docker-compose.yml up -d
```

Or create `n8n/.env` next to the compose file:

```
AI_LAB_BASE_URL=http://host.docker.internal:3001
PRACTICE_API_KEY=practice-dev-key
```

After changing the value, restart n8n so it picks up the new env:
`docker compose -f n8n/docker-compose.yml up -d --force-recreate n8n`

## Review drafts

- Live: https://ai-lab-alpha-five.vercel.app/approve
- Local: http://localhost:3001/approve
