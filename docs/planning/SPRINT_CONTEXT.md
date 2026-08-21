SPRINT CONTEXT — eVault
Actualizado: 21 de agosto de 2026
Estado: Iteración 11 en curso desde el 21 de agosto de 2026, planificada en el issue 347. La 10 se cerró ese mismo día.

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

LA ITERACIÓN 11 ESTÁ EN CURSO desde el 21 de agosto de 2026, planificada en el issue 347. Objetivo: la vault de 370 contraseñas se maneja como una vault de verdad. Once issues en seis bloques, y las mediciones que lo sostienen están en la sección manual de STATUS.md.

DE DÓNDE SALIÓ ESE OBJETIVO, porque no es el que tocaba. ADR-009 sección 4 pone la funcionalidad nueva en tercer lugar y las tres primeras columnas estaban agotadas, así que tocaba TOTP y organizar la vault. Al usar la aplicación con 370 entradas dentro —cuenta limpia, CSV generado, importado y recorrido en Chromium— aparecieron seis defectos medidos, y ninguno se ve leyendo el código ni lo detecta la suite, porque los tests de la lista montan tres items. Cuatro minutos para importar y un segundo largo por cada borrado son fiabilidad de uso, que es la primera columna otra vez.

Y EL PRIMERO LO ENCONTRÓ QUIEN USA LA VAULT, NO UNA HERRAMIENTA: con 370 entradas el menú de usuario queda a 27.464 píxeles con la ventana en 900, así que para cerrar sesión, cambiar la contraseña maestra o llegar a la clave de recuperación hay que recorrer las 370 entradas enteras. El aside toma la altura del documento y no la de la ventana. Es otra vuelta de la lección de la Iteración 5: el camino que nadie recorre es el que está roto, y el camino era la vault real.

LOS NÚMEROS, para no tener que abrir STATUS.md. La lista de 370 tarda entre 2.657 y 2.804 milisegundos en pintarse, de los cuales la petición son 77 y el descifrado 25: el resto es React montando 7.839 nodos. La primera pulsación en el buscador cuesta 773 milisegundos y vaciarlo 1.293. Importar 370 entradas tardó 4 minutos y 19 segundos con 741 peticiones —un POST y un GET de la lista completa por entrada, unos 68.000 items descargados para escribir 370—. Borrar una entrada cuesta 1.191 milisegundos y dos peticiones. El export de las 370, en cambio, fue instantáneo, porque cifra el JSON entero una vez.

HAY DOS CAUSAS RAÍZ Y NO SEIS DEFECTOS SUELTOS: la lista no está virtualizada, y toda escritura invalida la lista entera. La segunda es la que multiplica el import por 370.

LO QUE ESO DESCARTÓ, con la medida delante: paginar GET /items en el servidor, que era el candidato heredado de la 10. La petición son 77 milisegundos de los 2.700, así que paginar no tocaría el 95 por ciento del coste, y además buscar seguiría exigiendo la vault entera en el cliente porque el servidor no puede filtrar lo que no puede leer.

Y UN DATO QUE HACE FALTA CUANDO LLEGUEN TOTP Y LAS ETIQUETAS: añadir un campo al blob NO obliga a subir version. Version es la del esquema criptográfico —1 fue base64 sin cifrar, 2 es AES-256-GCM y es la vigente—, no la del contenido, y FOUNDATION.md ya manda omitir las claves que no se rellenan en vez de escribirlas como null. Así que un campo nuevo dentro del JSON cifrado es retrocompatible sin migración y sin que el servidor se entere. Subir version significaría cambiar cómo se cifra, y eso sí es caro: tendría que recifrar cada cliente item por item, porque el servidor no puede leerlos.

La Iteración 10 se cerró el 21 de agosto de 2026 y el repositorio pasó a leerse entero en un idioma: 3.836 líneas de comentario y 461 nombres de test convertidos en seis capas, y el andamiaje que lo vigilaba jubilado. Dieciséis issues. El detalle y las lecciones están en docs/planning/archive/ITERACION_10.md, y conviene leerlo antes de tocar la regla de idioma, su comprobador, el censo o el volcado de texto visible.

