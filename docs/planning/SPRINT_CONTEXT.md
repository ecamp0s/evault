SPRINT CONTEXT — eVault
Actualizado: 3 de agosto de 2026
Estado: Iteración 4 planificada y en curso. La 3 se cerró el 3 de agosto de 2026.

Nota de formato: este documento está escrito en prosa plana sin Markdown, siguiendo la convención del proyecto para instrucciones dirigidas a Claude Code.

Este archivo es el puente entre sesiones y se lee entero al empezar. Por eso es corto, y hay que mantenerlo corto: creció hasta las cuatrocientas cincuenta líneas durante la Iteración 1 y dejó de cumplir su función, porque lo único que se leía eran las últimas veinte. Lo que no cabe aquí vive en otro sitio y se enlaza.

Qué NO se escribe aquí. Ni qué issues están cerrados ni cuál es el siguiente: eso se lee en docs/planning/STATUS.md, que se genera desde GitHub. Ni el entorno local, que está en docs/development/SETUP.md. Ni el historial de lo ya hecho, que se archiva por iteración en docs/planning/archive/. Una copia se desincroniza siempre, porque nada obliga a actualizarla.


QUÉ ES eVault

eVault es un gestor de contraseñas y secretos personales con modelo zero-knowledge. El servidor nunca puede leer los datos del usuario: toda la criptografía ocurre en el cliente antes de que los datos salgan del dispositivo, y la base de datos solo almacena blobs cifrados opacos.

CAMBIO DE RUMBO, 3 de agosto de 2026: eVault NO se va a comercializar. Lo que había escrito aquí hasta hoy —SaaS con planes Free, Team y Enterprise— ya no aplica. Los dos propósitos reales son que el desarrollador lo use para sus propias contraseñas en una instancia self-hosted, y que el repositorio sea público y sirva como muestra de trabajo en procesos de selección. Quien lo lea estará evaluando criterio técnico: código, decisiones de seguridad, arquitectura y documentación.

Lo que eso implica, y conviene tenerlo claro antes de retomar nada. El self-hosting deja de ser el plan Enterprise y pasa a ser el único modo de despliegue, así que ADR-005 gana importancia en lugar de perderla. Sale del alcance todo lo que existía solo por el negocio: vaults compartidas, organizaciones, plan Team y el panel Filament de administración de plataforma, que nunca llegó a instalarse. El multi-tenancy ya construido no se retira, porque el aislamiento cross-tenant con sus tests es precisamente lo que hay que poder enseñar. Y suben de prioridad el README, el arranque reproducible, el export y el backup. Los ADR son inmutables, así que el cambio se registrará en un ADR nuevo y no editando los existentes; ese ADR está pendiente.

Los clientes previstos siguen siendo una SPA web, una app nativa iOS/Android y una extensión de navegador, esta última para Chrome y no para Firefox como se dijo al principio. Ahora mismo solo se está construyendo la web.

El proyecto reutiliza deliberadamente la arquitectura, los patrones y el workflow de un proyecto anterior del mismo desarrollador, que no es público. Lo que cambia respecto a aquel es que el frontend de la vault es una SPA React con cifrado en cliente.


DÓNDE ENCONTRAR CADA COSA

Estado del backlog, prioridades y dependencias: docs/planning/STATUS.md, generado desde GitHub.
Entorno local, stack, versiones y arranque: docs/development/SETUP.md.
Por qué el proyecto está construido así: los once ADR en docs/architecture/decisions.
Historial de iteraciones cerradas y sus lecciones: docs/planning/archive.
Comandos, URLs y workflow git: CLAUDE.md en la raíz.
Reglas de la propia documentación: docs/GUIDE.md.

IDIOMA DEL CÓDIGO

