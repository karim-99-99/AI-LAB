# Automation — Addendum A (Local Research Agents)

Local-first scheduled research automation for macOS.

**Principle:** Local-First / Secure / Modular / AI-Agnostic / Future-Ready

| Doc | Purpose |
|-----|---------|
| [`ADDENDUM_A.md`](./ADDENDUM_A.md) | Full specification (AR/EN) |
| [`PROJECT_HARDWARE.md`](./PROJECT_HARDWARE.md) | Device inventory (MBP 16/14, iPhone, iPad) |

---

## Quick start (macOS)

```bash
# 1) Store secrets in Keychain (once)
./automation/scripts/keychain.sh set ailab.anythingllm api-key
./automation/scripts/keychain.sh set ailab.research-archive passphrase

# 2) Edit paths in the LaunchAgent plist, then install
cp automation/launchd/com.ailab.research.automation.plist ~/Library/LaunchAgents/
# replace REPLACE_WITH_REPO with your absolute clone path
launchctl load ~/Library/LaunchAgents/com.ailab.research.automation.plist

# 3) Manual run
./automation/scripts/run-task.sh daily-global-market-brief --force
```

### Dry-run / CI (no Keychain, no AnythingLLM)

```bash
AILAB_DRY_RUN=1 ./automation/tests/e2e-test.sh
```

---

## Add a new task (no rebuild)

1. Add a prompt under `prompts/my-task.md`  
2. Register it in `prompts/library.json`  
3. Append a task object to `config/tasks.json`  
4. Done — Launchd already polls `run-due-tasks.sh` every minute  

n8n Local is **optional** only; Launchd + script is the primary path.

---

## Security checklist

- [x] No API keys in `tasks.json`  
- [x] Keychain helper for AnythingLLM + archive passphrase  
- [x] Encrypted archive writer  
- [x] Local-only workspaces refuse non-localhost AnythingLLM URLs  
- [x] No Email / Telegram / auto-share in the runner  
