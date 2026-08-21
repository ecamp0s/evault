#!/bin/sh
# The API's start-up inside the container. See ADR-012 and issue #155.
#
# The issue's goal is that `docker compose up` leaves the application usable from a
# clean clone, so everything that in a manual installation is a previous step
# --composer install, .env, APP_KEY, migrations-- happens here.
set -e

cd /var/www/html

# 0a) Line PHP-FPM's user up with the owner of the mounted code.
#
# The code arrives by bind mount from the clone, so inside the container it keeps the
# host's UID. PHP-FPM needs to write into storage/ and bootstrap/cache, and there are
# two ways of getting that:
#
#   - `chown -R www-data` over what is mounted. It works, and it leaves the clone's
#     owner without write permission in their own directory: they cannot `git pull`,
#     nor delete the clone, nor sync it, without `sudo`. It was tried, and it is
#     exactly what happened while verifying #155.
#   - Moving www-data to the host's UID, which is this. The container adapts to the
#     machine instead of appropriating its files.
#
# It is done before writing anything, because changing the UID afterwards would leave
# behind the files created with the previous one.
uid_host=$(stat -c %u /var/www/html)
gid_host=$(stat -c %g /var/www/html)

if [ "$uid_host" != "0" ] && [ "$uid_host" != "$(id -u www-data)" ]; then
    echo "[entrypoint] alineando www-data con el usuario del host ($uid_host:$gid_host)"
    groupmod -o -g "$gid_host" www-data
    usermod -o -u "$uid_host" -g "$gid_host" www-data
fi

# And everything that writes into the clone runs AS that user, not as root.
#
# Lining the UID up is not enough on its own, and this took a second round: this
# script runs as root, so `composer install` created `vendor/` with UID 0 over the
# bind mount. The result is a clone its own owner cannot delete or update without
# `sudo`, which is the same failure that had just been corrected, one layer further
# down. It turned up while trying to clean up the verification directory of #155.
#
# HOME is needed because Composer warns and changes behaviour without it.
as_host() {
    su www-data -s /bin/sh -c "HOME=/tmp $*"
}

# 1) Dependencies. The autoload is checked and not the directory, because a half
# vendor/ from an interrupted installation exists but is no good.
if [ ! -f vendor/autoload.php ]; then
    echo "[entrypoint] instalando dependencias de Composer"
    as_host composer install --no-interaction --prefer-dist --no-progress
fi

# 2) The .env. It is kept if it already exists: it may carry the deployer's own
# settings, and overwriting them at every start-up would lose configuration without
# warning.
if [ ! -f .env ]; then
    echo "[entrypoint] creando .env a partir de .env.example"
    as_host cp .env.example .env
fi

# 3) APP_KEY. Without it Laravel does not start, and it is the first thing whoever
# installs by hand forgets. `key:generate` writes it into the .env above.
if ! grep -q '^APP_KEY=base64:' .env; then
    echo "[entrypoint] generando APP_KEY"
    as_host php artisan key:generate --force
fi

# 4) Wait for MySQL. The database container accepts connections a fair while after
# Docker considers it started, so without this wait the migrations fail one time out
# of two. It is probed with Laravel's own connection so as not to depend on a mysql
# client inside this image.
echo "[entrypoint] esperando a la base de datos"
attempts=0
until php -r '
    $dsn = sprintf("mysql:host=%s;port=%s", getenv("DB_HOST"), getenv("DB_PORT") ?: 3306);
    try { new PDO($dsn, getenv("DB_USERNAME"), getenv("DB_PASSWORD")); exit(0); }
    catch (Throwable $e) { exit(1); }
' 2>/dev/null; do
    attempts=$((attempts + 1))
    if [ "$attempts" -ge 60 ]; then
        echo "[entrypoint] la base de datos no respondió tras 60 intentos" >&2
        exit 1
    fi
    sleep 2
done

# 5) Migrations. --force because in a non-interactive environment Laravel asks and
# nobody can answer.
echo "[entrypoint] migrando"
as_host php artisan migrate --force

# 6) The permissions are not touched: step 0a already left www-data with the UID of
# the clone's owner, so PHP-FPM writes into storage/ and bootstrap/cache without
# anything mounted having to change owner.

echo "[entrypoint] listo"
exec "$@"