Los identificadores en inglés, la prosa en español: lo que ejecuta la máquina en inglés, lo que lee una persona en español. En español siguen los comentarios, los nombres de los tests, los textos de interfaz y los títulos de issues y commits. La regla está en CLAUDE.md y rige desde el 2 de agosto de 2026. La migración de lo anterior terminó el 4 de agosto de 2026, issue 97, hecha por capas en los issues 115 a 119. CLAUDE.md recoge además qué NO se traduce y por qué: hay cosas que parecen identificadores y son datos.


DECISIONES DE ARQUITECTURA CERRADAS

Desde el issue #9 estas decisiones están registradas como ADR en docs/architecture/decisions, y esos documentos son la fuente de verdad. Lo que sigue es un resumen para no obligar a abrirlos en cada sesión, pero si el resumen y el ADR se contradicen, manda el ADR. Los ADR son inmutables: si una decisión cambia, se escribe uno nuevo que la supersede, no se edita el viejo.

Los seis primeros están numerados por profundidad arquitectónica y no por fecha, de la decisión más fundacional a la más superficial. ADR-001 zero-knowledge, ADR-002 React para la vault y Filament solo para administración, ADR-003 monorepo, ADR-004 multi-tenancy sin Spatie teams, ADR-005 arquitectura self-hosteable, ADR-006 TypeScript 6. A partir del 007 la numeración es cronológica: ADR-007 token de sesión solo en memoria, ADR-008 arquitectura de claves de la vault, ADR-009 el proyecto deja de ser un SaaS, ADR-010 clave de recuperación, ADR-011 formato de export e import.

Zero-knowledge, ADR-001. La contraseña maestra nunca sale del cliente. El cliente deriva con PBKDF2 dos valores a partir de ella: una clave de cifrado que nunca abandona el dispositivo, y un hash de autenticación que sí se envía al servidor para verificar identidad. Los vault items se cifran con AES-256-GCM en el cliente antes de cada petición.

React para la vault, Filament solo para administración, ADR-002. Filament es server-side rendering, así que haría pasar los datos por PHP y rompería la garantía de zero-knowledge. Para el panel de plataforma, donde no se manejan secretos de usuarios, Filament sigue siendo la elección correcta por velocidad de desarrollo.

Monorepo, ADR-003, con API y panel admin en el mismo proyecto Laravel, y el frontend React como proyecto separado dentro del mismo repositorio. Las rutas de API y de admin están completamente separadas.

Token de sesión solo en memoria, ADR-007, ya implementado. El argumento no es que localStorage sea inseguro en abstracto, sino que la clave de cifrado no se puede persistir de ninguna forma, así que al recargar hay que reintroducir la contraseña maestra igualmente: persistir el token solo mantendría viva una sesión incapaz de enseñar contenido. Recargar dejó de ser una expulsión y pasó a ser el bloqueo de la vault. No tocó la API.

Arquitectura de claves, ADR-008, ya implementado. PBKDF2 deriva del par contraseña maestra y correo una clave maestra que no cifra ningún item: su único trabajo es envolver una clave de vault aleatoria de 256 bits, que es la que cifra de verdad con AES-256-GCM. Así, cambiar la contraseña maestra es reenvolver un blob en vez de recifrar la vault entera, y las vaults compartidas caben sin rediseñar porque la misma clave se envuelve una vez por miembro. Por eso la clave envuelta vive en vault_members, que es lo que describe cómo abre una persona una vault concreta. El hash de autenticación se deriva de la clave maestra usando la contraseña como salt, viaja en el campo password que ya existe y no permite obtener la clave de cifrado: quien lo capture consigue una sesión, no el contenido. El salt de la derivación es el correo, lo que evita un endpoint de prelogin que sería un oráculo de enumeración de cuentas, y el precio es que los parámetros KDF quedan fijos en el cliente. Se mantiene PBKDF2 con 600.000 iteraciones, y no Argon2id, porque crypto.subtle implementa el primero de forma nativa y el segundo exigiría un WASM de terceros ejecutando en el mismo origen que custodia la clave.

