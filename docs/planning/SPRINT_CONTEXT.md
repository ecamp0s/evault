SPRINT CONTEXT — eVault
Actualizado: 18 de agosto de 2026
Estado: Iteración 8 en curso, planificada el 18 de agosto de 2026 en el issue 262.

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
Por qué el proyecto está construido así: los catorce ADR en docs/architecture/decisions.
Historial de iteraciones cerradas y sus lecciones: docs/planning/archive.
Modelo de datos y contrato del blob: docs/architecture/FOUNDATION.md, lectura obligatoria antes de tocar la API o de añadir una columna a vault_items.
Qué llave abre qué y qué se pierde con cada una: docs/architecture/KEYS.md, que es de consulta y responde sin abrir ningún ADR.
Comandos, URLs, workflow git e idioma del código: CLAUDE.md en la raíz.
Reglas de la propia documentación: docs/GUIDE.md.


DECISIONES DE ARQUITECTURA CERRADAS

Los catorce ADR de docs/architecture/decisions son la fuente de verdad, y son inmutables: si una decisión cambia, se escribe uno nuevo que la supersede. Lo que sigue es el índice para saber cuál abrir, no un sustituto de abrirlo.

Los seis primeros están numerados por profundidad arquitectónica y no por fecha. ADR-001 zero-knowledge. ADR-002 React para la vault y Filament solo para administración, porque el server-side rendering rompería la garantía. ADR-003 monorepo. ADR-004 multi-tenancy sin Spatie teams, con el contexto de tenant explícito en cada llamada porque la API es stateless. ADR-005 arquitectura self-hosteable. ADR-006 TypeScript 6, con un bloqueador verificable detrás.

A partir del 007 la numeración es cronológica. ADR-007 el token de sesión vive solo en memoria, así que recargar no es una expulsión sino el bloqueo de la vault. ADR-008 arquitectura de claves. ADR-009 el proyecto deja de ser un SaaS. ADR-010 clave de recuperación. ADR-011 formato de export e import. ADR-012 estrategia de despliegue. ADR-013 emplazamiento y operación de la instancia personal, que es además donde queda corregida la imprecisión de ADR-012 sección 2.3 al meter Tailscale, Cloudflare y una VPN propia en el mismo saco. ADR-014 cambio de correo electrónico, y de ahí lo único que hay que tener presente sin abrirlo: cambiar el correo SÍ invalida la clave de recuperación, al contrario que rotar la contraseña maestra, porque el correo es el salt del HKDF que deriva sus claves.

Del 012 conviene tener presente una cosa sin abrirlo, porque decide si un despliegue funciona o no: HTTPS no es endurecimiento, es requisito de arranque. Fuera de localhost no existe crypto.subtle en contexto inseguro, así que una instancia servida por http en un dominio propio o en una IP de la red local no es una instalación limitada, es una donde no se puede ni registrar un usuario. Y la excepción de .localhost no rescata nada aquí: vale en la máquina que ejecuta el navegador, no desde otro dispositivo de la red.

Lo único de todo esto que hay que tener en la cabeza sin abrir nada, porque explica la forma de casi todo el código: la contraseña maestra no cifra los items. PBKDF2 con 600.000 iteraciones deriva del par contraseña y correo una clave maestra cuyo único trabajo es ENVOLVER una clave de vault aleatoria de 256 bits, y es esa la que cifra con AES-256-GCM. Por eso cambiar la contraseña maestra es reenvolver 32 bytes en vez de recifrar la vault, y por eso la clave de recuperación puede ser un segundo envoltorio de la MISMA clave sin duplicar nada. El hash que viaja al servidor se deriva de la clave maestra usando la contraseña como salt: quien lo capture consigue una sesión, no el contenido.

Y la consecuencia que más se malinterpreta, con test que falla si el aviso desaparece: rotar la contraseña maestra NO invalida la clave de recuperación, porque la clave de vault no cambia. Quien sospeche un robo tiene que regenerarla aparte.


DÓNDE ESTAMOS

