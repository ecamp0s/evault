SPRINT CONTEXT — eVault
Actualizado: 2 de agosto de 2026
Estado: Iteración 3 planificada y en curso.

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
Por qué el proyecto está construido así: los seis ADR en docs/architecture/decisions.
Historial de iteraciones cerradas y sus lecciones: docs/planning/archive.
Comandos, URLs y workflow git: CLAUDE.md en la raíz.
Reglas de la propia documentación: docs/GUIDE.md.

DECISIONES DE ARQUITECTURA CERRADAS

Desde el issue #9 estas decisiones están registradas como ADR en docs/architecture/decisions, y esos documentos son la fuente de verdad. Lo que sigue es un resumen para no obligar a abrirlos en cada sesión, pero si el resumen y el ADR se contradicen, manda el ADR. Los ADR son inmutables: si una decisión cambia, se escribe uno nuevo que la supersede, no se edita el viejo.

Los seis primeros están numerados por profundidad arquitectónica y no por fecha, de la decisión más fundacional a la más superficial. ADR-001 zero-knowledge, ADR-002 React para la vault y Filament solo para administración, ADR-003 monorepo, ADR-004 multi-tenancy sin Spatie teams, ADR-005 arquitectura self-hosteable, ADR-006 TypeScript 6. A partir del 007 la numeración es cronológica: ADR-007 token de sesión solo en memoria, ADR-008 arquitectura de claves de la vault.

Zero-knowledge, ADR-001. La contraseña maestra nunca sale del cliente. El cliente deriva con PBKDF2 dos valores a partir de ella: una clave de cifrado que nunca abandona el dispositivo, y un hash de autenticación que sí se envía al servidor para verificar identidad. Los vault items se cifran con AES-256-GCM en el cliente antes de cada petición.

React para la vault, Filament solo para administración, ADR-002. Filament es server-side rendering, así que haría pasar los datos por PHP y rompería la garantía de zero-knowledge. Para el panel de plataforma, donde no se manejan secretos de usuarios, Filament sigue siendo la elección correcta por velocidad de desarrollo.

Monorepo, ADR-003, con API y panel admin en el mismo proyecto Laravel, y el frontend React como proyecto separado dentro del mismo repositorio. Las rutas de API y de admin están completamente separadas.

Token de sesión solo en memoria, ADR-007, en vigor con la Iteración 3. El argumento no es que localStorage sea inseguro en abstracto, sino que la clave de cifrado no se puede persistir de ninguna forma, así que al recargar habrá que reintroducir la contraseña maestra igualmente: persistir el token solo mantendría viva una sesión incapaz de enseñar contenido. Recargar deja de ser una expulsión y pasa a ser el bloqueo de la vault. No toca la API. La implementación es el issue 73.

Arquitectura de claves, ADR-008, en vigor con la Iteración 3. PBKDF2 deriva del par contraseña maestra y correo una clave maestra que no cifra ningún item: su único trabajo es envolver una clave de vault aleatoria de 256 bits, que es la que cifra de verdad con AES-256-GCM. Así, cambiar la contraseña maestra es reenvolver un blob en vez de recifrar la vault entera, y las vaults compartidas caben sin rediseñar porque la misma clave se envuelve una vez por miembro. Por eso la clave envuelta vive en vault_members, que es lo que describe cómo abre una persona una vault concreta. El hash de autenticación se deriva de la clave maestra usando la contraseña como salt, viaja en el campo password que ya existe y no permite obtener la clave de cifrado: quien lo capture consigue una sesión, no el contenido. El salt de la derivación es el correo, lo que evita un endpoint de prelogin que sería un oráculo de enumeración de cuentas, y el precio es que los parámetros KDF quedan fijos en el cliente. Se mantiene PBKDF2 con 600.000 iteraciones, y no Argon2id, porque crypto.subtle implementa el primero de forma nativa y el segundo exigiría un WASM de terceros ejecutando en el mismo origen que custodia la clave.