Rotación de la contraseña maestra, ADR-008, con la mitad de servidor construida en el issue 124: PUT /api/auth/master-password reescribe el hash y reenvuelve la clave de todas las vaults en una transacción, sin tocar un solo item. Exige el hash actual además de la sesión, y revoca los demás tokens conservando el de la petición. El servicio no verifica identidad a propósito, porque lo van a usar dos caminos: este y la recuperación del 128, que llega con un token de un solo uso y no puede aportar un hash actual.

Clave de recuperación, ADR-010, con el servidor en el issue 126 y la generación en el cliente en el 127. Falta usarla para recuperar, que es el 128. Dos cosas del 127 que conviene saber antes de tocar eso: la clave de vault se importa NO extraíble, así que para envolverla con la clave de recuperación no vale leerla de memoria —hay que abrir el envoltorio que ya existe, y eso exige la clave maestra, por lo que generar la clave de recuperación pide la contraseña; y el carácter de comprobación del final detecta un carácter cambiado y también dos intercambiados, porque la suma va sobre los bytes y no sobre los caracteres, aunque no cubre el 100% y lo que cuela lo caza el envoltorio al no abrir. Es la mitigación que ADR-001 dejó prometida para el único agujero duro del modelo: olvidar la contraseña maestra. Se genera en el cliente un secreto aleatorio de 256 bits que envuelve la MISMA clave de vault que envuelve la clave maestra, así que recuperar no recifra nada y es el mismo movimiento que ADR-008 previó para las vaults compartidas. De ese secreto salen dos valores independientes con HKDF y etiquetas de dominio distintas: uno envuelve y otro autentica, de modo que lo que viaja al servidor no compromete lo que abre la vault. No se estira con PBKDF2 a propósito, porque no es una contraseña humana y no hay diccionario que probar. Tres cosas que conviene no olvidar al implementarlo: rotar la contraseña maestra NO invalida la clave de recuperación, porque la clave de vault no cambia, así que quien sospeche un robo tiene que regenerarla aparte; recuperar no termina hasta fijar una contraseña maestra nueva, reutilizando el servicio de rotación y no reimplementándolo; y el endpoint de recuperación no puede distinguir un correo inexistente de una clave incorrecta, ni siquiera por el tiempo de respuesta.

Formato de export e import, ADR-011, decidido y sin implementar. Dos formatos con propósitos distintos que no se solapan: uno cifrado con extensión .evault, que es el de por defecto y sirve de copia de seguridad y de traslado entre instancias, y CSV en claro, que existe para que el usuario pueda irse a otro gestor y no quede atrapado. El fichero cifrado es autodescriptivo: versión, algoritmo, salt aleatorio e iteraciones viajan dentro. Eso es lo contrario de lo que hizo ADR-008 con la vault, y no se contradicen: allí los parámetros quedaron fijos en el cliente para no abrir un oráculo de enumeración, y el precio fue que subirlos deja fuera a los ya registrados; un fichero no tiene ese problema porque lleva los suyos. La passphrase del export es distinta de la contraseña maestra a propósito, porque la copia tiene que servir el día que se pierde justo esa contraseña. El import AÑADE y nunca sustituye ni borra: no hay identificador estable entre dos instancias, así que fusionar solo puede ser una heurística, y una heurística que se equivoca pierde datos en silencio. Lo que no cabe en los cinco campos del item se conserva en notas, etiquetado y contado, nunca descartado sin decirlo. Impacto en la API: ninguno, y no por suerte, sino porque el servidor no puede participar en ninguna de las dos operaciones.

SaaS primero, pero con arquitectura self-hosteable desde el principio, ADR-005: sin URLs hardcodeadas, todo por variables de entorno, preparado para Docker.

