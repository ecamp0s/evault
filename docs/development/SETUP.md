SETUP — Entorno local de eVault

Todo lo necesario para levantar el proyecto en una máquina. Se extrajo de
SPRINT_CONTEXT.md al cerrar la Iteración 1, cuando aquel documento creció
demasiado para lo que debe ser: un bridge entre sesiones que se lee de corrido.

Nota de formato: prosa plana sin Markdown, siguiendo la convención del proyecto
para documentos dirigidos a Claude Code.

RUTAS Y REPOSITORIO

Raíz del monorepo: /home/ecampos/Workspace/evault
Repositorio: ecamp0s/evault (GitHub, público desde el 3 de agosto de 2026). Se llamó evault-claude hasta esa fecha; GitHub redirige el nombre antiguo, pero ese redirect se pierde si alguna vez se crea otro repositorio con ese nombre, así que no conviene apoyarse en él.
Rama principal: master

Estructura:
api/ es el proyecto Laravel, que aloja la API REST. No hay panel de administración y no está previsto: ADR-009 sección 4 lo sacó del alcance junto con lo demás que solo existía por el modelo SaaS.
web/ es la SPA React.
extension/ es la extensión de Chrome de la Iteración 18 (ADR-023). Compila el código de web/src/lib/vault en vez de copiarlo, y su instancia se fija al construirla con EVAULT_EXTENSION_ORIGINS; los comandos están en CLAUDE.md.
docs/ contiene planning, architecture, development y operations; su índice y sus reglas están en docs/README.md y docs/GUIDE.md.
mobile/ NO existe en el clon, aunque ADR-003 la reserve: git no versiona directorios vacíos, así que nunca llegó a un clon. Se creará cuando haya algo dentro.


STACK Y VERSIONES VERIFICADAS

Backend: PHP 8.4.26, Laravel 13.31.0, Composer 2.9.5. Base de datos MySQL 8, en un contenedor que la máquina ve en el 3309. Tests con Pest 5.0.2 sobre PHPUnit 13.2.6 y SQLite in-memory. Análisis estático con Larastan 3.11 sobre PHPStan 2, en nivel max.

Nota sobre Pest 5 y PHPUnit 13, porque es un punto donde es fácil equivocarse: el composer.json que genera el template laravel/laravel restringe phpunit a ^12.5, y eso hace parecer que Laravel 13 no soporta PHPUnit 13. Es falso. El require-dev de laravel/framework 13.23.0, la versión con que se comprobó, declara phpunit ^11.5.50 || ^12.5.8 || ^13.0.3, así que PHPUnit 13 está soportado oficialmente. El ^12.5 es solo un valor por defecto del template, no una limitación del framework. Ampliar el constraint a ^13.0.3 permite instalar Pest 5 sin forzar nada, sin ignore-platform-reqs y sin conflictos de resolución.

Consecuencia de subir a Pest 5: exige php ^8.4, así que el require php del composer.json se subió de ^8.3 a ^8.4. Eso además alinea el constraint con el runtime real y con el PHP del CI, que ya era 8.4.

Sobre @types/node y TypeScript la política de no adelantarse sigue vigente, pero no confundirla con este caso. Ahí hay un bloqueador concreto y verificable, typescript-eslint sin soporte para TS 7. Aquí no había ninguno.

Frontend: Node v24.19.0, React 19.3.0, Vite 8.3.0, Tailwind 4.3.3, TypeScript 6.0, shadcn CLI 4.21.0 sobre Base UI con preset Nova. Estado global con Zustand, HTTP con axios y TanStack Query, routing con React Router 8.

Importante sobre TypeScript: el proyecto permanece deliberadamente en TypeScript 6 y no debe subirse a 7. TypeScript 7.0 salió el 8 de julio de 2026 con el compilador reescrito en Go, pero la API programática estable no llega hasta 7.1, y typescript-eslint cerró la petición de soporte para 7.0 como no planificada. Subir a 7 rompe el linting. Reevaluar cuando salga 7.1 con soporte confirmado en typescript-eslint.

Importante sobre @types/node: debe permanecer en la línea 24 para coincidir con el runtime de Node instalado. No subir a 26 salvo que se actualice Node.

**Node 24 es requisito y desde el issue #255 se comprueba al instalar.** `web/package.json` lo declara en `engines`, y `web/.npmrc` activa `engine-strict` para que `npm ci` falle con `EBADENGINE` en vez de dejar pasar la instalación. Sin eso, un Node anterior instala sin protestar y el problema aparece mucho más tarde y disfrazado: con Node 20, `jsdom` 30 revienta con `webidl.util.markAsUncloneable is not a function` y la suite informa de **cero tests ejecutados**, sin mencionar Node por ninguna parte.

Si aparece `EBADENGINE`, la respuesta es actualizar Node, no tocar el `.npmrc`.


