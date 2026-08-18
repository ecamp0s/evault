#!/usr/bin/env bash
# Says out loud when there has been no backup for too long.
#
# WHY THIS EXISTS — #265. offsite-backup.sh fails loudly when it runs and something
# goes wrong. What nothing covered is the case where it never runs at all: the
# machine was off at 03:00, or cron is broken. In both cases absolutely nothing
# happens, and nothing is indistinguishable from success.
#
# THE DISTINCTION THIS SCRIPT MAKES, and it comes straight out of ADR-013: a machine
# that was switched off is not a failure. ADR-013 decides the intermittency is
# deliberate and not to be fought, and it says what actually matters is the gap
# between the last backup and the last change — not the time spent off. A vault
# nobody could reach is a vault nobody changed.
#
# So an old backup means two very different things depending on uptime:
#
#   machine up longer than the window  ->  cron is NOT running. Real failure.
#   machine just booted                ->  it was off. Worth saying, not worth alarming.
#
# Conflating them is how a warning becomes noise: one that fires every Monday after
# a weekend off is one that gets ignored, and then it is not there on the day it
# matters. That is the lesson from #62, applied to alerts instead of CI checks.
#
# Usage:
#   scripts/check-backup-freshness.sh
#
# Environment:
#   EVAULT_BACKUP_MAX_AGE_DAYS   window before complaining (default 3)
#   EVAULT_BACKUP_LOG            where to append (default api/storage/logs/offsite-backup.log)
#   EVAULT_BACKUP_DIR            where to look for copies (default api/storage/app/backups)

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# Overridable so this can be exercised against a scratch directory instead of the
# real copies. That is not a convenience: checking the warning on the actual machine
# used to mean back-dating real backups, and the first attempt at verifying it there
# was rigged instead — a zero-day window, which makes ANY uptime exceed it and sends
# every run down the "cron is broken" branch. The test agreed with the code for the
# wrong reason. See #265.
BACKUPS="${EVAULT_BACKUP_DIR:-$ROOT/api/storage/app/backups}"
MAX_AGE_DAYS="${EVAULT_BACKUP_MAX_AGE_DAYS:-3}"
# THE LOG FOLLOWS THE DIRECTORY, and that default is not a convenience either.
#
# Pointing EVAULT_BACKUP_DIR at a scratch directory means you are rehearsing, not
# backing up. If the log kept defaulting to the real one, every rehearsal would file
# invented warnings into the production record — and it did, twice, while verifying
# this on the machine. Someone reading that record a month later has no way to tell
# a drill from the real thing, which is exactly the property the record exists to
# have.
#
# Setting EVAULT_BACKUP_LOG explicitly still wins over both.
if [[ -n "${EVAULT_BACKUP_DIR:-}" ]]; then
  LOG="${EVAULT_BACKUP_LOG:-$BACKUPS/offsite-backup.log}"
else
  LOG="${EVAULT_BACKUP_LOG:-$ROOT/api/storage/logs/offsite-backup.log}"
fi

mkdir -p "$(dirname "$LOG")" 2>/dev/null || true

say() {
  echo "$*"
  echo "$(date '+%Y-%m-%d %H:%M:%S %z') $*" >> "$LOG" 2>/dev/null || true
}

# Three days at a daily cron is not bad luck: it is something broken. Short enough to
# catch a real failure while there is still a recent copy on the remote, long enough
# not to fire on an ordinary weekend.
seconds_window=$(( MAX_AGE_DAYS * 86400 ))
now=$(date +%s)

# A window of zero would make the script useless in a way that still looks like it
# is working: every uptime exceeds zero, so every stale copy would be reported as a
# broken cron and the distinction this script exists for would silently disappear.
if (( seconds_window <= 0 )); then
  echo "error: EVAULT_BACKUP_MAX_AGE_DAYS tiene que ser al menos 1, y es ${MAX_AGE_DAYS}." >&2
  echo "       Con una ventana de cero no se puede distinguir un cron roto de una máquina apagada." >&2
  exit 2
fi

latest=""
newest=0

for file in "$BACKUPS"/evault-*.json; do
  [[ -e "$file" ]] || continue
  stamp=$(stat -c %Y "$file" 2>/dev/null) || continue
  if (( stamp > newest )); then
    newest=$stamp
    latest="$(basename "$file")"
  fi
done

if [[ -z "$latest" ]]; then
  say "AVISO: no hay ninguna copia de seguridad en $BACKUPS."
  exit 1
fi

age=$(( now - newest ))

# A NEGATIVE AGE MEANS THE CLOCK IS LYING, NOT THAT THE BACKUP IS FROM THE FUTURE.
#
# This machine's RTC does not hold the date: systemd restores the time of the last
# shutdown at boot and NTP corrects it a moment later, so for the first seconds the
# machine believes it is in the past. That is #240, and running right after boot is
# exactly when this script is meant to run.
#
# Saying nothing here would be the worst outcome: a clock behind the last backup
# computes a tiny age and reports everything is fine.
if (( age < 0 )); then
  say "AVISO: el reloj va por detrás de la última copia ($latest), así que no se puede saber su antigüedad. Probablemente NTP aún no ha corregido la hora tras el arranque."
  exit 1
fi

age_days=$(( age / 86400 ))
age_hours=$(( (age % 86400) / 3600 ))

if (( age <= seconds_window )); then
  echo "La última copia es $latest, de hace ${age_days}d ${age_hours}h. Dentro de la ventana de ${MAX_AGE_DAYS} días."
  exit 0
fi

# /proc/uptime is the reliable way to ask how long this boot has lasted. Not the
# systemd timestamps: this machine's clock is not monotonic between boots, so those
# can claim the current boot started in 2019. That is #240.
#
# EVAULT_UPTIME_SECONDS exists so this branch can be exercised, and that is its only
# purpose. Without it the interesting case — an old backup on a machine that has been
# up for a week — cannot be reproduced on demand: you would have to leave a machine
# running for a week to find out whether the warning works. A check nobody can make
# fail is a check nobody knows is working, which is the mistake this whole iteration
# exists to stop repeating.
uptime_seconds="${EVAULT_UPTIME_SECONDS:-0}"

if [[ -z "${EVAULT_UPTIME_SECONDS:-}" && -r /proc/uptime ]]; then
  uptime_seconds=$(cut -d' ' -f1 /proc/uptime | cut -d'.' -f1)
fi

if (( uptime_seconds > seconds_window )); then
  say "AVISO: la última copia es $latest, de hace ${age_days}d ${age_hours}h, y la máquina lleva $(( uptime_seconds / 86400 ))d encendida. El cron no está produciendo copias."
  exit 1
fi

say "La última copia es $latest, de hace ${age_days}d ${age_hours}h. La máquina ha estado apagada, así que no es un fallo del cron; la copia de esta noche lo pondrá al día."
exit 0