Multi-tenancy siguiendo el patrón del proyecto anterior, ADR-004. El tenant personal es un Vault; los equipos tienen una Organization con vaults compartidas. Todo query lleva vault_id y los servicios validan pertenencia. No se usa spatie/laravel-permission teams. El contexto activo se pasa explícito en cada llamada porque la API es stateless, a diferencia de aquel proyecto, que lo guardaba en sesión.

Dirección visual: línea Bitwarden y Linear. Superficies oscuras, un único color de acento usado con moderación, tipografía sobria con jerarquía por peso y tamaño, radios pequeños y consistentes. Sin gradientes, sin sombras pronunciadas, sin ilustraciones decorativas. El preset Nova de shadcn aporta espaciado compacto, iconos Lucide y tipografía Geist.

Dirección visual y TypeScript 6: la primera no tiene ADR porque no es una decisión técnica irreversible, sino una guía de estilo que puede evolucionar; vive aquí y en el sistema de diseño de web/. La segunda sí lo tiene, ADR-006, porque hay un bloqueador verificable detrás.



DÓNDE ESTAMOS

La Iteración 3 se cerró el 3 de agosto de 2026. eVault es ya lo que dice ser: un gestor de contraseñas zero-knowledge. El usuario se registra, entra, y guarda, consulta, edita, borra, copia y busca credenciales cifradas con AES-256-GCM en su vault personal. La contraseña maestra no sale del dispositivo, el token no se persiste y el servidor almacena blobs que no puede abrir, comprobado abriendo la fila en MySQL. Hay 198 tests en la API y 283 en la web, análisis estático en nivel max sin baseline, y CI en verde.

Ya no hay ninguna excepción viva al principio fundamental, y con ella desaparece la advertencia que encabezaba este documento durante dos iteraciones: la condición de no desplegar con datos reales queda levantada.

El detalle de qué se hizo y qué se aprendió está en docs/planning/archive/ITERACION_3.md, y conviene leerlo antes de tocar criptografía o el ciclo de sesión. El modelo de datos y el contrato del blob están en docs/architecture/FOUNDATION.md, lectura obligatoria antes de tocar la API o de añadir una columna a vault_items.

El mapa del cliente, para no tener que buscarlo: la primitiva criptográfica es lib/vault/cripto.ts, el único sitio que llama a crypto.subtle; encima está lib/vault/empaquetado.ts, que cifra y descifra el contenido de los items; la clave vive en lib/vault/claveEnMemoria.ts, un store sin persist; y abrirla es desbloquearVault, en lib/vault/desbloqueo.ts.


DEUDA CONOCIDA

Deuda sin issue no existe, así que aquí solo hay punteros. La lista viva es la de GitHub filtrando por el label deuda; esto es el resumen para no tener que ir a buscarlo.

El issue 97, los identificadores del código en dos idiomas, quedó CERRADO el 4 de agosto de 2026. Se hizo por capas en los issues 115 a 119: lib/vault, lib, components, pages y la API. Lo que aprendió está recogido en CLAUDE.md, en la sección de idioma del código, y conviene leerlo antes de renombrar nada más: hay cosas que parecen identificadores y son datos —los campos del blob, el store de localStorage y su clave interna, y la clave que los guards escriben en el state de react-router—, y renombrarlas rompe algo que ningún compilador vigila. En el frontend, además, proteger comentarios y cadenas no basta: hacen falta el texto JSX, sus fragmentos partidos por interpolaciones y los regex literales de los tests. Y la comprobación tiene que leer el texto JSX CRUZANDO SALTOS DE LÍNEA, porque si no se le escapa justo lo que más se ve: al cerrar el 119 aparecieron tres frases rotas —«antes de logOut de él», «Al close o recargar», «Tus data siguen aquí»— que llevaban en master desde el 116 y el 118 y que ninguna auditoría línea a línea había detectado. Las encontró abrir el navegador, que es la regla de siempre.

El issue 91, el entorno local no puede ejecutar crypto.subtle, quedó resuelto el 3 de agosto de 2026 al mover el entorno a .localhost. Ver más abajo.