La Iteración 8 se planificó el 18 de agosto de 2026 y su objetivo es que lo que ya guarda contraseñas reales se pueda comprobar, en vez de darse por bueno. Nueve issues en cinco bloques, el detalle está en el issue 262. No trae funcionalidad nueva y es deliberado: hay un usuario con todas sus contraseñas dentro, y ADR-009 sección 4 pone la fiabilidad para quien lo usa de verdad por delante de todo lo demás.

LO QUE HAY QUE SABER DE ESA PLANIFICACIÓN, porque decide el orden del trabajo. Primero va el 259, el test intermitente, porque comprobar el backup contra una suite que falla dos de cada tres veces bajo carga es construir sobre arena. Después las copias: el 263, el 264 y el 265. Después la verificación sobre datos reales: el 266, el 267 y el 260. Y el 268 cierra.

LA APUESTA DE SECUENCIACIÓN es que restaurar va antes que rotar. El 266 restaura una copia con las 370 contraseñas dentro y el 267 rota la contraseña maestra sobre la instancia real; el segundo no se toca hasta haber visto una copia abrirse de verdad, porque una rotación a medias deja el acceso perdido en una máquina que no puede repararlo. Es la misma forma que la apuesta de la 7, el bloque de fiabilidad antes del despliegue.

CUATRO COSAS APARECIERON AL PLANIFICAR y ninguna estaba en ningún documento. Las tres primeras son la misma familia que la lección central de la 7, y dos de ellas son literalmente el mismo fallo de método.

El intermitente del 259 está reproducido y no era ninguno de los tres candidatos que el issue listaba. Treinta pasadas capturando la salida entera dieron veinte rojas y diez verdes, y las rojas caen exactamente en la ventana en que la máquina estaba cargada con otras mediciones: la suite volvió sola al verde al retirarlas, sin tocar una línea de código. La causa es presión de CPU contra unos timeouts que estaban sin configurar, es decir en el valor por defecto de Vitest de 5.000 milisegundos. El test más lento tarda 916 milisegundos en máquina ociosa y 2.643 con carga, así que el margen se lo come la contención. El más frágil tiene nombre y falla 20 de 30 veces: ItemDialog.test.tsx, crear, guarda una entrada nueva con lo que se ha escrito.

Y AQUÍ HAY UNA CORRECCIÓN QUE CONVIENE LEER, porque la explicación que se escribió al planificar era falsa y se descubrió al abrir el código. Se dijo que los ocho ficheros derivaban claves de verdad con PBKDF2 sin sustituir, y es al revés: el helper que usan importa 32 bytes directamente para evitar las 600.000 iteraciones, y lo dice en su propio comentario. El más frágil de todos no deriva nada. Lo que esos ficheros tienen en común no es criptografía, sino que renderizan React en jsdom y teclean con userEvent carácter a carácter. La afirmación se dio por buena porque encajaba con el síntoma y con lo que ya se sabía del proyecto, sin abrir el fichero, que es la lección de la Iteración 7 cometida al escribirla. Y el agravante que lo hace más urgente de lo que parecía: los runners de CI tienen dos núcleos, así que lo que aquí hay que provocar allí es la condición normal.

El backup sube copias vacías sin protestar. En el destino remoto hay ocho copias, siete de 2.378 bytes que son la vault vacía y una de 210.855 que es la única con las contraseñas dentro, y esa se hizo a mano. El script comprueba cuatro cosas y ninguna mira si la copia contiene algo. Con KEEP_REMOTE en 30 y un cron diario, un vaciado que nadie note en 30 días rota las 30 copias buenas. Y lo que lo convierte en la misma lección de la iteración anterior: BackupCommand sí calcula las filas copiadas y las imprime, pero offsite-backup.sh lo invoca con mayor que dev null. La información que detectaría el problema se produce y se descarta, que es palabra por palabra el fallo que dejó al 259 sin identificar durante una iteración entera.

La evidencia de que el backup corre vive en /tmp, y ADR-013 decide que esa máquina se apaga a propósito. La pregunta de cuándo fue la última copia buena no tiene forma de responderse ahí. Es la segunda vez que esta máquina falla por no conservar su propia historia: la primera fue el 240, con el reloj no monótono entre arranques.