LO QUE HAY QUE SABER DE ESO, sin abrir el archivo. La regla de idioma la vigila UN solo comando y en modo --all: check-comment-language.py mira el árbol entero y el CI lo ejecuta en cada PR, así que ensuciarlo otra vez duele el mismo día. check-identifiers.py ya no existe, ni su lista, ni sus extractores: 1.885 líneas fuera. Y dump-ui-text.mjs sobrevivió porque hace otra cosa —comparar el texto visible antes y después de un renombrado— y ahora es scripts/ui-text.mjs, con tests propios.

EL CENSO DETECTA LA PÉRDIDA DESPROPORCIONADA, NO CUALQUIER PÉRDIDA, y conviene saberlo antes de fiarse de él: permite el 15 por ciento con un suelo de 3 líneas, porque una traducción fiel también encoge. En un fichero de 43 líneas de comentario, borrar 6 pasa y borrar 7 no. Si la pérdida es deliberada se justifica con una línea «Censo: <motivo>» en el cuerpo del PR.

Y LA LECCIÓN DE LA ITERACIÓN, que vale para cualquier trabajo por capas: traducir obliga a leer entero lo que un grep solo mira por encima. Eso destapó seis notas caducadas y tres comentarios huérfanos de su código, ninguno encontrable buscando, y los tres huérfanos afirmaban además cosas falsas. Una conversión no es trabajo mecánico: su valor no está en el texto resultante sino en haber tenido que leer el anterior.

DEL ENTORNO DE DESARROLLO SALIERON DOS COSAS QUE NO SE DEDUCEN LEYENDO. El bloque de Caddy que hace falta está ahora escrito en SETUP.md, porque ese fichero vive en /etc/caddy, no se versiona y necesita sudo: su única copia estaba en una máquina, y por eso la documentación y la realidad divergieron desde el 296 sin que nada lo notara. Y un host retirado de Caddy SIGUE respondiendo 200, con cero bytes, porque cualquier nombre acabado en .localhost resuelve a loopback y entra en el bloque del puerto; lo que distingue «retirado» de «sirviendo» es el tamaño del cuerpo y no el código.

LO QUE APARECIÓ AL PLANIFICAR Y NO ESTABA EN NINGÚN DOCUMENTO son cinco hallazgos, en la sección manual de STATUS.md. Los cinco se resolvieron dentro de la iteración, y el patrón que comparten es el que este proyecto arrastra desde el criterio 7 de la Iteración 4: una afirmación escrita en un documento que le da autoridad y que nadie volvió a comprobar.

La Iteración 9 se cerró el 19 de agosto de 2026 y la vault dejó de servir solo dentro de casa. Quince issues cerrados, cinco de ellos abiertos por el camino sobre un plan de doce. Siete de los ocho criterios de salida cumplidos y uno a medias porque estaba mal escrito. El detalle y las lecciones están en docs/planning/archive/ITERACION_9.md.

QUÉ HAY FUNCIONANDO AHORA. La instancia de kastor se alcanza por dos nombres: evault.local con la CA interna de Caddy desde la red local, y el nombre de la tailnet con certificado de Let's Encrypt desde donde sea. El segundo no necesita instalar ninguna CA en el dispositivo, que era el paso manual por cada móvil. En la tailnet hay tres dispositivos. Y la API vive en /api del MISMO origen que la SPA desde ADR-016, así que CORS ya no existe en el proyecto y un dist construido una vez sirve desde cualquier hostname.

LO QUE HAY QUE SABER ANTES DE TOCAR ESTO, y no se deduce leyendo el código. Los nombres de máquina de una tailnet se publican en el registro público de Certificate Transparency, así que no pueden nombrar el proyecto. El certificado que emite la CA interna de Caddy dura DOCE HORAS y no meses. Con HTTPS quien elige el sitio es el SNI y no la cabecera Host, de modo que -H "Host: ..." contra localhost falla en el handshake y devuelve 000, que parece el servidor caído estando perfectamente. Y borrar config/cors.php NO retira CORS: Laravel cae en su valor por defecto con comodín y la API pasa a responder a cualquier origen; lo que hay que quitar es el middleware.