ARRANQUE CON DOCKER

Desde el issue 155 hay un compose.yaml en la raíz que levanta el proyecto entero con
un comando, sin instalar PHP, Composer, Node ni MySQL en la máquina:

    docker compose up --build

Deja la aplicación en http://app.evault.localhost y la API en
http://app.evault.localhost/api, en el mismo origen. La APP_KEY, los .env y las
migraciones se resuelven en el arranque, así que no hay ningún paso previo que
olvidar. La decisión y sus alternativas descartadas están en ADR-012, y la del
origen único en ADR-016.

Los valores configurables están en el .env.example de la raíz, que NO hace falta
copiar para arrancar: son los mismos que el compose aplica por defecto. El que se
cambia con más frecuencia es HTTP_PORT, y basta con reiniciar: desde ADR-016 la SPA
pide /api relativo y el build no lleva dentro ni host ni puerto. Hasta el issue 296
sí había que reconstruir, porque la URL de la API se horneaba en el bundle.

    HTTP_PORT=8090 docker compose up

UNA COSA QUE SE APRENDIÓ VERIFICÁNDOLO, porque falla de forma silenciosa y cuesta de
diagnosticar. Había otra, que el origen que comparaba CORS lleva puerto salvo el
estándar del esquema, y dejó de aplicar cuando ADR-016 retiró CORS.

Es que un bind mount conserva el UID del host, y que la salida fácil
--hacer chown a www-data de lo montado-- deja al dueño del clon sin permiso de
escritura en su propio directorio: ni git pull, ni borrar el clon, ni sincronizarlo,
sin sudo. Lo que hace el entrypoint es lo contrario, mover www-data al UID del host,
de modo que el contenedor se adapta a la máquina en vez de apropiarse de sus
ficheros.

EL ENTORNO DE DESARROLLO, que es el que se usa para trabajar

Desde el issue 703 se levanta también con Docker, como eDrive en la misma máquina, y
con un fichero distinto del de arriba: compose.yaml sirve un build estático detrás de
su propio Caddy, y compose.dev.yaml sirve Vite en modo desarrollo, con recarga en
caliente. Desde la raíz:

    docker compose -f compose.dev.yaml up -d

La SPA queda en http://localhost:5173 y la API detrás de ella, en /api del mismo
origen, como pide ADR-016. Son tres contenedores del proyecto evault-dev: db, que es
MySQL 8 publicado solo en 127.0.0.1:3309; api, la imagen de docker/api sirviendo con
php artisan serve y sin puerto publicado; y web, node:24 con Vite en el 5173, que
manda /api al contenedor api por DEV_API_PROXY. El código se monta desde el clon, así
que un cambio en api/ o en web/src se ve sin reiniciar nada.

Lo que se hace a menudo, siempre desde la raíz:

    docker compose -f compose.dev.yaml logs -f api web
    docker compose -f compose.dev.yaml exec -u www-data api php artisan migrate:fresh --seed
    docker compose -f compose.dev.yaml restart api
    docker compose -f compose.dev.yaml down

El restart hace falta después de tocar api/.env y nada más: artisan serve corre con
--no-reload para que PHP_CLI_SERVER_WORKERS tenga efecto, y el código PHP se lee en
cada petición. down -v borra además la base de datos, que aquí solo tiene datos de
prueba. Y los artisan con -u www-data, porque como root dejarían en storage/ ficheros
que desde la máquina no se pueden tocar.

EL NOMBRE DEL PROYECTO ES FIJO, al revés que en compose.yaml, y el motivo está escrito
en la cabecera de compose.dev.yaml: sin él los dos ficheros derivarían el mismo nombre
del directorio, evault, y un down -v de uno se llevaría los contenedores y los
volúmenes del otro.

Los tests NO pasan por Docker: la suite de la API usa SQLite en memoria y la de la web
jsdom, así que se ejecutan en la máquina con los comandos de CLAUDE.md, y para eso
hacen falta PHP 8.4 con Composer y Node 24. Los cuatro verificadores tampoco necesitan
nada más: apuntan por defecto a http://localhost:5173, que es este entorno.

POR QUÉ localhost:5173 Y NO app.evault.localhost, que es lo que hubo hasta el 703. Las
dos son contexto seguro, porque la especificación trata como de confianza localhost y
cualquier nombre que termine en .localhost, así que en las dos existen crypto.subtle,
navigator.clipboard y WebAuthn sobre http y sin certificado. El nombre sin puerto
necesitaba un Caddy instalado en la máquina, escuchando en el 8080 detrás del
portproxy de Windows que comparte otro proyecto, y con un bloque escrito a mano que no
estaba en el repositorio. Al reorganizar ~/Workspace el 27 de septiembre de 2026 ese
Caddy y ~/start-dev.sh ya no existían, y nada lo decía. El montaje entero sigue en el
historial de este fichero, y docker/web/Caddyfile hace lo mismo dentro del compose.

