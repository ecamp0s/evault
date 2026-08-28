#!/usr/bin/env bash
# Regenerates docs/planning/STATUS.md from GitHub.
#
# Needs gh authenticated and python3. Run it when an issue closes, or when the status,
# the priority or the dependencies of one of them change.
set -euo pipefail

if ! command -v gh >/dev/null 2>&1; then
  echo "error: falta gh (GitHub CLI)" >&2
  exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "error: gh no está autenticado — ejecutar 'gh auth login'" >&2
  exit 1
fi

exec python3 "$(dirname "$0")/status.py" "$@"