EL BLOQUEO POR INACTIVIDAD Y LA CLAVE DE RECUPERACIÓN YA NO SON PROMESAS. El primero se verifica con scripts/verify-auto-lock.mjs en dieciocho minutos de reloj real y cinco casos, incluida la pestaña realmente oculta; solo el móvil sigue siendo manual. La segunda se probó sobre una vault real restaurada: el ciphertext de los 370 items quedó idéntico byte a byte, que es ADR-008 en producción.

Y LA REGLA DE IDIOMA TIENE RED desde el 291: scripts/check-comment-language.py marca la prosa española que un cambio AÑADE, y no mira el árbol a propósito porque quedan 3.950 líneas esperando al 290. Cero falsos positivos sobre 333 líneas inglesas, medido.

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

EL HOSTING COMPARTIDO QUEDA POSPUESTO A PROPÓSITO, decidido el 19 de agosto de 2026, y conviene saber que NO es una decisión aplazada por inercia: es el disparador que ADR-013 sección 6 dejó escrito, que dice reevaluar el emplazamiento si el patrón de uso demuestra que la vault se queda a medio poblar por no estar disponible. Lo que urgía —cómo llegar a la vault desde fuera— ya está decidido y funcionando con Tailscale, y lo que queda abierto es solo el emplazamiento alternativo.

LO QUE HAY QUE MIRAR ANTES DE REABRIRLO, y son tres señales y no una impresión, porque en este proyecto una impresión no cierra un criterio. Primera: cuántas veces se quiso consultar una contraseña y no se pudo porque kastor estaba apagado; es LA medida, porque es el riesgo que ADR-013 sección 2.2 registra. Segunda: cuántas veces se recurrió al gestor anterior, que es el síntoma de ADR-009 sección 1 fallando. Tercera: si Tailscale se desconecta solo en algún dispositivo y hay que reconectarlo a mano, que es una fricción distinta de la de una máquina apagada. Si en dos o tres semanas las tres son cero o casi, se cierra la puerta con la medición delante en vez de por silencio.

LA TAILNET TIENE TRES DISPOSITIVOS desde el 19 de agosto: kastor, el portátil Windows y el iPhone. Con eso la vault se alcanza desde los tres sin instalar ningún certificado.

Y UN CABO QUE HAY QUE CERRAR EN EL 292, no posponer otra vez: ADR-012 sección 2.4 prometió que quedaba issue abierto para verificar el hosting compartido, y ese issue nunca existió. Lo detectó ADR-013 y lo repitió ADR-015, que además dijo que con el hosting descartado como vía de acceso esa verificación pierde demanda. Pero eso sigue siendo una frase dentro de un ADR sobre otra cosa. Cerrarlo explícitamente al cerrar la iteración evita la cuarta vuelta.

LO QUE NO SE POSPUSO, y conviene no confundirlo: el hosting compartido está descartado COMO VÍA DE ACCESO en ADR-015, por el criterio de quién puede servir el JavaScript, y eso no se reabre. Lo pospuesto es su uso como EMPLAZAMIENTO alternativo. Y hay un tercer uso que ninguna de las dos decisiones toca y que ADR-009 sección 4 sí contempla: una instancia de demostración pública, donde el reproche del JavaScript casi desaparece porque no habría nada que robar —la contraseña del fichero de ejemplo está publicada en el README.

LA CLAVE DE RECUPERACIÓN ESTÁ PROBADA SOBRE UNA VAULT REAL, el 19 de agosto de 2026, y era el criterio 5 de la Iteración 7 que llevaba sin ejecutarse. Se restauró la copia de las 370 contraseñas en una instancia desechable —0,4 segundos— y se recuperó el acceso con la clave real, sin usar la contraseña maestra: unos tres segundos, con los items legibles después.

