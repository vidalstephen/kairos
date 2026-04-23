#!/usr/bin/env bash
# rotate-creds.sh — operator helper for credential rotation
# See docs/operations/credential-rotation.md
set -euo pipefail

ALIAS="${1:-}"
if [ -z "$ALIAS" ]; then
  echo "usage: rotate-creds.sh <alias>"
  echo "Phase 0: placeholder; full implementation ships with vault service."
  exit 1
fi

echo "Rotating alias: $ALIAS"
echo "Not implemented in Phase 0."
exit 2