Lo que NO sirve es .test, aunque esté igual de reservado por la RFC 6761: no otorga
contexto seguro, y sin él no hay ni registro ni cifrado. Es lo que cerró el issue 91,
cuando el dominio era app.evault.claude y el fallo llegaba como un Uncaught (in
promise) sin mensaje.

UN PASSKEY ESTÁ ATADO AL NOMBRE DE HOST, así que los dados de alta en
app.evault.localhost no se ofrecen en localhost:5173. Son de datos de prueba y se
vuelven a dar de alta. Por lo mismo, la extensión construida sin
EVAULT_EXTENSION_ORIGINS apunta desde el 703 a http://localhost:5173.

Base de datos: nombre evault, usuario evault y contraseña evault, escritos en
compose.dev.yaml porque solo existen dentro de este entorno. Desde la máquina se
entra por 127.0.0.1:3309. Las variables del compose ganan a las de api/.env, así que
el mismo .env sigue valiendo para una API arrancada fuera de Docker.

EL LÍMITE DE ALTAS, QUE EN DESARROLLO HAY QUE SUBIR. La API admite diez altas por hora y por IP (issue 25), y ese es el valor de .env.example porque es el de producción: ADR-005 pide que un clon arranque con valores sensatos, y en una instancia pública diez altas por hora es lo que frena a quien crea cuentas en masa. En desarrollo estorba: los cuatro verificadores de scripts/ registran diecinueve cuentas entre los cuatro en una ejecución completa, todas desde la misma dirección. Por eso compose.dev.yaml lleva THROTTLE_REGISTER_ATTEMPTS=1000, y esa línea no estaba escrita en ningún sitio hasta el issue 667: el clon de este proyecto la tenía en su .env desde el 27 de agosto de 2026, y el cierre de la Iteración 17 hizo cuentas con el diez de los documentos. Solo se sube en una máquina de desarrollo, nunca en una instancia que alguien use. Para saber qué límite aplica la API que responde, sin adivinar: curl -s -D - -o /dev/null -X POST -H 'Accept: application/json' -d '{}' http://localhost:5173/api/auth/register | grep -i x-ratelimit, que gasta un intento. Los verificadores hacen esa misma pregunta antes de arrancar el navegador y se niegan a empezar si no les alcanza.



COPIA DE SEGURIDAD

php artisan evault:backup escribe una copia restaurable en storage/app/backups, o
donde diga --path. Conserva las siete últimas y borra las demás; --keep=0 desactiva
la rotación para quien la gestione por fuera.

Qué lleva dentro, porque conviene saberlo antes de decidir dónde guardarla. Las
cinco tablas con datos: users, vaults, vault_members, vault_items y passkeys. La de
miembros NO es opcional aunque parezca de relleno: ahí vive la clave de vault envuelta,
y sin ella la copia es un montón de ciphertext que ya nadie puede abrir, ni siquiera con
la contraseña maestra correcta. La de passkeys tampoco, y por lo mismo un envoltorio más
allá: sin ella, una instancia restaurada abre con la contraseña maestra y no con la
cara, y eso no se descubre hasta el día que alguien lo intenta. Se dejan fuera los
tokens de sesión, la caché y la cola, que son estado de ejecución y no datos.

EL FICHERO NO VA CIFRADO, y es una decisión y no un olvido. Lo que hay dentro son los
mismos blobs opacos que guarda el servidor, así que la copia se puede sacar de la
máquina sin ceremonia: es un dividendo directo del modelo zero-knowledge. Ahora bien,
sí lleva los hashes de autenticación de users y las claves de vault envueltas. Nada de
eso permite descifrar nada —ver ADR-008— pero tampoco es material que convenga
repartir alegremente, así que el fichero se escribe con permisos 600 y su carpeta con
700.

Programarla con cron, una vez al día de madrugada:

    0 3 * * * cd /ruta/a/evault/api && php artisan evault:backup >> storage/logs/backup.log 2>&1

Restaurar: php artisan evault:restore ruta/al/fichero.json. Se niega a escribir si la
base de datos ya tiene datos, porque restaurar encima sustituye lo que hubiera y no
hay deshacer; con --force lo hace igualmente. Es todo o nada: una restauración a
medias dejaría usuarios sin su clave envuelta, es decir, gente que no puede abrir su
propia vault.

Y lo más importante de todo esto: una copia que nadie ha restaurado nunca no es una
copia de seguridad, es un fichero. Conviene probar la restauración en una base de
datos aparte de vez en cuando, no el día que haga falta.


COMANDOS FRECUENTES

Los comandos del día a día, con sus rutas y advertencias, están en el CLAUDE.md
de la raíz del repositorio. No se duplican aquí para que no puedan divergir.