LO QUE DEMUESTRAN LAS HUELLAS, tomadas antes y después contra la base de datos: password y wrapped_key cambiaron, y el CIPHERTEXT DE LOS 370 ITEMS quedó idéntico byte a byte. Es ADR-008 otra vez: recuperar reenvuelve 32 bytes, no recifra la vault. Y el cambio de password demuestra sin tener que probarla que la contraseña maestra anterior dejó de valer.

Y UNA EXPECTATIVA QUE ERA FALSA Y ESTABA ESCRITA EN EL ISSUE 289: que recovery_wrapped_key cambiaría. NO cambia, y hace bien — el envoltorio de recuperación cuelga de la clave de vault y no de la maestra, y recuperar es una rotación. Solo regenerar invalida la clave anterior, y eso lo dice ADR-010. De ahí salió el 309: usar la clave de recuperación no la invalida y nada lo advierte, que importa si quien la usó primero fue otro.

EL BLOQUEO POR INACTIVIDAD YA SE VERIFICA SOLO, con scripts/verify-auto-lock.mjs: dieciocho minutos de reloj de verdad, tres casos en paralelo y sin falsear el tiempo, que es la condición que el 281 no admitía negociar. Conduce un Chromium por CDP sin ninguna dependencia nueva, porque Node 24 ya trae WebSocket. Verde el 19 de agosto de 2026: aviso a los 14,8 minutos, bloqueo a los 15,8, el aviso retirándose con una pulsación y la vault aguantando 18 minutos mientras se escribe cada tres.

Y SE COMPROBÓ QUE SIRVE, subiendo INACTIVITY_LIMIT_MS a una hora: dos de los tres casos en rojo y código de salida 1.

LO QUE NO CUBRE es solo el móvil, y ESE YA ESTÁ VERIFICADO A MANO: el 19 de agosto de 2026, desbloqueada la vault y guardado el iPhone, la pantalla se apagó sola y pasados más de quince minutos la vault estaba bloqueada. Ningún navegador de escritorio reproduce cómo iOS suspende una pestaña de fondo, así que ese caso seguirá siendo manual. Con eso el 260 queda cerrado y el criterio que llevaba desde la Iteración 7 sin cumplirse, cumplido.

LA PESTAÑA REALMENTE OCULTA SÍ SE AUTOMATIZÓ, y llegar ahí exigió deshacer una conclusión equivocada propia. Se midió que /json/activate y Page.bringToFront no ocultan la pestaña de la que salen, y de ahí se concluyó que en headless no podía haber pestañas ocultas. Abrir una pestaña NUEVA sí oculta la anterior. Y una vez oculta, Chromium estrangula de verdad: 60 ticks por minuto los primeros minutos y UNO por minuto a partir del sexto. El caso corre en su propio navegador sin los flags anti-estrangulamiento, porque ahí el estrangulamiento es lo que se prueba y no un estorbo, y comprueba las dos cosas — que la pestaña se ocultó y que estuvo estrangulada— antes de fiarse del resultado.

Y UN DATO MEDIDO QUE NO ESTABA EN NINGÚN SITIO: el certificado que emite la CA interna de Caddy dura DOCE HORAS, no meses. Se descubrió al escribir el aviso de caducidad del 287, cuya primera versión usaba un umbral fijo de 21 días y habría nacido en rojo señalando un certificado sano que Caddy rota varias veces al día. Por eso el margen de scripts/check-cert-expiry.sh es una fracción de la vida del certificado y no un número de días. El certificado está instalado en el Windows de casa y el ciclo se verificó en navegador desde otro dispositivo: crear item, recargar para que la vault se bloquee, desbloquear y descifrar. Comprobado además contra la base de datos que el servidor no puede leer nada. Un cron a las 3 llama a scripts/offsite-backup.sh, que pide la copia, la cifra con age y la sube a Dropbox; la clave privada está en OneDrive, otro proveedor, que es lo que hace que el cifrado sirva de algo. El cron lleva disparando solo desde la noche del 17.

