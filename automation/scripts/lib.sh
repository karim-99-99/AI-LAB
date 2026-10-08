#!/usr/bin/env bash
# Shared helpers for Addendum A automation (macOS primary; Linux dry-run OK).
set -euo pipefail

AUTOMATION_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export AUTOMATION_ROOT

TASKS_FILE="${AUTOMATION_ROOT}/config/tasks.json"
PROMPTS_DIR="${AUTOMATION_ROOT}/prompts"
LOG_DIR="${AUTOMATION_ROOT}/logs/execution"
ARCHIVE_ROOT="${AUTOMATION_ROOT}/archive"
INBOX_DIR="${ARCHIVE_ROOT}/inbox"

mkdir -p "${LOG_DIR}" "${INBOX_DIR}"

is_macos() {
  [[ "$(uname -s)" == "Darwin" ]]
}

json_get() {
  # Usage: json_get <file> <python-expr-on-data>
  local file="$1"
  local expr="$2"
  python3 - "$file" "$expr" <<'PY'
import json, sys
path, expr = sys.argv[1], sys.argv[2]
with open(path, encoding="utf-8") as f:
    data = json.load(f)
print(eval(expr, {"data": data}))
PY
}

task_ids() {
  python3 - "$TASKS_FILE" <<'PY'
import json, sys
with open(sys.argv[1], encoding="utf-8") as f:
    data = json.load(f)
for t in data.get("tasks", []):
    print(t["id"])
PY
}

load_task_json() {
  local task_id="$1"
  python3 - "$TASKS_FILE" "$task_id" <<'PY'
import json, sys
with open(sys.argv[1], encoding="utf-8") as f:
    data = json.load(f)
tid = sys.argv[2]
for t in data["tasks"]:
    if t["id"] == tid:
        print(json.dumps({"config": data, "task": t}, ensure_ascii=False))
        raise SystemExit(0)
raise SystemExit(f"task not found: {tid}")
PY
}

utc_now_iso() {
  date -u +"%Y-%m-%dT%H:%M:%SZ"
}

stamp_local() {
  date +"%Y%m%d-%H%M%S"
}

log_event() {
  # log_event <task_id> <status> <message> [extra_json_object]
  # Note: do not use ${4:-{}} — bash ends the expansion at the first `}`.
  local task_id="$1"
  local status="$2"
  local message="$3"
  local extra="{}"
  if [[ $# -ge 4 ]]; then
    extra="$4"
  fi
  local logfile="${LOG_DIR}/$(date +%Y-%m).jsonl"
  python3 - "$logfile" "$task_id" "$status" "$message" "$extra" <<'PY'
import json, sys, datetime
path, task_id, status, message, extra = sys.argv[1:6]
try:
    extra_obj = json.loads(extra) if extra else {}
    if not isinstance(extra_obj, dict):
        extra_obj = {"extra": extra_obj}
except json.JSONDecodeError:
    extra_obj = {"extra_raw": extra}
row = {
    "ts": datetime.datetime.now(datetime.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
    "task_id": task_id,
    "status": status,
    "message": message,
    **extra_obj,
}
# Never allow secret-looking keys into logs
for banned in ("api_key", "authorization", "password", "passphrase", "token"):
    row.pop(banned, None)
with open(path, "a", encoding="utf-8") as f:
    f.write(json.dumps(row, ensure_ascii=False) + "\n")
print(json.dumps(row, ensure_ascii=False))
PY
}

redact_secrets() {
  # Strip common secret patterns from stdin → stdout
  sed -E \
    -e 's/(Bearer )[A-Za-z0-9._-]+/\1***REDACTED***/g' \
    -e 's/(api[_-]?key["[:space:]:=]+)[^[:space:]"]+/\1***REDACTED***/gi' \
    -e 's/(Authorization["[:space:]:=]+)[^[:space:]"]+/\1***REDACTED***/gi'
}
