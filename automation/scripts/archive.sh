#!/usr/bin/env bash
# Encrypt a report into the Encrypted Research Archive.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "${SCRIPT_DIR}/lib.sh"

usage() {
  echo "Usage: archive.sh <task_id> <plaintext_report_path>"
  exit 2
}

task_id="${1:-}"
src="${2:-}"
[[ -n "$task_id" && -n "$src" && -f "$src" ]] || usage

stamp="$(stamp_local)"
day="$(date +%Y-%m-%d)"
dest_dir="${ARCHIVE_ROOT}/${task_id}/${day}"
mkdir -p "$dest_dir"

base="$(basename "$src")"
plain_copy="${dest_dir}/${stamp}-${base}"
enc_path="${plain_copy}.enc"

# Keep an inbox copy for operator review before/while encrypting
inbox_copy="${INBOX_DIR}/${stamp}-${task_id}-${base}"
cp "$src" "$inbox_copy"
cp "$src" "$plain_copy"

service="$(json_get "$TASKS_FILE" 'data["archive"]["keychain_service"]')"
account="$(json_get "$TASKS_FILE" 'data["archive"]["keychain_account"]')"

if [[ "${AILAB_DRY_RUN:-0}" == "1" ]]; then
  # Simulate encryption without requiring OpenSSL passphrase / Keychain
  printf 'DRY_RUN_ENCRYPTED_BLOB\n' > "$enc_path"
  # Remove plaintext from archive root in dry-run to mimic secure store
  rm -f "$plain_copy"
  echo "$enc_path"
  exit 0
fi

passphrase="$("${SCRIPT_DIR}/keychain.sh" get "$service" "$account")"

openssl enc -aes-256-cbc -pbkdf2 -salt \
  -in "$plain_copy" \
  -out "$enc_path" \
  -pass "pass:${passphrase}"

# Wipe plaintext from archive tree (inbox copy remains until operator clears it)
rm -f "$plain_copy"
unset passphrase

echo "$enc_path"
