SPRINT CONTEXT — eVault
Actualizado: 5 de agosto de 2026
Estado: Iteración 4 cerrada el 5 de agosto de 2026. La 5 planificada el mismo día y en curso.

Nota de formato: este documento está escrito en prosa plana sin Markdown, siguiendo la convención del proyecto para instrucciones dirigidas a Claude Code.

Este archivo es el puente entre sesiones y se lee entero al empezar. Por eso es corto, y hay que mantenerlo corto: creció hasta las cuatrocientas cincuenta líneas durante la Iteración 1 y dejó de cumplir su función, porque lo único que se leía eran las últimas veinte. Lo que no cabe aquí vive en otro sitio y se enlaza.

Qué NO se escribe aquí. Ni qué issues están cerrados ni cuál es el siguiente: eso se lee en docs/planning/STATUS.md, que se genera desde GitHub. Ni el entorno local, que está en docs/development/SETUP.md. Ni el historial de lo ya hecho, que se archiva por iteración en docs/planning/archive/. Una copia se desincroniza siempre, porque nada obliga a actualizarla.


QUÉ ES eVault

eVault es un gestor de contraseñas y secretos personales con modelo zero-knowledge. El servidor nunca puede leer los datos del usuario: toda la criptografía ocurre en el cliente antes de que los datos salgan del dispositivo, y la base de datos solo almacena blobs cifrados opacos.

NO se comercializa, y eso está decidido en ADR-009. Los dos propósitos reales son que el desarrollador lo use para sus propias contraseñas en una instancia self-hosted, y que el repositorio sea público y sirva como muestra de trabajo en procesos de selección. Quien lo lea estará evaluando criterio técnico: código, decisiones de seguridad, arquitectura y documentación. De ahí que el self-hosting sea el único modo de despliegue y que ADR-005 gane importancia en lugar de perderla.

Quedan fuera del alcance, y conviene no reabrirlos por inercia: vaults compartidas, organizaciones, plan Team y el panel Filament de administración de plataforma. El multi-tenancy ya construido NO se retira, porque el aislamiento cross-tenant con sus tests es precisamente lo que hay que poder enseñar.

Los clientes previstos siguen siendo una SPA web, una app nativa iOS/Android y una extensión de navegador para Chrome. Ahora mismo solo se está construyendo la web.


DÓNDE ENCONTRAR CADA COSA

Estado del backlog, prioridades y dependencias: docs/planning/STATUS.md, generado desde GitHub.
Entorno local, stack, versiones y arranque: docs/development/SETUP.md.
Por qué el proyecto está construido así: los once ADR en docs/architecture/decisions.
Historial de iteraciones cerradas y sus lecciones: docs/planning/archive.
Modelo de datos y contrato del blob: docs/architecture/FOUNDATION.md, lectura obligatoria antes de tocar la API o de añadir una columna a vault_items.
Comandos, URLs, workflow git e idioma del código: CLAUDE.md en la raíz.
Reglas de la propia documentación: docs/GUIDE.md.


DECISIONES DE ARQUITECTURA CERRADAS

Los once ADR de docs/architecture/decisions son la fuente de verdad, y son inmutables: si una decisión cambia, se escribe uno nuevo que la supersede. Lo que sigue es el índice para saber cuál abrir, no un sustituto de abrirlo.

Los seis primeros están numerados por profundidad arquitectónica y no por fecha. ADR-001 zero-knowledge. ADR-002 React para la vault y Filament solo para administración, porque el server-side rendering rompería la garantía. ADR-003 monorepo. ADR-004 multi-tenancy sin Spatie teams, con el contexto de tenant explícito en cada llamada porque la API es stateless. ADR-005 arquitectura self-hosteable. ADR-006 TypeScript 6, con un bloqueador verificable detrás.

A partir del 007 la numeración es cronológica. ADR-007 el token de sesión vive solo en memoria, así que recargar no es una expulsión sino el bloqueo de la vault. ADR-008 arquitectura de claves. ADR-009 el proyecto deja de ser un SaaS. ADR-010 clave de recuperación. ADR-011 formato de export e import.

Lo único de todo esto que hay que tener en la cabeza sin abrir nada, porque explica la forma de casi todo el código: la contraseña maestra no cifra los items. PBKDF2 con 600.000 iteraciones deriva del par contraseña y correo una clave maestra cuyo único trabajo es ENVOLVER una clave de vault aleatoria de 256 bits, y es esa la que cifra con AES-256-GCM. Por eso cambiar la contraseña maestra es reenvolver 32 bytes en vez de recifrar la vault, y por eso la clave de recuperación puede ser un segundo envoltorio de la MISMA clave sin duplicar nada. El hash que viaja al servidor se deriva de la clave maestra usando la contraseña como salt: quien lo capture consigue una sesión, no el contenido.

