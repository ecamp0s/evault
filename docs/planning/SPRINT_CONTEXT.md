SPRINT CONTEXT — eVault
Actualizado: 7 de agosto de 2026
Estado: Iteración 6 cerrada el 16 de agosto de 2026. La 7 no está planificada.

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
Por qué el proyecto está construido así: los doce ADR en docs/architecture/decisions.
Historial de iteraciones cerradas y sus lecciones: docs/planning/archive.
Modelo de datos y contrato del blob: docs/architecture/FOUNDATION.md, lectura obligatoria antes de tocar la API o de añadir una columna a vault_items.
Comandos, URLs, workflow git e idioma del código: CLAUDE.md en la raíz.
Reglas de la propia documentación: docs/GUIDE.md.


DECISIONES DE ARQUITECTURA CERRADAS

Los doce ADR de docs/architecture/decisions son la fuente de verdad, y son inmutables: si una decisión cambia, se escribe uno nuevo que la supersede. Lo que sigue es el índice para saber cuál abrir, no un sustituto de abrirlo.

Los seis primeros están numerados por profundidad arquitectónica y no por fecha. ADR-001 zero-knowledge. ADR-002 React para la vault y Filament solo para administración, porque el server-side rendering rompería la garantía. ADR-003 monorepo. ADR-004 multi-tenancy sin Spatie teams, con el contexto de tenant explícito en cada llamada porque la API es stateless. ADR-005 arquitectura self-hosteable. ADR-006 TypeScript 6, con un bloqueador verificable detrás.

A partir del 007 la numeración es cronológica. ADR-007 el token de sesión vive solo en memoria, así que recargar no es una expulsión sino el bloqueo de la vault. ADR-008 arquitectura de claves. ADR-009 el proyecto deja de ser un SaaS. ADR-010 clave de recuperación. ADR-011 formato de export e import. ADR-012 estrategia de despliegue.

Del 012 conviene tener presente una cosa sin abrirlo, porque decide si un despliegue funciona o no: HTTPS no es endurecimiento, es requisito de arranque. Fuera de localhost no existe crypto.subtle en contexto inseguro, así que una instancia servida por http en un dominio propio o en una IP de la red local no es una instalación limitada, es una donde no se puede ni registrar un usuario. Y la excepción de .localhost no rescata nada aquí: vale en la máquina que ejecuta el navegador, no desde otro dispositivo de la red.

Lo único de todo esto que hay que tener en la cabeza sin abrir nada, porque explica la forma de casi todo el código: la contraseña maestra no cifra los items. PBKDF2 con 600.000 iteraciones deriva del par contraseña y correo una clave maestra cuyo único trabajo es ENVOLVER una clave de vault aleatoria de 256 bits, y es esa la que cifra con AES-256-GCM. Por eso cambiar la contraseña maestra es reenvolver 32 bytes en vez de recifrar la vault, y por eso la clave de recuperación puede ser un segundo envoltorio de la MISMA clave sin duplicar nada. El hash que viaja al servidor se deriva de la clave maestra usando la contraseña como salt: quien lo capture consigue una sesión, no el contenido.

Y la consecuencia que más se malinterpreta, con test que falla si el aviso desaparece: rotar la contraseña maestra NO invalida la clave de recuperación, porque la clave de vault no cambia. Quien sospeche un robo tiene que regenerarla aparte.


DÓNDE ESTAMOS

La Iteración 6 se cerró el 16 de agosto de 2026 y el repositorio dejó de tener afirmaciones que nadie podía comprobar. El código está entero en inglés —cero identificadores en español en las seis áreas, producción y tests—, hay comandos que lo comprueban, y el CI los ejecuta en cada PR. Hay 371 tests en la web, 238 en la API, 52 del propio utillaje, análisis estático en nivel max sin baseline y CI en verde.

Catorce issues cerrados, tres de ellos abiertos por el camino.

Lo que hay que saber de lo hecho, para no redescubrirlo. Hay tres comandos nuevos y conviene conocerlos antes de tocar nada: ./scripts/check-identifiers.py comprueba que los identificadores estén en inglés y --all incluye los tests; ./scripts/check-docs.py comprueba bytes NUL, marcadores de conflicto, los seis marcadores de sección manual de STATUS.md y las referencias a documentos que no existen; y node scripts/identifiers/dump-ui-text.mjs vuelca el texto visible para compararlo antes y después de un renombrado. Los tres tienen tests, y el workflow «repositorio» los ejecuta siempre y sin filtro de paths.

