SPRINT CONTEXT — eVault
Actualizado: 3 de agosto de 2026
Estado: Iteración 3 cerrada. Iteración 4 sin planificar.

Nota de formato: este documento está escrito en prosa plana sin Markdown, siguiendo la convención del proyecto para instrucciones dirigidas a Claude Code.

Este archivo es el puente entre sesiones y se lee entero al empezar. Por eso es corto, y hay que mantenerlo corto: creció hasta las cuatrocientas cincuenta líneas durante la Iteración 1 y dejó de cumplir su función, porque lo único que se leía eran las últimas veinte. Lo que no cabe aquí vive en otro sitio y se enlaza.

Qué NO se escribe aquí. Ni qué issues están cerrados ni cuál es el siguiente: eso se lee en docs/planning/STATUS.md, que se genera desde GitHub. Ni el entorno local, que está en docs/development/SETUP.md. Ni el historial de lo ya hecho, que se archiva por iteración en docs/planning/archive/. Una copia se desincroniza siempre, porque nada obliga a actualizarla.


QUÉ ES eVault

eVault es un gestor de contraseñas y secretos personales con modelo zero-knowledge. El servidor nunca puede leer los datos del usuario: toda la criptografía ocurre en el cliente antes de que los datos salgan del dispositivo, y la base de datos solo almacena blobs cifrados opacos.

El producto se concibe como SaaS con opción de self-hosting para planes Enterprise, con planes Free y Team. Los clientes previstos son una SPA web, una app nativa iOS/Android y una extensión de navegador Firefox. Ahora mismo solo se está construyendo la web.

El proyecto reutiliza deliberadamente la arquitectura, los patrones y el workflow de eBudget, un proyecto anterior del mismo desarrollador. Lo que cambia respecto a eBudget es que el frontend de la vault es una SPA React con cifrado en cliente, mientras que Filament queda reservado para el panel de administración de plataforma.


DÓNDE ENCONTRAR CADA COSA

Estado del backlog, prioridades y dependencias: docs/planning/STATUS.md, generado desde GitHub.
Entorno local, stack, versiones y arranque: docs/development/SETUP.md.
Por qué el proyecto está construido así: los ocho ADR en docs/architecture/decisions.
Historial de iteraciones cerradas y sus lecciones: docs/planning/archive.
Comandos, URLs y workflow git: CLAUDE.md en la raíz.
Reglas de la propia documentación: docs/GUIDE.md.

IDIOMA DEL CÓDIGO

Los identificadores en inglés, la prosa en español: lo que ejecuta la máquina en inglés, lo que lee una persona en español. En español siguen los comentarios, los nombres de los tests, los textos de interfaz y los títulos de issues y commits. La regla está en CLAUDE.md y rige desde el 2 de agosto de 2026. Lo escrito antes está mayormente en español en el frontend y en inglés en la API; migrarlo es el issue 97, y mientras tanto no se renombra de paso al tocar un fichero antiguo.


DECISIONES DE ARQUITECTURA CERRADAS

Desde el issue #9 estas decisiones están registradas como ADR en docs/architecture/decisions, y esos documentos son la fuente de verdad. Lo que sigue es un resumen para no obligar a abrirlos en cada sesión, pero si el resumen y el ADR se contradicen, manda el ADR. Los ADR son inmutables: si una decisión cambia, se escribe uno nuevo que la supersede, no se edita el viejo.

Los seis primeros están numerados por profundidad arquitectónica y no por fecha, de la decisión más fundacional a la más superficial. ADR-001 zero-knowledge, ADR-002 React para la vault y Filament solo para administración, ADR-003 monorepo, ADR-004 multi-tenancy sin Spatie teams, ADR-005 arquitectura self-hosteable, ADR-006 TypeScript 6. A partir del 007 la numeración es cronológica: ADR-007 token de sesión solo en memoria, ADR-008 arquitectura de claves de la vault.

Zero-knowledge, ADR-001. La contraseña maestra nunca sale del cliente. El cliente deriva con PBKDF2 dos valores a partir de ella: una clave de cifrado que nunca abandona el dispositivo, y un hash de autenticación que sí se envía al servidor para verificar identidad. Los vault items se cifran con AES-256-GCM en el cliente antes de cada petición.

React para la vault, Filament solo para administración, ADR-002. Filament es server-side rendering, así que haría pasar los datos por PHP y rompería la garantía de zero-knowledge. Para el panel de plataforma, donde no se manejan secretos de usuarios, Filament sigue siendo la elección correcta por velocidad de desarrollo.