Y el 251 dimensiona su trabajo con el 68 por ciento del volumen real, cosa que se corrige ahora que está medido para que la Iteración 9 lo tome con la cifra buena: son 805 nombres de test en español y no 547, porque faltaban los 260 de api; 214 ficheros con prosa española y no 192, porque faltaban api/app entero y scripts entero; unas 3.870 líneas de comentario, cifra que no constaba en ningún sitio; y 1.600 líneas de infraestructura a jubilar, no 1.585.

La Iteración 7 se cerró el 18 de agosto de 2026 y eVault dejó de ser un proyecto que funciona para pasar a ser la vault donde están las contraseñas de verdad, que era el propósito número uno de ADR-009. Dieciocho issues cerrados, seis de ellos abiertos por el camino. Hay 442 tests en la web, 263 en la API, 73 del utillaje, análisis estático en nivel max y CI en verde. El detalle y las lecciones están en docs/planning/archive/ITERACION_7.md.

DE LOS OCHO CRITERIOS DE SALIDA, seis quedaron cumplidos, uno parcial y uno sin verificar, y eso se dice en vez de estirar la definición para que cuadre. El que falta es el 4: que la vault se bloquee sola comprobado EN NAVEGADOR con la pestaña en segundo plano, que ningún test sustituye y que exige quince minutos de reloj real. Queda en el issue 260. El 5 está implementado y probado con 41 tests pero no ejecutado sobre la instancia real, porque hacerlo ahí significa re-derivar las claves de una vault con 370 contraseñas dentro. Y el 8 quedó parcial por un test intermitente sin identificar, que es el issue 259.

QUÉ HAY FUNCIONANDO. La instancia personal vive en kastor, en ~/apps/evault y por el puerto 443, sirviendo evault.local y evault-api.local con la CA interna de Caddy. El certificado está instalado en el Windows de casa y el ciclo se verificó en navegador desde otro dispositivo: crear item, recargar para que la vault se bloquee, desbloquear y descifrar. Comprobado además contra la base de datos que el servidor no puede leer nada. Un cron a las 3 llama a scripts/offsite-backup.sh, que pide la copia, la cifra con age y la sube a Dropbox; la clave privada está en OneDrive, otro proveedor, que es lo que hace que el cifrado sirva de algo. El cron lleva disparando solo desde la noche del 17.

Y DENTRO HAY CONTRASEÑAS DE VERDAD desde el 18 de agosto: 370 items, todos con version 2, ninguno vacío ni sin nonce. Eso cambia cómo hay que tratar esa máquina: lo que se rompa ahí ya no es reproducible.

LO QUE HAY QUE SABER ANTES DE TOCAR ESA MÁQUINA. Su reloj no es monótono entre arranques —el RTC marca 2019 y systemd restaura la fecha del último apagado antes de que NTP corrija—, así que los timestamps de systemd del arranque en curso mienten; de ahí salió el issue 240, porque la retención de copias ordenaba por la fecha del nombre. Y docker compose up -d --build NO aplica las migraciones: el código va por volumen, así que un git pull no cambia la imagen, y sin cambio de imagen compose no recrea el contenedor. Hace falta --force-recreate. Está en la sección 7 de DEPLOYMENT.md.

DEL CÓDIGO, tres cosas que no se deducen leyéndolo. El cifrado del backup es asimétrico: en kastor solo está la clave pública, así que la máquina cifra y NO descifra, y quien la comprometa no puede leer las copias que ya subió. El bloqueo por inactividad compara marcas de tiempo y no usa setTimeout, porque los navegadores estrangulan los temporizadores de las pestañas ocultas. Y los avisos de sonner no viven en el árbol de React: su estado es global al módulo, así que cleanup() no los borra y se filtran entre tests, cosa que cubre un toast.dismiss() en el afterEach global.

DEL ENTORNO. El frontend exige Node 24 y desde el issue 255 se comprueba al instalar: si npm ci falla con EBADENGINE, la respuesta es actualizar Node y no tocar el .npmrc.

Y EL CAMBIO DE REGLA DEL 17 DE AGOSTO, que afecta a todo lo que se escriba a partir de ahora: el código va en inglés INCLUIDOS los comentarios y los nombres de test, y el español se queda en docs/. Lo ya escrito se convierte en el issue 251, y el comprobador de identificadores se retira CON esa conversión y no antes, porque mientras haya prosa española pegada a código inglés sigue siendo la única red que detecta el arrastre.

