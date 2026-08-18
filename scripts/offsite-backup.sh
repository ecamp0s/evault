#!/usr/bin/env bash
# Copia de seguridad que sale de la máquina, cifrada. Ver ADR-013 y el issue #225.
#
# Hace tres cosas en orden y se para en la primera que falle: pide la copia a la
# aplicación, la cifra con una clave PÚBLICA, y sube el resultado al destino remoto.
#
# POR QUÉ CIFRADO ASIMÉTRICO, que es la decisión de ADR-013 §2.4 y no un detalle de
# implementación: la máquina lleva la clave pública, así que puede CIFRAR pero NO
# DESCIFRAR. Quien comprometa el servidor no obtiene las copias anteriores ni las que
# ya están en el destino remoto — solo puede seguir produciendo copias que no puede
# leer. Con una clave simétrica haría falta el secreto aquí para poder cifrar, y con
# él se abriría todo.
#
# Es la misma idea que hace que el servidor de eVault no pueda leer la vault,
# aplicada a sus copias.
#
# La contrapartida está asumida en ADR-013 §5.2 y conviene tenerla presente: SI SE
# PIERDE LA CLAVE PRIVADA, LAS COPIAS SON BASURA. Vive fuera de esta máquina, donde
# la clave de recuperación de la vault, y se comprueba restaurando de vez en cuando y
# no el día que haga falta.
#
# Uso:
#   scripts/offsite-backup.sh
#
# Configuración, por variables de entorno o por el .env del clon:
#   EVAULT_BACKUP_RECIPIENT   clave pública de age a la que se cifra   (obligatoria)
#   EVAULT_BACKUP_REMOTE      destino de rclone, p. ej. "nube:evault"  (obligatoria)
#   EVAULT_BACKUP_KEEP_REMOTE cuántas copias conservar en el destino   (por defecto 30)

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE=(docker compose -f "$ROOT/compose.yaml" -f "$ROOT/compose.deploy.yaml")
BACKUPS="$ROOT/api/storage/app/backups"

# Todo lo que falle sale por stderr Y con código distinto de cero. Es lo que hace que
# cron mande un correo y que el aviso del final tenga algo que detectar: un backup que
# falla en silencio es peor que no tenerlo, porque da la tranquilidad sin dar la copia.
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

# El .env del clon, para no repetir la configuración en el crontab.
#
# EL ENTORNO GANA SOBRE EL FICHERO, y se lee variable a variable en vez de con
# `source` justamente por eso: `set -a && source .env` PISA lo que venga del entorno,
# que es al revés de lo que hace todo lo demás —docker compose, Laravel— y de lo que
# espera cualquiera.
#
# No es teórico: la primera versión de esto usaba `source`, y al intentar probar el
# script con un destino roto —`EVAULT_BACKUP_REMOTE=noexiste: ./offsite-backup.sh`—
# el fichero pisaba la variable y la copia se subía al destino bueno tan tranquila. La
# prueba parecía decir que el script no detectaba el fallo, cuando lo que pasaba es que
# el fallo no llegaba a producirse.
#
# Solo se leen las variables de este script: el resto del .env es de docker compose y
# no pinta nada aquí.
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

# ESTA COMPROBACIÓN VA ANTES QUE NINGUNA OTRA, y el orden no es estético: es la única
# garantía que compra el cifrado asimétrico. Si aquí acabara la clave PRIVADA —por un
# copiar y pegar torcido— la máquina podría descifrar sus propias copias y todo el
# argumento de ADR-013 §2.4 se cae, sin que nada fallara.
#
# Una clave pública de age empieza por `age1`; la privada, por `AGE-SECRET-KEY-`.
if [[ "$RECIPIENT" == AGE-SECRET-KEY-* ]]; then
  fail "EVAULT_BACKUP_RECIPIENT es una clave PRIVADA. Aquí va la pública, la que empieza por 'age1'"
fi

if [[ "$RECIPIENT" != age1* ]]; then
  fail "EVAULT_BACKUP_RECIPIENT no parece una clave pública de age (debe empezar por 'age1')"
fi

[[ -n "$REMOTE" ]] || fail "falta EVAULT_BACKUP_REMOTE (el destino de rclone)"
command -v age >/dev/null 2>&1 || fail "falta age. Instálalo con: sudo apt install age"
command -v rclone >/dev/null 2>&1 || fail "falta rclone. Instálalo con: sudo apt install rclone"

# 1) La copia. El -u www-data no es opcional: sin él los ficheros salen de root con
#    permisos 700 y su dueño no puede ni listarlos, y por tanto tampoco sacarlos.
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

# La recién escrita, por número de secuencia y no por fecha: el reloj de una máquina
# no es monótono entre arranques, y por eso el nombre lleva ese número. Ver #240.
latest="$(find "$BACKUPS" -maxdepth 1 -name 'evault-*.json' -printf '%f\n' 2>/dev/null | sort | tail -1)"
[[ -n "$latest" ]] || fail "no se encontró ninguna copia en $BACKUPS"

# 2) El cifrado. A un fichero temporal en la misma carpeta, que ya tiene permisos
#    restrictivos, y no en /tmp, donde el contenido en claro quedaría legible.
encrypted="$BACKUPS/$latest.age"
age --encrypt --recipient "$RECIPIENT" --output "$encrypted" "$BACKUPS/$latest" \
  || fail "el cifrado falló"

# Que el fichero cifrado no sea el original disfrazado. Barato de comprobar y caro de
# descubrir tarde: age escribe una cabecera propia, así que si esto no está, no se
# cifró nada.
head -c 21 "$encrypted" | grep -q 'age-encryption.org' \
  || fail "el fichero cifrado no tiene la cabecera de age"

# 3) La subida.
rclone copy "$encrypted" "$REMOTE" || fail "la subida a $REMOTE falló"

# Y comprobar que llegó, en vez de dar por bueno que rclone no protestara.
rclone lsf "$REMOTE/$(basename "$encrypted")" >/dev/null 2>&1 \
  || fail "la copia no está en $REMOTE después de subirla"

rm -f "$encrypted"

# 4) La retención del destino remoto. La local la hace el propio comando con --keep;
#    esta es otra, porque ahí no hay nada que borre nada.
if [[ "$KEEP_REMOTE" -gt 0 ]]; then
  mapfile -t remote_files < <(rclone lsf "$REMOTE" --include 'evault-*.json.age' | sort)
  extra=$(( ${#remote_files[@]} - KEEP_REMOTE ))

  for (( i = 0; i < extra; i++ )); do
    rclone deletefile "$REMOTE/${remote_files[$i]}" \
      || echo "aviso: no se pudo borrar ${remote_files[$i]} del destino remoto" >&2
  done
fi

echo "copia $latest cifrada y subida a $REMOTE${rows:+ — $rows}"
