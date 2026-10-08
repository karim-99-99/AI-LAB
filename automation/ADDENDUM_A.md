# ADDENDUM A — Automation & Research Agents

**Classification:** PRIVATE / CONFIDENTIAL  
**Version:** V1-LC  
**Environment:** macOS / Single User  
**Implementation Principle:** Local-First / Secure / Modular / AI-Agnostic / Future-Ready

---

## OBJECTIVE

تنفيذ طبقة Automation محلية لتشغيل مهام البحث تلقائيًا وفق جدول زمني، وإرسالها إلى Workspaces المعتمدة، ثم حفظ النتائج في Encrypted Research Archive.

Run a **local** automation layer that:

1. Executes research tasks on a schedule  
2. Sends each task to the configured AnythingLLM workspace (+ model)  
3. Saves results into an **Encrypted Research Archive**  
4. Never uses Cloud Scheduler or a custom backend  

---

## IMPLEMENTATION

| Requirement | Choice |
|-------------|--------|
| Scheduler | **macOS Launchd** + script |
| AI runtime | **AnythingLLM** local API |
| Optional orchestrator | **n8n Local** only (not required) |
| Task registry | `config/tasks.json` |
| Prompts | Central Prompt Library under `prompts/` |
| Extensibility | Add tasks via JSON + prompt file — **no rebuild** |
| Forbidden | Cloud Scheduler · dedicated backend · auto Email/Telegram/external share |

---

## INITIAL TASKS

| Task ID | Name | Schedule | Notes |
|---------|------|----------|-------|
| `daily-global-market-brief` | Daily Global Market Brief | Daily **08:00** local | Editable via config + prompt |
| `us-market-close` | U.S. Market Close | After U.S. market close (**16:05 America/New_York**) | Editable via config + prompt |

All tasks are editable through **Configuration** (`tasks.json`) and **Prompts**.

---

## SECURITY

- API keys live in **macOS Keychain only** (never in repo or env files committed to git).  
- All results go into the **Encrypted Research Archive**.  
- **Local-Only** workspaces must not make external network calls.  
- No automatic Email / Telegram / external sharing.

Keychain account names used by scripts:

| Secret | Keychain service | Account |
|--------|------------------|---------|
| AnythingLLM API key | `ailab.anythingllm` | `api-key` |
| Archive passphrase | `ailab.research-archive` | `passphrase` |

---

## OUTPUT & LOGGING

Every task run must:

1. Execute automatically (Launchd or manual CLI)  
2. Use the workspace + model defined in `tasks.json`  
3. Save the report dated by execution time  
4. Append an **Execution Log** entry  
5. Record errors when they occur  

Paths (relative to this package):

```text
automation/
├── config/tasks.json
├── prompts/                 # Central Prompt Library
├── scripts/run-task.sh      # single task
├── scripts/run-due-tasks.sh # scheduler entrypoint
├── launchd/*.plist
├── logs/execution/          # JSONL execution logs
└── archive/                 # encrypted report store
```

---

## ACCEPTANCE TEST

IT / owner confirms:

- [ ] Automation runs on schedule (or dry-run proves the same path)  
- [ ] Reports land in the Encrypted Research Archive  
- [ ] No credentials are exposed in files or logs  
- [ ] Local-Only workspaces do not send data externally  
- [ ] A new task can be added by editing `tasks.json` + adding a prompt — no structural rebuild  

Run:

```bash
./automation/tests/e2e-test.sh
```

---

## DELIVERABLES

| Deliverable | Location |
|-------------|----------|
| `tasks.json` | `automation/config/tasks.json` |
| Prompt Library | `automation/prompts/` |
| Automation Script | `automation/scripts/` |
| Launchd Job | `automation/launchd/` |
| Execution Logs | `automation/logs/execution/` |
| End-to-End Test | `automation/tests/e2e-test.sh` |
| Hardware inventory | `automation/PROJECT_HARDWARE.md` |

---

## END OF ADDENDUM A
