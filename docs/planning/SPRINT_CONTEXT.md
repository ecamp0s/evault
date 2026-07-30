SPRINT CONTEXT — eVault
Actualizado: 30 de julio de 2026
Estado: Iteración 1 en curso

Nota de formato: este documento está escrito en prosa plana sin Markdown, siguiendo la convención del proyecto para instrucciones dirigidas a Claude Code.

Nota sobre qué NO se escribe aquí: este documento no dice qué issues están cerrados ni cuál es el siguiente. Eso se lee en docs/planning/STATUS.md, que se genera desde GitHub. La razón es una lección aprendida, no una preferencia: hasta el 30 de julio de 2026 el encabezado enumeraba los issues cerrados y la sección final afirmaba cuál era el único desbloqueado, y ambas cosas caducaron en cuanto se cerró un issue más y se abrieron seis nuevos. Una copia del estado se desincroniza siempre, porque nada obliga a actualizarla. Aquí va lo que GitHub no sabe: entorno, decisiones, intención de cada issue y lecciones aprendidas. El estado, nunca. Es la regla que docs/GUIDE.md ya exigía en su lista de prohibiciones, no duplicar información cuya fuente de verdad es otra.


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

Base de datos: nombre evault_claude, usuario evault, contraseña secret, puerto 3307. El nombre lleva guion bajo, no guion medio; lo que manda es DB_DATABASE del .env. Existieron dos bases duplicadas con el mismo esquema, evault-claude y evault, ambas sin datos; se borraron el 30 de julio de 2026 para dejar solo evault_claude. Para entrar como administrador el comando que funciona es sudo mysql --socket=/var/run/mysqld/mysqld.sock -P 3307. La contraseña de root no está disponible.

Permisos: PHP-FPM corre como www-data, por lo que storage y bootstrap/cache dentro de api/ necesitan pertenecer al grupo www-data con permisos 775. Si aparece un error de tempnam o un 500 sin log, casi siempre es esto. El comando es sudo chown -R ecampos:www-data seguido de sudo chmod -R 775 sobre ambos directorios.

Arranque de sesión: el script ~/start-dev.sh levanta MySQL, PHP-FPM 8.4 y Caddy. Vite se arranca a mano con npm run dev desde web/.


DECISIONES DE ARQUITECTURA CERRADAS

Desde el issue #9 estas decisiones están registradas como ADR en docs/architecture/decisions, y esos documentos son la fuente de verdad. Lo que sigue es un resumen para no obligar a abrirlos en cada sesión, pero si el resumen y el ADR se contradicen, manda el ADR. Los ADR son inmutables: si una decisión cambia, se escribe uno nuevo que la supersede, no se edita el viejo.

Están numerados por profundidad arquitectónica y no por fecha, de la decisión más fundacional a la más superficial. ADR-001 zero-knowledge, ADR-002 React para la vault y Filament solo para administración, ADR-003 monorepo, ADR-004 multi-tenancy sin Spatie teams, ADR-005 arquitectura self-hosteable, ADR-006 TypeScript 6.

Zero-knowledge, ADR-001. La contraseña maestra nunca sale del cliente. El cliente deriva con PBKDF2 dos valores a partir de ella: una clave de cifrado que nunca abandona el dispositivo, y un hash de autenticación que sí se envía al servidor para verificar identidad. Los vault items se cifran con AES-256-GCM en el cliente antes de cada petición.

React para la vault, Filament solo para administración, ADR-002. Filament es server-side rendering, así que haría pasar los datos por PHP y rompería la garantía de zero-knowledge. Para el panel de plataforma, donde no se manejan secretos de usuarios, Filament sigue siendo la elección correcta por velocidad de desarrollo.

Monorepo, ADR-003, con API y panel admin en el mismo proyecto Laravel, y el frontend React como proyecto separado dentro del mismo repositorio. Las rutas de API y de admin están completamente separadas.

SaaS primero, pero con arquitectura self-hosteable desde el principio, ADR-005: sin URLs hardcodeadas, todo por variables de entorno, preparado para Docker.