Monorepo, ADR-003, con API y panel admin en el mismo proyecto Laravel, y el frontend React como proyecto separado dentro del mismo repositorio. Las rutas de API y de admin están completamente separadas.

Token de sesión solo en memoria, ADR-007, ya implementado. El argumento no es que localStorage sea inseguro en abstracto, sino que la clave de cifrado no se puede persistir de ninguna forma, así que al recargar hay que reintroducir la contraseña maestra igualmente: persistir el token solo mantendría viva una sesión incapaz de enseñar contenido. Recargar dejó de ser una expulsión y pasó a ser el bloqueo de la vault. No tocó la API.

Arquitectura de claves, ADR-008, ya implementado. PBKDF2 deriva del par contraseña maestra y correo una clave maestra que no cifra ningún item: su único trabajo es envolver una clave de vault aleatoria de 256 bits, que es la que cifra de verdad con AES-256-GCM. Así, cambiar la contraseña maestra es reenvolver un blob en vez de recifrar la vault entera, y las vaults compartidas caben sin rediseñar porque la misma clave se envuelve una vez por miembro. Por eso la clave envuelta vive en vault_members, que es lo que describe cómo abre una persona una vault concreta. El hash de autenticación se deriva de la clave maestra usando la contraseña como salt, viaja en el campo password que ya existe y no permite obtener la clave de cifrado: quien lo capture consigue una sesión, no el contenido. El salt de la derivación es el correo, lo que evita un endpoint de prelogin que sería un oráculo de enumeración de cuentas, y el precio es que los parámetros KDF quedan fijos en el cliente. Se mantiene PBKDF2 con 600.000 iteraciones, y no Argon2id, porque crypto.subtle implementa el primero de forma nativa y el segundo exigiría un WASM de terceros ejecutando en el mismo origen que custodia la clave.

SaaS primero, pero con arquitectura self-hosteable desde el principio, ADR-005: sin URLs hardcodeadas, todo por variables de entorno, preparado para Docker.

Multi-tenancy siguiendo el patrón de eBudget, ADR-004. El tenant personal es un Vault; los equipos tienen una Organization con vaults compartidas. Todo query lleva vault_id y los servicios validan pertenencia. No se usa spatie/laravel-permission teams. El contexto activo se pasa explícito en cada llamada porque la API es stateless, a diferencia de eBudget que lo guardaba en sesión.

Dirección visual: línea Bitwarden y Linear. Superficies oscuras, un único color de acento usado con moderación, tipografía sobria con jerarquía por peso y tamaño, radios pequeños y consistentes. Sin gradientes, sin sombras pronunciadas, sin ilustraciones decorativas. El preset Nova de shadcn aporta espaciado compacto, iconos Lucide y tipografía Geist.

Dirección visual y TypeScript 6: la primera no tiene ADR porque no es una decisión técnica irreversible, sino una guía de estilo que puede evolucionar; vive aquí y en el sistema de diseño de web/. La segunda sí lo tiene, ADR-006, porque hay un bloqueador verificable detrás.



DÓNDE ESTAMOS

La Iteración 3 se cerró el 3 de agosto de 2026. eVault es ya lo que dice ser: un gestor de contraseñas zero-knowledge. El usuario se registra, entra, y guarda, consulta, edita, borra, copia y busca credenciales cifradas con AES-256-GCM en su vault personal. La contraseña maestra no sale del dispositivo, el token no se persiste y el servidor almacena blobs que no puede abrir, comprobado abriendo la fila en MySQL. Hay 169 tests en la API y 276 en la web, análisis estático en nivel max sin baseline, y CI en verde.

Ya no hay ninguna excepción viva al principio fundamental, y con ella desaparece la advertencia que encabezaba este documento durante dos iteraciones: la condición de no desplegar con datos reales queda levantada.

El detalle de qué se hizo y qué se aprendió está en docs/planning/archive/ITERACION_3.md, y conviene leerlo antes de tocar criptografía o el ciclo de sesión. El modelo de datos y el contrato del blob están en docs/architecture/FOUNDATION.md, lectura obligatoria antes de tocar la API o de añadir una columna a vault_items.

El mapa del cliente, para no tener que buscarlo: la primitiva criptográfica es lib/vault/cripto.ts, el único sitio que llama a crypto.subtle; encima está lib/vault/empaquetado.ts, que cifra y descifra el contenido de los items; la clave vive en lib/vault/claveEnMemoria.ts, un store sin persist; y abrirla es desbloquearVault, en lib/vault/desbloqueo.ts.