Y DENTRO HAY CONTRASEÑAS DE VERDAD desde el 18 de agosto: 370 items, todos con version 2, ninguno vacío ni sin nonce. Eso cambia cómo hay que tratar esa máquina: lo que se rompa ahí ya no es reproducible.

LO QUE HAY QUE SABER ANTES DE TOCAR ESA MÁQUINA. Su reloj no es monótono entre arranques —el RTC marca 2019 y systemd restaura la fecha del último apagado antes de que NTP corrija—, así que los timestamps de systemd del arranque en curso mienten; de ahí salió el issue 240, porque la retención de copias ordenaba por la fecha del nombre. Y docker compose up -d --build NO aplica las migraciones: el código va por volumen, así que un git pull no cambia la imagen, y sin cambio de imagen compose no recrea el contenedor. Hace falta --force-recreate. Está en la sección 7 de DEPLOYMENT.md.

DEL CÓDIGO, tres cosas que no se deducen leyéndolo. El cifrado del backup es asimétrico: en kastor solo está la clave pública, así que la máquina cifra y NO descifra, y quien la comprometa no puede leer las copias que ya subió. El bloqueo por inactividad compara marcas de tiempo y no usa setTimeout, porque los navegadores estrangulan los temporizadores de las pestañas ocultas. Y los avisos de sonner no viven en el árbol de React: su estado es global al módulo, así que cleanup() no los borra y se filtran entre tests, cosa que cubre un toast.dismiss() en el afterEach global.

DEL ENTORNO. El frontend exige Node 24 y desde el issue 255 se comprueba al instalar: si npm ci falla con EBADENGINE, la respuesta es actualizar Node y no tocar el .npmrc.

Y EL CAMBIO DE REGLA DEL 17 DE AGOSTO, que afecta a todo lo que se escriba a partir de ahora: el código va en inglés INCLUIDOS los comentarios y los nombres de test, y el español se queda en docs/. Lo ya escrito se convierte en el issue 290 —se citó como el 251 hasta el 19 de agosto, ver la deuda—, y el comprobador de identificadores se retira CON esa conversión y no antes, porque mientras haya prosa española pegada a código inglés sigue siendo la única red que detecta el arrastre.

Y DESDE EL 291 LA REGLA TIENE RED: scripts/check-comment-language.py marca los comentarios y nombres de test en español que un cambio AÑADE, y no mira el árbol a propósito, porque quedan 3.950 líneas esperando al 290 y un check que nace en rojo se acaba ignorando entero. Su tasa de falsos positivos está medida y no supuesta: CERO sobre 333 líneas inglesas, con un 76 por ciento de detección sobre las españolas. Cuando el 290 termine, se le pasa --all y no hace falta escribir otro.

LA PREGUNTA QUE ESA REGLA NO RESPONDÍA Y AHORA SÍ, cerrada en el 251 el 19 de agosto: al editar un fichero que YA está en español, lo que se añade va en inglés y lo que ya estaba se queda. Ni se traduce el fichero de paso, porque cada cambio arrastraría una conversión que nadie ha revisado, ni se escribe en español por coherencia, porque eso hace crecer la deuda. Está en CLAUDE.md, que es donde se busca, y no en un comentario suelto de un fichero de tests como estuvo hasta ahora.

La Iteración 6 se cerró el 16 de agosto de 2026 y el repositorio dejó de tener afirmaciones que nadie podía comprobar: el código quedó entero en inglés y hay comandos que lo verifican, ejecutados por el CI en cada PR. Catorce issues. El detalle está en docs/planning/archive/ITERACION_6.md.

De ahí salieron tres comandos, y de los tres quedan dos: check-docs.py mira bytes NUL, marcadores de conflicto, los marcadores de sección manual de STATUS.md y las referencias a documentos que no existen; y ui-text.mjs vuelca el texto visible para compararlo antes y después de un renombrado. El tercero era check-identifiers.py, y lo jubiló el 323. Los que quedan tienen tests y el workflow repositorio los ejecuta siempre, sin filtro de paths.

