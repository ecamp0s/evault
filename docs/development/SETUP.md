SETUP — Entorno local de eVault

Todo lo necesario para levantar el proyecto en una máquina. Se extrajo de
SPRINT_CONTEXT.md al cerrar la Iteración 1, cuando aquel documento creció
demasiado para lo que debe ser: un bridge entre sesiones que se lee de corrido.

Nota de formato: prosa plana sin Markdown, siguiendo la convención del proyecto
para documentos dirigidos a Claude Code.

RUTAS Y REPOSITORIO

Raíz del monorepo: /home/ecampos/Workspace/eVault/claude
Repositorio: ecamp0s/evault (GitHub, público desde el 3 de agosto de 2026, SSH). Se llamó evault-claude hasta esa fecha; GitHub redirige el nombre antiguo, pero ese redirect se pierde si alguna vez se crea otro repositorio con ese nombre, así que no conviene apoyarse en él.
Rama principal: master

Estructura:
api/ es el proyecto Laravel, que aloja la API REST. No hay panel de administración y no está previsto: ADR-009 sección 4 lo sacó del alcance junto con lo demás que solo existía por el modelo SaaS.
web/ es la SPA React.
docs/ contiene planning y architecture/decisions.
mobile/ y extension/ NO existen en el clon, aunque ADR-003 las reserve: git no versiona directorios vacíos, así que nunca llegaron a un clon. Se crearán cuando haya algo dentro.


STACK Y VERSIONES VERIFICADAS

Backend: PHP 8.4.18, Laravel 13.23.0, Composer 2.9.5. Base de datos MySQL 8 en puerto 3307. Tests con Pest 5.0.2 sobre PHPUnit 13.2.6 y SQLite in-memory. Análisis estático con Larastan 3.10 sobre PHPStan 2, en nivel max.

Nota sobre Pest 5 y PHPUnit 13, porque es un punto donde es fácil equivocarse: el composer.json que genera el template laravel/laravel restringe phpunit a ^12.5, y eso hace parecer que Laravel 13 no soporta PHPUnit 13. Es falso. El require-dev de laravel/framework 13.23.0 declara phpunit ^11.5.50 || ^12.5.8 || ^13.0.3, así que PHPUnit 13 está soportado oficialmente. El ^12.5 es solo un valor por defecto del template, no una limitación del framework. Ampliar el constraint a ^13.0.3 permite instalar Pest 5 sin forzar nada, sin ignore-platform-reqs y sin conflictos de resolución.

Consecuencia de subir a Pest 5: exige php ^8.4, así que el require php del composer.json se subió de ^8.3 a ^8.4. Eso además alinea el constraint con el runtime real y con el PHP del CI, que ya era 8.4.

Sobre @types/node y TypeScript la política de no adelantarse sigue vigente, pero no confundirla con este caso. Ahí hay un bloqueador concreto y verificable, typescript-eslint sin soporte para TS 7. Aquí no había ninguno.

Frontend: Node v24.19.0, React 19.2.8, Vite 8.1.5, Tailwind 4.3.3, TypeScript 6.x, shadcn CLI 4.16.0 sobre Base UI con preset Nova. Estado global con Zustand, HTTP con axios y TanStack Query, routing con React Router 7.

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
cambia con más frecuencia es HTTP_PORT, y tiene una consecuencia que conviene saber:
la URL de la API se hornea en el build de la SPA, así que cambiar el puerto obliga a
reconstruir y no solo a reiniciar.

    HTTP_PORT=8090 docker compose up --build

DOS COSAS QUE SE APRENDIERON VERIFICÁNDOLO, porque las dos fallan de forma silenciosa
y cuestan de diagnosticar.

La primera es que el origen que compara CORS lleva puerto salvo que sea el estándar
del esquema. Con el puerto 80 el navegador manda http://app.evault.localhost, sin
:80, y en cualquier otro puerto lo manda entero. Construir ese origen mal no rompe
nada visible: la SPA carga, y solo al registrarse aparece «no se ha podido contactar
con el servidor», que parece un problema de red. Por eso el origen lo compone el
entrypoint de la API y no el compose, que no sabe condicionar.

La segunda es que un bind mount conserva el UID del host, y que la salida fácil
--hacer chown a www-data de lo montado-- deja al dueño del clon sin permiso de
escritura en su propio directorio: ni git pull, ni borrar el clon, ni sincronizarlo,
sin sudo. Lo que hace el entrypoint es lo contrario, mover www-data al UID del host,
de modo que el contenedor se adapta a la máquina en vez de apropiarse de sus
ficheros.

EL ENTORNO LOCAL SIN DOCKER, que es el que se usa para desarrollar

Lo de abajo sigue vigente y es lo que conviene para trabajar en el día a día, porque
Vite en modo desarrollo da recarga en caliente y el compose sirve un build estático.

El sistema es WSL2 sobre Windows, con Caddy y PHP-FPM 8.4 por socket Unix. PHP 8.3 está instalado pero desactivado a propósito; ningún proyecto lo usa.

URLs de desarrollo:
app.evault.localhost sirve la SPA React, con Caddy haciendo reverse proxy a localhost:5173, y bajo /api la API Laravel por PHP-FPM.
admin.evault.localhost SE RETIRÓ en el issue 324, junto con api.evault.localhost. Existía esperando un panel Filament que ADR-009 sección 4 sacó del alcance, y mientras tanto servía la raíz del mismo proyecto Laravel que la API: nada de administración detrás.