Issue 45, el bundle está en 663 kB en un solo chunk, sin code splitting ni rutas perezosas. WebCrypto es nativo y apenas lo movió. Se quedó fuera de la Iteración 4 a propósito: por el criterio de ADR-009 esto es pulido y no fiabilidad, y un bundle grande no impide usar el producto. Sigue abierto y sin prioridad nueva.

Issue 62, comprobaciones de documentación en los PR. Importa porque la regla de actualizar este mismo documento al cerrar un issue no la comprueba nadie, y durante la Iteración 2 se saltó tres veces.

El issue 21, master sin protección, quedó resuelto el 3 de agosto de 2026 al hacerse público el repositorio, porque GitHub sí admite rulesets en repos públicos de cuentas Free. Hay un ruleset activo sobre master que impide borrarla y reescribir su historia, y que nadie puede saltarse porque vive en el servidor. Lo que no exige es que los cambios pasen por pull request, y conviene saber por qué antes de intentar añadirlo: GitHub no permite dar bypass a GitHub Actions en un repositorio personal, solo en organizaciones, así que la regla mata el push con que el workflow status regenera STATUS.md. Se comprobó activándola, y el push murió con GH013. Se eligió conservar la automatización; el push directo a master lo sigue cubriendo el hook pre-push.

No es deuda, aunque lo parezca: que el rate limiting cuente peticiones y no solo intentos fallidos. Se evaluó, se descartó con motivo y no hay intención de cambiarlo; está documentado en el código y en un test.


SIGUIENTE PASO

La Iteración 4 se planificó el 3 de agosto de 2026 en el issue 114, y su objetivo es que eVault deje de ser una vault en la que da miedo meter contraseñas reales: que se pueda sacar lo que hay dentro, entrar si se pierde la contraseña, y rotarla sin recifrar nada. No es un objetivo inventado para llenar un sprint. ADR-001 planificó el proyecto por fases en la Iteración 1, y su fase 4 decía literalmente clave de recuperación, rotación de contraseña maestra y criptografía asimétrica para vaults compartidas; esta iteración es esa fase, menos la parte asimétrica que ADR-009 sacó del alcance. El criterio de orden es el de ADR-009: primero lo que hace el producto fiable para quien lo usa de verdad, después lo que lo hace legible, y solo después funcionalidad nueva.

El alcance, por bloques y en orden de dependencia. Cero, el issue 110 configura el repositorio ahora que es público y cierra el 21. Uno, la migración de identificadores a inglés, issues 115 a 119. Dos, las decisiones antes del código: ADR-010 para la clave de recuperación en el issue 120 y ADR-011 para el formato de export e import en el 121. Tres, sacar los datos: export en el 122 e import en el 123. Cuatro, rotar la contraseña maestra: API en el 124 y cliente en el 125. Cinco, la clave de recuperación: API en el 126, generarla en el 127 y usarla en el 128. Seis, backup y restauración en el 129. El cierre es el 130.

La decisión de secuenciación que hay que respetar, porque no se ve en el grafo de dependencias sin leer el porqué: la migración de idiomas va ANTES que el código nuevo. Los bloques tres, cuatro y cinco tocan lib/vault, lib, pages/vault y pages/auth, que son exactamente las capas en español. Migrar después significaría renombrar código recién escrito y resolver conflictos entre PR grandes.

Cuatro decisiones tomadas al planificar, para no rediscutirlas. El import entra aunque no estaba en el planteamiento inicial, porque sin él meter las contraseñas reales significa teclearlas a mano una por una, y es lo primero que se cae si la iteración se alarga. La clave de recuperación se ofrece en el registro y hay que rechazarla explícitamente, porque una garantía que casi todo el mundo se salta no existe. El backup es un comando del servidor y no un export automático del cliente, porque un backup que depende de que alguien abra el navegador no es un backup; y como los blobs ya salen cifrados, la copia se puede sacar de la máquina sin ceremonia, que es un dividendo de ADR-001 que casi nunca se cobra. Y cambiar la contraseña maestra no invalida el envoltorio de recuperación, porque la clave de vault no cambia: quien robe la clave de recuperación no queda expulsado al cambiar la contraseña, y por eso hay que poder regenerarla.

