#!/usr/bin/env bash
# The backup that leaves the machine, encrypted. See ADR-013 and issue #225.
#
# It does three things in order and stops at the first one that fails: it asks the
# application for the copy, encrypts it with a PUBLIC key, and uploads the result to the
# remote destination.
#
# WHY ASYMMETRIC ENCRYPTION, which is the decision of ADR-013 §2.4 and not an
# implementation detail: the machine carries the public key, so it can ENCRYPT but NOT
# DECRYPT. Whoever compromises the server gets neither the earlier copies nor the ones
# already at the remote destination — all they can do is keep producing copies they
# cannot read. With a symmetric key the secret would have to be here in order to
# encrypt, and with it everything would open.
#
# It is the same idea that keeps eVault's server from reading the vault, applied to its
# backups.
#
# The trade-off is accepted in ADR-013 §5.2 and is worth keeping in mind: IF THE PRIVATE
# KEY IS LOST, THE BACKUPS ARE RUBBISH. It lives outside this machine, where the vault's
# recovery key lives, and it is checked by restoring every now and then and not on the
# day it is needed.
#
# Usage:
#   scripts/offsite-backup.sh
#
# Configuration, by environment variables or by the clone's .env:
#   EVAULT_BACKUP_RECIPIENT   age public key it is encrypted to        (required)
#   EVAULT_BACKUP_REMOTE      rclone destination, e.g. "nube:evault"   (required)
#   EVAULT_BACKUP_KEEP_REMOTE how many copies to keep at the destination (default 30)

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE=(docker compose -f "$ROOT/compose.yaml" -f "$ROOT/compose.deploy.yaml")
BACKUPS="$ROOT/api/storage/app/backups"

# Everything that fails goes out on stderr AND with a non-zero code. It is what makes
# cron send an email and gives the notice at the end something to detect: a backup that
# fails in silence is worse than having none, because it gives the peace of mind without
# giving the copy.
fail() {
  echo "error: $*" >&2
  exit 1
}

# THE LOG HAS TO SURVIVE A REBOOT — #264.
#
# The crontab used to send this straight to /tmp, and ADR-013 decides that this
# machine gets powered off on purpose. /tmp does not survive that, so the record of
# whether the backup ran disappeared every boot: the log was found holding a single
# line, for that morning, with nothing before it.
#
# The question a backup has to be able to answer is "when was the last good copy?",
# and on that machine it had no way of being answered.
#
# WHY THE SCRIPT OWNS ITS LOG instead of leaving it to the crontab line: because
# then the answer depends on whoever copied that line out of the deployment guide
# getting it right, and one machine already got it wrong. Owning it also means the
# rotation ships with it rather than needing logrotate configured separately.
#
# WHY NOT journald, which was the alternative considered: it only persists across
# boots when /var/log/journal exists, which is machine configuration this script
# cannot see and would silently not have. Trading a /tmp that is reliably wiped for
# a journal that might be is not an improvement.
LOG="${EVAULT_BACKUP_LOG:-$ROOT/api/storage/logs/offsite-backup.log}"
LOG_MAX_BYTES="${EVAULT_BACKUP_LOG_MAX_BYTES:-1048576}"

mkdir -p "$(dirname "$LOG")" 2>/dev/null || true

# One line a day reaches a megabyte somewhere around the year 4000, so this is not
# about disk. It is about the file staying readable if something ever starts looping.
if [[ -f "$LOG" && "$(wc -c < "$LOG")" -gt "$LOG_MAX_BYTES" ]]; then
  mv -f "$LOG" "$LOG.1"
fi

# tee and not a plain redirect: cron still needs the output on stdout to be able to
# mail it, and running this by hand still has to show what it is doing.
exec > >(tee -a "$LOG") 2>&1
LOG_WRITER=$!

# Closing the descriptors and waiting is what stops the last lines being lost when
# the script exits before tee has flushed — including when it exits through fail().
flush_log() {
  exec 1>&- 2>&-
  wait "$LOG_WRITER" 2>/dev/null || true
}
trap flush_log EXIT

# The timestamp is for whoever reads this months later. It is NOT what the retention
# orders by, and that distinction cost #240: this machine's clock is not monotonic
# between boots, so a line written right after a reboot can claim to be from the
# past. The sequence number in the file name is the part that can be trusted.
echo "=== $(date '+%Y-%m-%d %H:%M:%S %z') ==="

# How long it had been without a copy, before this run fixes it. Reported and never
# fatal: `|| true` is load-bearing. The moment there has been no backup for days is
# precisely the moment the backup must not be blocked. See #265.
"$ROOT/scripts/check-backup-freshness.sh" || true

# The clone's .env, so as not to repeat the configuration in the crontab.
#
# THE ENVIRONMENT WINS OVER THE FILE, and it is read variable by variable instead of
# with `source` precisely for that: `set -a && source .env` OVERWRITES whatever comes
# from the environment, which is the opposite of what everything else does —docker
# compose, Laravel— and of what anybody expects.
#
# It is not theoretical: the first version of this used `source`, and when trying the
# script against a broken destination —`EVAULT_BACKUP_REMOTE=noexiste: ./offsite-backup.sh`—
# the file overwrote the variable and the copy went up to the good destination quite
# happily. The test seemed to say the script did not detect the failure, when what was
# happening is that the failure never occurred.
#
# Only this script's variables are read: the rest of the .env belongs to docker compose
# and has no business here.
if [[ -f "$ROOT/.env" ]]; then
  while IFS='=' read -r key value; do
    [[ -n "${!key:-}" ]] && continue
    export "$key=$value"
  done < <(grep -E '^EVAULT_BACKUP_[A-Z_]+=' "$ROOT/.env" || true)