DEUDA CONOCIDA

Deuda sin issue no existe, así que aquí solo hay punteros. La lista viva es la de GitHub filtrando por el label deuda; esto es el resumen para no tener que ir a buscarlo.

Issue 97, los identificadores del código están en dos idiomas: la API en inglés y el frontend en español. La convención ya está escrita en CLAUDE.md y rige para todo lo nuevo; lo que falta es migrar lo anterior, por capas para que cada PR sea revisable. Cuidado al hacerlo con los campos del contrato de la API y con el nombre del store de localStorage: son cadenas y no símbolos, así que un renombrado los rompe sin que el compilador se entere.

Issue 91, el entorno local no puede ejecutar crypto.subtle. Ver el aviso de entorno de más abajo.

Issue 45, el bundle está en 657 kB en un solo chunk, sin code splitting ni rutas perezosas. WebCrypto es nativo y apenas lo movió. Es el primero de la lista para la iteración siguiente.

Issue 62, comprobaciones de documentación en los PR. Importa porque la regla de actualizar este mismo documento al cerrar un issue no la comprueba nadie, y durante la Iteración 2 se saltó tres veces.

Issue 21, master sin protección. No se puede resolver: GitHub no permite rulesets en repos privados de cuentas Free. Sigue abierto como constancia, no como trabajo, y el hook pre-push cubre el despiste.

No es deuda, aunque lo parezca: que el rate limiting cuente peticiones y no solo intentos fallidos. Se evaluó, se descartó con motivo y no hay intención de cambiarlo; está documentado en el código y en un test.


SIGUIENTE PASO

La Iteración 4 no está planificada. No hay un núcleo decidido de antemano como lo hubo en la 2 y en la 3, así que lo primero es decidir qué producto toca construir ahora que el cifrado está resuelto.

Lo que hay sobre la mesa, sin orden ni compromiso: cambio de contraseña maestra, que ADR-008 abarató a reenvolver un blob y que hoy no existe; clave de recuperación, que ADR-001 dejó apuntada como mitigación de que no haya recuperación; vaults compartidas y organizaciones, que es el plan Team y exige criptografía asimétrica; y el panel de administración con Filament, que ADR-002 reservó para plataforma. Aparte, la deuda de arriba.

AVISO DE ENTORNO, y es lo que más tiempo hace perder si no se sabe: crypto.subtle NO existe en app.evault.claude, porque la Web Crypto API exige contexto seguro y ese origen es http sobre un dominio que no es localhost. Hay que trabajar en localhost:5173, que los navegadores tratan como excepción. El fallo llega como Uncaught (in promise) sin mensaje, así que si algo de cripto revienta sin explicación, mirar primero la URL. Misma causa que deja al entorno sin navigator.clipboard. Issue 91.

Reglas que salieron de las tres iteraciones y que conviene mantener. Cuando la interfaz haga una promesa sobre seguridad, escribir el test que falla si la promesa deja de ser cierta; y si la garantía cambia de signo, invertir el test en vez de borrarlo, que ya ha pasado dos veces. Ver pasar un test no demuestra que sirva: se comprueba rompiendo el código a propósito, y en la Iteración 3 eso destapó dos tests que no detectaban nada. Y lo que promete la interfaz se verifica abriendo el navegador, porque las tres veces que mintió en el proyecto se descubrieron así y no en la suite.


CONVENCIONES DE TRABAJO

Git: una rama por issue con el formato tipo/número-descripcion-corta. Merge a master solo mediante PR con squash, un commit por issue. El cuerpo del PR incluye Closes seguido del número para que GitHub cierre el issue automáticamente. Se usa gh CLI.

Definition of Done: criterios de aceptación completos, tests en verde, RBAC validado donde aplique, PR mergeado y este documento actualizado. STATUS.md no hay que tocarlo, lo regenera el CI tras el merge. Los issues con UI se verifican en navegador antes de marcarse como hechos.

Patrones de código heredados de eBudget: servicios de aplicación con método handle que reciben identificadores explícitos y no acceden a sesión. Double guard, es decir validación en la capa de presentación y también en la capa de aplicación, nunca solo en una. DTOs tipados para transferir datos entre capas. Servicios idempotentes para operaciones de agregación. Tests de aislamiento cross-tenant en todos los servicios críticos.