Quedan fuera a propósito, y conviene no reabrirlos por inercia: la demo pública y el screenshot del README, que van juntos y son la iteración siguiente; el issue 45 del bundle y el 62 de las comprobaciones de documentación; y el cambio de correo electrónico, que no es pequeño porque el correo es el salt de la derivación y cambiarlo obliga a re-derivar y reenvolver. Y del cambio de rumbo: vaults compartidas, organizaciones y el panel Filament.

Del arranque en un clon, que fue el issue 107, salió una lección que vale para todo lo que viene: lo que hay que probar no es el camino feliz sino el paso que alguien se salta. Ahí el paso saltado era copiar el .env y el síntoma una página en blanco muda; en esta iteración los pasos que alguien se salta son guardar la clave de recuperación y comprobar que un backup restaura.

El repositorio es público desde el 3 de agosto de 2026 y pasó a llamarse evault, sin el sufijo. El historial se auditó antes de publicar y está limpio, nunca hubo un .env versionado. Sigue sin descripción, sin topics y con el escaneo de secretos desactivado, que es lo que resuelve el issue 110. Ahí está anotada la trampa del ruleset: el workflow status escribe en master, así que uno que exija pull request deja al bot sin poder regenerar STATUS.md si no se le da bypass.

EL AVISO DE ENTORNO QUE ENCABEZABA ESTA SECCIÓN DESDE LA ITERACIÓN 3 YA NO APLICA, y conviene decirlo porque era lo que más tiempo hacía perder: crypto.subtle no existía en app.evault.claude y había que irse a localhost:5173 para cualquier cosa de criptografía. El entorno se movió a app.evault.localhost, que sí es contexto seguro porque la especificación trata como de confianza todo host que termine en .localhost, así que ahí funcionan crypto.subtle y navigator.clipboard sin certificado. Una sola URL sirve para todo y el issue 91 quedó cerrado. El porqué está en SETUP.md, y hay que leerlo antes de proponer .test u otro dominio: .test está igual de reservado pero no da contexto seguro.

Reglas que salieron de las tres iteraciones y que conviene mantener. Cuando la interfaz haga una promesa sobre seguridad, escribir el test que falla si la promesa deja de ser cierta; y si la garantía cambia de signo, invertir el test en vez de borrarlo, que ya ha pasado dos veces. Ver pasar un test no demuestra que sirva: se comprueba rompiendo el código a propósito, y en la Iteración 3 eso destapó dos tests que no detectaban nada. Y lo que promete la interfaz se verifica abriendo el navegador, porque las tres veces que mintió en el proyecto se descubrieron así y no en la suite.


CONVENCIONES DE TRABAJO

Git: una rama por issue con el formato tipo/número-descripcion-corta. Merge a master solo mediante PR con squash, un commit por issue. El cuerpo del PR incluye Closes seguido del número para que GitHub cierre el issue automáticamente. Se usa gh CLI.

Definition of Done: criterios de aceptación completos, tests en verde, RBAC validado donde aplique, PR mergeado y este documento actualizado. STATUS.md no hay que tocarlo, lo regenera el CI tras el merge. Los issues con UI se verifican en navegador antes de marcarse como hechos.

Patrones de código heredados del proyecto anterior: servicios de aplicación con método handle que reciben identificadores explícitos y no acceden a sesión. Double guard, es decir validación en la capa de presentación y también en la capa de aplicación, nunca solo en una. DTOs tipados para transferir datos entre capas. Servicios idempotentes para operaciones de agregación. Tests de aislamiento cross-tenant en todos los servicios críticos.