La Iteración 6 se cerró el 16 de agosto de 2026 y el repositorio dejó de tener afirmaciones que nadie podía comprobar. El código está entero en inglés —cero identificadores en español en las seis áreas, producción y tests—, hay comandos que lo comprueban, y el CI los ejecuta en cada PR. Hay 379 tests en la web, 238 en la API, 60 del propio utillaje, análisis estático en nivel max sin baseline y CI en verde. Las cifras incluyen el 197 y el 202, cerrados justo después de la iteración.

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

El 229, que no se puede llegar a la vault desde fuera de la red local. Se dejó fuera de la 7 a propósito, porque puede acabar resolviéndose con una instancia en hosting compartido en vez de con un túnel, y esa decisión no era de esta iteración. El issue guarda ya razonada la diferencia entre Tailscale, Cloudflare, una VPN propia y el hosting compartido, según quién termina el TLS, para no discutirlo dos veces.

Y el 251, convertir a inglés los comentarios y los nombres de test que quedan en español, que es lo que permite jubilar el comprobador de identificadores y sus 1.600 líneas. Su volumen real se midió al planificar la Iteración 8 y es mayor de lo que el issue decía: 805 nombres de test y unas 3.870 líneas de comentario en 214 ficheros, porque faltaban por contar api entero y scripts entero.

De la Iteración 8 quedan dos deudas abiertas, las dos aparecidas al verificar el 266: el 276, que un segundo clon puede borrar los datos del primero, y el 277, que la instancia real no tiene clave de recuperación. El 259, el 263, el 264, el 265 y el 266 se cerraron el 18 de agosto.

No es deuda, aunque lo parezca: que el rate limiting cuente peticiones y no solo intentos fallidos. Se evaluó, se descartó con motivo y no hay intención de cambiarlo; está documentado en el código y en un test.


SIGUIENTE PASO

Cerrados los bloques 1 y 2 y el primero del 3: el 259, el 263, el 264, el 265 y el 266. Quedan el 267, que rota la contraseña maestra sobre la instancia real, y el 260, el bloqueo por inactividad en navegador.

PERO EL 267 ESTÁ BLOQUEADO, y no por planificación sino por algo que apareció midiendo: la instancia real NO TIENE CLAVE DE RECUPERACIÓN. Su recovery_wrapped_key es NULL, así que las 370 contraseñas dependen de un solo secreto y el 267 se haría sin la red que su propio alcance daba por supuesta. Va en el 277, que bloquea al 267 en GitHub. ADR-010 y los issues 126, 127 y 128 construyeron eso entero en la Iteración 4, y la instancia que guarda los datos de verdad no lo usa: es la misma lección de la 7, algo que se da por hecho porque está construido sin comprobar que esté puesto.

DEL 266, lo que hay que saber sin abrirlo. La restauración funciona: 370 items restaurados en una instancia limpia y las contraseñas leídas descifradas en navegador, que es lo que ningún conteo sustituye. Y tres correcciones al procedimiento que el issue asumía: no hace falta descifrar nada, porque el guion deja el JSON en claro en la máquina y solo borra el cifrado; la ruta dentro del contenedor no lleva api/ delante; y montar una segunda instancia en la misma máquina es peligroso, que es el 276.

EL 276 ES EL HALLAZGO QUE MÁS PESA de todo esto. compose.yaml fija name: evault dentro del propio fichero, no lo toma del nombre del directorio, así que un segundo clon en la misma máquina se apropia de los contenedores y volúmenes del primero y un down -v se lleva las 370 contraseñas. Nada avisa. Se sorteó con COMPOSE_PROJECT_NAME, y el procedimiento entero quedó escrito en la sección 7 de DEPLOYMENT.md.

DEL 265. La comprobación distingue dos cosas que parecen la misma, y es toda su razón de ser: si la copia es vieja y la máquina lleva días encendida, el cron está roto y avisa con error; si la copia es vieja y la máquina acaba de arrancar, es que estuvo apagada y lo dice sin alarma. Avisar de las dos igual sería el error, porque una alerta que salta cada lunes tras un fin de semana apagada se aprende a ignorar. Sale de ADR-013: los apagados son deliberados y lo que importa es el desfase entre la última copia y el último cambio.