Multi-tenancy siguiendo el patrón de eBudget, ADR-004. El tenant personal es un Vault; los equipos tienen una Organization con vaults compartidas. Todo query lleva vault_id y los servicios validan pertenencia. No se usa spatie/laravel-permission teams. El contexto activo se pasa explícito en cada llamada porque la API es stateless, a diferencia de eBudget que lo guardaba en sesión.

Dirección visual: línea Bitwarden y Linear. Superficies oscuras, un único color de acento usado con moderación, tipografía sobria con jerarquía por peso y tamaño, radios pequeños y consistentes. Sin gradientes, sin sombras pronunciadas, sin ilustraciones decorativas. El preset Nova de shadcn aporta espaciado compacto, iconos Lucide y tipografía Geist.

Dirección visual y TypeScript 6: la primera no tiene ADR porque no es una decisión técnica irreversible, sino una guía de estilo que puede evolucionar; vive aquí y en el sistema de diseño de web/. La segunda sí lo tiene, ADR-006, porque hay un bloqueador verificable detrás.


DÓNDE ESTAMOS

La Iteración 1 se planificó como seis issues, del 1 al 6. Después se han ido añadiendo otros que salieron de fricciones encontradas al trabajar: el 9 y el 11 de documentación y CI, el 15 de corrección del generador, y los que van del 17 al 21. Todos creados en GitHub con etiquetas s1 más feat, chore o documentation, más api o web cuando aplica.

El estado del backlog no se lee aquí, se lee en docs/planning/STATUS.md, que se genera desde GitHub con scripts/status.sh e incluye estado, prioridad y grafo de dependencias. Lo que sigue es la intención de cada issue, que no cambia; el estado sí, y por eso no se duplica en este documento.

El issue 1 es el stack de calidad del backend: Pest, Larastan, phpunit.xml con SQLite in-memory, script composer analyse y workflow de GitHub Actions.

El issue 2 configura Sanctum en modo token y CORS para permitir el origen de la SPA, todo por variables de entorno.

El issue 3 crea los endpoints de registro, login, logout y sesión activa, con la lógica en servicios de aplicación bajo app/Application/Auth.

El issue 4 es el sistema de diseño del frontend.

El issue 5 son las pantallas de login y registro conectadas a la API.

El issue 6 es el shell autenticado con sidebar, store de auth en Zustand, rutas protegidas e interceptor de axios que fuerza logout ante un 401.

El issue 9 es la fundación documental: índice y guía de docs, los seis ADR, el generador de STATUS.md y la gobernanza del backlog en GitHub.

El issue 11 automatiza la regeneración de STATUS.md en cada push a master, y el 15 corrige el generador para que localice el Project por su vinculación al repositorio en vez de por su nombre, que es editable desde la interfaz.

El issue 17 da al frontend la comprobación automática que no tenía: lint y build en cada PR que toque web.

El issue 18 son las plantillas de issue en .github/ISSUE_TEMPLATE, para que la estructura que hoy se sostiene por costumbre la imponga el formulario.

El issue 19 es Dependabot sobre los tres ecosistemas, composer, npm y github-actions, con ignore obligatorio de las mayores de typescript y de @types/node, porque sin él propondría cada semana justo lo que el ADR-006 decidió no hacer.

El issue 20 mueve el filtrado por paths del trigger a los jobs. Hace falta porque un workflow que no se dispara nunca reporta sus checks, y un check obligatorio que no llega bloquea el PR para siempre. Es requisito del 21.

El issue 21 protege master con un ruleset.

El issue 25 pone rate limiting en los endpoints de autenticación, que hoy no tienen ninguno. Salió al cerrar el issue 3.

Advertencia importante sobre la autenticación de esta iteración: es deliberadamente convencional. La contraseña viaja al servidor y Laravel la hashea. Eso no es zero-knowledge y se sustituye en la Iteración 3. Se hace así a propósito para validar el stack completo antes de introducir criptografía. El contrato de la API, es decir rutas, forma de request y response y gestión de tokens, debe mantenerse estable para que el cambio posterior sea mínimo.


ISSUE 19 CERRADO

