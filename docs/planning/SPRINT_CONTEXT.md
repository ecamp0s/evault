SPRINT CONTEXT — eVault
Actualizado: 31 de julio de 2026
Estado: Iteración 1 cerrada. Iteración 2 planificada, sin empezar.

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

Los seis primeros están numerados por profundidad arquitectónica y no por fecha, de la decisión más fundacional a la más superficial. ADR-001 zero-knowledge, ADR-002 React para la vault y Filament solo para administración, ADR-003 monorepo, ADR-004 multi-tenancy sin Spatie teams, ADR-005 arquitectura self-hosteable, ADR-006 TypeScript 6. A partir del 007 la numeración es cronológica: ADR-007 token de sesión solo en memoria.

Zero-knowledge, ADR-001. La contraseña maestra nunca sale del cliente. El cliente deriva con PBKDF2 dos valores a partir de ella: una clave de cifrado que nunca abandona el dispositivo, y un hash de autenticación que sí se envía al servidor para verificar identidad. Los vault items se cifran con AES-256-GCM en el cliente antes de cada petición.

React para la vault, Filament solo para administración, ADR-002. Filament es server-side rendering, así que haría pasar los datos por PHP y rompería la garantía de zero-knowledge. Para el panel de plataforma, donde no se manejan secretos de usuarios, Filament sigue siendo la elección correcta por velocidad de desarrollo.

Monorepo, ADR-003, con API y panel admin en el mismo proyecto Laravel, y el frontend React como proyecto separado dentro del mismo repositorio. Las rutas de API y de admin están completamente separadas.

Token de sesión solo en memoria, ADR-007, en vigor con la Iteración 3. El argumento no es que localStorage sea inseguro en abstracto, sino que la clave de cifrado no se puede persistir de ninguna forma, así que al recargar habrá que reintroducir la contraseña maestra igualmente: persistir el token solo mantendría viva una sesión incapaz de enseñar contenido. Recargar deja de ser una expulsión y pasa a ser el bloqueo de la vault. No toca la API. La implementación es el issue 73.

SaaS primero, pero con arquitectura self-hosteable desde el principio, ADR-005: sin URLs hardcodeadas, todo por variables de entorno, preparado para Docker.

Multi-tenancy siguiendo el patrón de eBudget, ADR-004. El tenant personal es un Vault; los equipos tienen una Organization con vaults compartidas. Todo query lleva vault_id y los servicios validan pertenencia. No se usa spatie/laravel-permission teams. El contexto activo se pasa explícito en cada llamada porque la API es stateless, a diferencia de eBudget que lo guardaba en sesión.

Dirección visual: línea Bitwarden y Linear. Superficies oscuras, un único color de acento usado con moderación, tipografía sobria con jerarquía por peso y tamaño, radios pequeños y consistentes. Sin gradientes, sin sombras pronunciadas, sin ilustraciones decorativas. El preset Nova de shadcn aporta espaciado compacto, iconos Lucide y tipografía Geist.

Dirección visual y TypeScript 6: la primera no tiene ADR porque no es una decisión técnica irreversible, sino una guía de estilo que puede evolucionar; vive aquí y en el sistema de diseño de web/. La segunda sí lo tiene, ADR-006, porque hay un bloqueador verificable detrás.



DÓNDE ESTAMOS

La Iteración 1 se cerró el 30 de julio de 2026. El ciclo completo de autenticación funciona de punta a punta: la SPA registra, entra, mantiene sesión por token tras recargar, y sale revocando el token en el servidor. Un 401 en cualquier petición expulsa solo. Hay 72 tests en la API y 44 en la web, análisis estático en nivel max, y CI que ejecuta ambas suites con filtrado por área.

El detalle de qué se hizo y qué se aprendió está en docs/planning/archive/ITERACION_1.md.

Advertencia que sigue vigente: la autenticación de esta iteración es deliberadamente convencional. La contraseña viaja al servidor y Laravel la hashea. Eso no es zero-knowledge y se sustituye en la Iteración 3. El contrato de la API, es decir rutas, forma de request y response y gestión de tokens, debe mantenerse estable para que el cambio posterior sea mínimo. Ver ADR-001.


DEUDA CONOCIDA

Deuda sin issue no existe, así que aquí solo hay punteros. La lista viva es la de GitHub filtrando por el label deuda; esto es el resumen para no tener que ir a buscarlo.