Después el 266 y el 267, que verifican sobre los datos reales, y el 260 en navegador. El 266 va antes que el 267 y eso no es negociable.

DEL 259, lo que conviene saber sin abrir el issue. El intermitente era un timeout sin configurar, el de Vitest por defecto, contra un test que tarda 916 milisegundos en máquina ociosa. Ahora testTimeout está en 15 segundos y hay un comando, scripts/suite-under-load.sh, que carga la máquina a propósito y lanza la suite N veces guardando la salida entera: con él, 30 pasadas seguidas en verde donde antes salían 20 rojas. Y una trampa que quedó escrita al lado del código porque no es evidente: subir el timeout de Testing Library sin subir el de Vitest EMPEORA el fallo, porque la espera se come el presupuesto del test entero.

DEL 263, lo mismo. El backup ahora se niega a escribir si no hay datos o si la copia tendría menos de la mitad de filas que la anterior, y el guion dejó de invocar al comando con mayor que dev null, así que el log dice cuántas filas lleva cada copia y de qué tablas. Lo que NO comprueba, y conviene no confundirlo: que el ciphertext esté íntegro, porque el servidor no puede leerlo. Esa prueba es el 266 y no hay atajo.

DEL 264. El guion escribe ahora su propio registro en api/storage/logs/offsite-backup.log, con la fecha de cada ejecución, y rota al llegar a un mega. Se descartó journald, que era la alternativa obvia, porque solo persiste entre arranques si existe /var/log/journal, y eso es configuración de la máquina que el guion no puede ver: cambiar un /tmp que se borra seguro por un journal que quizá se borre no es una mejora.

EL CRITERIO 3 ESTÁ CUMPLIDO Y VERIFICADO EN LA MÁQUINA. Se reinició kastor con líneas ya dentro del registro, y el arranque quedó entre las dos: la de las 13:14 sobrevivió, la de las 13:18 se añadió detrás, y /tmp seguía sin nada. Antes, en el primer reinicio del día, se comprobó lo contrario: el log de /tmp desapareció con la copia del cron de la madrugada y la manual de las 10:33 dentro.

Y DEL CRITERIO 2: vaciar la base de datos de una instancia de prueba con Compose y ver fallar el guion entero. En la máquina de desarrollo no hay Docker, así que eso pide una que lo tenga. Lo que sí está verificado ejecutando es el comando contra una base vacía, con test y con mutación, y el guion contra un comando que se niega, comprobando que no llega a llamar ni a age ni a rclone.

Lo que NO entra en esta iteración y está decidido. La conversión del código a inglés, issue 251, que va a la Iteración 9 con el volumen ya corregido y da para una iteración entera por sí sola. Y el acceso a la vault desde fuera de la red local, issue 229, que sigue siendo la mayor limitación de uso diario pero cuya decisión es de alcance y no de esta iteración.

Con la instancia en marcha y contraseñas reales dentro, el criterio para priorizar que apareció al cerrar la 7 sigue mandando: lo que se rompa ahí ya no es reproducible.

CONVENCIONES DE TRABAJO

Git: una rama por issue con el formato tipo/número-descripcion-corta. Merge a master solo mediante PR con squash, un commit por issue. El cuerpo del PR incluye Closes seguido del número para que GitHub cierre el issue automáticamente. Se usa gh CLI.

Definition of Done: criterios de aceptación completos, tests en verde, RBAC validado donde aplique, PR mergeado y este documento actualizado. STATUS.md no hay que tocarlo, lo regenera el CI tras el merge. Los issues con UI se verifican en navegador antes de marcarse como hechos.

Patrones de código heredados de un proyecto anterior: servicios de aplicación con método handle que reciben identificadores explícitos y no acceden a sesión. Double guard, es decir validación en la capa de presentación y también en la capa de aplicación, nunca solo en una. DTOs tipados para transferir datos entre capas. Servicios idempotentes para operaciones de agregación. Tests de aislamiento cross-tenant en todos los servicios críticos.