Lo que se fue con el comprobador de identificadores, para saber qué ya no vigila nadie: marcaba las palabras funcionales españolas pegadas a otra —aItem, deVault— y eso ahora no lo ve nada. Se asume, porque con la frontera entre ficheros ese arrastre no tiene de dónde venir. Lo que nunca comprobó fue la gramática: useVaultPersonal son tres palabras inglesas en orden español y pasaba igual. Eso sigue habiendo que verlo leyendo.

La Iteración 5 se cerró el 7 de agosto de 2026 y eVault dejó de ser un proyecto que solo corría en la máquina de su autor: se levanta con un comando, se despliega con una guía escrita ejecutándola, y tiene portada. Once issues, tres de ellos sin planificar y siendo buena parte del valor. El detalle está en docs/planning/archive/ITERACION_5.md, y conviene leerlo antes de tocar el despliegue, el Compose o cualquier cosa que dependa de auditar el repositorio con grep.

De ahí sale también examples/sample-vault.evault, siete entradas ficticias que se importan con la contraseña publicada en el README. Sirve para ver la aplicación con contenido, y de paso es la demostración más concreta del zero-knowledge que tiene el repositorio: el servidor NO PUEDE sembrar datos, así que la única vía es entregar un fichero cifrado y su contraseña.

El entorno de verificación es kastor, el servidor de casa. No se documenta aquí porque el repositorio es público y son datos de una red doméstica.

La Iteración 4 se cerró el 5 de agosto de 2026 y eVault dejó de ser una vault en la que diera miedo meter contraseñas reales: export e import, rotación de la contraseña maestra, clave de recuperación y copias con dos comandos de Artisan. Diecinueve issues. El detalle está en docs/planning/archive/ITERACION_4.md, y conviene leerlo antes de tocar la rotación, la recuperación o el export. Dos cosas de ahí que valen por sí solas: el middleware ability de Sanctum NO sirve para restringir, porque un token normal lleva la capacidad * y * satisface cualquier comprobación; y el texto de la interfaz se rompe cruzando saltos de línea, así que una auditoría línea a línea no lo ve.

El mapa del cliente, para no tener que buscarlo. La primitiva criptográfica es lib/vault/crypto.ts, el único sitio que llama a crypto.subtle. Encima está lib/vault/payload.ts, que cifra y descifra el contenido de los items. La clave vive en lib/vault/keyInMemory.ts, un store sin persist. Abrirla es unlockVault, en lib/vault/unlock.ts. Y lo que se construyó en esta iteración: masterPassword.ts para rotarla, recoveryKey.ts y recovery.ts para la clave de recuperación, y export.ts e import.ts.

Antes de dar por vivo el entorno local, comprobarlo: suele estar caído al empezar la sesión.

Tres lecciones de método de la Iteración 5, y conviene tenerlas delante porque las tres se pagaron caras.

EL CAMINO QUE NADIE RECORRE ES EL QUE ESTÁ ROTO, que salió cinco veces seguidas. El criterio siete se dio por bueno sin ejecutarlo y era falso. El origen de CORS funcionaba solo con el puerto por defecto y rompía el camino documentado de cambiarlo. El clon quedaba imborrable por su dueño y solo se vio al intentar borrarlo. En una vault vacía no se podía importar, que es justo cuando alguien quiere hacerlo, porque el import siempre se había probado con items delante. Y los nombres mDNS de más de una etiqueta no resuelven, aunque avahi los publique sin protestar. Ninguno de los cinco se ve leyendo el código.

CUANDO DOS MEDIDAS DISCREPAN, LA PRIMERA HIPÓTESIS NO PUEDE SER QUE LA RARA ES LA PROPIA. Al inventariar el renombrado, un extractor propio encontraba identificadores que grep no veía. Se dio por bueno grep y se declararon inexistentes, cuando lo cierto era lo contrario: había un byte NUL en el fichero y grep lo omitía EN SILENCIO. Se estuvo a punto de corregir un inventario correcto para ajustarlo a una herramienta rota. La discrepancia entre dos medidas es información, no ruido.