Dos cosas del comprobador de identificadores que hay que tener presentes al escribir código nuevo. La lista de scripts/identifiers/english.txt es de PERMITIDOS, así que una palabra inglesa nueva se reporta hasta que alguien la añade, y eso es lo buscado. Y comprueba la gramática solo en la parte que tiene forma reconocible: desde el issue 197 marca las palabras funcionales españolas pegadas a otra, como aItem o deVault, pero useVaultPersonal son tres palabras inglesas en orden español y sigue pasando. Eso hay que verlo leyendo.

El detalle de la iteración y sus lecciones está en docs/planning/archive/ITERACION_6.md. Conviene leerlo antes de tocar el utillaje, la lista de palabras o la carga diferida de las rutas.

La Iteración 5 se cerró el 7 de agosto de 2026 y eVault dejó de ser un proyecto que solo corría en la máquina de su autor. Se levanta con docker compose up desde un clon, se despliega en un servidor con una guía que se escribió ejecutándola, y el README tiene por fin una portada que enseñar. Hay 238 tests en la API y 368 en la web, análisis estático en nivel max sin baseline, y CI en verde.

Once issues cerrados, tres de ellos sin planificar y siendo buena parte del valor: el 184, un byte NUL que hacía invisible un fichero entero para grep; el 186, dos tests que dependían del orden de resolución; y el 153, la rectificación del criterio de salida siete de la iteración anterior, con la que empezó todo.

Lo que hay que saber de lo hecho, para no redescubrirlo. Levantar el proyecto es un comando y no ocho, y lo que se aprendió montándolo está en SETUP.md. Desplegarlo tiene su propia guía en docs/operations/DEPLOYMENT.md, y ahí está lo que costó averiguar: que mDNS solo resuelve nombres de una etiqueta, que el backup sin -u www-data deja copias que su dueño no puede recuperar, y que los puertos de dos ficheros de compose se fusionan en vez de sustituirse. Hay además un fichero examples/sample-vault.evault con siete entradas ficticias que se importa con la contraseña publicada en el README: sirve para ver la aplicación con contenido sin inventarse nada, y de paso es la demostración más concreta del zero-knowledge que tiene el repositorio, porque el servidor NO PUEDE sembrar datos y por eso la única vía es entregar un fichero cifrado y su contraseña.

El detalle de la iteración y sus lecciones está en docs/planning/archive/ITERACION_5.md. Conviene leerlo antes de tocar el despliegue, el Compose o cualquier cosa que dependa de auditar el repositorio con grep.

El entorno de verificación es kastor, el servidor de casa. No se documenta aquí porque el repositorio es público y son datos de una red doméstica.

La Iteración 4 se cerró el 5 de agosto de 2026 y eVault ya no es una vault en la que dé miedo meter contraseñas reales. Se puede exportar e importar, cambiar la contraseña maestra, recuperar el acceso con una clave de recuperación si se pierde, y hacer copia de seguridad de la instancia con dos comandos de Artisan. Hay 230 tests en la API y 367 en la web, análisis estático en nivel max sin baseline, y CI en verde.

El detalle de qué se hizo y qué se aprendió está en docs/planning/archive/ITERACION_4.md. Conviene leerlo antes de tocar la rotación de contraseñas, la recuperación o el export, y también antes de hacer cualquier renombrado masivo. Dos cosas de ahí que valen por sí solas: el middleware ability de Sanctum NO sirve para restringir, porque un token de sesión normal lleva la capacidad * y * satisface cualquier comprobación; y el texto de la interfaz se rompe cruzando saltos de línea, así que una auditoría línea a línea no lo ve.

El mapa del cliente, para no tener que buscarlo. La primitiva criptográfica es lib/vault/crypto.ts, el único sitio que llama a crypto.subtle. Encima está lib/vault/payload.ts, que cifra y descifra el contenido de los items. La clave vive en lib/vault/keyInMemory.ts, un store sin persist. Abrirla es unlockVault, en lib/vault/unlock.ts. Y lo que se construyó en esta iteración: masterPassword.ts para rotarla, recoveryKey.ts y recovery.ts para la clave de recuperación, y export.ts e import.ts.

