SPRINT CONTEXT — eVault
Actualizado: 19 de agosto de 2026
Estado: Iteración 9 planificada el 19 de agosto de 2026. Sin empezar.

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
Por qué el proyecto está construido así: los dieciséis ADR en docs/architecture/decisions.
Historial de iteraciones cerradas y sus lecciones: docs/planning/archive.
Modelo de datos y contrato del blob: docs/architecture/FOUNDATION.md, lectura obligatoria antes de tocar la API o de añadir una columna a vault_items.
Qué llave abre qué y qué se pierde con cada una: docs/architecture/KEYS.md, que es de consulta y responde sin abrir ningún ADR.
Comandos, URLs, workflow git e idioma del código: CLAUDE.md en la raíz.
Reglas de la propia documentación: docs/GUIDE.md.


DECISIONES DE ARQUITECTURA CERRADAS

Los dieciséis ADR de docs/architecture/decisions son la fuente de verdad, y son inmutables: si una decisión cambia, se escribe uno nuevo que la supersede. Lo que sigue es el índice para saber cuál abrir, no un sustituto de abrirlo.

Los seis primeros están numerados por profundidad arquitectónica y no por fecha. ADR-001 zero-knowledge. ADR-002 React para la vault y Filament solo para administración, porque el server-side rendering rompería la garantía. ADR-003 monorepo. ADR-004 multi-tenancy sin Spatie teams, con el contexto de tenant explícito en cada llamada porque la API es stateless. ADR-005 arquitectura self-hosteable. ADR-006 TypeScript 6, con un bloqueador verificable detrás.

A partir del 007 la numeración es cronológica. ADR-007 el token de sesión vive solo en memoria, así que recargar no es una expulsión sino el bloqueo de la vault. ADR-008 arquitectura de claves. ADR-009 el proyecto deja de ser un SaaS. ADR-010 clave de recuperación. ADR-011 formato de export e import. ADR-012 estrategia de despliegue. ADR-013 emplazamiento y operación de la instancia personal, que es además donde queda corregida la imprecisión de ADR-012 sección 2.3 al meter Tailscale, Cloudflare y una VPN propia en el mismo saco. ADR-014 cambio de correo electrónico, y de ahí lo único que hay que tener presente sin abrirlo: cambiar el correo SÍ invalida la clave de recuperación, al contrario que rotar la contraseña maestra, porque el correo es el salt del HKDF que deriva sus claves. ADR-015 acceso a la vault desde fuera de la red local, que elige Tailscale y explica por qué el criterio no es la comodidad sino quién puede servir el JavaScript. ADR-016 un solo origen para la SPA y la API, que mueve la API a /api del mismo host y retira CORS, y de ahí lo que hay que tener presente: dos lineamientos de ADR-012 sección 4 dejaron de regir y siguen escritos ahí, porque los ADR son inmutables.

Del 012 conviene tener presente una cosa sin abrirlo, porque decide si un despliegue funciona o no: HTTPS no es endurecimiento, es requisito de arranque. Fuera de localhost no existe crypto.subtle en contexto inseguro, así que una instancia servida por http en un dominio propio o en una IP de la red local no es una instalación limitada, es una donde no se puede ni registrar un usuario. Y la excepción de .localhost no rescata nada aquí: vale en la máquina que ejecuta el navegador, no desde otro dispositivo de la red.

Lo único de todo esto que hay que tener en la cabeza sin abrir nada, porque explica la forma de casi todo el código: la contraseña maestra no cifra los items. PBKDF2 con 600.000 iteraciones deriva del par contraseña y correo una clave maestra cuyo único trabajo es ENVOLVER una clave de vault aleatoria de 256 bits, y es esa la que cifra con AES-256-GCM. Por eso cambiar la contraseña maestra es reenvolver 32 bytes en vez de recifrar la vault, y por eso la clave de recuperación puede ser un segundo envoltorio de la MISMA clave sin duplicar nada. El hash que viaja al servidor se deriva de la clave maestra usando la contraseña como salt: quien lo capture consigue una sesión, no el contenido.

Y la consecuencia que más se malinterpreta, con test que falla si el aviso desaparece: rotar la contraseña maestra NO invalida la clave de recuperación, porque la clave de vault no cambia. Quien sospeche un robo tiene que regenerarla aparte.


DÓNDE ESTAMOS

