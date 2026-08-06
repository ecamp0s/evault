#!/bin/sh
# Arranque de la API dentro del contenedor. Ver ADR-012 y el issue #155.
#
# El objetivo del issue es que `docker compose up` deje la aplicación usable desde
# un clon limpio, así que todo lo que en la instalación manual son pasos previos
# --composer install, .env, APP_KEY, migraciones-- ocurre aquí.
set -e

cd /var/www/html

# 0a) Alinear el usuario de PHP-FPM con el dueño del código montado.
#
# El código llega por bind mount desde el clon, así que dentro del contenedor
# conserva el UID del host. PHP-FPM necesita escribir en storage/ y en
# bootstrap/cache, y hay dos formas de conseguirlo:
#
#   - `chown -R www-data` sobre lo montado. Funciona, y deja al dueño del clon sin
#     permiso de escritura en su propio directorio: no puede hacer `git pull`, ni
#     borrar el clon, ni sincronizarlo, sin `sudo`. Se probó, y es exactamente lo
#     que pasó al verificar #155.
#   - Mover www-data al UID del host, que es esto. El contenedor se adapta a la
#     máquina en vez de apropiarse de sus ficheros.
#
# Se hace antes de escribir nada, porque cambiar el UID después dejaría atrás los
# ficheros creados con el anterior.
uid_host=$(stat -c %u /var/www/html)
gid_host=$(stat -c %g /var/www/html)

if [ "$uid_host" != "0" ] && [ "$uid_host" != "$(id -u www-data)" ]; then
    echo "[entrypoint] alineando www-data con el usuario del host ($uid_host:$gid_host)"
    groupmod -o -g "$gid_host" www-data
    usermod -o -u "$uid_host" -g "$gid_host" www-data
fi

# Y todo lo que escriba en el clon se ejecuta COMO ese usuario, no como root.
#
# Alinear el UID no basta por sí solo, y esto costó una segunda vuelta: este script
# corre como root, así que `composer install` creaba `vendor/` con UID 0 sobre el
# bind mount. El resultado es un clon que su propio dueño no puede borrar ni
# actualizar sin `sudo`, que es el mismo fallo que se acababa de corregir, una capa
# más abajo. Apareció al intentar limpiar el directorio de verificación de #155.
#
# HOME hace falta porque Composer avisa y cambia de comportamiento sin él.
como_host() {
    su www-data -s /bin/sh -c "HOME=/tmp $*"
}

# 0b) El origen desde el que la SPA va a llamar, que es lo que CORS compara.
#
# Se compone aquí y no en el compose porque hay una regla que hay que aplicar y
# compose no sabe condicionar: EL ORIGEN LLEVA PUERTO SALVO QUE SEA EL ESTÁNDAR
# DEL ESQUEMA. Un navegador que sirve la SPA en el puerto 80 manda
# `http://app.evault.localhost`, sin `:80`, y en cualquier otro puerto lo manda
# entero. Comparar mal es un preflight rechazado y un registro que falla con «no
# se ha podido contactar con el servidor», sin más pista.
#
# Costó descubrirlo al verificar el issue #155 con el puerto cambiado: con el 80
# por defecto funcionaba por casualidad.
if [ -z "$CORS_ALLOWED_ORIGINS" ]; then
    if [ "$HTTP_PORT" = "80" ] || [ -z "$HTTP_PORT" ]; then
        CORS_ALLOWED_ORIGINS="http://${APP_HOST}"
    else
        CORS_ALLOWED_ORIGINS="http://${APP_HOST}:${HTTP_PORT}"
    fi
    export CORS_ALLOWED_ORIGINS
fi
echo "[entrypoint] origen permitido: $CORS_ALLOWED_ORIGINS"

# 1) Dependencias. Se comprueba el autoload y no el directorio, porque un vendor/
# a medias de una instalación interrumpida existe pero no sirve.
if [ ! -f vendor/autoload.php ]; then
    echo "[entrypoint] instalando dependencias de Composer"
    como_host composer install --no-interaction --prefer-dist --no-progress
fi

# 2) El .env. Se conserva si ya existe: puede llevar ajustes de quien despliega, y
# pisarlos en cada arranque sería perder configuración sin avisar.
if [ ! -f .env ]; then
    echo "[entrypoint] creando .env a partir de .env.example"
    como_host cp .env.example .env
fi

# 3) APP_KEY. Sin ella Laravel no arranca, y es lo primero que olvida quien instala
# a mano. `key:generate` la escribe en el .env de arriba.
if ! grep -q '^APP_KEY=base64:' .env; then
    echo "[entrypoint] generando APP_KEY"
    como_host php artisan key:generate --force
fi

# 4) Esperar a MySQL. El contenedor de la base de datos acepta conexiones bastante
# después de que Docker lo dé por arrancado, así que sin esta espera las
# migraciones fallan una vez de cada dos. Se sondea con la propia conexión de
# Laravel para no depender de un cliente mysql dentro de esta imagen.
echo "[entrypoint] esperando a la base de datos"
intentos=0
until php -r '
    $dsn = sprintf("mysql:host=%s;port=%s", getenv("DB_HOST"), getenv("DB_PORT") ?: 3306);
    try { new PDO($dsn, getenv("DB_USERNAME"), getenv("DB_PASSWORD")); exit(0); }
    catch (Throwable $e) { exit(1); }
' 2>/dev/null; do
    intentos=$((intentos + 1))
    if [ "$intentos" -ge 60 ]; then
        echo "[entrypoint] la base de datos no respondió tras 60 intentos" >&2
        exit 1
    fi
    sleep 2
done

# 5) Migraciones. --force porque en un entorno no interactivo Laravel pregunta y
# nadie puede contestar.
echo "[entrypoint] migrando"
como_host php artisan migrate --force

# 6) Los permisos no se tocan: el paso 0a ya dejó a www-data con el UID del dueño
# del clon, así que PHP-FPM escribe en storage/ y bootstrap/cache sin que haya que
# cambiar de dueño nada de lo montado.

echo "[entrypoint] listo"
exec "$@"