.github/dependabot.yml con los tres ecosistemas del repositorio: composer en /api, npm en /web y github-actions en la raíz. Frecuencia semanal, cinco PR abiertos como máximo por ecosistema, y las actualizaciones menores y de parche agrupadas en un solo PR. Las mayores llegan sueltas a propósito, porque son las que pueden romper algo y conviene mirarlas de una en una. Cada ecosistema lleva su prefijo de commit para que los PR del bot encajen con la convención del proyecto.

Los dos ignore que exige el ADR-006 están puestos: mayores de typescript y mayores de @types/node. Sin ellos Dependabot propondría cada semana exactamente lo que el proyecto ha decidido no hacer. El primero se levanta cuando salga TypeScript 7.1 con soporte confirmado en typescript-eslint, y el segundo cuando se actualice Node.

El auto-merge queda fuera, como decía el issue. Ahora ya existe CI de frontend, que era una de las dos condiciones, pero falta la otra: master sigue sin protección hasta que se cierren el 20 y el 21.

Aprovechando el PR se añadió .claude/settings.local.json al .gitignore del repositorio. Estaba protegido solo por el ~/.config/git/ignore global de la máquina, y ese fichero acumula comandos literales que incluyen credenciales de desarrollo, así que depender de una configuración personal para que no se filtre no era suficiente. El .claude/settings.json sí se versiona: son las reglas de permisos compartidas del proyecto, todas de solo lectura y sin nada específico de una máquina.


ISSUE 3 CERRADO

Cuatro endpoints bajo el prefijo api/auth: register que devuelve 201, login que devuelve 200, logout que devuelve 204 y me que devuelve 200. Los dos últimos van tras auth:sanctum. El placeholder GET api/user que dejaba install:api se eliminó, como estaba previsto, y los tests que lo usaban apuntan ahora a api/auth/me.

La lógica vive en app/Application/Auth: RegisterUser, LoginUser y LogoutUser, cada uno con su método handle recibiendo datos explícitos y devolviendo un AuthResult, que es un DTO con el usuario y el token en claro. El controlador solo traduce petición a llamada y resultado a JSON. La forma del usuario en la respuesta la fija App\Http\Resources\UserResource, que enumera los campos uno a uno en vez de volcar el modelo, para que un atributo nuevo en la tabla no se filtre solo por existir.

Contrato de las respuestas, que es lo que no debe cambiar en la Iteración 3: los datos van siempre envueltos en una clave data. Registro y login devuelven data.user y data.token; me devuelve data.user; logout no devuelve cuerpo. Los errores conservan la forma de Laravel, con message y, cuando son de validación, errors.

Decisiones de seguridad que conviene no deshacer sin pensarlo:

Login responde 401 y no 422, y el mensaje es idéntico tanto si el correo no existe como si la contraseña no coincide. Además, cuando el correo no existe se comprueba igualmente el hash contra un valor ficticio. Sin eso, la respuesta a un correo no registrado sería medible más rápida que la de uno registrado con contraseña incorrecta, y esa diferencia de tiempo permite enumerar qué cuentas existen. Hay un test que compara ambos mensajes y otro que compara ambos códigos.

El correo se normaliza a minúsculas y sin espacios antes de comprobar la unicidad y antes de guardarlo, así que dos altas que solo difieran en mayúsculas son la misma cuenta.

Double guard en el alta: la regla unique del Form Request es la primera barrera y RegisterUser la segunda, dentro de una transacción y con lockForUpdate, porque entre la validación y el insert cabe otra petición con el mismo correo. La segunda barrera tiene test propio que la ejercita sin pasar por el Form Request.

Logout revoca solo el token de la petición y no todos los del usuario, porque cerrar sesión en un dispositivo no debe cerrarla en los demás. El servicio filtra además por propietario, así que un identificador de token ajeno no revocaría nada aunque llegara. Es idempotente.

Las reglas de validación de la contraseña son solo de longitud mínima, a propósito. En la Iteración 3 ese campo dejará de ser una contraseña y pasará a ser un hash de autenticación derivado en el cliente, y unas reglas de composición pensadas para texto escrito por humanos estorbarían entonces.

Lecciones aprendidas en esta sesión:

El fallo más engañoso de la sesión: tras revocar un token, una segunda petición dentro del mismo test seguía devolviendo 200 en vez de 401. El código era correcto. La causa es que todas las peticiones de un test comparten una única instancia de la aplicación y el guard cachea el usuario la primera vez que lo resuelve, mientras que en producción cada petición arranca limpia. Se comprobó midiendo que el token sí desaparecía de la base de datos y que la misma petición daba 401 tras vaciar los guards. La solución es el helper olvidarSesionResuelta de tests/Pest.php, que hay que llamar entre peticiones cuando un test comprueba que algo ha dejado de estar autorizado. Antes de tocar el código de aplicación por un fallo así, comprobar el estado en base de datos: si el dato ya está bien, el problema es el aislamiento del test. Se verificó además el ciclo completo contra el servidor real, donde la revocación funciona sin ningún truco.

Los tests unitarios de los servicios de aplicación necesitan base de datos, porque los servicios persisten. tests/Pest.php extiende ahora la TestCase de Laravel y RefreshDatabase también sobre Unit/Auth, listando ese subdirectorio y no Unit entero: los tests que sí son unitarios puros, como los de App\Support, deben seguir corriendo sin base de datos, porque teniéndola disponible nada impediría que empezaran a depender de ella sin querer.

Larastan avisó de que el instanceof PersonalAccessToken sobre el retorno de currentAccessToken era siempre cierto. Y tiene razón con la configuración actual: el genérico TToken del trait HasApiTokens se resuelve a PersonalAccessToken, y el otro caso posible, TransientToken, solo aparece con autenticación por sesión, que el guard vacío de config/sanctum.php impide. Se quitó la comprobación en vez de silenciar el aviso.

Quedó fuera de alcance y ya tiene issue propio, el 25: no hay rate limiting en login ni en registro. Laravel 13 no aplica throttle a las rutas de api si no se configura un RateLimiter, y no se configuró aquí porque el issue 2 lo dejó explícitamente fuera y el 3 no lo pedía. En un gestor de contraseñas, un login sin límite de intentos es una invitación a la fuerza bruta.

Decisión de contrato tomada al cerrar el issue 3: los mensajes de error de la API no se traducen. Los message que devuelve son para desarrolladores y para los logs, y la SPA no debe mostrarlos al usuario final; construye sus textos a partir del código HTTP y de la clave del campo dentro de errors, nunca del texto que venga dentro. El motivo es que una API que devuelve mensajes localizados se acopla a un idioma y obliga a mantener traducciones en el servidor para que las lea un cliente que ya tiene su propio i18n; además deja el contrato estable de cara a la Iteración 3. La consecuencia visible es que el 422 por correo duplicado llega en inglés, porque lo genera la regla unique de Laravel y APP_LOCALE es en, y eso es correcto y no hay que arreglarlo en el servidor. Está anotado también como comentario en el issue 5, que es quien lo consume.


ISSUE 2 CERRADO

Sanctum 4.3 instalado con php artisan install:api, que publica config/sanctum.php, crea routes/api.php, añade la clave api al withRouting de bootstrap/app.php y ejecuta la migración de personal_access_tokens. Al modelo User se le añadió el trait HasApiTokens.

Modo token puro, y para que lo sea de verdad hubo que cambiar una cosa que no viene así por defecto: config/sanctum.php trae guard igual a la lista con web, lo que significa que una petición con una cookie de sesión válida se autenticaría sin presentar token. Se dejó la lista vacía, de modo que la única vía es el bearer token. bootstrap/app.php no llama a statefulApi, así que el middleware de sesión de Sanctum no está en el stack y la clave stateful de su configuración no tiene efecto. Hay un test que falla si alguien revierte el guard, porque probarlo con actingAs es la única forma de que ese cambio no se deshaga sin querer.

CORS por variable de entorno, CORS_ALLOWED_ORIGINS, una lista separada por comas. El parseo vive en app/Support/CorsOrigins y es fail-closed: ante una variable ausente, vacía o con comodín devuelve la lista vacía, que no permite ningún origen. El comodín se descarta incluso cuando alguien lo escribe a propósito. config/cors.php no contiene ninguna URL; el valor de desarrollo vive en .env.example, que es lo que ADR-005 pide.

