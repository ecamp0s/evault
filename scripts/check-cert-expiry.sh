#!/usr/bin/env bash
# Says out loud when a TLS certificate is about to expire.
#
# WHY THIS EXISTS — #287. Caddy renews the Tailscale certificate on its own: it asks
# the local tailscaled daemon during the handshake and never writes it to disk, which
# is exactly why ADR-016 §2.2 chose that over `tailscale cert` plus a cron job. So the
# expected number of times this script fires is zero.
#
# THAT IS THE POINT, AND IT IS NOT A CONTRADICTION. Automatic renewal is a claim about
# the future, and this project has paid twice for claims nobody could check until the
# day they mattered: #264, where the backup log lived in /tmp on a machine that gets
# switched off, and #265, where a night without a backup produced no visible effect at
# all. A certificate expires in 90 days on a machine ADR-013 deliberately powers down.
# If renewal ever fails, the vault stops opening — and without HTTPS there is no
# crypto.subtle, so it does not degrade, it refuses to start.
#
# What this buys is the difference between finding out three weeks early and finding
# out from a locked vault.
#
# WHY IT CHECKS THE SERVED CERTIFICATE and not a file: Caddy keeps its certificates in
# its own storage, and the Tailscale one never lands on disk at all. Asking the port
# is the only check that covers what a browser will actually be handed — and it also
# catches the case where the certificate is fine but Caddy is serving the wrong one.
#
# Usage:
#   scripts/check-cert-expiry.sh                 # every host in the deployment
#   scripts/check-cert-expiry.sh evault.local    # just one
#
# Environment:
#   EVAULT_CERT_MIN_FRACTION   complain under this fraction of total life (default 6, i.e. 1/6)
#
# Exit codes:
#   0  every certificate has more than the margin left
#   1  at least one is expiring, or could not be read

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# THE MARGIN IS A FRACTION OF THE CERTIFICATE'S OWN LIFE, not a number of days, and
# that is not over-engineering — a fixed threshold was tried first and was wrong.
#
# The two certificates served here have wildly different lifetimes: the Tailscale one
# from Let's Encrypt lasts 90 days, and the one Caddy's internal CA issues for the
# local name lasts TWELVE HOURS. Measured, not assumed: the first run of this script
# reported `evault.local: 0 days left`. A 21-day threshold therefore flagged a
# perfectly healthy certificate that Caddy rotates several times a day, so the check
# would have been born red — and #62 already taught this project what happens to a
# check that is born red: it gets ignored whole, and then it is not there on the day
# it matters.
#
# One sixth, because both issuers renew at one third of remaining life. Being under a
# sixth means the renewal window came and went without renewing, which is the only
# thing worth being told: 15 days on a 90-day certificate, 2 hours on a 12-hour one.
MIN_FRACTION="${EVAULT_CERT_MIN_FRACTION:-6}"

# Hosts come from the deployment's own .env, so this never carries a copy of a name
# that can drift from the one actually served. TAILSCALE_HOST is optional: a
# deployment without remote access simply has one host to check.
hosts=()
if [ $# -gt 0 ]; then
    hosts=("$@")
elif [ -f "$ROOT/.env" ]; then
    for var in APP_HOST TAILSCALE_HOST; do
        value="$(grep -E "^${var}=" "$ROOT/.env" | tail -1 | cut -d= -f2-)"
        [ -n "$value" ] && hosts+=("$value")
    done
fi

if [ ${#hosts[@]} -eq 0 ]; then
    echo "[cert] no hosts to check: pass one as an argument or set APP_HOST in .env" >&2
    exit 1
fi

problems=0

for host in "${hosts[@]}"; do
    # -servername matters and is not optional: with HTTPS the site is chosen by SNI,
    # not by any header, so omitting it asks for a certificate nobody serves and the
    # handshake fails. That failure looks exactly like a machine that is down, which
    # cost real time to diagnose while closing #286.
    end_date="$(echo | openssl s_client -connect "${host}:443" -servername "$host" 2>/dev/null \
        | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)"

    if [ -z "$end_date" ]; then
        echo "[cert] ✗ ${host}: could not read a certificate. Is it being served?" >&2
        problems=$((problems + 1))
        continue
    fi

    # Both dates in one handshake: asking twice can straddle a renewal and compare a
    # start date with the expiry of a different certificate.
    details="$(echo | openssl s_client -connect "${host}:443" -servername "$host" 2>/dev/null \
        | openssl x509 -noout -startdate -enddate -issuer 2>/dev/null)"
    start_date="$(echo "$details" | grep '^notBefore=' | cut -d= -f2-)"
    issuer="$(echo "$details" | grep '^issuer=' | sed 's/^issuer=//')"

    end_epoch="$(date -d "$end_date" +%s 2>/dev/null)"
    start_epoch="$(date -d "$start_date" +%s 2>/dev/null)"
    if [ -z "$end_epoch" ] || [ -z "$start_epoch" ]; then
        echo "[cert] ✗ ${host}: could not parse the certificate dates (${end_date})" >&2
        problems=$((problems + 1))
        continue
    fi

    now="$(date +%s)"
    total=$(( end_epoch - start_epoch ))
    left=$(( end_epoch - now ))
    threshold=$(( total / MIN_FRACTION ))

    # Hours rather than days: a 12-hour certificate reported as "0 days left" is what
    # made the first version of this check useless.
    left_h=$(( left / 3600 ))
    total_h=$(( total / 3600 ))

    if [ "$left" -lt "$threshold" ]; then
        echo "[cert] ✗ ${host}: ${left_h}h left of a ${total_h}h certificate (expires ${end_date})." >&2
        echo "[cert]   Renewal window came and went. Issuer: ${issuer}" >&2
        problems=$((problems + 1))
    else
        echo "[cert] ✓ ${host}: ${left_h}h left of ${total_h}h, issued by ${issuer}"
    fi
done

if [ "$problems" -gt 0 ]; then
    echo "[cert] ${problems} certificate(s) need attention" >&2
    exit 1
fi

exit 0