Y la consecuencia que más se malinterpreta, con test que falla si el aviso desaparece: rotar la contraseña maestra NO invalida la clave de recuperación, porque la clave de vault no cambia. Quien sospeche un robo tiene que regenerarla aparte.


DÓNDE ESTAMOS

La Iteración 4 se cerró el 5 de agosto de 2026 y eVault ya no es una vault en la que dé miedo meter contraseñas reales. Se puede exportar e importar, cambiar la contraseña maestra, recuperar el acceso con una clave de recuperación si se pierde, y hacer copia de seguridad de la instancia con dos comandos de Artisan. Hay 230 tests en la API y 367 en la web, análisis estático en nivel max sin baseline, y CI en verde.

El detalle de qué se hizo y qué se aprendió está en docs/planning/archive/ITERACION_4.md. Conviene leerlo antes de tocar la rotación de contraseñas, la recuperación o el export, y también antes de hacer cualquier renombrado masivo. Dos cosas de ahí que valen por sí solas: el middleware ability de Sanctum NO sirve para restringir, porque un token de sesión normal lleva la capacidad * y * satisface cualquier comprobación; y el texto de la interfaz se rompe cruzando saltos de línea, así que una auditoría línea a línea no lo ve.

El mapa del cliente, para no tener que buscarlo. La primitiva criptográfica es lib/vault/crypto.ts, el único sitio que llama a crypto.subtle. Encima está lib/vault/payload.ts, que cifra y descifra el contenido de los items. La clave vive en lib/vault/keyInMemory.ts, un store sin persist. Abrirla es unlockVault, en lib/vault/unlock.ts. Y lo que se construyó en esta iteración: masterPassword.ts para rotarla, recoveryKey.ts y recovery.ts para la clave de recuperación, y export.ts e import.ts.

Antes de dar por vivo el entorno local, comprobarlo: suele estar caído al empezar la sesión.


DEUDA CONOCIDA

Deuda sin issue no existe, así que aquí solo hay punteros. La lista viva es la de GitHub filtrando por el label deuda; esto es el resumen para no tener que ir a buscarlo.

Issues 160 y 161, los identificadores en español que la Iteración 4 creyó haber migrado. El criterio de salida siete de aquella iteración decía que no quedaba ninguno en web/src ni en api/app, y quedaban veinticuatro en el código de producción de la web y uno en la API, más una treintena de ficheros de test. Se rectificó en el issue 153. El 160 es el código de producción y entra en esta iteración; el 161 son los tests y queda fuera, sin fecha. Lo que de verdad conviene llevarse de aquí no es el español: es que el criterio se dio por bueno leyendo el diff en vez de ejecutando nada, y una afirmación así no la revisa nadie después, porque vive justamente en el documento que certifica que ya está comprobada.

Issue 149, los tokens de sesión se acumulan y no caducan nunca. Recargar bloquea la vault y desbloquear hace por debajo un login completo, así que cada recarga deja un token vivo que nadie revoca. No rompe nada hoy con un solo usuario, pero la tabla crece sin techo y un token robado vale para siempre. La caducidad es la mitad barata y cubre lo que peor envejece.

Issue 45, el bundle está en 663 kB en un solo chunk, sin code splitting ni rutas perezosas. Se quedó fuera de la Iteración 4 a propósito: por el criterio de ADR-009 esto es pulido y no fiabilidad, y un bundle grande no impide usar el producto.

Issue 62, comprobaciones de documentación en los PR. Importa porque la regla de actualizar este mismo documento al cerrar un issue no la comprueba nadie, y durante la Iteración 2 se saltó tres veces.

No es deuda, aunque lo parezca: que el rate limiting cuente peticiones y no solo intentos fallidos. Se evaluó, se descartó con motivo y no hay intención de cambiarlo; está documentado en el código y en un test.


SIGUIENTE PASO

La Iteración 5 está planificada. El objetivo es que eVault se levante desde un clon con un comando, se despliegue con una guía verificada, y que quien lo abra vea una vault con contenido en menos de un minuto.