La Iteración 9 se planificó el 19 de agosto de 2026 y está en curso. Su objetivo es que la vault se pueda consultar desde fuera de casa, y que lo que lleva dos iteraciones sin verificarse quede verificado. Catorce issues en seis bloques, del 284 al 296 más el 251, el 260 y el 281 que vienen de antes. El plan entero, con los criterios de salida y los riesgos, está en la sección 1 de docs/planning/STATUS.md.

EL 284 Y EL 285 ESTÁN CERRADOS. Lo siguiente es el 295, que es el ADR-016 y va solo, y después el 296.

POR QUÉ HAY UN ADR-016 QUE NO ESTABA EN EL PLAN, y es lo que hay que saber antes de tocar nada: el 286 NO ERA EJECUTABLE. Tailscale da exactamente un nombre DNS por máquina, el despliegue usa dos hostnames —evault.local y evault-api.local—, y la URL de la API se hornea en el bundle en tiempo de build. No hay dónde poner el segundo host, y aunque lo hubiera, un artefacto apunta a una sola API, así que los dos caminos que la decisión 4 del ADR-015 quería conservar no podían convivir. La salida es servir la API bajo /api del mismo origen, y con eso CORS desaparece entero. El 286 está replanteado y depende del 296.

Y LO QUE ESO DICE DEL MÉTODO, que conviene no leer como un fallo: el ADR-015 decidió bien el qué y asumió sin verificar que el cómo encajaba, y lo destapó la primera hora de implementación. Poner la decisión delante del código no evita el error; lo que hace es que aparezca en un documento y no en una máquina con 370 contraseñas dentro.

DEL ADR-016 HAY QUE TENER PRESENTE UNA COSA SIN ABRIRLO, porque afecta a cualquiera que lea ADR-012: dos de sus lineamientos de la sección 4 dejaron de regir —que CORS_ALLOWED_ORIGINS lleva el dominio real, y que la SPA se construye por despliegue— y SIGUEN ESCRITOS AHÍ con autoridad, porque los ADR son inmutables. Lo único que los corrige es la sección 7 del ADR-016.

LA REGLA QUE SE SIGUE MANTENIENDO: la decisión se escribe ANTES de tocar la máquina. Tocar el TLS de la instancia con las 370 contraseñas reales sin la decisión escrita es cómo se acaba con una configuración que nadie sabe por qué es así, y por eso el 295 va solo igual que fue el 285.

Y OJO CON UNA COSA QUE EL 229 AFIRMA Y ES FALSA, porque cuesta media tarde de trabajo inútil: dice que hay que corregir ADR-012 sección 2.3, que metía Tailscale, Cloudflare y una VPN propia en el mismo saco. ESA CORRECCIÓN YA ESTÁ HECHA, en ADR-013 sección 1, el mismo día en que se escribió el 229. Ahí está la tabla de las cuatro vías, el criterio del JavaScript servido y la frase de que ADR-012 no se supersede. Lo que ADR-013 dejó a propósito para otro ADR es la DECISIÓN, y eso fue el 285, ya cerrado. La planificación de la Iteración 9 copió esa afirmación del 229 sin comprobarla y la escribió en dos documentos antes de verificarla, así que el fallo que este repositorio lleva cinco iteraciones documentando se cometió mientras se documentaba.

POR QUÉ TAILSCALE Y NO OTRA, que es lo único de la decisión que hay que tener en la cabeza: no ve el JavaScript servido. Quien controla el JavaScript controla el cifrado en el cliente, porque puede servir una versión que se quede la contraseña maestra, y ADR-001 no protege de eso. Eso descarta Cloudflare Tunnel, que termina el TLS en su borde, y el hosting compartido, que además alojaría la base de datos. Frente a una VPN propia, Tailscale no abre puertos y además emite certificado válido dentro de la tailnet, lo que elimina instalar la CA interna a mano en cada dispositivo.

Y LA TRAMPA DEL OBJETIVO, que conviene tener presente desde el primer día: una verificación de acceso remoto hecha desde el wifi de casa no verifica nada, y todo funcionaría igual sin haber resuelto el problema. Hay que apuntar el operador móvil y que el wifi estaba apagado, y comprobar el negativo: con Tailscale desconectado, la vault NO responde.

La Iteración 8 se cerró el 18 de agosto de 2026 y las copias de seguridad dejaron de ser un acto de fe. Ocho issues cerrados, tres de ellos abiertos por el camino. Siete de los ocho criterios de salida cumplidos. El detalle y las lecciones están en docs/planning/archive/ITERACION_8.md.

