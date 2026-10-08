#!/usr/bin/env bash
# Launchd entrypoint: run every enabled task whose schedule matches "now".
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "${SCRIPT_DIR}/lib.sh"

# Optional: force all enabled tasks (used by e2e / manual sweep)
FORCE_ALL="${AILAB_RUN_ALL:-0}"

python3 - "$TASKS_FILE" "$FORCE_ALL" <<'PY' | while IFS= read -r task_id; do
import json, sys
from datetime import datetime
try:
    from zoneinfo import ZoneInfo
except ImportError:
    from backports.zoneinfo import ZoneInfo  # type: ignore

path, force_all = sys.argv[1], sys.argv[2] == "1"
with open(path, encoding="utf-8") as f:
    data = json.load(f)

dow_map = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]

for task in data.get("tasks", []):
    if not task.get("enabled", True) and not force_all:
        continue
    if force_all:
        print(task["id"])
        continue
    sched = task["schedule"]
    tz = ZoneInfo(sched.get("timezone") or data.get("timezone_default") or "UTC")
    now = datetime.now(tz)
    days = sched.get("days_of_week") or dow_map
    if dow_map[now.weekday()] not in days:
        continue
    if now.hour == int(sched["hour"]) and now.minute == int(sched["minute"]):
        print(task["id"])
PY
  "${SCRIPT_DIR}/run-task.sh" "$task_id" || true
done

# Always exit 0 so Launchd does not throttle on a single task failure;
# per-task errors are in execution logs.
exit 0
