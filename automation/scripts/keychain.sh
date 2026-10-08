#!/usr/bin/env bash
# Read secrets from macOS Keychain. On non-macOS, supports DRY_RUN fixtures only.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "${SCRIPT_DIR}/lib.sh"

usage() {
  cat <<'EOF'
Usage:
  keychain.sh get <service> <account>
  keychain.sh set <service> <account>   # macOS only — prompts securely

Secrets are never printed when AILAB_QUIET=1 (scripts set this).
EOF
}

cmd="${1:-}"
service="${2:-}"
account="${3:-}"

if [[ -z "$cmd" || -z "$service" || -z "$account" ]]; then
  usage
  exit 2
fi

case "$cmd" in
  get)
    if [[ "${AILAB_DRY_RUN:-0}" == "1" ]]; then
      # Fixture for e2e / Linux CI — not a real credential
      echo "dry-run-not-a-real-key"
      exit 0
    fi
    if is_macos; then
      security find-generic-password -s "$service" -a "$account" -w 2>/dev/null
    else
      echo "keychain.sh: macOS Keychain required (or set AILAB_DRY_RUN=1)" >&2
      exit 1
    fi
    ;;
  set)
    if ! is_macos; then
      echo "keychain.sh set is only supported on macOS" >&2
      exit 1
    fi
    read -r -s -p "Enter secret for ${service}/${account}: " secret
    echo
    security add-generic-password -U -s "$service" -a "$account" -w "$secret"
    echo "Stored in Keychain: ${service} / ${account}"
    ;;
  *)
    usage
    exit 2
    ;;
esac