LO QUE CAMBIÓ, Y ES LO QUE HAY QUE SABER. Antes de esta iteración las copias existían, salían cifradas de la máquina y NADIE HABÍA ABIERTO UNA VAULT DESDE NINGUNA. Ahora se restauró una con las 370 contraseñas dentro en una instancia limpia y se leyeron items descifrados en un navegador. El procedimiento entero está en la sección 7 de DEPLOYMENT.md.

Y ADR-008 dejó de ser un argumento para ser una medición: rotar la contraseña maestra sobre 370 contraseñas reales tardó DOS SEGUNDOS, con el ciphertext de los items idéntico byte a byte antes y después. La contraseña maestra no cifra los items, solo envuelve una clave de vault de 256 bits, así que rotar reenvuelve 32 bytes. Y recovery_wrapped_key tampoco cambió, lo que confirma medido que rotar NO invalida la clave de recuperación.

LO QUE SE ARREGLÓ Y NO ESTABA PREVISTO. El backup subía copias vacías sin protestar, y ahora se niega si no hay datos o si la copia tendría menos de la mitad de filas que la anterior. Su registro vivía en /tmp, en una máquina que se apaga a propósito, y ahora sobrevive al arranque. Una noche sin copia no producía ningún efecto visible, y ahora avisa distinguiendo un cron roto de una máquina que estuvo apagada. Y compose.yaml fijaba el nombre del proyecto DENTRO del fichero, así que un segundo clon podía llevarse los volúmenes del primero; ahora sale del directorio.

EL ÚNICO CRITERIO QUE NO SE CUMPLIÓ es el mismo que quedó sin cumplir en la 7: el bloqueo por inactividad verificado en navegador. Hay una observación de uso real —la vault se bloqueó sola durante la sesión y hubo que reescribir la contraseña maestra— pero sin horas apuntadas no es una verificación. La causa de fondo no es técnica: exige cuatro esperas de quince minutos delante de una pantalla, y un criterio que cuesta eso se pospone siempre. Sale al 281, automatizarlo con reloj real.

La Iteración 7 se cerró el 18 de agosto de 2026 y eVault dejó de ser un proyecto que funciona para pasar a ser la vault donde están las contraseñas de verdad, que era el propósito número uno de ADR-009. Dieciocho issues cerrados, seis de ellos abiertos por el camino. Hay 442 tests en la web, 263 en la API, 73 del utillaje, análisis estático en nivel max y CI en verde. El detalle y las lecciones están en docs/planning/archive/ITERACION_7.md.

DE LOS OCHO CRITERIOS DE SALIDA, seis quedaron cumplidos, uno parcial y uno sin verificar, y eso se dice en vez de estirar la definición para que cuadre. El que falta es el 4: que la vault se bloquee sola comprobado EN NAVEGADOR con la pestaña en segundo plano, que ningún test sustituye y que exige quince minutos de reloj real. Queda en el issue 260. El 5 está implementado y probado con 41 tests pero no ejecutado sobre la instancia real, porque hacerlo ahí significa re-derivar las claves de una vault con 370 contraseñas dentro. Y el 8 quedó parcial por un test intermitente sin identificar, que es el issue 259.

QUÉ HAY FUNCIONANDO. La instancia personal vive en kastor, en ~/apps/evault y por el puerto 443. Desde el 19 de agosto sirve UN SOLO ORIGEN —la API va en /api, ver ADR-016— y por DOS nombres: evault.local con la CA interna de Caddy para la red local, y el nombre de la tailnet con certificado de Let's Encrypt para todo lo demás. El segundo no necesita instalar ninguna CA en el dispositivo, que era el paso manual por cada móvil.

Y EL CICLO ENTERO ESTÁ VERIFICADO DESDE FUERA DE LA RED, el 19 de agosto de 2026 a las 11:30, desde un iPhone con Safari por datos móviles de Movistar y CON EL WIFI APAGADO, que es la condición sin la cual esta verificación no verifica nada. Desbloqueo en dos segundos, item leído descifrado, item nuevo creado y visible tras recargar, y la vault bloqueándose al recargar como manda ADR-007. El dispositivo NUNCA tuvo instalada la CA interna: evault.local le da ERR_CERT_AUTHORITY_INVALID y el nombre de la tailnet carga sin un solo aviso, así que las dos mitades quedan demostradas en el mismo aparato.

