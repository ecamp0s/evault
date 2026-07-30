#!/usr/bin/env bash
# Regenera docs/planning/STATUS.md desde GitHub.
#
# Requiere gh autenticado y python3. Ejecutar al cerrar cada issue, o cuando
# cambie el estado, la prioridad o las dependencias de alguno.
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