No es funcionalidad nueva, y es a propósito. ADR-009 en su sección 4 pone el despliegue reproducible por delante de la legibilidad y de la funcionalidad, y hoy no existe: no hay Dockerfile, ni Compose, ni guía de despliegue, mientras ADR-005 decidió que el proyecto fuera self-hosteable desde el primer commit y el README afirma en inglés que lo es. Esa es hoy la mayor distancia entre lo que el proyecto promete y lo que entrega, y es de las primeras cosas que comprueba quien lo lea evaluando criterio técnico.

Lo primero de todo es el issue 153, que ya está hecho y es esta misma actualización: rectificar el criterio de salida siete de la Iteración 4. Iba solo y antes que nada porque era lo único que estaba mintiendo en un repositorio público.

Después, ADR-012 en el issue 154 decide la estrategia de despliegue antes de escribir el primer Dockerfile. Sobre esa decisión van el arranque con un comando, issues 155 y 156, los datos de ejemplo y el screenshot, issues 157 y 158, y la guía de despliegue verificada, issue 159. La deuda que entra es la 149 y la 62. Cierra el issue 162.

Hay un hallazgo de la planificación que conviene no volver a descubrir, porque cambia la forma de la solución: EL SERVIDOR NO PUEDE SEMBRAR DATOS DE DEMO. No es una limitación de implementación, es el zero-knowledge funcionando. Un seeder de Laravel no puede crear vault items con contenido, porque el contenido se cifra en el cliente con una clave derivada de una contraseña maestra que el servidor nunca ve. El DatabaseSeeder actual lo confirma sin decirlo: crea un usuario con su vault personal y cero items, porque no le es posible crear ninguno. Por eso los datos de ejemplo son un fichero .evault pre-generado con la contraseña publicada, que se importa desde la interfaz reutilizando lo que ya construyeron ADR-011 y el issue 123. Y por eso el README puede decir, siendo literalmente cierto, que no existe forma de poner datos de ejemplo en la base de datos de otro sin darle la contraseña que los abre: la siembra demuestra el modelo en vez de explicarlo.

El bundle, issue 45, se queda fuera otra vez y por el mismo criterio que lo dejó fuera de la 4. Su medición sí está al día: son 689 kB, no los 663 que decía.

Sigue fuera el cambio de correo electrónico, que no es pequeño porque el correo es el salt de la derivación (ADR-008) y cambiarlo obliga a re-derivar y a reenvolver.

Reglas que salieron de las cuatro iteraciones y que conviene mantener. Cuando la interfaz haga una promesa sobre seguridad, escribir el test que falla si la promesa deja de ser cierta; y si la garantía cambia de signo, invertir el test en vez de borrarlo, que ya ha pasado dos veces. Ver pasar un test no demuestra que sirva: se comprueba rompiendo el código a propósito, y eso ya ha destapado tests que no detectaban nada en dos iteraciones distintas. Y lo que promete la interfaz se verifica abriendo el navegador, porque las cuatro veces que mintió en el proyecto se descubrieron así y no en la suite.

La quinta regla es de la Iteración 4 y se aprendió tarde, al rectificar su criterio siete: SI UN CRITERIO SE PUEDE COMPROBAR CON UN COMANDO, EL CRITERIO ES ESE COMANDO Y SE DEJA ESCRITO EN EL REPOSITORIO. «Ningún identificador en español» no es un criterio, es una intención; un grep que devuelve cero y rompe el CI cuando no lo devuelve, sí lo es. Y va con un corolario incómodo: un criterio de salida falso es más duradero que un test que no detecta nada, porque el test al menos pasa por delante de alguien cada vez que corre la suite, mientras que la afirmación vive en el documento que certifica que ya está comprobada, y por eso nadie la vuelve a mirar.


CONVENCIONES DE TRABAJO

Git: una rama por issue con el formato tipo/número-descripcion-corta. Merge a master solo mediante PR con squash, un commit por issue. El cuerpo del PR incluye Closes seguido del número para que GitHub cierre el issue automáticamente. Se usa gh CLI.

Definition of Done: criterios de aceptación completos, tests en verde, RBAC validado donde aplique, PR mergeado y este documento actualizado. STATUS.md no hay que tocarlo, lo regenera el CI tras el merge. Los issues con UI se verifican en navegador antes de marcarse como hechos.

Patrones de código heredados de un proyecto anterior: servicios de aplicación con método handle que reciben identificadores explícitos y no acceden a sesión. Double guard, es decir validación en la capa de presentación y también en la capa de aplicación, nunca solo en una. DTOs tipados para transferir datos entre capas. Servicios idempotentes para operaciones de agregación. Tests de aislamiento cross-tenant en todos los servicios críticos.
