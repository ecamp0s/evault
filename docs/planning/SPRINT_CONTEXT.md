SPRINT CONTEXT — eVault
Actualizado: 28 de julio de 2026
Estado: Iteración 1, issue #4 cerrado, issue #1 en curso

Nota de formato: este documento está escrito en prosa plana sin Markdown, siguiendo la convención del proyecto para instrucciones dirigidas a Claude Code.


QUÉ ES eVault

eVault es un gestor de contraseñas y secretos personales con modelo zero-knowledge. El servidor nunca puede leer los datos del usuario: toda la criptografía ocurre en el cliente antes de que los datos salgan del dispositivo, y la base de datos solo almacena blobs cifrados opacos.

El producto se concibe como SaaS con opción de self-hosting para planes Enterprise, con planes Free y Team. Los clientes previstos son una SPA web, una app nativa iOS/Android y una extensión de navegador Firefox. Ahora mismo solo se está construyendo la web.

El proyecto reutiliza deliberadamente la arquitectura, los patrones y el workflow de eBudget, un proyecto anterior del mismo desarrollador. Lo que cambia respecto a eBudget es que el frontend de la vault es una SPA React con cifrado en cliente, mientras que Filament queda reservado para el panel de administración de plataforma.


RUTAS Y REPOSITORIO

Raíz del monorepo: /home/ecampos/Workspace/eVault/claude
Repositorio: ecamp0s/evault-claude (GitHub, privado, SSH)
Rama principal: master

Estructura:
api/ es el proyecto Laravel, que aloja tanto la API REST como el futuro panel Filament.
web/ es la SPA React.
docs/ contiene planning y architecture/decisions.
mobile/ y extension/ están creadas pero vacías, reservadas para más adelante.


STACK Y VERSIONES VERIFICADAS

Backend: PHP 8.4.18, Laravel 13.23.0, Composer 2.9.5. Base de datos MySQL 8 en puerto 3307. Tests previstos con Pest sobre SQLite in-memory. Análisis estático previsto con Larastan.

Frontend: Node v24.14.0, React 19.2.8, Vite 8.1.5, Tailwind 4.3.3, TypeScript 6.x, shadcn CLI 4.16.0 sobre Base UI con preset Nova. Estado global con Zustand, HTTP con axios y TanStack Query, routing con React Router 7.

Importante sobre TypeScript: el proyecto permanece deliberadamente en TypeScript 6 y no debe subirse a 7. TypeScript 7.0 salió el 8 de julio de 2026 con el compilador reescrito en Go, pero la API programática estable no llega hasta 7.1, y typescript-eslint cerró la petición de soporte para 7.0 como no planificada. Subir a 7 rompe el linting. Reevaluar cuando salga 7.1 con soporte confirmado en typescript-eslint.

Importante sobre @types/node: debe permanecer en la línea 24 para coincidir con el runtime de Node instalado. No subir a 26 salvo que se actualice Node.


ENTORNO LOCAL

El sistema es WSL2 sobre Windows, con Caddy y PHP-FPM 8.4 por socket Unix. PHP 8.3 está instalado pero desactivado a propósito; ningún proyecto lo usa.

URLs de desarrollo:
app.evault.claude sirve la SPA React, con Caddy haciendo reverse proxy a localhost:5173.
api.evault.claude sirve la API Laravel.
admin.evault.claude sirve el futuro panel Filament, apuntando al mismo proyecto Laravel.

Caddy tiene un único bloque en el puerto 8080 con matchers por host, porque Windows tiene un portproxy que envía el puerto 80 al 8080. Ese portproxy también sirve a ebudget.test, que convive en la misma máquina y no debe romperse.

Vite necesita app.evault.claude declarado en server.allowedHosts dentro de vite.config.ts, o bloquea la petición que le llega desde Caddy.

Base de datos: nombre evault-claude, usuario evault, contraseña secret, puerto 3307. Para entrar como administrador el comando que funciona es sudo mysql --socket=/var/run/mysqld/mysqld.sock -P 3307. La contraseña de root no está disponible.

Permisos: PHP-FPM corre como www-data, por lo que storage y bootstrap/cache dentro de api/ necesitan pertenecer al grupo www-data con permisos 775. Si aparece un error de tempnam o un 500 sin log, casi siempre es esto. El comando es sudo chown -R ecampos:www-data seguido de sudo chmod -R 775 sobre ambos directorios.

Arranque de sesión: el script ~/start-dev.sh levanta MySQL, PHP-FPM 8.4 y Caddy. Vite se arranca a mano con npm run dev desde web/.


DECISIONES DE ARQUITECTURA CERRADAS

Zero-knowledge. La contraseña maestra nunca sale del cliente. El cliente deriva con PBKDF2 dos valores a partir de ella: una clave de cifrado que nunca abandona el dispositivo, y un hash de autenticación que sí se envía al servidor para verificar identidad. Los vault items se cifran con AES-256-GCM en el cliente antes de cada petición.

React para la vault, Filament solo para administración. Filament es server-side rendering, así que haría pasar los datos por PHP y rompería la garantía de zero-knowledge. Para el panel de plataforma, donde no se manejan secretos de usuarios, Filament sigue siendo la elección correcta por velocidad de desarrollo.

Monorepo con API y panel admin en el mismo proyecto Laravel, y el frontend React como proyecto separado dentro del mismo repositorio. Las rutas de API y de admin están completamente separadas.

SaaS primero, pero con arquitectura self-hosteable desde el principio: sin URLs hardcodeadas, todo por variables de entorno, preparado para Docker.

