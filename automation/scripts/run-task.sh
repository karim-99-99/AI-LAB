#!/usr/bin/env bash
# Execute one research task against AnythingLLM and archive the result.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "${SCRIPT_DIR}/lib.sh"

usage() {
  cat <<'EOF'
Usage: run-task.sh <task_id> [--force]

Env:
  AILAB_DRY_RUN=1   Skip live API / Keychain; write fixture report (CI / Linux)
  AILAB_FORCE=1     Same as --force (ignore enabled flag)
EOF
  exit 2
}

task_id="${1:-}"
[[ -n "$task_id" ]] || usage
shift || true
FORCE=0
for arg in "$@"; do
  case "$arg" in
    --force) FORCE=1 ;;
  esac
done
[[ "${AILAB_FORCE:-0}" == "1" ]] && FORCE=1

bundle="$(load_task_json "$task_id")"
enabled="$(python3 -c 'import json,sys; print(json.load(sys.stdin)["task"]["enabled"])' <<<"$bundle")"
if [[ "$enabled" != "True" && "$FORCE" != "1" ]]; then
  log_event "$task_id" "skipped" "task disabled in tasks.json"
  exit 0
fi

prompt_id="$(python3 -c 'import json,sys; print(json.load(sys.stdin)["task"]["prompt_id"])' <<<"$bundle")"
workspace_slug="$(python3 -c 'import json,sys; print(json.load(sys.stdin)["task"]["workspace"]["slug"])' <<<"$bundle")"
local_only="$(python3 -c 'import json,sys; print(json.load(sys.stdin)["task"]["workspace"]["local_only"])' <<<"$bundle")"
model="$(python3 -c 'import json,sys; print(json.load(sys.stdin)["task"]["workspace"].get("model","default"))' <<<"$bundle")"
title_prefix="$(python3 -c 'import json,sys; print(json.load(sys.stdin)["task"]["output"]["title_prefix"])' <<<"$bundle")"
base_url="$(python3 -c 'import json,sys; print(json.load(sys.stdin)["config"]["anythingllm"]["base_url"])' <<<"$bundle")"
kc_service="$(python3 -c 'import json,sys; print(json.load(sys.stdin)["config"]["anythingllm"]["keychain_service"])' <<<"$bundle")"
kc_account="$(python3 -c 'import json,sys; print(json.load(sys.stdin)["config"]["anythingllm"]["keychain_account"])' <<<"$bundle")"

prompt_file="${PROMPTS_DIR}/${prompt_id}.md"
if [[ ! -f "$prompt_file" ]]; then
  log_event "$task_id" "error" "prompt file missing" "{\"prompt_file\":\"${prompt_id}.md\"}"
  exit 1
fi

# Resolve prompt from library registry (modular — future prompts need library entry)
if ! python3 - "$PROMPTS_DIR/library.json" "$prompt_id" <<'PY'
import json, sys
lib = json.load(open(sys.argv[1], encoding="utf-8"))
pid = sys.argv[2]
ids = {p["id"] for p in lib.get("prompts", [])}
raise SystemExit(0 if pid in ids else 1)
PY
then
  log_event "$task_id" "error" "prompt_id not registered in library.json" "{\"prompt_id\":\"$prompt_id\"}"
  exit 1
fi

today="$(date +%Y-%m-%d)"
prompt_body="$(sed "s/{{DATE}}/${today}/g" "$prompt_file")"
tmp_report="$(mktemp "${TMPDIR:-/tmp}/ailab-report.XXXXXX.md")"
trap 'rm -f "$tmp_report"' EXIT

if [[ "$local_only" == "True" ]]; then
  local_only_json=true
else
  local_only_json=false
fi

start_extra="$(python3 -c 'import json,sys; print(json.dumps({"workspace":sys.argv[1],"model":sys.argv[2],"local_only":sys.argv[3]=="true"}))' "$workspace_slug" "$model" "$local_only_json")"
log_event "$task_id" "started" "running task" "$start_extra"

if [[ "$local_only" == "True" ]]; then
  # Guard: Local-Only workspaces must not egress. AnythingLLM must be bound to localhost.
  case "$base_url" in
    http://127.0.0.1:*|http://localhost:*|https://127.0.0.1:*|https://localhost:*)
      ;;
    *)
      log_event "$task_id" "error" "local_only workspace refused non-localhost AnythingLLM URL" \
        '{"base_url_host":"redacted-non-local"}'
      exit 1
      ;;
  esac
fi

if [[ "${AILAB_DRY_RUN:-0}" == "1" ]]; then
  cat > "$tmp_report" <<EOF
# ${title_prefix} — ${today}

> DRY_RUN fixture report (no live AnythingLLM call; no real credentials used).

## Workspace
- slug: \`${workspace_slug}\`
- model: \`${model}\`
- local_only: \`${local_only}\`

## Prompt (excerpt)
$(head -n 20 "$prompt_file")

## Body
Automated dry-run content for End-to-End Test acceptance.
EOF
else
  api_key="$("${SCRIPT_DIR}/keychain.sh" get "$kc_service" "$kc_account")"
  # AnythingLLM workspace chat endpoint (API-agnostic wrapper; adjust path if your build differs)
  response="$(
    curl -sS --fail-with-body \
      -X POST "${base_url}/workspace/${workspace_slug}/chat" \
      -H "Authorization: Bearer ${api_key}" \
      -H "Content-Type: application/json" \
      -d "$(python3 -c 'import json,sys; print(json.dumps({"message":sys.stdin.read(),"mode":"chat","model":sys.argv[1]}))' "$model" <<<"$prompt_body")" \
      | redact_secrets
  )" || {
    unset api_key
    log_event "$task_id" "error" "AnythingLLM request failed"
    exit 1
  }
  unset api_key

  text="$(python3 -c 'import json,sys
raw=sys.stdin.read()
try:
  d=json.loads(raw)
  print(d.get("textResponse") or d.get("response") or d.get("text") or raw)
except Exception:
  print(raw)
' <<<"$response")"

  {
    echo "# ${title_prefix} — ${today}"
    echo
    echo "$text"
  } > "$tmp_report"
fi

enc_path="$("${SCRIPT_DIR}/archive.sh" "$task_id" "$tmp_report")"
rel_archive="${enc_path#$AUTOMATION_ROOT/}"
success_extra="$(python3 -c 'import json,sys; print(json.dumps({"archive_path":sys.argv[1],"workspace":sys.argv[2]}))' "$rel_archive" "$workspace_slug")"
log_event "$task_id" "success" "report archived" "$success_extra"

echo "OK: $task_id → $enc_path"