LO QUE HACE QUE ESO SEA UNA VERIFICACIÓN Y NO UN TESTIMONIO son tres comprobaciones hechas contra el servidor, no contra la impresión de quien miraba. El item creado desde fuera está en la base de datos con version 2, 144 bytes de ciphertext y 16 de iv. Su nombre NO aparece en claro por ningún lado: cero coincidencias buscando la cadena en la tabla, y lo que hay es base64 opaco. Y el tráfico llegó por Tailscale y no por otro camino, medido en el propio peer: iphone175, iOS, 89.308 bytes transmitidos. El item de prueba se borró después y la vault volvió a sus 370.

EL CONTROL NEGATIVO TAMBIÉN PASA: con el interruptor de Tailscale apagado en el móvil, y el wifi todavía apagado, la vault deja de ser accesible. Sin eso, lo anterior no demostraría por dónde llegó el tráfico.

Y UN DATO MEDIDO QUE NO ESTABA EN NINGÚN SITIO: el certificado que emite la CA interna de Caddy dura DOCE HORAS, no meses. Se descubrió al escribir el aviso de caducidad del 287, cuya primera versión usaba un umbral fijo de 21 días y habría nacido en rojo señalando un certificado sano que Caddy rota varias veces al día. Por eso el margen de scripts/check-cert-expiry.sh es una fracción de la vida del certificado y no un número de días. El certificado está instalado en el Windows de casa y el ciclo se verificó en navegador desde otro dispositivo: crear item, recargar para que la vault se bloquee, desbloquear y descifrar. Comprobado además contra la base de datos que el servidor no puede leer nada. Un cron a las 3 llama a scripts/offsite-backup.sh, que pide la copia, la cifra con age y la sube a Dropbox; la clave privada está en OneDrive, otro proveedor, que es lo que hace que el cifrado sirva de algo. El cron lleva disparando solo desde la noche del 17.

Y DENTRO HAY CONTRASEÑAS DE VERDAD desde el 18 de agosto: 370 items, todos con version 2, ninguno vacío ni sin nonce. Eso cambia cómo hay que tratar esa máquina: lo que se rompa ahí ya no es reproducible.

LO QUE HAY QUE SABER ANTES DE TOCAR ESA MÁQUINA. Su reloj no es monótono entre arranques —el RTC marca 2019 y systemd restaura la fecha del último apagado antes de que NTP corrija—, así que los timestamps de systemd del arranque en curso mienten; de ahí salió el issue 240, porque la retención de copias ordenaba por la fecha del nombre. Y docker compose up -d --build NO aplica las migraciones: el código va por volumen, así que un git pull no cambia la imagen, y sin cambio de imagen compose no recrea el contenedor. Hace falta --force-recreate. Está en la sección 7 de DEPLOYMENT.md.

DEL CÓDIGO, tres cosas que no se deducen leyéndolo. El cifrado del backup es asimétrico: en kastor solo está la clave pública, así que la máquina cifra y NO descifra, y quien la comprometa no puede leer las copias que ya subió. El bloqueo por inactividad compara marcas de tiempo y no usa setTimeout, porque los navegadores estrangulan los temporizadores de las pestañas ocultas. Y los avisos de sonner no viven en el árbol de React: su estado es global al módulo, así que cleanup() no los borra y se filtran entre tests, cosa que cubre un toast.dismiss() en el afterEach global.

DEL ENTORNO. El frontend exige Node 24 y desde el issue 255 se comprueba al instalar: si npm ci falla con EBADENGINE, la respuesta es actualizar Node y no tocar el .npmrc.

Y EL CAMBIO DE REGLA DEL 17 DE AGOSTO, que afecta a todo lo que se escriba a partir de ahora: el código va en inglés INCLUIDOS los comentarios y los nombres de test, y el español se queda en docs/. Lo ya escrito se convierte en el issue 290 —se citó como el 251 hasta el 19 de agosto, ver la deuda—, y el comprobador de identificadores se retira CON esa conversión y no antes, porque mientras haya prosa española pegada a código inglés sigue siendo la única red que detecta el arrastre.

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

Y el 290, convertir a inglés los comentarios y los nombres de test que quedan en español, que es lo que permite jubilar el comprobador de identificadores y sus 1.604 líneas. OJO CON ESTE, porque el número cambió: hasta el 19 de agosto esta deuda se citaba como el 251, y el 251 no era eso. El 251 era la DECISIÓN de si migrar, tomada ya el 17 de agosto en el 253, y su propio cuerpo dice que no es una propuesta de migrar. CLAUDE.md afirmaba desde entonces que la conversión era un issue aparte y ese issue no existía; se creó al planificar la Iteración 9 y es el 290. El volumen, remedido entonces: 3.904 líneas de comentario en 214 ficheros y unos 754 nombres de test.