Multi-tenancy siguiendo el patrón de eBudget. El tenant personal es un Vault; los equipos tienen una Organization con vaults compartidas. Todo query lleva vault_id y los servicios validan pertenencia. No se usa spatie/laravel-permission teams. El contexto activo se pasa explícito en cada llamada porque la API es stateless, a diferencia de eBudget que lo guardaba en sesión.

Dirección visual: línea Bitwarden y Linear. Superficies oscuras, un único color de acento usado con moderación, tipografía sobria con jerarquía por peso y tamaño, radios pequeños y consistentes. Sin gradientes, sin sombras pronunciadas, sin ilustraciones decorativas. El preset Nova de shadcn aporta espaciado compacto, iconos Lucide y tipografía Geist.

Pendiente: los ADR todavía no están escritos en docs/architecture/decisions. Hay cinco que registrar, correspondientes a las cinco decisiones anteriores más la de TypeScript 6.


DÓNDE ESTAMOS

La Iteración 1 está partida en seis issues, todos creados en GitHub con etiquetas s1 más feat o chore más api o web.

El issue 1 es el stack de calidad del backend: Pest, Larastan, phpunit.xml con SQLite in-memory, script composer analyse y workflow de GitHub Actions. No depende de nada.

El issue 2 configura Sanctum en modo token y CORS para permitir el origen de la SPA, todo por variables de entorno.

El issue 3 crea los endpoints de registro, login, logout y sesión activa, con la lógica en servicios de aplicación bajo app/Application/Auth. Depende del issue 2.

El issue 4 es el sistema de diseño del frontend y está cerrado.

El issue 5 son las pantallas de login y registro conectadas a la API. Depende de los issues 3 y 4.

El issue 6 es el shell autenticado con sidebar, store de auth en Zustand, rutas protegidas e interceptor de axios que fuerza logout ante un 401. Depende del issue 5.

Advertencia importante sobre la autenticación de esta iteración: es deliberadamente convencional. La contraseña viaja al servidor y Laravel la hashea. Eso no es zero-knowledge y se sustituye en la Iteración 3. Se hace así a propósito para validar el stack completo antes de introducir criptografía. El contrato de la API, es decir rutas, forma de request y response y gestión de tokens, debe mantenerse estable para que el cambio posterior sea mínimo.


ISSUE 4 CERRADO

Los seis componentes base quedaron instalados en src/components/ui: avatar, button, card, dropdown-menu, field, input, label, separator, sonner. Contenido por defecto de Vite eliminado por completo. /styleguide creado y verificado visualmente en navegador, incluyendo interacción real (dropdown, toast). npm run build en verde. PR mergeado con squash, rama borrada.

Lecciones aprendidas en esta sesión:

El registro del preset base-nova no tiene una implementación real de form (queda como stub vacío, sin files ni dependencies); el equivalente de este preset es field, un set de primitivos de formulario sin atar a ninguna librería de validación. Se instaló field en su lugar. Se integrará con react-hook-form y zod en el issue 5 cuando haga falta un formulario real con validación.

baseUrl en tsconfig.json y tsconfig.app.json se eliminó porque TypeScript 6 lo marca deprecado (error TS5101, deja de funcionar en TS7) y bloqueaba npm run build. paths sigue funcionando sin baseUrl bajo moduleResolution: bundler, así que no hizo falta ningún workaround.

Base UI usa el prop render para composición polimórfica en vez de asChild de Radix (por ejemplo en DropdownMenuTrigger). Y DropdownMenuLabel exige estar envuelto en DropdownMenuGroup: usarlo suelto lanza un error no capturado de Base UI (MenuGroupContext is missing) que deja la página en blanco sin ningún mensaje visible para el usuario, solo detectable revisando la consola del navegador.


ESTADO DEL ISSUE 1

Rama activa: ninguna todavía, hay que crear chore/1-stack-calidad-backend (o el nombre que corresponda) desde api/.

Qué es: stack de calidad del backend. Pest, Larastan, phpunit.xml con SQLite in-memory, script composer analyse y workflow de GitHub Actions. No depende de nada, es el único issue completamente desbloqueado ahora mismo (los issues 2 y 3 también siguen abiertos en GitHub, pero el 3 depende del 2).

Siguiente paso inmediato: revisar el estado actual de api/ (composer.json, si Pest ya está instalado desde el setup inicial del monorepo) antes de instalar nada, y crear la rama del issue.

Criterios de aceptación pendientes: Pest configurado y corriendo sobre SQLite in-memory, Larastan instalado con script composer analyse, phpunit.xml apuntando a SQLite in-memory, workflow de GitHub Actions ejecutando tests y análisis estático en cada push o PR.


CONVENCIONES DE TRABAJO

Git: una rama por issue con el formato tipo/número-descripcion-corta. Merge a master solo mediante PR con squash, un commit por issue. El cuerpo del PR incluye Closes seguido del número para que GitHub cierre el issue automáticamente. Se usa gh CLI.

Definition of Done: criterios de aceptación completos, tests en verde, RBAC validado donde aplique, PR mergeado, y este documento actualizado. Los issues con UI se verifican en navegador antes de marcarse como hechos.

Patrones de código heredados de eBudget: servicios de aplicación con método handle que reciben identificadores explícitos y no acceden a sesión. Double guard, es decir validación en la capa de presentación y también en la capa de aplicación, nunca solo en una. DTOs tipados para transferir datos entre capas. Servicios idempotentes para operaciones de agregación. Tests de aislamiento cross-tenant en todos los servicios críticos.

Documentación viva: este archivo es el puente entre sesiones y se actualiza al cerrar cada issue. STATUS.md es el snapshot operativo del backlog, con GitHub Project como fuente de verdad. Los ADR en docs/architecture/decisions son inmutables una vez cerrados; son registro histórico, no documentos vivos.