Detalle de ADR-008 que no es evidente y cuesta caro: el correo es el salt, así que cliente y servidor tienen que normalizarlo igual, minúsculas y recorte. Si no, quien se registra con mayúsculas y entra sin ellas obtiene otro hash y recibe credenciales incorrectas, con todo el mundo mirando al login, que es el único sitio donde no está el problema.

SaaS primero, pero con arquitectura self-hosteable desde el principio, ADR-005: sin URLs hardcodeadas, todo por variables de entorno, preparado para Docker.

Multi-tenancy siguiendo el patrón de eBudget, ADR-004. El tenant personal es un Vault; los equipos tienen una Organization con vaults compartidas. Todo query lleva vault_id y los servicios validan pertenencia. No se usa spatie/laravel-permission teams. El contexto activo se pasa explícito en cada llamada porque la API es stateless, a diferencia de eBudget que lo guardaba en sesión.

Dirección visual: línea Bitwarden y Linear. Superficies oscuras, un único color de acento usado con moderación, tipografía sobria con jerarquía por peso y tamaño, radios pequeños y consistentes. Sin gradientes, sin sombras pronunciadas, sin ilustraciones decorativas. El preset Nova de shadcn aporta espaciado compacto, iconos Lucide y tipografía Geist.

Dirección visual y TypeScript 6: la primera no tiene ADR porque no es una decisión técnica irreversible, sino una guía de estilo que puede evolucionar; vive aquí y en el sistema de diseño de web/. La segunda sí lo tiene, ADR-006, porque hay un bloqueador verificable detrás.



DÓNDE ESTAMOS

La Iteración 2 se cerró el 2 de agosto de 2026 y la Iteración 3 se planificó ese mismo día. La aplicación es un gestor de contraseñas que funciona: el usuario se registra, entra, y guarda, consulta, edita, borra y copia credenciales en su vault personal. El servidor almacena blobs sin ninguna columna con significado y no puede deducir nada de ellos, ni siquiera en qué servicios tiene cuenta el usuario. Hay 146 tests en la API y 133 en la web, análisis estático en nivel max sin baseline, y CI en verde.

El detalle de qué se hizo y qué se aprendió está en docs/planning/archive/ITERACION_2.md. El modelo de datos y el contrato del blob están en docs/architecture/FOUNDATION.md, que es lectura obligatoria antes de tocar la API o de añadir una columna a vault_items.

Advertencia que manda sobre todo lo demás: el contenido de los items NO está cifrado. Viaja con una codificación reversible que cualquiera puede deshacer, y el servidor puede leer las contraseñas. Fue una decisión de alcance deliberada, la misma jugada que la autenticación convencional de la Iteración 1, para fijar el contrato antes de meter criptografía. Va con una condición que no es negociable: no desplegar con datos reales hasta que cierre la Iteración 3. Issue 59.


DEUDA CONOCIDA

Deuda sin issue no existe, así que aquí solo hay punteros. La lista viva es la de GitHub filtrando por el label deuda; esto es el resumen para no tener que ir a buscarlo.

Tres de las cuatro entraron en la Iteración 3 y se resuelven dentro de ella: el issue 59, que el contenido no esté cifrado y que es su núcleo; el 73, el token en localStorage, que va con el desbloqueo porque hacerlo antes expulsaría al usuario en cada recarga sin nada que se lo explique; y el 77, la Content-Security-Policy, que entra porque a partir de ahora el cliente tiene la clave de cifrado en memoria.

Queda fuera el issue 45: el bundle está en 651 kB en un solo chunk, sin code splitting ni rutas perezosas. WebCrypto es nativo y no añade peso, así que aplazarlo no cuesta nada. Es el primero de la lista para la iteración siguiente.

Fuera de la deuda pero también aplazado, el issue 62, comprobaciones de documentación en los PR. Importa porque la regla de actualizar este mismo documento al cerrar un issue no la comprueba nadie, y durante la Iteración 2 se saltó tres veces.