Que la lista quede vacía no se queda callado. AppServiceProvider comprueba en boot que hay al menos un origen y, si no lo hay, aborta con un mensaje que dice exactamente qué variable falta. La comprobación se salta cuando se corre en consola, y eso es deliberado: si abortara también ahí, un despliegue con la variable ausente no podría ejecutar migraciones ni config:clear, que es justo lo que hace falta para salir del problema. Verificado a mano de extremo a extremo: sin la variable la API responde 500 con ese mensaje y no emite ninguna cabecera de origen permitido.

Se añadió GET /api/health, una sonda pública. El health de Laravel vive en /up, fuera del grupo api, así que no lleva cabeceras CORS y la SPA no puede consultarlo desde el navegador. Esta sí, y además sirve de healthcheck a un despliegue en contenedores.

De config/cors.php se quitó sanctum/csrf-cookie de la lista de paths, porque esa ruta solo existe en el modo cookie-based que este proyecto no usa.

Lecciones aprendidas en esta sesión:

Una API sin ruta de login devuelve 500 en vez de 401, y cuesta ver por qué. Una petición sin token a una ruta protegida que no envíe Accept application/json hace que el middleware Authenticate resuelva route('login') para redirigir al invitado; esa ruta no existe en una API y la RouteNotFoundException se convierte en un 500. Lo importante es dónde ocurre: dentro del propio middleware, antes de que el manejador de excepciones llegue a decidir el formato de la respuesta. Por eso shouldRenderJsonWhen no basta por sí solo, aunque parezca lo indicado. La solución que sí funciona es redirectGuestsTo devolviendo null en el withMiddleware de bootstrap/app.php. Se pusieron las dos cosas, porque resuelven problemas distintos: redirectGuestsTo evita la excepción y shouldRenderJsonWhen garantiza que todo error bajo api sale en JSON.

Cuidado al escribir tests de CORS con un solo origen permitido. La librería php-cors, cuando la lista tiene exactamente un elemento y no hay patrones, emite Access-Control-Allow-Origin siempre con ese valor fijo, sin mirar el Origin de la petición, porque así la respuesta es cacheable. Sigue siendo seguro, porque quien compara esa cabecera con su propio origen y bloquea la respuesta es el navegador. La consecuencia práctica es que assertHeaderMissing es una aserción equivocada para el caso del origen no permitido: la cabecera está, y lo que hay que comprobar es que nunca lleva el origen del atacante. El primer intento de test falló justo por esto y el fallo era del test, no del código.

Larastan volvió a sacar el mismo error que en el issue #1 con config/filesystems.php, esta vez en config/sanctum.php: env puede devolver bool y explode exige string. Se resolvió igual, con un cast a string. Es un patrón recurrente en la configuración publicada de Laravel y de sus paquetes, así que conviene esperarlo cada vez que se publique un config nuevo.

Reapareció el problema de permisos de storage que ya describe la sección de entorno local, y merece la pena saber cómo se manifiesta porque es engañoso: storage/logs, storage/framework/cache y storage/framework/sessions habían vuelto a quedar como ecampos:ecampos en vez de grupo www-data. El síntoma no es un error de permisos, sino que el error real queda oculto detrás de otro que habla de no poder abrir el fichero de log en modo append. Al diagnosticar un 500, comprobar primero si el log se puede escribir.


ISSUE 17 CERRADO

El workflow .github/workflows/frontend.yml con dos jobs, ESLint y Build, sobre Node 24, con caché de npm por web/package-lock.json y working-directory web. Filtra por paths web más el propio workflow, igual que static-analysis.yml. No hay job de typecheck separado porque npm run build es tsc -b seguido de vite build, así que el build ya comprueba los tipos.

El hallazgo que justifica el issue por sí solo: npm run lint estaba fallando en master. El error era react-refresh/only-export-components en src/components/ui/button.tsx, porque el fichero exporta buttonVariants junto al componente Button. Llevaba ahí desde el issue 4 y nadie lo había visto, que es exactamente lo que este issue existía para impedir. Sin arreglarlo, el job de lint habría nacido en rojo.