fi

RECIPIENT="${EVAULT_BACKUP_RECIPIENT:-}"
REMOTE="${EVAULT_BACKUP_REMOTE:-}"
KEEP_REMOTE="${EVAULT_BACKUP_KEEP_REMOTE:-30}"

[[ -n "$RECIPIENT" ]] || fail "falta EVAULT_BACKUP_RECIPIENT (la clave pública de age)"

# THIS CHECK COMES BEFORE ANY OTHER, and the order is not cosmetic: it is the only
# guarantee asymmetric encryption buys. If the PRIVATE key ended up here —through a
# crooked copy and paste— the machine could decrypt its own backups and the whole
# argument of ADR-013 §2.4 falls apart, without anything failing.
#
# An age public key starts with `age1`; the private one, with `AGE-SECRET-KEY-`.
if [[ "$RECIPIENT" == AGE-SECRET-KEY-* ]]; then
  fail "EVAULT_BACKUP_RECIPIENT es una clave PRIVADA. Aquí va la pública, la que empieza por 'age1'"
fi

if [[ "$RECIPIENT" != age1* ]]; then
  fail "EVAULT_BACKUP_RECIPIENT no parece una clave pública de age (debe empezar por 'age1')"
fi

[[ -n "$REMOTE" ]] || fail "falta EVAULT_BACKUP_REMOTE (el destino de rclone)"
command -v age >/dev/null 2>&1 || fail "falta age. Instálalo con: sudo apt install age"
command -v rclone >/dev/null 2>&1 || fail "falta rclone. Instálalo con: sudo apt install rclone"

# 1) The copy. The -u www-data is not optional: without it the files come out owned by
#    root with 700 permissions and their owner cannot even list them, and therefore
#    cannot get them out either.
#
# THE OUTPUT IS KEPT, NOT DISCARDED, and that is the whole of #263. This line used
# to end in `>/dev/null`, which threw away the one thing that tells a good backup
# from a backup of nothing: the row count the command prints. Seven of the eight
# copies on the remote were 2.378 bytes and one was 210.855, and this script said
# exactly the same sentence about all eight.
#
# It is the same mistake that left #259 unidentified for a whole iteration: the
# information needed was produced and filtered out.
if ! backup_output="$("${COMPOSE[@]}" exec -T -u www-data api php artisan evault:backup 2>&1)"; then
  printf '%s\n' "$backup_output" >&2
  fail "el comando de copia falló"
fi

# The command refuses to write an empty or collapsed backup on its own, so reaching
# this point already means there was something to copy. This line is for the log,
# so that "was the copy from that night any good?" has an answer three weeks later.
rows="$(printf '%s\n' "$backup_output" | grep -o 'Filas copiadas: .*' || true)"

# The one just written, by sequence number and not by date: a machine's clock is not
# monotonic between boots, and that is why the name carries that number. See #240.
latest="$(find "$BACKUPS" -maxdepth 1 -name 'evault-*.json' -printf '%f\n' 2>/dev/null | sort | tail -1)"
[[ -n "$latest" ]] || fail "no se encontró ninguna copia en $BACKUPS"

# 2) The encryption. Into a temporary file in the same folder, which already has
#    restrictive permissions, and not in /tmp, where the cleartext would stay readable.
encrypted="$BACKUPS/$latest.age"
age --encrypt --recipient "$RECIPIENT" --output "$encrypted" "$BACKUPS/$latest" \
  || fail "el cifrado falló"

# That the encrypted file is not the original in disguise. Cheap to check and expensive
# to find out late: age writes a header of its own, so if this is not there, nothing was
# encrypted.
head -c 21 "$encrypted" | grep -q 'age-encryption.org' \
  || fail "el fichero cifrado no tiene la cabecera de age"

# 3) The upload.
rclone copy "$encrypted" "$REMOTE" || fail "la subida a $REMOTE falló"

# And check that it arrived, instead of taking rclone not complaining as good enough.
rclone lsf "$REMOTE/$(basename "$encrypted")" >/dev/null 2>&1 \
  || fail "la copia no está en $REMOTE después de subirla"

rm -f "$encrypted"

# 4) The retention at the remote destination. The local one is done by the command
#    itself with --keep; this is another, because over there nothing deletes anything.
if [[ "$KEEP_REMOTE" -gt 0 ]]; then
  mapfile -t remote_files < <(rclone lsf "$REMOTE" --include 'evault-*.json.age' | sort)
  extra=$(( ${#remote_files[@]} - KEEP_REMOTE ))

  for (( i = 0; i < extra; i++ )); do
    rclone deletefile "$REMOTE/${remote_files[$i]}" \
      || echo "aviso: no se pudo borrar ${remote_files[$i]} del destino remoto" >&2
  done
fi

echo "copia $latest cifrada y subida a $REMOTE${rows:+ — $rows}"
