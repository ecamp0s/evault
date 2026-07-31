SPRINT CONTEXT — eVault
Actualizado: 30 de julio de 2026
Estado: Iteración 1 cerrada. Iteración 2 sin planificar.

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

Están numerados por profundidad arquitectónica y no por fecha, de la decisión más fundacional a la más superficial. ADR-001 zero-knowledge, ADR-002 React para la vault y Filament solo para administración, ADR-003 monorepo, ADR-004 multi-tenancy sin Spatie teams, ADR-005 arquitectura self-hosteable, ADR-006 TypeScript 6.

Zero-knowledge, ADR-001. La contraseña maestra nunca sale del cliente. El cliente deriva con PBKDF2 dos valores a partir de ella: una clave de cifrado que nunca abandona el dispositivo, y un hash de autenticación que sí se envía al servidor para verificar identidad. Los vault items se cifran con AES-256-GCM en el cliente antes de cada petición.

React para la vault, Filament solo para administración, ADR-002. Filament es server-side rendering, así que haría pasar los datos por PHP y rompería la garantía de zero-knowledge. Para el panel de plataforma, donde no se manejan secretos de usuarios, Filament sigue siendo la elección correcta por velocidad de desarrollo.

Monorepo, ADR-003, con API y panel admin en el mismo proyecto Laravel, y el frontend React como proyecto separado dentro del mismo repositorio. Las rutas de API y de admin están completamente separadas.

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

Issue 43, dónde vive el token de sesión. Hoy está en localStorage, legible por cualquier JavaScript que se ejecute en el origen. Se aceptó porque la API todavía no guarda secretos, y ese razonamiento caduca en la Iteración 3. Es la deuda con más peso de todas.
Issue 46, el shell no es usable en móvil. La sidebar es fija y por debajo de 640 px se come la pantalla.
Issue 45, el bundle está en 595 kB en un solo chunk.
Issue 44, la ruta styleguide viaja al build de producción.

No es deuda, aunque lo parezca: que el rate limiting cuente peticiones y no solo intentos fallidos. Se evaluó, se descartó con motivo y no hay intención de cambiarlo; está documentado en el código y en un test.


SIGUIENTE PASO

La Iteración 2 no está planificada. Lo que toca antes de escribir código es decidir su alcance: el modelo de vaults y organizaciones del ADR-004, y el CRUD de vault items.

Punto de partida verificado, comprobado el 30 de julio de 2026. En la API existen los cuatro endpoints de autenticación bajo api/auth, el modelo User con HasApiTokens, y nada más de dominio: no hay migraciones de vaults ni de items, y app/Application solo contiene Auth. En la web están montados el cliente axios con su interceptor, el store de sesión con hidratación, los guards y el shell con sidebar; el área de contenido es un placeholder a la espera de la vault.

CONVENCIONES DE TRABAJO

Git: una rama por issue con el formato tipo/número-descripcion-corta. Merge a master solo mediante PR con squash, un commit por issue. El cuerpo del PR incluye Closes seguido del número para que GitHub cierre el issue automáticamente. Se usa gh CLI.

Definition of Done: criterios de aceptación completos, tests en verde, RBAC validado donde aplique, PR mergeado y este documento actualizado. STATUS.md no hay que tocarlo, lo regenera el CI tras el merge. Los issues con UI se verifican en navegador antes de marcarse como hechos.

Patrones de código heredados de eBudget: servicios de aplicación con método handle que reciben identificadores explícitos y no acceden a sesión. Double guard, es decir validación en la capa de presentación y también en la capa de aplicación, nunca solo en una. DTOs tipados para transferir datos entre capas. Servicios idempotentes para operaciones de agregación. Tests de aislamiento cross-tenant en todos los servicios críticos.