La corrección no fue tocar button.tsx sino añadir en eslint.config.js un override que desactiva esa regla solo para src/components/ui. El motivo es que esos ficheros los genera el CLI de shadcn, que exporta el componente junto a sus variantes de cva por convención propia; editarlos a mano se desharía en cuanto se reinstale o actualice cualquier componente. La regla protege el fast refresh durante el desarrollo, y perderlo en primitivos de librería que casi nunca se editan no cuesta nada. El override está acotado a ese directorio a propósito: en código de aplicación la regla sigue activa.

Lecciones aprendidas en esta sesión:

Node en esta máquina necesita cuidado. /usr/bin/node es la v20.20.1 y es la que coge una shell no interactiva, mientras que la v24.14.0 que da por supuesta este documento está instalada bajo nvm y hay que activarla. Antes de dar por bueno un resultado de npm en local, comprobar node --version. El CI no tiene el problema porque fija la versión de forma explícita en el workflow.

La última versión de actions/setup-node es la v7. Se dejó actions/checkout en v5 para no divergir de static-analysis.yml, aunque exista ya la v7; subir las dos a la vez es trabajo del issue 19, cuando Dependabot empiece a vigilar el ecosistema github-actions.

Método para verificar que un job de CI detecta de verdad lo que dice detectar, que es lo que pedía el criterio de aceptación: escribir un fichero temporal en src con un error de tipos evidente, comprobar que npm run build sale con código distinto de cero, y borrarlo. Salió con código 2 y volvió a verde al quitarlo. Es preferible a modificar un fichero real, porque no deja rastro si se interrumpe a medias.


ISSUE 11 CERRADO

Salió de una fricción detectada al mergear el issue 9. El estado de un issue solo pasa a Done después de mergear su pull request, así que el STATUS.md que viaja dentro de un PR nunca puede reflejar el cierre del issue que ese mismo PR cierra. Regenerarlo a mano después funcionaba pero producía un cambio que no encajaba en ningún PR, y dependía de acordarse.

La solución es el workflow .github/workflows/status.yml, que ejecuta scripts/status.sh en cada push a master y commitea el resultado si cambió. Corre también una vez al día y a demanda con workflow_dispatch, porque cambiar la prioridad o el estado en el Project no genera ningún push y sin esas ejecuciones el fichero se quedaría atrás. Dos barreras contra el bucle: el commit del bot lleva skip ci en el mensaje y el job tiene una guarda por actor.

Verificado de extremo a extremo: el push del merge disparó el workflow, terminó en verde y el bot commiteó docs: regenerar STATUS.md skip ci con exactamente el desfase esperado, quitando el issue 11 de la lista de tomables. No hubo segundo run, así que el skip ci hace su trabajo.

Requisito de entorno que hay que conocer: el workflow necesita un PAT con scopes repo y read:project en el secret STATUS_TOKEN del repositorio. El GITHUB_TOKEN que Actions inyecta por defecto es efímero, no tiene scopes configurables y no puede leer Projects v2, así que no sirve para esto. El secret ya está creado. Si algún día ese PAT caduca, el workflow empezará a fallar con el mensaje de que no se pudo leer el Project; ese mensaje significa dos cosas posibles, que falta el token o que caducó.

Lecciones aprendidas en esta sesión:

El modo estricto del generador existe por una razón concreta. Si no puede leer el Project, falla en vez de escribir un STATUS.md sin la columna de prioridades. En local un aviso por stderr se ve, pero en CI nadie lo lee y el fichero degradado se commitearía en silencio, sobrescribiendo información buena con información peor. Se activa con EVAULT_STATUS_ESTRICTO=1, que solo pone el workflow.

El acceso al Project se hace por GraphQL directo y no con los subcomandos gh project, y esto no es una preferencia estética. gh project list --owner X tiene que averiguar antes si X es un usuario o una organización, y para decidirlo consulta ambos; si el token no tiene read:org no puede completar esa comprobación y aborta con unknown owner type, aunque tenga permiso de sobra para leer el Project. El mensaje de error apunta al owner cuando el problema es otro permiso, así que cuesta de diagnosticar. Ir directo a user.projectsV2 y user.projectV2.items evita esa resolución y funciona con el mínimo privilegio, solo repo y read:project.

