#!/usr/bin/env bash
# Runs the web suite repeatedly while the machine is deliberately busy.
#
# WHY THIS EXISTS: this is the exit criterion for #259. The suite used to fail
# roughly one run in seven and nobody could name the test, because the runs that
# failed were the ones where the machine happened to be busy — and a green run on
# an idle workstation proves nothing about a 2-core CI runner.
#
# So the criterion is not "30 green runs". It is "30 green runs WHILE LOADED",
# and this is the command that produces them.
#
# The failure it guards against is subtle and worth naming: a timeout that is
# generous enough today can stop being generous when a test gets slower. Running
# under load is what turns that from a surprise in CI into a red run here.
#
# Usage:
#   scripts/suite-under-load.sh [runs]        # default 30
#
# Environment:
#   LOAD_FACTOR   spinner processes per core (default 2; 0 disables the load)

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUNS="${1:-30}"
LOAD_FACTOR="${LOAD_FACTOR:-2}"
CORES="$(nproc)"
SPINNERS=$(( CORES * LOAD_FACTOR ))
LOGS="$(mktemp -d)"
declare -a LOAD_PIDS=()

# The spinners MUST die with this script, including on Ctrl-C. Leaving a couple of
# busy loops behind would quietly slow down everything the user does next, and it
# would look like the machine's fault rather than ours.
cleanup() {
  if (( ${#LOAD_PIDS[@]} > 0 )); then
    kill "${LOAD_PIDS[@]}" 2>/dev/null
    wait "${LOAD_PIDS[@]}" 2>/dev/null
  fi
}
trap cleanup EXIT INT TERM

# Node 24 is required by web/package.json, and npm refuses to install without it
# since #255. Checking here turns a confusing failure deep inside jsdom into a
# sentence that says what to do.
node_major="$(node --version 2>/dev/null | sed 's/^v\([0-9]*\).*/\1/')"
if [[ -z "$node_major" || "$node_major" -lt 24 ]]; then
  echo "error: se necesita Node 24 o superior, y hay ${node_major:-ninguno}." >&2
  echo "       Con nvm: nvm use 24" >&2
  exit 1
fi

echo "Suite bajo carga: $RUNS pasadas, $SPINNERS procesos de carga sobre $CORES núcleos."
echo "Logs completos en $LOGS"
echo

for (( i = 0; i < SPINNERS; i++ )); do
  ( while :; do :; done ) &
  LOAD_PIDS+=("$!")
done

# Let the load actually land before measuring anything. Without this the first
# runs are effectively unloaded and the result is optimistic.
sleep 5

green=0
red=0
declare -a failed_runs=()

for (( run = 1; run <= RUNS; run++ )); do
  log="$LOGS/run-$(printf '%02d' "$run").log"

  # The ENTIRE output is kept, never filtered. Filtering it is what left #259
  # unidentified for a whole iteration: the summary line was kept and the name of
  # the failing test — the only thing that was needed — was thrown away.
  ( cd "$ROOT/web" && npm run test:run ) > "$log" 2>&1
  status=$?

  if (( status == 0 )); then
    green=$(( green + 1 ))
    printf '  %2d/%d  verde\n' "$run" "$RUNS"
  else
    red=$(( red + 1 ))
    failed_runs+=("$run")
    printf '  %2d/%d  ROJO   %s\n' "$run" "$RUNS" "$log"
  fi
done

cleanup
LOAD_PIDS=()

echo
echo "Resultado: $green verdes, $red rojas de $RUNS."

if (( red > 0 )); then
  echo
  echo "Tests que fallaron, con su fichero:"
  grep -h "^ FAIL " "$LOGS"/run-*.log | sed 's/^ FAIL  /  /' | sort | uniq -c | sort -rn
  echo
  echo "Salida completa de cada pasada roja en $LOGS"
  exit 1
fi

rm -rf "$LOGS"
echo "Criterio cumplido: $RUNS pasadas seguidas en verde con la máquina cargada."
