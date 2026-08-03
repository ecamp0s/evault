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
api/ es el proyecto Laravel, que aloja tanto la API REST como el futuro panel Filament.
web/ es la SPA React.
docs/ contiene planning y architecture/decisions.
mobile/ y extension/ están creadas pero vacías, reservadas para más adelante.


STACK Y VERSIONES VERIFICADAS

Backend: PHP 8.4.18, Laravel 13.23.0, Composer 2.9.5. Base de datos MySQL 8 en puerto 3307. Tests con Pest 5.0.2 sobre PHPUnit 13.2.6 y SQLite in-memory. Análisis estático con Larastan 3.10 sobre PHPStan 2, en nivel max.

Nota sobre Pest 5 y PHPUnit 13, porque es un punto donde es fácil equivocarse: el composer.json que genera el template laravel/laravel restringe phpunit a ^12.5, y eso hace parecer que Laravel 13 no soporta PHPUnit 13. Es falso. El require-dev de laravel/framework 13.23.0 declara phpunit ^11.5.50 || ^12.5.8 || ^13.0.3, así que PHPUnit 13 está soportado oficialmente. El ^12.5 es solo un valor por defecto del template, no una limitación del framework. Ampliar el constraint a ^13.0.3 permite instalar Pest 5 sin forzar nada, sin ignore-platform-reqs y sin conflictos de resolución.

Consecuencia de subir a Pest 5: exige php ^8.4, así que el require php del composer.json se subió de ^8.3 a ^8.4. Eso además alinea el constraint con el runtime real y con el PHP del CI, que ya era 8.4.

Sobre @types/node y TypeScript la política de no adelantarse sigue vigente, pero no confundirla con este caso. Ahí hay un bloqueador concreto y verificable, typescript-eslint sin soporte para TS 7. Aquí no había ninguno.

Frontend: Node v24.14.0, React 19.2.8, Vite 8.1.5, Tailwind 4.3.3, TypeScript 6.x, shadcn CLI 4.16.0 sobre Base UI con preset Nova. Estado global con Zustand, HTTP con axios y TanStack Query, routing con React Router 7.

Importante sobre TypeScript: el proyecto permanece deliberadamente en TypeScript 6 y no debe subirse a 7. TypeScript 7.0 salió el 8 de julio de 2026 con el compilador reescrito en Go, pero la API programática estable no llega hasta 7.1, y typescript-eslint cerró la petición de soporte para 7.0 como no planificada. Subir a 7 rompe el linting. Reevaluar cuando salga 7.1 con soporte confirmado en typescript-eslint.

Importante sobre @types/node: debe permanecer en la línea 24 para coincidir con el runtime de Node instalado. No subir a 26 salvo que se actualice Node.


ENTORNO LOCAL

El sistema es WSL2 sobre Windows, con Caddy y PHP-FPM 8.4 por socket Unix. PHP 8.3 está instalado pero desactivado a propósito; ningún proyecto lo usa.

URLs de desarrollo:
app.evault.localhost sirve la SPA React, con Caddy haciendo reverse proxy a localhost:5173.
api.evault.localhost sirve la API Laravel.
admin.evault.localhost sirve el futuro panel Filament, apuntando al mismo proyecto Laravel.

Caddy tiene un único bloque en el puerto 8080 con matchers por host, porque Windows tiene un portproxy que envía el puerto 80 al 8080. Ese portproxy también sirve a ebudget.test, que convive en la misma máquina y no debe romperse.

Vite necesita app.evault.localhost declarado en server.allowedHosts dentro de vite.config.ts, o bloquea la petición que le llega desde Caddy.

POR QUÉ EL DOMINIO TERMINA EN .localhost, que es lo que hay que entender antes de cambiarlo por otra cosa. La especificación de contextos seguros considera de confianza cualquier host que sea localhost o termine en .localhost, y los navegadores lo implementan resolviéndolo además a loopback por su cuenta. Consecuencia práctica: en app.evault.localhost existen window.crypto.subtle y navigator.clipboard aunque se sirva por http y sin ningún certificado. Comprobado en el navegador antes de adoptarlo, no leído en una especificación.

Eso es lo que cerró el issue 91. Hasta la Iteración 3 el dominio era app.evault.claude, donde no había contexto seguro, así que no existía ni el registro, ni el login, ni el cifrado, y había que trabajar en localhost:5173 para cualquier cosa de criptografía. El fallo además no se explicaba: llegaba como Uncaught (in promise) sin mensaje, porque lo que reventaba era una propiedad de undefined dentro de una promesa.

De ahí que .test no sirva aquí aunque esté igual de reservado por la RFC 6761 y aunque sea lo que usa ebudget: .test no otorga contexto seguro y devolvería el proyecto al problema anterior.

Base de datos: nombre evault, usuario evault, puerto 3307. La contraseña no se escribe aquí porque el repositorio es público: la define quien monta el entorno y vive en DB_PASSWORD del .env, que no se versiona. Lo que manda es DB_DATABASE del .env. Se llamó evault_claude hasta el 3 de agosto de 2026, cuando se renombró junto con el dominio; los datos que había eran de prueba y se descartaron en vez de migrarse. Para entrar como administrador el comando que funciona es sudo mysql --socket=/var/run/mysqld/mysqld.sock -P 3307. La contraseña de root no está disponible.

Permisos: PHP-FPM corre como www-data, por lo que storage y bootstrap/cache dentro de api/ necesitan pertenecer al grupo www-data con permisos 775. Si aparece un error de tempnam o un 500 sin log, casi siempre es esto. El comando es sudo chown -R ecampos:www-data seguido de sudo chmod -R 775 sobre ambos directorios.

Arranque de sesión: el script ~/start-dev.sh levanta MySQL, PHP-FPM 8.4 y Caddy. Vite se arranca a mano con npm run dev desde web/.



COMANDOS FRECUENTES

Los comandos del día a día, con sus rutas y advertencias, están en el CLAUDE.md
de la raíz del repositorio. No se duplican aquí para que no puedan divergir.