UN COMPROBADOR QUE OMITE FICHEROS EN SILENCIO ES PEOR QUE NO TENER COMPROBADOR, porque devuelve un cero tranquilizador. Cualquier auditoría con grep tiene que usar -a, o heredará ese punto ciego.


DEUDA CONOCIDA

Deuda sin issue no existe, así que aquí solo hay punteros. La lista viva es la de GitHub filtrando por el label deuda; esto es el resumen para no tener que ir a buscarlo.

EL 290 YA NO ESTÁ AQUÍ, y esa ausencia es el resultado de la Iteración 10: la conversión terminó el 21 de agosto de 2026 con sus seis capas, del 317 al 322, y el andamiaje que la vigilaba se jubiló en el 323. Se anota porque este documento llevaba tres iteraciones citando esa deuda y su cifra, y porque la frase que la acompañaba —«ya no crece sin que nadie lo vea»— se retira con ella: no puede crecer lo que no existe, y dejar la frase sería el mismo mecanismo que produjo la mitad de los hallazgos de la iteración.

Lo que queda en su lugar es un comando: check-comment-language.py --all, en verde sobre el árbol entero y ejecutado por el CI en cada PR.

Los tres de abajo quedaron FUERA de la Iteración 11 salvo el 329, y eso es una decisión y no un olvido: el 332 y el 344 son higiene, no están rotos, y se deciden al cerrar en el 357.

El 344, que api/ arrastra el andamiaje de frontend de Laravel —package.json con Vite y Tailwind, vite.config.js, resources/css y resources/js, y la vista welcome que los referencia—, en un directorio que es una API REST. No está roto, así que es deuda y no bug; y borrarlo a ciegas rompería el test que pide la raíz de la aplicación.

El 329, ENTRA EN LA ITERACIÓN 11 y es su criterio de salida 8: el bloqueo por inactividad también se lleva la clave de recuperación recién generada y el import a medias. Salió al arreglar el 303, y la primera mitad NO es perder trabajo: createRecoveryKey manda la clave al servidor ANTES de enseñarla, así que un bloqueo deja una cuenta con has_recovery_key en true y una clave que su dueño nunca llegó a ver. Se entera el día que la necesita. El mecanismo del 303 lo deja a una línea de resolverse, pero la pantalla de la clave merece decidirse aparte.

Y el hosting compartido, que no tiene issue porque no es deuda sino una decisión pospuesta con criterio. Está descartado COMO VÍA DE ACCESO en ADR-015 y eso no se reabre; lo pospuesto es su uso como emplazamiento, con el disparador de ADR-013 sección 6 y tres señales que decidirán: cuántas veces no se pudo consultar la vault por estar kastor apagado, cuántas se recurrió al gestor anterior, y si Tailscale se desconecta solo.

No es deuda, aunque lo parezca: que el rate limiting cuente peticiones y no solo intentos fallidos. Se evaluó, se descartó con motivo y no hay intención de cambiarlo; está documentado en el código y en un test.


SIGUIENTE PASO

EJECUTAR LA ITERACIÓN 11, planificada el 21 de agosto de 2026 en el issue 347. Objetivo: la vault de 370 contraseñas se maneja como una vault de verdad. Once issues en seis bloques, y el detalle con las mediciones está en la sección manual de STATUS.md.

LO PRIMERO ES EL BANCO DE PRUEBAS DEL 348, Y NO ES ORDEN ARBITRARIO. Nada de lo que esta iteración arregla lo detecta la suite —los tests de la lista montan tres items— y nada se ve en un diff. Sin un comando que levante una vault de N entradas y mida, cada arreglo se daría por bueno porque se ve más rápido. Es la lección del censo del 316 aplicada: la red va antes del primer arreglo, no después. Y ese comando fija los números del antes, que son los que hacen ejecutables los ocho criterios de salida.