No es deuda, aunque lo parezca: que el rate limiting cuente peticiones y no solo intentos fallidos. Se evaluó, se descartó con motivo y no hay intención de cambiarlo; está documentado en el código y en un test.


SIGUIENTE PASO

El ADR-008 está cerrado, así que lo siguiente son los issues 81 y 82, que ya no se bloquean entre sí y pueden ir en paralelo: el módulo criptográfico del cliente con sus tests, y la clave envuelta en el servidor. Encima van registro (83), login (84), cifrado real de los items (59) y bloqueo de la vault (73). Fuera de la cadena y tomables desde ya: el trigger del workflow status (63), la CSP (77), el generador de contraseñas (85) y la búsqueda de items (86), esta última después del 59.

Si hay que elegir uno para empezar, el 81: es el que concentra el riesgo, y el 82 se escribe mejor sabiendo qué forma tienen exactamente los blobs que va a guardar.

Aviso de ADR-001 que conviene tener delante desde el primer issue: el coste de un bug criptográfico en el cliente es pérdida de datos irreversible, no un error recuperable. De ahí que el módulo criptográfico se escriba con sus tests antes que ninguna pantalla que lo use, y contra el módulo desnudo: probar cifrado a través de un formulario mide el formulario. El suelo del que partir son los tests de lib/vault/sinCifrar.test.ts.

Dos detalles que salen de leer el código y que se olvidan si no están escritos. El test de ListaDeItems.test.tsx que comprueba que la interfaz no promete cifrado hay que invertirlo al cerrar el 59: existe para fallar mientras la promesa sea mentira, y pasa a fallar si la promesa desaparece cuando ya es cierta. Y ADR-001 exige avisar de forma inequívoca de que no hay recuperación de la contraseña maestra antes de que el usuario cree su vault; hoy eso no está en ninguna parte y entra en el issue 83.

Los datos de desarrollo se descartan con migrate:fresh, no se migran: no hay ruta honesta desde una contraseña hasheada por el servidor hacia una clave derivada en cliente. Lo hace legítimo la condición de no desplegar con datos reales.

Dos cosas de la web que conviene saber antes de tocarla. La codificación del blob vive en un único fichero, lib/vault/sinCifrar.ts, y su nombre es el mensaje: hoy no cifra, y la Iteración 3 sustituye ese fichero y ningún otro. Y copiar al portapapeles tiene dos caminos porque el entorno local sirve por http, donde navigator.clipboard no existe; el plan B con execCommand funciona para copiar pero no para el vaciado diferido, porque exige un gesto del usuario, así que ese vaciado solo ocurrirá en producción bajo https.

Regla que salió de la Iteración 2 y que conviene mantener: cuando la interfaz haga una promesa sobre seguridad, escribir el test que falla si la promesa deja de ser cierta. Las dos veces que la interfaz mintió en esta iteración se detectaron abriendo el navegador, no en la suite.

CONVENCIONES DE TRABAJO

Git: una rama por issue con el formato tipo/número-descripcion-corta. Merge a master solo mediante PR con squash, un commit por issue. El cuerpo del PR incluye Closes seguido del número para que GitHub cierre el issue automáticamente. Se usa gh CLI.

Definition of Done: criterios de aceptación completos, tests en verde, RBAC validado donde aplique, PR mergeado y este documento actualizado. STATUS.md no hay que tocarlo, lo regenera el CI tras el merge. Los issues con UI se verifican en navegador antes de marcarse como hechos.

Patrones de código heredados de eBudget: servicios de aplicación con método handle que reciben identificadores explícitos y no acceden a sesión. Double guard, es decir validación en la capa de presentación y también en la capa de aplicación, nunca solo en una. DTOs tipados para transferir datos entre capas. Servicios idempotentes para operaciones de agregación. Tests de aislamiento cross-tenant en todos los servicios críticos.