Issue 59, el contenido de los vault items no está cifrado durante la Iteración 2. El servidor puede leer las contraseñas. Es deuda de otra categoría que el resto, porque no es una mejora pendiente sino una violación consciente del principio fundamental del producto, y lleva una condición operativa mientras dure: no desplegar con datos reales hasta que cierre la Iteración 3. Se decidió al planificar la Iteración 2 y por la misma razón que la autenticación convencional de la Iteración 1, fijar el contrato antes de meter criptografía.
Issue 73, el token de sesión sigue en localStorage. La decisión ya está tomada y cerrada en ADR-007, que era el issue 43: deja de persistirse y pasa a vivir solo en memoria. Lo que queda es implementarlo, y va a la Iteración 3 junto al desbloqueo por contraseña maestra, porque hacerlo antes expulsaría al usuario en cada recarga sin nada que se lo explique. Hasta entonces lo cubre la misma condición del issue 59: no desplegar con datos reales.
Issue 46, el shell no es usable en móvil. La sidebar es fija y por debajo de 640 px se come la pantalla. Entra en el sprint, porque este añade cuatro pantallas nuevas y arreglarlo después sale más caro.
Issue 44, la ruta styleguide viaja al build de producción. Entra en el sprint, es trivial.
Issue 45, el bundle. Queda fuera del sprint a propósito: la Iteración 2 iba a montar TanStack Query y a añadir pantallas, así que medir antes era medir un número que iba a cambiar. Efectivamente cambió, de 595 kB a 656 kB. Se vuelve a mirar al cierre de la iteración.

No es deuda, aunque lo parezca: que el rate limiting cuente peticiones y no solo intentos fallidos. Se evaluó, se descartó con motivo y no hay intención de cambiarlo; está documentado en el código y en un test.


SIGUIENTE PASO

La Iteración 2 está en curso y toda su funcionalidad está hecha, del 50 al 58: modelo de vaults y pertenencia, tabla de items con payload opaco, CRUD con contexto explícito, listado de vaults, capa de datos con TanStack Query, lista de items, crear y editar, borrar con confirmación, y copiar y mostrar la contraseña. El objetivo del sprint, que un usuario guarde, consulte, edite y borre credenciales en su vault personal, se cumple de punta a punta.

Lo que queda es deuda: el issue 46, shell usable en móvil, y el 44, que styleguide no viaje al build. El 43 ya está cerrado, con ADR-007 escrito, y su implementación es el 73, que va a la Iteración 3.

La API que el cliente va a consumir, para no tener que ir a leerla: GET /api/vaults devuelve id, name, is_personal y role. Los items cuelgan de /api/vaults/{vault}/items con los cinco verbos, y su payload son siempre tres campos juntos, ciphertext, iv y version, que se sustituyen enteros porque por separado no significan nada. Todo lo inaccesible responde 404 y nunca 403.

Dos decisiones de alcance tomadas al planificar, que conviene no reabrir sin motivo. La primera es que el cifrado real sigue siendo la Iteración 3: el contrato de la API ya es el definitivo, con blob opaco y ninguna columna con significado, pero el contenido va codificado y no cifrado, con la condición de no desplegar con datos reales. La segunda es que la búsqueda de items y el generador de contraseñas quedan fuera del sprint.

Consecuencia de diseño que sale del zero-knowledge y que conviene tener presente desde el primer issue: como el servidor no puede leer los blobs, tampoco puede buscar, ordenar ni paginar. El cliente se sincroniza la vault entera y descifra en memoria, igual que hace Bitwarden.

Punto de partida verificado, comprobado el 2 de agosto de 2026. En la API está el dominio entero de la iteración: las tablas vaults, vault_members y vault_items, los modelos correspondientes, y app/Application/Vaults con los servicios de listado, alta, lectura, actualización y borrado, más la guarda de pertenencia. Hay 146 tests y composer analyse sigue en verde en nivel max, sin baseline. En la web, lib/vault reúne tipos, cliente, claves de caché y hooks, con TanStack Query ya montado; pages/vault tiene la lista con sus estados, el diálogo de crear y editar, y el de borrado. Hay 125 tests, y lint y build en verde.

Dos cosas de la web que conviene saber antes de tocarla. La codificación del blob vive en un único fichero, lib/vault/sinCifrar.ts, y su nombre es el mensaje: hoy no cifra, y la Iteración 3 sustituye ese fichero y ningún otro. Y copiar al portapapeles tiene dos caminos porque el entorno local sirve por http, donde navigator.clipboard no existe; el plan B con execCommand funciona para copiar pero no para el vaciado diferido, porque exige un gesto del usuario, así que ese vaciado solo ocurrirá en producción bajo https.

El modelo de datos y el contrato del blob están explicados en docs/architecture/FOUNDATION.md, que se creó en el issue 51. Es la lectura obligatoria antes de tocar la API o de añadir una columna a vault_items.

CONVENCIONES DE TRABAJO

Git: una rama por issue con el formato tipo/número-descripcion-corta. Merge a master solo mediante PR con squash, un commit por issue. El cuerpo del PR incluye Closes seguido del número para que GitHub cierre el issue automáticamente. Se usa gh CLI.

Definition of Done: criterios de aceptación completos, tests en verde, RBAC validado donde aplique, PR mergeado y este documento actualizado. STATUS.md no hay que tocarlo, lo regenera el CI tras el merge. Los issues con UI se verifican en navegador antes de marcarse como hechos.

Patrones de código heredados de eBudget: servicios de aplicación con método handle que reciben identificadores explícitos y no acceden a sesión. Double guard, es decir validación en la capa de presentación y también en la capa de aplicación, nunca solo en una. DTOs tipados para transferir datos entre capas. Servicios idempotentes para operaciones de agregación. Tests de aislamiento cross-tenant en todos los servicios críticos.