DESPUÉS, EN ESTE ORDEN Y POR ESTE MOTIVO. El 349, virtualizar la lista, antes que el 350, que es una línea: el sidebar toma la altura del documento porque el documento mide 27.524 px, así que virtualizar puede cambiar esa altura y medir antes obligaría a repetirlo. El 352 y el 354 van juntos, porque el import de 741 peticiones y el segundo largo de cada borrado son el mismo defecto visto dos veces.

LO QUE LA PLANIFICACIÓN DESCARTÓ CON LA MEDIDA DELANTE, y conviene no reabrirlo por inercia: paginar GET /items en el servidor. Era el candidato que la 10 dejó sobre la mesa con el encargo de medirlo antes de arreglarlo, y medido resulta que la petición son 77 milisegundos de los 2.700 y el descifrado 25. El resto es React montando 7.839 nodos. Paginar en el servidor no tocaría el 95 por ciento del coste, y encima buscar seguiría exigiendo la vault entera en el cliente porque el servidor no puede filtrar lo que no puede leer. Lo que hay que virtualizar es la lista.

LO QUE SE POSPUSO A PROPÓSITO Y ES CANDIDATO DE LA 12: los códigos TOTP y la organización de la vault —carpetas, etiquetas, favoritos—. Se consideraron como objetivo de la 11 y se descartaron con motivo: añadir organización sobre una lista que tarda 773 milisegundos por pulsación es construir encima del defecto, y ADR-009 sección 4 pone la fiabilidad de uso antes que la funcionalidad nueva. Y un dato que abarata las dos cosas cuando lleguen: añadir un campo al blob NO obliga a subir version, porque version es la del esquema criptográfico y no la del contenido, y FOUNDATION.md ya manda omitir las claves que no se rellenan. El servidor no se entera: no hay columna, ni migración, ni cambio en la API.

Y EL 332 Y EL 344 TAMBIÉN QUEDAN FUERA, que es distinto de olvidados: son higiene, no están rotos, y se deciden al cerrar en el 357.

LO QUE NO HAY QUE REABRIR POR INERCIA: el acceso desde fuera de la red local, que está resuelto y verificado; el hosting compartido como vía de acceso, descartado en ADR-015 por quién puede servir el JavaScript; y el panel Filament de administración, que ADR-009 sección 4 sacó del alcance y que el 324 borró de los documentos que aún lo prometían.

Y LO QUE SE MIRA SIN QUE SEA UNA TAREA: las tres señales del hosting compartido como emplazamiento, con el disparador de ADR-013 sección 6. Cuántas veces no se pudo consultar la vault por estar kastor apagado, cuántas se recurrió al gestor anterior, y si Tailscale se desconecta solo en algún dispositivo. Al planificar la 11 la primera apuntaba a que no hace falta reabrirlo: kastor llevaba dos días encendido con los tres contenedores arriba. Si al cerrar las tres son cero o casi, se cierra la puerta con la medición delante en vez de por silencio.


CONVENCIONES DE TRABAJO

Git: una rama por issue con el formato tipo/número-descripcion-corta. Merge a master solo mediante PR con squash, un commit por issue. El cuerpo del PR incluye Closes seguido del número para que GitHub cierre el issue automáticamente. Se usa gh CLI.

Definition of Done: criterios de aceptación completos, tests en verde, RBAC validado donde aplique, PR mergeado y este documento actualizado. STATUS.md no hay que tocarlo, lo regenera el CI tras el merge. Los issues con UI se verifican en navegador antes de marcarse como hechos.

Patrones de código heredados de un proyecto anterior: servicios de aplicación con método handle que reciben identificadores explícitos y no acceden a sesión. Double guard, es decir validación en la capa de presentación y también en la capa de aplicación, nunca solo en una. DTOs tipados para transferir datos entre capas. Servicios idempotentes para operaciones de agregación. Tests de aislamiento cross-tenant en todos los servicios críticos.