OJO AL COMPROBAR QUE UN HOST ESTÁ RETIRADO, porque el 200 engaña: los dos siguen resolviendo —cualquier nombre acabado en .localhost resuelve a loopback— y siguen entrando en el bloque :8080 de Caddy, que responde 200 CON CERO BYTES cuando ningún handle casa. Es decir que retirado no significa «no responde», significa «no sirve nada». Lo que distingue los dos casos es el tamaño del cuerpo, no el código:

    curl -o /dev/null -w '%{http_code} %{size_download}\n' http://api.evault.localhost/api/health

api.evault.localhost SE RETIRÓ en el issue 296. Desde ADR-016 la API vive en /api del mismo origen que la SPA, de modo que un dist construido una vez sirve desde cualquier hostname y CORS desaparece. Si arrancas Vite suelto contra php artisan serve, sin Caddy delante, el proxy del propio servidor de desarrollo lo cubre y su destino se cambia con DEV_API_PROXY.

EL BLOQUE DE CADDY QUE HACE FALTA, escrito aquí porque ese fichero NO está en el repositorio y por tanto nadie puede reproducirlo leyendo el código. Va dentro del bloque :8080, junto a los matchers de los otros proyectos de la máquina:

    @app_evault host app.evault.localhost

    handle @app_evault {
        handle /api/* {
            root * /home/ecampos/Workspace/eVault/claude/api/public
            php_fastcgi unix//run/php/php8.4-fpm.sock
        }

        handle {
            reverse_proxy localhost:5173
        }
    }

La API va PRIMERO y con handle anidado, no con directivas sueltas: si el proxy al 5173 se tragara /api, la respuesta sería el index.html de Vite con un 200 y el cliente lo parsearía como JSON, fallando lejos de la causa. Y handle y no handle_path, porque las rutas de Laravel ya empiezan por /api y el prefijo tiene que llegarles intacto. Es el mismo orden y el mismo motivo que docker/web/Caddyfile, que sí está en el repositorio y sirve de referencia.

CÓMO SABER SI TU MÁQUINA LO TIENE, en un comando y con Vite APAGADO:

    curl -o /dev/null -w '%{http_code}\n' http://app.evault.localhost/api/health

200 significa que Caddy enruta /api a PHP-FPM. 502 significa que manda el host entero al 5173 y que ese bloque sigue sin actualizar. Con Vite levantado los dos casos responden igual, porque el proxy del servidor de desarrollo tapa la diferencia, y por eso el fallo puede vivir meses sin notarse: pasó entre el issue 296 y el 342.

Caddy tiene un único bloque en el puerto 8080 con matchers por host, porque Windows tiene un portproxy que envía el puerto 80 al 8080. Ese portproxy da servicio además a otro proyecto que convive en la misma máquina y que no debe romperse, así que cualquier cambio ahí se verifica comprobando que el otro sigue respondiendo.

Vite necesita app.evault.localhost declarado en server.allowedHosts dentro de vite.config.ts, o bloquea la petición que le llega desde Caddy.

POR QUÉ EL DOMINIO TERMINA EN .localhost, que es lo que hay que entender antes de cambiarlo por otra cosa. La especificación de contextos seguros considera de confianza cualquier host que sea localhost o termine en .localhost, y los navegadores lo implementan resolviéndolo además a loopback por su cuenta. Consecuencia práctica: en app.evault.localhost existen window.crypto.subtle y navigator.clipboard aunque se sirva por http y sin ningún certificado. Comprobado en el navegador antes de adoptarlo, no leído en una especificación.

Eso es lo que cerró el issue 91. Hasta la Iteración 3 el dominio era app.evault.claude, donde no había contexto seguro, así que no existía ni el registro, ni el login, ni el cifrado, y había que trabajar en localhost:5173 para cualquier cosa de criptografía. El fallo además no se explicaba: llegaba como Uncaught (in promise) sin mensaje, porque lo que reventaba era una propiedad de undefined dentro de una promesa.

De ahí que .test no sirva aquí aunque esté igual de reservado por la RFC 6761 y aunque sea lo que usa el otro proyecto de la misma máquina: .test no otorga contexto seguro y devolvería el proyecto al problema anterior.

Base de datos: nombre evault, usuario evault, puerto 3307. La contraseña no se escribe aquí porque el repositorio es público: la define quien monta el entorno y vive en DB_PASSWORD del .env, que no se versiona. Lo que manda es DB_DATABASE del .env. Se llamó evault_claude hasta el 3 de agosto de 2026, cuando se renombró junto con el dominio; los datos que había eran de prueba y se descartaron en vez de migrarse. Para entrar como administrador el comando que funciona es sudo mysql --socket=/var/run/mysqld/mysqld.sock -P 3307. La contraseña de root no está disponible.

Permisos: PHP-FPM corre como www-data, por lo que storage y bootstrap/cache dentro de api/ necesitan pertenecer al grupo www-data con permisos 775. Si aparece un error de tempnam o un 500 sin log, casi siempre es esto. El comando es sudo chown -R ecampos:www-data seguido de sudo chmod -R 775 sobre ambos directorios.

Arranque de sesión: el script ~/start-dev.sh levanta MySQL, PHP-FPM 8.4 y Caddy. Vite se arranca a mano con npm run dev desde web/.



COPIA DE SEGURIDAD

php artisan evault:backup escribe una copia restaurable en storage/app/backups, o
donde diga --path. Conserva las siete últimas y borra las demás; --keep=0 desactiva
la rotación para quien la gestione por fuera.

Qué lleva dentro, porque conviene saberlo antes de decidir dónde guardarla. Las
cuatro tablas con datos: users, vaults, vault_members y vault_items. La de miembros
NO es opcional aunque parezca de relleno: ahí vive la clave de vault envuelta, y sin
ella la copia es un montón de ciphertext que ya nadie puede abrir, ni siquiera con la
contraseña maestra correcta. Se dejan fuera los tokens de sesión, la caché y la cola,
que son estado de ejecución y no datos.

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