Regla general que se deriva de lo anterior: cuando una llamada de gh falle por permisos de forma poco explicable, comprobar si el subcomando hace consultas auxiliares que no se ven. La API GraphQL directa suele necesitar menos permisos que el comando de conveniencia que la envuelve.

El generador es idempotente a propósito y la fecha del encabezado lleva solo el día y no la hora. Con hora, cada ejecución produciría un diff espurio, el bot commitearía en cada push y el historial se llenaría de ruido.


ISSUE 9 CERRADO

Se creó la fundación documental que CLAUDE.md daba por existente y que nunca se había escrito. docs/README.md como índice, docs/GUIDE.md con las reglas de la propia documentación, los seis ADR en docs/architecture/decisions, y docs/planning/STATUS.md generado desde GitHub.

Numeración de los ADR por profundidad arquitectónica y no por fecha: del más fundacional, zero-knowledge, al más superficial, TypeScript 6. Cada uno se apoya en los anteriores, así que leídos en orden explican el proyecto de dentro hacia fuera. Los ADR posteriores al 006 se numerarán secuencialmente según se cierren, porque a partir de ahí el orden cronológico y el lógico ya no se pueden reconciliar. Cada ADR lleva dos fechas, la de decisión y la de registro, porque estas seis se decidieron en la planificación y se escribieron después, y fingir que se decidieron el mismo día falsearía el historial.

Se corrigió en el issue 2 la referencia a ADR-004, que con esta numeración pasó a ser ADR-005.

Gobernanza del backlog: GitHub es la única fuente de verdad del estado, y STATUS.md se genera desde ahí con scripts/status.sh. Esta es la corrección deliberada de lo que no funcionó bien en eBudget, donde STATUS.md son doscientas líneas mantenidas a mano, con un checklist de sincronización y una cláusula que admite que si hay discrepancia manda el Project. Aquí el documento no se puede desincronizar porque no se escribe a mano. Solo se editan a mano tres secciones delimitadas con marcadores HTML, objetivo de la iteración, criterios de salida y riesgos, que son lo que GitHub no sabe; el generador las preserva entre ejecuciones.

Se añadió el campo Priority al Project, que no existía, y se asignó a los issues abiertos. Se decidió no añadir la columna Ready ni el campo Type que sí tiene eBudget: con un solo desarrollador, la condición de listo para tomar se deriva de que el issue no tenga bloqueantes abiertos, y el tipo ya lo cubren los labels.

Lecciones aprendidas en esta sesión:

GitHub tiene dependencias nativas entre issues, blocked by y blocking, que no existían cuando se montó eBudget. Eso permite que las dependencias sean metadato consultable en vez de prosa en un documento. Se registran por REST, no por GraphQL: la API GraphQL las expone para lectura pero no ofrece mutation para crearlas. El comando es gh api --method POST repos/OWNER/REPO/issues/N/dependencies/blocked_by -F issue_id=ID, donde ID es el id interno del issue bloqueante y no su número. Importa el flag: con -f minúscula el valor viaja como cadena y la API responde 422 porque espera un entero; con -F mayúscula funciona.

Los números de issue y de pull request comparten la misma secuencia en GitHub. Esta issue se pensó como la número 7 y se creó como la 9, porque los PR de los issues 4 y 1 consumieron el 7 y el 8. No dar por hecho el número antes de crear el issue.

El generador se hizo idempotente a propósito: la línea de fecha lleva solo el día y no la hora, para que dos ejecuciones seguidas sin cambios en GitHub produzcan un fichero byte a byte idéntico. Si llevara hora, cada ejecución generaría un diff espurio y el fichero ensuciaría todos los commits.

Si gh falla o no está autenticado, el script sale con error sin escribir nada. Es deliberado: un STATUS.md desactualizado es recuperable, uno vaciado por un fallo de red no.