Esa deuda NO está congelada, y es lo que corrige el 291. En los dos primeros días de la regla nueva se añadieron catorce líneas de comentario en español sin que nada lo señalara, porque check-identifiers.py mira identificadores y no comentarios. Sobre 3.904 no es mucho; el problema es que nada lo frena. Por eso la red va en la Iteración 9 aunque la conversión vaya en la 10, y por eso comprueba las líneas añadidas y no el árbol: un comprobador que naciera en rojo con 3.904 líneas esperando se acabaría ignorando entero, que es la lección del 62.

De la Iteración 8 queda el 281, automatizar la verificación del bloqueo por inactividad, que es lo que desatasca el 260. El 276 se arregló y el 277 se cerró como falso positivo. El 259, el 263, el 264, el 265 y el 266 se cerraron el 18 de agosto.

No es deuda, aunque lo parezca: que el rate limiting cuente peticiones y no solo intentos fallidos. Se evaluó, se descartó con motivo y no hay intención de cambiarlo; está documentado en el código y en un test.


SIGUIENTE PASO

Tomar el 284 y ejecutar la planificación de la Iteración 9, que ya está escrita en la sección 1 de STATUS.md. Después el 285, que va solo.

EL ORDEN DE LOS BLOQUES Y POR QUÉ ES ESE. Primero el ADR, porque la decisión se escribe antes de tocar una máquina con 370 contraseñas irreproducibles dentro. Después el acceso remoto —286, 287 y 288—, que es el objetivo. Y solo entonces el bloque de verificaciones, porque el 281 necesita una instancia desechable y montarla sale más barato con el acceso ya resuelto.

LO QUE HAY QUE VIGILAR EN CADA BLOQUE, que es donde estas cosas se rompen:

En el acceso remoto ya no hay que ajustar ni el origen de CORS ni el VITE_API_URL: los dos desaparecieron con el 296. Lo que hay que vigilar ahora es lo contrario, que nadie los reintroduzca — y de eso se encarga el test de tests/Feature/ApiCorsTest.php.

En el certificado, que la renovación esté comprobada y no supuesta. Un certificado de noventa días en una máquina que ADR-013 apaga a propósito es la forma exacta del fallo del 265: una noche sin copia no producía ningún efecto visible.

En la clave de recuperación, que se hace contra una instancia restaurada y DESECHABLE. recoverAccess fija una contraseña nueva, así que el camino no se puede partir ni ensayar a medias, y hacerlo contra la personal la dejaría con una contraseña que nadie eligió.

En el bloqueo por inactividad, que no se puede falsear el reloj. Quince minutos reales y estrangulamiento real: falsearlo reproduce lo que los 24 tests del 220 ya cubren, y convierte el criterio en un cero tranquilizador con otra forma.

LO QUE QUEDA FUERA DE LA 9 Y ES DELIBERADO. La conversión del código a inglés, el 290, por ADR-009 sección 4: es legibilidad y va detrás de la fiabilidad. Sale de esta iteración con la red del 291 puesta para que no siga creciendo, que es lo que la hace esperable sin coste. Y el punto flojo de RecoveryKey.tsx, al 61 por ciento de sentencias y 50 de funciones: se anota porque apareció al medir, pero cubrir una pantalla no es el objetivo de esta iteración y no se mete por inercia.


CONVENCIONES DE TRABAJO

Git: una rama por issue con el formato tipo/número-descripcion-corta. Merge a master solo mediante PR con squash, un commit por issue. El cuerpo del PR incluye Closes seguido del número para que GitHub cierre el issue automáticamente. Se usa gh CLI.

Definition of Done: criterios de aceptación completos, tests en verde, RBAC validado donde aplique, PR mergeado y este documento actualizado. STATUS.md no hay que tocarlo, lo regenera el CI tras el merge. Los issues con UI se verifican en navegador antes de marcarse como hechos.

Patrones de código heredados de un proyecto anterior: servicios de aplicación con método handle que reciben identificadores explícitos y no acceden a sesión. Double guard, es decir validación en la capa de presentación y también en la capa de aplicación, nunca solo en una. DTOs tipados para transferir datos entre capas. Servicios idempotentes para operaciones de agregación. Tests de aislamiento cross-tenant en todos los servicios críticos.