Antes de dar por vivo el entorno local, comprobarlo: suele estar caído al empezar la sesión.

Tres lecciones de método de la Iteración 5, y conviene tenerlas delante porque las tres se pagaron caras.

EL CAMINO QUE NADIE RECORRE ES EL QUE ESTÁ ROTO, que salió cinco veces seguidas. El criterio siete se dio por bueno sin ejecutarlo y era falso. El origen de CORS funcionaba solo con el puerto por defecto y rompía el camino documentado de cambiarlo. El clon quedaba imborrable por su dueño y solo se vio al intentar borrarlo. En una vault vacía no se podía importar, que es justo cuando alguien quiere hacerlo, porque el import siempre se había probado con items delante. Y los nombres mDNS de más de una etiqueta no resuelven, aunque avahi los publique sin protestar. Ninguno de los cinco se ve leyendo el código.

CUANDO DOS MEDIDAS DISCREPAN, LA PRIMERA HIPÓTESIS NO PUEDE SER QUE LA RARA ES LA PROPIA. Al inventariar el renombrado, un extractor propio encontraba identificadores que grep no veía. Se dio por bueno grep y se declararon inexistentes, cuando lo cierto era lo contrario: había un byte NUL en el fichero y grep lo omitía EN SILENCIO. Se estuvo a punto de corregir un inventario correcto para ajustarlo a una herramienta rota. La discrepancia entre dos medidas es información, no ruido.

UN COMPROBADOR QUE OMITE FICHEROS EN SILENCIO ES PEOR QUE NO TENER COMPROBADOR, porque devuelve un cero tranquilizador. Cualquier auditoría con grep tiene que usar -a, o heredará ese punto ciego.


DEUDA CONOCIDA

Deuda sin issue no existe, así que aquí solo hay punteros. La lista viva es la de GitHub filtrando por el label deuda; esto es el resumen para no tener que ir a buscarlo.

No queda ninguna. Las dos que dejó la Iteración 6 —el 197 y el 202— se cerraron después de ella.

No es deuda, aunque lo parezca: que el rate limiting cuente peticiones y no solo intentos fallidos. Se evaluó, se descartó con motivo y no hay intención de cambiarlo; está documentado en el código y en un test.


SIGUIENTE PASO

La Iteración 7 no está planificada, y por primera vez en tres iteraciones no hay deuda que arrastre el plan: lo que queda son dos issues pequeños, el 197 y el 202.

Lo que lleva más tiempo esperando y ya no tiene nada delante es LA INSTANCIA PERSONAL, la que guarde contraseñas de verdad. Es el propósito número uno de ADR-009 y sigue sin resolverse dónde vive: kastor es candidato pero por ADR-009 sección 4 la instancia personal no comparte máquina con despliegues de prueba. Desde la Iteración 5 hay guía de despliegue verificada, así que la parte difícil está hecha; lo que falta es la decisión.

Y sigue fuera el cambio de correo electrónico, que no es pequeño porque el correo es el salt de la derivación (ADR-008) y cambiarlo obliga a re-derivar y a reenvolver.

CONVENCIONES DE TRABAJO

Git: una rama por issue con el formato tipo/número-descripcion-corta. Merge a master solo mediante PR con squash, un commit por issue. El cuerpo del PR incluye Closes seguido del número para que GitHub cierre el issue automáticamente. Se usa gh CLI.

Definition of Done: criterios de aceptación completos, tests en verde, RBAC validado donde aplique, PR mergeado y este documento actualizado. STATUS.md no hay que tocarlo, lo regenera el CI tras el merge. Los issues con UI se verifican en navegador antes de marcarse como hechos.

Patrones de código heredados de un proyecto anterior: servicios de aplicación con método handle que reciben identificadores explícitos y no acceden a sesión. Double guard, es decir validación en la capa de presentación y también en la capa de aplicación, nunca solo en una. DTOs tipados para transferir datos entre capas. Servicios idempotentes para operaciones de agregación. Tests de aislamiento cross-tenant en todos los servicios críticos.
