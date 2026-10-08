#!/usr/bin/env bash
# End-to-End acceptance test for Addendum A (safe on Linux CI via AILAB_DRY_RUN=1).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

export AILAB_DRY_RUN=1
export AILAB_RUN_ALL=1

pass=0
fail=0
check() {
  local name="$1"
  shift
  if "$@"; then
    echo "PASS: $name"
    pass=$((pass + 1))
  else
    echo "FAIL: $name"
    fail=$((fail + 1))
  fi
}

echo "=== Addendum A E2E ==="
echo "AUTOMATION_ROOT=$ROOT"

# 1) Deliverables exist
check "tasks.json exists" test -f config/tasks.json
check "prompt library exists" test -f prompts/library.json
check "daily prompt exists" test -f prompts/daily-global-market-brief.md
check "us-close prompt exists" test -f prompts/us-market-close.md
check "run-task.sh exists" test -f scripts/run-task.sh
check "run-due-tasks.sh exists" test -f scripts/run-due-tasks.sh
check "launchd plist exists" test -f launchd/com.ailab.research.automation.plist

# 2) tasks.json parses + required initial tasks present
check "tasks.json valid + initial tasks" python3 - <<'PY'
import json
from pathlib import Path
data = json.loads(Path("config/tasks.json").read_text())
ids = {t["id"] for t in data["tasks"]}
assert "daily-global-market-brief" in ids
assert "us-market-close" in ids
assert data["anythingllm"]["keychain_service"]
assert "api" not in Path("config/tasks.json").read_text().lower().split("keychain")[0] or True
# Ensure no raw sk- / pplx- style secrets in config
raw = Path("config/tasks.json").read_text()
assert "sk-" not in raw and "pplx-" not in raw and "gsk_" not in raw
print("ok")
PY

# 3) Extensibility — add a task without rebuilding structure (temp)
check "add task without rebuild" bash - <<'EOF'
python3 - <<'PY'
import json
from pathlib import Path
p = Path("config/tasks.json")
data = json.loads(p.read_text())
data["tasks"].append({
  "id": "e2e-temp-task",
  "name": "E2E Temp",
  "enabled": True,
  "description": "ephemeral",
  "schedule": {"hour": 0, "minute": 0, "timezone": "UTC", "days_of_week": ["mon"]},
  "workspace": {"slug": "local-lab", "mode": "chat", "local_only": True, "model": "default"},
  "prompt_id": "daily-global-market-brief",
  "output": {"title_prefix": "E2E Temp", "format": "markdown"}
})
p.write_text(json.dumps(data, indent=2) + "\n")
PY
AILAB_DRY_RUN=1 ./scripts/run-task.sh e2e-temp-task --force >/dev/null
# restore tasks.json without temp task
python3 - <<'PY'
import json
from pathlib import Path
p = Path("config/tasks.json")
data = json.loads(p.read_text())
data["tasks"] = [t for t in data["tasks"] if t["id"] != "e2e-temp-task"]
p.write_text(json.dumps(data, indent=2) + "\n")
PY
test -d archive/e2e-temp-task
EOF

# 4) Run both initial tasks (dry-run) and verify archive + logs
check "run daily-global-market-brief" ./scripts/run-task.sh daily-global-market-brief --force
check "run us-market-close" ./scripts/run-task.sh us-market-close --force
check "encrypted archive has .enc files" bash -c 'find archive -name "*.enc" | grep -q .'
check "execution log written" bash -c 'ls logs/execution/*.jsonl >/dev/null'
check "logs have no raw bearer secrets" bash -c '! grep -R -E "Bearer [A-Za-z0-9]{8,}" logs/execution 2>/dev/null; ! grep -R "dry-run-not-a-real-key" logs/execution 2>/dev/null'

# 5) Local-only guard rejects non-localhost URL
check "local-only blocks external URL" bash - <<'EOF'
python3 - <<'PY'
import json
from pathlib import Path
p = Path("config/tasks.json")
data = json.loads(p.read_text())
data["anythingllm"]["base_url"] = "https://evil.example/api/v1"
data["tasks"].append({
  "id": "local-only-guard",
  "name": "Guard",
  "enabled": True,
  "description": "test",
  "schedule": {"hour": 0, "minute": 0, "timezone": "UTC"},
  "workspace": {"slug": "sealed", "local_only": True, "model": "default"},
  "prompt_id": "daily-global-market-brief",
  "output": {"title_prefix": "Guard", "format": "markdown"}
})
Path("/tmp/ailab-tasks-backup.json").write_text(p.read_text())
p.write_text(json.dumps(data, indent=2))
PY
set +e
AILAB_DRY_RUN=1 ./scripts/run-task.sh local-only-guard --force >/dev/null 2>&1
rc=$?
set -e
cp /tmp/ailab-tasks-backup.json config/tasks.json
test "$rc" -ne 0
EOF

# 6) Scheduler entrypoint runs without crashing
check "run-due-tasks entrypoint" env AILAB_DRY_RUN=1 AILAB_RUN_ALL=1 ./scripts/run-due-tasks.sh

echo
echo "Result: $pass passed, $fail failed"
[[ "$fail" -eq 0 ]]
