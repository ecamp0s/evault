SPRINT CONTEXT — eVault
Actualizado: 30 de julio de 2026
Estado: Iteración 1, issues #4 y #1 cerrados, issue #2 es el siguiente

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

El issue 1 es el stack de calidad del backend: Pest, Larastan, phpunit.xml con SQLite in-memory, script composer analyse y workflow de GitHub Actions. No dependía de nada y está cerrado.

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


ISSUE 1 CERRADO

Pest 5.0.2 con pest-plugin-laravel 5.0.1 instalado, sobre PHPUnit 13.2.6. tests/Pest.php aplica la TestCase de Laravel y RefreshDatabase a todo el directorio Feature. Los dos ExampleTest del skeleton se reescribieron en estilo Pest, y se añadió tests/Feature/TestEnvironmentTest.php, que asserta que la conexión activa es sqlite y la base de datos es :memory:. Ese test es la garantía en CI de que la suite nunca toca el MySQL de desarrollo.

phpunit.xml no hizo falta tocarlo: el skeleton de Laravel 13 ya trae DB_CONNECTION=sqlite y DB_DATABASE=:memory:. Verificado que esos valores ganan sobre el .env local que apunta a MySQL, porque phpunit fija las variables antes de que dotenv cargue y dotenv no sobreescribe lo que ya existe en el entorno.

Larastan 3.10 configurado en phpstan.neon con nivel max y checkModelProperties activado, analizando app, bootstrap, config, database y routes. Script composer analyse añadido. phpstan-baseline.neon commiteado pero vacío, con ignoreErrors a lista vacía.

Workflow .github/workflows/static-analysis.yml en la raíz del monorepo, con dos jobs, larastan y pest, ambos sobre PHP 8.4 con working-directory api. Filtra por paths api más el propio workflow, porque en un monorepo no tiene sentido analizar el backend cuando el PR solo toca web.

Lecciones aprendidas en esta sesión:

El nivel max de Larastan sobre el skeleton limpio solo produjo dos errores, los dos en código de Laravel y no propio, así que se arreglaron en origen en vez de congelarlos en el baseline. En config/filesystems.php, rtrim sobre env('APP_URL') falla porque env puede devolver bool, y se resolvió con un cast a string. En database/factories/UserFactory.php, el docblock @return array<string, mixed> es incompatible con el tipo del padre.

Sobre ese segundo error, cuidado: la sintaxis propia de Larastan model property of no parsea dentro de un @return, lanza un phpDoc.parseError. La solución fue borrar el docblock y dejar que definition() herede el tipo del padre. No intentar escribir @return array<model property of User, mixed>.

El baseline vacío requiere el flag --allow-empty-baseline al generarlo, porque phpstan se niega a escribir un baseline cuando no encuentra errores.

Bug del setup inicial que salió a la luz con el primer CI, y que conviene tener presente: el .gitignore de la raíz del monorepo ignoraba api/bootstrap/cache y los cuatro directorios de api/storage por completo. El skeleton de Laravel ya trae dentro de cada uno un .gitignore con el patrón asterisco más !.gitignore, cuyo propósito es ignorar el contenido pero mantener el directorio dentro del repo. Ignorar los directorios desde la raíz pisaba ese mecanismo, así que en un checkout limpio no existían y artisan fallaba con "directory must be present and writable". El repositorio no era clonable y ejecutable desde cero, pero en local nunca se notó porque los directorios sí existían en el disco de desarrollo.

La corrección fue quitar esas cinco entradas del .gitignore raíz y commitear los seis .gitignore anidados del skeleton. Regla general: no ignorar desde la raíz del monorepo un directorio que el framework espera que exista.

Para verificar este tipo de fallo sin depender de CI, sirve reconstruir un checkout limpio con git archive del write-tree y hacer composer install de verdad dentro. Dos avisos si se hace: enlazar vendor con un symlink en vez de instalarlo invalida la prueba, porque Pest resuelve la raíz del proyecto desde vendor y el in('Feature') de tests/Pest.php deja de casar; y la ruta del checkout no puede contener un segmento que empiece por dígito, porque Pest deriva el namespace de la ruta y genera un identificador PHP inválido.

Método a repetir cuando una dependencia parezca incompatible: no fiarse del constraint que trae el composer.json del template. Leer el require-dev del paquete real en vendor, y comprobar la resolución con composer require --dry-run antes de descartar una versión. En este issue se instaló primero Pest 4 dando por imposible Pest 5, y la comprobación posterior demostró que resolvía limpio.

Decisión abierta a revisar: nivel max es exigente y todavía no hay código de dominio. Si al escribir servicios reales resulta insostenible, bajar a 8 es aceptable, pero la intención es mantener max mientras se pueda.


SIGUIENTE PASO

El issue 2, Sanctum en modo token y CORS por variables de entorno, es ahora el único issue completamente desbloqueado. Desbloquea a su vez el issue 3, y ese al 5 y al 6. No hay rama activa.

Sigue pendiente crear docs/planning/STATUS.md, que CLAUDE.md da por existente pero nunca se escribió, y los seis ADR de docs/architecture/decisions, que sigue vacío.


CONVENCIONES DE TRABAJO

Git: una rama por issue con el formato tipo/número-descripcion-corta. Merge a master solo mediante PR con squash, un commit por issue. El cuerpo del PR incluye Closes seguido del número para que GitHub cierre el issue automáticamente. Se usa gh CLI.

Definition of Done: criterios de aceptación completos, tests en verde, RBAC validado donde aplique, PR mergeado, y este documento actualizado. Los issues con UI se verifican en navegador antes de marcarse como hechos.

Patrones de código heredados de eBudget: servicios de aplicación con método handle que reciben identificadores explícitos y no acceden a sesión. Double guard, es decir validación en la capa de presentación y también en la capa de aplicación, nunca solo en una. DTOs tipados para transferir datos entre capas. Servicios idempotentes para operaciones de agregación. Tests de aislamiento cross-tenant en todos los servicios críticos.

Documentación viva: este archivo es el puente entre sesiones y se actualiza al cerrar cada issue. STATUS.md es el snapshot operativo del backlog, con GitHub Project como fuente de verdad. Los ADR en docs/architecture/decisions son inmutables una vez cerrados; son registro histórico, no documentos vivos.