Se corrigieron dos errores de hecho en CLAUDE.md que llevaban tiempo ahí. Decía Laravel 12 cuando el proyecto está en Laravel 13, y daba las URLs locales como https://evault.test con rutas /api y /admin, cuando los hosts reales son http y son api.evault.claude, app.evault.claude y admin.evault.claude. Verificado que evault.test no resuelve.

El CLAUDE.md de /home/ecampos/Workspace/eVault, el del directorio padre, no se tocó a propósito: está fuera de este repositorio y lo comparte el proyecto hermano codex, donde esta estructura documental no existe. El que manda para este proyecto es el CLAUDE.md de la raíz del repo.


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

Cuál es el siguiente issue no se decide aquí: se mira la sección "Qué se puede tomar ahora" de docs/planning/STATUS.md, que lista los issues abiertos sin bloqueantes abiertos ordenados por prioridad. Las dependencias están registradas como relaciones nativas en GitHub y se ven en el grafo de ese mismo documento, así que no hay que reconstruirlas leyendo prosa.

Lo que sí conviene dejar escrito es el punto de partida ya verificado en el código, porque ahorra la comprobación a la siguiente sesión.

Punto de partida verificado para el issue 5, las pantallas de login y registro, comprobado el 30 de julio de 2026: la API está lista y no hace falta tocarla. Los cuatro endpoints responden en api/auth y su contrato está descrito arriba, en la sección del issue 3. El origen app.evault.claude ya está permitido por CORS, así que la SPA puede llamar desde el navegador sin configuración adicional.

Del lado de web/ están instalados axios, TanStack Query, Zustand y React Router 7, y el sistema de diseño del issue 4 con sus componentes en src/components/ui, incluido field, que es el set de primitivos de formulario del preset. Lo que no hay todavía es cliente de API, store de sesión ni ninguna ruta: /styleguide es lo único que existe. react-hook-form y zod no están instalados y el issue 4 dejó anotado que este es el momento de añadirlos.

Recordatorio de contrato para quien conecte la SPA: el token llega en data.token y hay que enviarlo como cabecera Authorization con el prefijo Bearer, nunca como cookie. Los errores de validación llegan con la forma de Laravel, message más errors indexado por campo, y un login fallido es 401 con message y sin errors.

Pendiente de documentación, para cuando haya contenido real que poner en ellos: architecture/FOUNDATION.md cuando exista dominio propio, architecture/ACCESS_AND_TENANCY.md cuando se implemente el modelo de vaults y organizaciones, y development/SETUP.md extrayendo de aquí la sección de entorno local cuando este documento crezca demasiado. No se crearon vacíos a propósito.


CONVENCIONES DE TRABAJO

Git: una rama por issue con el formato tipo/número-descripcion-corta. Merge a master solo mediante PR con squash, un commit por issue. El cuerpo del PR incluye Closes seguido del número para que GitHub cierre el issue automáticamente. Se usa gh CLI.

Definition of Done: criterios de aceptación completos, tests en verde, RBAC validado donde aplique, PR mergeado y este documento actualizado. STATUS.md no hay que tocarlo, lo regenera el CI tras el merge. Los issues con UI se verifican en navegador antes de marcarse como hechos.

Patrones de código heredados de eBudget: servicios de aplicación con método handle que reciben identificadores explícitos y no acceden a sesión. Double guard, es decir validación en la capa de presentación y también en la capa de aplicación, nunca solo en una. DTOs tipados para transferir datos entre capas. Servicios idempotentes para operaciones de agregación. Tests de aislamiento cross-tenant en todos los servicios críticos.

Documentación viva: este archivo es el puente entre sesiones y se actualiza al cerrar cada issue. STATUS.md no se edita a mano, lo regenera el workflow status.yml desde GitHub tras cada push a master, y GitHub es la única fuente de verdad del estado; solo sus tres secciones marcadas como manuales se escriben a mano, y el generador las preserva. En local se puede regenerar con scripts/status.sh para verlo antes de tiempo, pero no es obligatorio. Los ADR en docs/architecture/decisions son inmutables una vez cerrados; son registro histórico, no documentos vivos. Las reglas completas de qué va en cada documento están en docs/GUIDE.md, que hay que leer antes de crear o modificar cualquiera.