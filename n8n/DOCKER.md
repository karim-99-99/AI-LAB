# Run n8n with Docker (free Community edition)

## Status (already set up on this PC)

- n8n UI: http://localhost:5678
- Login: `admin@ailab.local` / `Practice123!`
- Workflow **AI Lab — Support ticket → approval** is **Active**
- Webhook: `POST http://localhost:5678/webhook/support-ticket`
- AI Lab: http://localhost:3000 (must be running)
- Approve queue: http://localhost:3000/approve

## Start / stop

```bash
cd phase1-ai-lab/n8n
docker compose up -d
docker compose down
```

## Test (PowerShell)

```powershell
curl.exe -s http://localhost:5678/webhook/support-ticket `
  -H "Content-Type: application/json" `
  --data-binary "@ticket.json"
```

Or create the body file first:

```powershell
Set-Content ticket.json '{"customer":"sam@example.com","ticket":"Invoice PDF upload fails","ticketId":"demo-3"}'
curl.exe -s http://localhost:5678/webhook/support-ticket -H "Content-Type: application/json" --data-binary "@ticket.json"
```

Then open http://localhost:3000/approve → **Approve → outbox**.

## If webhook 404 again

Workflow must be **Active**. Open http://localhost:5678 → login → open Support ticket workflow → toggle **Active** ON.
