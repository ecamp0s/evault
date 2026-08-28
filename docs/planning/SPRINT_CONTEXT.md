SPRINT CONTEXT — eVault
Actualizado: 27 de agosto de 2026
Estado: Iteración 12 planificada el 27 de agosto de 2026 en el issue 383, y en marcha. La 11 se cerró ese mismo día.

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
Por qué el proyecto está construido así: los diecisiete ADR en docs/architecture/decisions.
Historial de iteraciones cerradas y sus lecciones: docs/planning/archive.
Modelo de datos y contrato del blob: docs/architecture/FOUNDATION.md, lectura obligatoria antes de tocar la API o de añadir una columna a vault_items.
Qué llave abre qué y qué se pierde con cada una: docs/architecture/KEYS.md, que es de consulta y responde sin abrir ningún ADR.
Comandos, URLs, workflow git e idioma del código: CLAUDE.md en la raíz.
Reglas de la propia documentación: docs/GUIDE.md.


DECISIONES DE ARQUITECTURA CERRADAS

Los diecisiete ADR de docs/architecture/decisions son la fuente de verdad, y son inmutables: si una decisión cambia, se escribe uno nuevo que la supersede. Lo que sigue es el índice para saber cuál abrir, no un sustituto de abrirlo.

Los seis primeros están numerados por profundidad arquitectónica y no por fecha. ADR-001 zero-knowledge. ADR-002 React para la vault y Filament solo para administración, porque el server-side rendering rompería la garantía. ADR-003 monorepo. ADR-004 multi-tenancy sin Spatie teams, con el contexto de tenant explícito en cada llamada porque la API es stateless. ADR-005 arquitectura self-hosteable. ADR-006 TypeScript 6, con un bloqueador verificable detrás.

A partir del 007 la numeración es cronológica. ADR-007 el token de sesión vive solo en memoria, así que recargar no es una expulsión sino el bloqueo de la vault. ADR-008 arquitectura de claves. ADR-009 el proyecto deja de ser un SaaS. ADR-010 clave de recuperación. ADR-011 formato de export e import. ADR-012 estrategia de despliegue. ADR-013 emplazamiento y operación de la instancia personal, que es además donde queda corregida la imprecisión de ADR-012 sección 2.3 al meter Tailscale, Cloudflare y una VPN propia en el mismo saco. ADR-014 cambio de correo electrónico, y de ahí lo único que hay que tener presente sin abrirlo: cambiar el correo SÍ invalida la clave de recuperación, al contrario que rotar la contraseña maestra, porque el correo es el salt del HKDF que deriva sus claves. ADR-015 acceso a la vault desde fuera de la red local, que elige Tailscale y explica por qué el criterio no es la comodidad sino quién puede servir el JavaScript. ADR-016 un solo origen para la SPA y la API, que mueve la API a /api del mismo host y retira CORS, y de ahí lo que hay que tener presente: dos lineamientos de ADR-012 sección 4 dejaron de regir y siguen escritos ahí, porque los ADR son inmutables. ADR-017 los códigos TOTP dentro de la vault, y de ahí lo que hay que tener presente sin abrirlo: SÍ se guardan semillas, dentro del item y del blob cifrado, asumiendo que quien abra la vault tiene también los segundos factores; no sube ninguna de las dos versiones, ni la del esquema criptográfico ni la del fichero de export; y la semilla NO sale nunca en el export en claro, que además dice a cuántas entradas afecta.

Del 012 conviene tener presente una cosa sin abrirlo, porque decide si un despliegue funciona o no: HTTPS no es endurecimiento, es requisito de arranque. Fuera de localhost no existe crypto.subtle en contexto inseguro, así que una instancia servida por http en un dominio propio o en una IP de la red local no es una instalación limitada, es una donde no se puede ni registrar un usuario. Y la excepción de .localhost no rescata nada aquí: vale en la máquina que ejecuta el navegador, no desde otro dispositivo de la red.

Lo único de todo esto que hay que tener en la cabeza sin abrir nada, porque explica la forma de casi todo el código: la contraseña maestra no cifra los items. PBKDF2 con 600.000 iteraciones deriva del par contraseña y correo una clave maestra cuyo único trabajo es ENVOLVER una clave de vault aleatoria de 256 bits, y es esa la que cifra con AES-256-GCM. Por eso cambiar la contraseña maestra es reenvolver 32 bytes en vez de recifrar la vault, y por eso la clave de recuperación puede ser un segundo envoltorio de la MISMA clave sin duplicar nada. El hash que viaja al servidor se deriva de la clave maestra usando la contraseña como salt: quien lo capture consigue una sesión, no el contenido.

Y la consecuencia que más se malinterpreta, con test que falla si el aviso desaparece: rotar la contraseña maestra NO invalida la clave de recuperación, porque la clave de vault no cambia. Quien sospeche un robo tiene que regenerarla aparte.


DÓNDE ESTAMOS

La Iteración 12 se planificó el 27 de agosto de 2026 en el issue 383 y está en marcha. Su objetivo: la vault de 370 entradas deja de ser una lista plana, con lo que se usa a diario arriba y el resto encontrable sin escribir. Catorce issues en siete bloques, más el ADR-017 que decide si las semillas TOTP viven en la vault y que la 13 implementará. Los criterios de salida, los cinco hallazgos de la planificación y las mediciones de partida están en el 383 y no se copian aquí, porque una copia se desincroniza siempre.

La Iteración 11 se cerró el 27 de agosto de 2026 y la vault dejó de ir lenta con las 370 contraseñas que tiene dentro. Trece issues. Siete de los ocho criterios cumplidos y uno no cumplido, que se dice en vez de estirar la definición. El detalle y las lecciones están en docs/planning/archive/ITERACION_11.md, y conviene leerlo antes de tocar la lista, su virtualización, lo que cuesta escribir en la vault o el banco que lo vigila.

LOS NÚMEROS, para no tener que abrir nada. Sobre 370 entradas: el menú de usuario pasó de estar a 27.464 píxeles a estar a 840; los nodos del DOM, de 7.839 a 487, con 289 en una vault de diez, así que el DOM dejó de crecer con lo que hay dentro; pintar la lista, de 668 milisegundos a unos 156; buscar, de 272 a unos 46; borrar una entrada, de dos peticiones y 437 milisegundos a UNA y unos 110; importar 370, de 740 peticiones y cuatro minutos y diecinueve segundos a 370 y quince segundos y medio.

LO QUE NO CAMBIÓ Y NO DEBÍA: desbloquear sigue tardando unos 900 milisegundos, y casi todos son las 600.000 iteraciones de PBKDF2 que derivan la clave. Por eso el criterio 2 quedó a medias: estaba mal escrito, mezclaba el desbloqueo con el pintado.

HAY UN COMANDO QUE LO VIGILA, y es lo primero que hay que ejecutar al tocar la lista: node scripts/verify-large-vault.mjs. Nació en rojo con sus seis límites a propósito, porque un banco que salga verde sobre el código que se escribió para medir no está midiendo nada. Y LO QUE DECIDE SON LOS RECUENTOS, NO LOS RELOJES: un umbral en milisegundos medido en un portátil sale rojo en otro sin que nada esté peor, así que los tiempos se comparan contra la misma vault de diez entradas en la misma ejecución y por sí solos no tumban nada.

LO QUE LA SUITE NO PUEDE VER, para no confiar de más: jsdom no aplica CSS ni hace layout, así que la virtualización no se verifica ahí —allí pinta 159 filas de 300 y empieza por la 141— ni nada que dependa de CSS. Los tests de esas cosas comprueban la declaración, no el comportamiento, y lo llevan escrito encima. Lo que verifica de verdad es el navegador.

Y TRES COSAS QUE NO SE DEDUCEN LEYENDO EL CÓDIGO. Las filas de la lista NO miden todas lo mismo: 70 píxeles sin usuario y 74 con él, medido, y por eso la estimación va deliberadamente por lo alto — quedarse corto acorta la página por debajo de su contenido y deja la última entrada sin alcanzar. Paginar GET /items quedó descartado con la medida delante, porque la petición eran 77 milisegundos de los 2.700. Y añadir un campo al blob NO obliga a subir version, que es la del esquema criptográfico y no la del contenido, lo que abarata TOTP y las etiquetas cuando lleguen.

EL COMPROBADOR DE IDIOMA DECLARABA TERMINADO LO QUE NUNCA MIRÓ, y es el hallazgo que más lejos llega (el 366). No leía los comentarios JSX ni las continuaciones de bloque: 196 líneas en 16 ficheros, y NUEVE seguían en español, sobrevivientes de la conversión de la Iteración 10 por ser invisibles a la herramienta que la declaró acabada. Ya lleva estado de bloque y el árbol sale limpio de verdad.

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

El 332 y el 344 quedaron fuera de la Iteración 11 a propósito y siguen abiertos: son higiene y no están rotos. Y el 332 tiene ahora un dato que lo refuerza — --measure dice cero por ciento de detección el mismo día en que el detector encontró nueve líneas reales de español.

El 344, que api/ arrastra el andamiaje de frontend de Laravel —package.json con Vite y Tailwind, vite.config.js, resources/css y resources/js, y la vista welcome que los referencia—, en un directorio que es una API REST. No está roto, así que es deuda y no bug; y borrarlo a ciegas rompería el test que pide la raíz de la aplicación.

El 360, que al cerrar un diálogo el foco no vuelve al botón que lo abrió. Salió verificando la Iteración 11, y lo llamativo es que hay un comentario de ItemRow.tsx que usa ese comportamiento como argumento para descartar un menú desplegable: se protegió algo que no existe. Está observado con un clic programático, así que lo primero es reproducirlo a mano con clic, Escape y Enter antes de tocar nada.

El 364, que el workflow repositorio no se puede disparar a mano: el paso del censo usa github.event.before, que en workflow_dispatch viene vacío. Es una capacidad declarada que nunca se ejercitó, y el día que el disparo por pull_request se cayó era la única vía que quedaba para verificar un PR.

El 382, que quedan cinco nombres españoles de identificadores y ningún comprobador puede verlos: cuatro describe que nombran identificadores que ya no existen —textoDeCampo, DialogoDeBorrado y ListaDeItems dos veces— y un comentario huérfano en generatorPreferences.ts. Son supervivientes de la conversión, no arrastre nuevo. Lo que importa es por qué nada los ve: check-comment-language.py busca prosa española y esto no es prosa, y el que sí veía esta forma se retiró en el 323 con un argumento —«ese arrastre no tiene de dónde venir»— que es correcto sobre el arrastre FUTURO y no dice nada sobre lo que ya estaba. Es la misma forma que el 366: el verde era cierto y respondía a otra pregunta.

Y el hosting compartido, que no tiene issue porque no es deuda sino una decisión pospuesta con criterio. Está descartado COMO VÍA DE ACCESO en ADR-015 y eso no se reabre; lo pospuesto es su uso como emplazamiento, con el disparador de ADR-013 sección 6 y tres señales que decidirán: cuántas veces no se pudo consultar la vault por estar kastor apagado, cuántas se recurrió al gestor anterior, y si Tailscale se desconecta solo.

No es deuda, aunque lo parezca: que el rate limiting cuente peticiones y no solo intentos fallidos. Se evaluó, se descartó con motivo y no hay intención de cambiarlo; está documentado en el código y en un test.


SIGUIENTE PASO

EJECUTAR LA ITERACIÓN 12. Catorce issues en siete bloques, y el orden importa: el 383 lo explica entero y aquí solo está lo que no se deduce leyéndolo.

EL 373 ESTÁ HECHO, el 28 de agosto de 2026: kastor pasó de un commit del 19 de agosto a master, 83 commits, y sirve por fin el código de la Iteración 11. Los datos quedaron intactos, comprobado con la huella SHA2 del ciphertext de los 370 items idéntica antes y después, no solo con el recuento.

LO MEDIDO DESDE EL IPHONE POR LA TAILNET, y son OBSERVACIONES DE USO REAL y no medidas instrumentadas, que es lo que se puede tener en un teléfono: la lista de 370 aparece en torno a un segundo, la búsqueda va rápida, y recorrer las 370 de un tirón es fluido y sin tirones — que es la prueba más directa de que la virtualización llegó, y lo único que un portátil no puede sustituir. Solo el «después»: el «antes» no lo midió nadie al planificar la 11, así que el criterio pedía una comparación imposible desde el primer día.

Y UNA DE LAS TRES COSAS QUE PEDÍA EL CRITERIO NO DEMUESTRA NADA, conviene saberlo antes de citarla: el menú de usuario en móvil NUNCA estuvo roto. Los 27.464 píxeles eran un problema solo de escritorio, del min-h-svh del aside; el sidebar móvil es un Dialog con h-svh fijo y el 350 lo midió antes de tocar nada, a 784 px de 844 en una pantalla de 390×844. Que se alcance en el iPhone confirma que funciona, no que haya mejorado.

Y KASTOR YA NO ES DE UN SOLO USUARIO desde el 26 de agosto de 2026: hay una segunda cuenta real, con su vault, que NO es de prueba y no se borra. Los 370 items siguen siendo todos de la primera. Eso hace que el aislamiento cross-tenant de ADR-004 pase a estar ejercitado en producción y no solo en tests, y que un despliegue afecte a dos personas.

DESPLEGAR EN KASTOR NO ES UN PASO MÁS: ahí dentro hay 370 contraseñas de verdad desde el 18 de agosto, y ahora además las de una segunda persona, así que lo que se rompa no es reproducible. El procedimiento está en la sección 7 de DEPLOYMENT.md, y tiene TRES trampas que no se deducen leyéndolo, las dos últimas descubiertas cayendo en ellas el 28 de agosto. Una, docker compose up -d --build NO aplica las migraciones ni recrea el contenedor si la imagen no cambia, porque el código va por volumen: hace falta --force-recreate. Dos, ese comando recrea solo api, y el dist de la SPA se hornea DENTRO de la imagen web, así que un cambio de frontend no se despliega y la aplicación abre igual. Y tres, al recrear web hay que incluir -f compose.tailscale.yaml o el acceso remoto desaparece sin protestar: TAILSCALE_HOST no llega, Caddy no monta bloque para ese nombre y el handshake muere. Las tres fallan en silencio, y la tercera solo se nota desde fuera de casa. La sección 7 ya las lleva escritas.

EL 374 ESTÁ HECHO Y DA CERO, el 28 de agosto de 2026: NO hay ninguna semilla TOTP dentro de la vault real. Se comprobó desde la propia aplicación —buscando login_totp, otpauth, totp e «Importado de otro gestor», que busca dentro de las notas— porque el servidor NO PUEDE contarlo: las notas van dentro del blob cifrado, y si esto se pudiera medir desde kastor el producto estaría roto.

Y EL CUARTO CERO DICE MÁS QUE LOS OTROS TRES: que «Importado de otro gestor» no aparezca en ninguna de las 370 significa que el import no movió NI UN SOLO campo a las notas. Eso descarta Bitwarden como origen —su CSV trae columnas sin mapear, login_totp entre ellas, que habrían dejado esa cabecera— y encaja con Chrome, cuyas cinco columnas están todas mapeadas. Como Chrome no guarda TOTP, nunca hubo semillas que perder. El ADR-017 se escribe sobre lienzo limpio: sin migración que decidir.

EL CERO SE VERIFICÓ CON UN CONTROL POSITIVO y no se dio por bueno, porque una búsqueda rota daría exactamente los mismos cuatro ceros: se añadieron notas a un par de entradas y se comprobó que la búsqueda las encuentra. Es la lección de la Iteración 9, que se la encontró cuatro veces — una comprobación puede pasar por el motivo equivocado.

EL 376 ORDENA LA LISTA, y hasta él NO ORDENABA NADA: ListVaultItems ordena por created_at, ni ItemList ni ItemRows reordenaban, así que las 370 aparecían en el orden del fichero que las importó. Ahora hay tres órdenes —nombre, añadida hace menos, modificada hace menos— con la preferencia persistida en evault.orden, que se une a evault.sesion y evault.generador. No toca la API, porque el servidor NO PUEDE ordenar por nombre: el nombre vive en el blob cifrado y no hay columna que lo lleve.

Y DOS COSAS DE AHÍ QUE NO SE DEDUCEN LEYENDO. La ñ ordena AL REVÉS que en la búsqueda, y las dos son deliberadas: search.ts le quita la tilde para que «espanol» encuentre «Español», y ordenando eso archivaría «Ñandú» entre las enes. Intl.Collator con locale es lo hace bien solo —medido, no supuesto: con sensitivity base sigue poniendo n antes que ñ antes que o, porque en español la ñ es letra primaria—, así que NO hay que reutilizar normalize() aquí, que es el error obvio. Y la pantalla usa DOS memos y no uno, ordenando primero y filtrando después: así una pulsación en el buscador no vuelve a pasar los 370 nombres por el colador, y los resultados de una búsqueda salen ordenados.

EL 377 PONE LOS FAVORITOS, y de ahí lo que hay que saber antes de tocar el blob: el campo es favorito?: true, NUNCA un booleano, y desmarcar BORRA LA CLAVE en vez de escribir false. Lo manda FOUNDATION.md —se omite lo que no se rellena— y no es cosmético: un booleano añadiría a cada una de las 370 entradas una clave que dice «no», que se cifra, se guarda y se descarga en cada carga para no llevar información. Hay test que comprueba el blob que sale, no la estrella encendiéndose.

LOS FAVORITOS VAN ENCIMA DEL ORDEN, NO EN LUGAR DE ÉL: dentro de ellos sigue mandando el orden elegido en el 376, porque diez favoritos en un orden que nadie puede nombrar son el mismo problema que tenían las 370. Y no son una sección aparte con su título: son la misma lista, así que una búsqueda filtra sobre las dos y no hay que decidir qué hace con un favorito que no coincide.

EL 378 PONE LAS ETIQUETAS, campo etiquetas?: string[] omitido cuando está vacío, editables desde el diálogo y con autocompletado de las que ya existen. ETIQUETAS Y NO CARPETAS, decidido: una carpeta obliga a que cada entrada esté en un solo sitio, y en una vault personal eso se rompe enseguida —la cuenta del banco de la empresa es del trabajo y es del banco—. Si al usarlas resulta que hacen falta carpetas, se verá con la vault delante.

Y LO QUE HACE QUE LAS ETIQUETAS VALGAN ALGO ES EL AUTOCOMPLETADO, no el campo: quien escribió «trabajo» en marzo y «Trabajo» en agosto tiene dos grupos de una entrada cada uno y nada se lo dice. Se comparan por clave normalizada —minúsculas y sin marcas, reutilizando normalize() de search.ts, que AQUÍ sí es lo correcto porque es una comparación— pero SE GUARDA Y SE MUESTRA LO QUE EL USUARIO ESCRIBIÓ. La lista de etiquetas existentes se calcula en el cliente recorriendo los items descifrados: no hay ni puede haber endpoint que las devuelva.

Y QUE EL EXPORT .evault LAS LLEVA ESTÁ COMPROBADO, no supuesto: serializa item.content entero, así que cualquier campo nuevo viaja solo, y hay test que falla el día que alguien enumere los campos ahí «para ser explícito». El export EN CLARO es el caso contrario y sí los enumera, que es el 380.

EL 379 HACE QUE LAS ETIQUETAS SIRVAN: chips arriba de la lista con el recuento de cada una, y al elegir una se filtra. UNA ETIQUETA Y NO VARIAS, decidido: dos a la vez obligan a decidir si significan Y u O, y ninguna respuesta es evidentemente correcta; mientras tanto una etiqueta MÁS el buscador ya da la intersección, que es el caso que aparece. Y el filtro NO se persiste, al revés que el orden: un orden es una preferencia y un filtro es algo que estás haciendo ahora, y volver mañana a una vault que enseña cuatro de 370 sin decir por qué es como esto asusta.

LA CADENA SON TRES PASOS CON TRES MEMOS y su orden importa: ordenar, filtrar por etiqueta, buscar. Así una pulsación solo rehace el último, y ni el colador ni el recorrido de etiquetas se repiten. Cada paso conserva el orden que recibe, que es lo que permite encadenarlos.

Y CUANDO HAY MUCHAS ETIQUETAS se pintan doce y el resto se despliegan a mano. El número está elegido y no medido —no hay vault con etiquetas de la que medir— y lo que decide no es el DOM sino la fila: pasada la docena, los chips envuelven en un bloque que empuja la lista fuera de la pantalla, y un filtro que tapa lo que filtra es peor que ninguno.

EL 380 CIERRA EL EXPORT EN CLARO, y lo que lo cierra NO es que ahora lleve los campos nuevos sino que el compilador obliga a decidir: PLAIN_EXPORT es un Record sobre keyof ItemContent, de modo que el día que el blob gane un campo el fichero DEJA DE COMPILAR hasta que alguien diga qué hace el CSV con él. Comprobado por mutación dos veces —quitando etiquetas de la clasificación, y añadiendo un totp a ItemContent sin tocar el export—: las dos rompen el build.

Y HABÍA PASADO YA, en silencio: exportPlain nombraba los cinco campos a mano, así que favorito y etiquetas pasaron de largo y el CSV salía perfectamente formado y dos campos corto. Nada fallaba porque no había nada que pudiera fallar. Es lo que ADR-011 sección 2.4 prohíbe para el import, aplicado al camino contrario, y en el fichero que se usa PARA IRSE, que es cuando perder algo sin decirlo es irreversible.

EL CSV LLEVA AHORA favorite Y tags, y conviene saber qué compra eso y qué no: la mayoría de gestores IGNORAN las columnas que no conocen, así que lo que se gana es que el dato esté EN EL FICHERO y se pueda recuperar a mano, no que llegue al destino. Las etiquetas van unidas por punto y coma porque la coma es el separador del propio fichero.

Y EL SITIO PARA TOTP YA ESTÁ HECHO: el tipo admite 'withheld' aunque hoy no lo use nadie, porque ADR-017 decidió que una semilla no sale nunca en claro. El aviso que cuenta los campos retenidos se escribe con ese campo y no antes, para no dejar una rama que no ejercita nada.

EL 381 IMPORTA EL CSV DE FIREFOX, y de ahí tres cosas que no se deducen. Una, SU FICHERO NO TIENE COLUMNA DE NOMBRE —identifica cada credencial por la URL—, así que sin derivarlo del host el fichero se descartaría entero fila por fila, porque toItem devuelve null cuando falta el nombre. Mapear columnas no habría bastado, y el fallo habría parecido «Firefox no está soportado» en vez de una línea que falta.

DOS, SU FIRMA ES UN SUBCONJUNTO DE LA DE CHROME: url, username y password sin name. Con la detección anterior, cuál gana dependía del ORDEN DE LAS CLAVES del objeto HEADERS —un fallo de corrección escondido en un literal, invisible para cualquier test que meta un fichero cada vez—. Ahora cada formato declara además qué columna NO debe estar, y hay test que mete los dos ficheros.

Y TRES, ES EL PRIMER FORMATO CUYO SOBRANTE NO ES DEL USUARIO SINO DEL PROGRAMA: un guid y tres marcas de tiempo. Aplicar ADR-011 sección 2.4 al pie de la letra metería cinco líneas de ruido de máquina en las notas de CADA entrada, y las notas son un campo que la búsqueda lee a propósito. Se declara una lista de columnas de ruido —en NOISE_COLUMNS, con su motivo— y se INFORMA de cuáles se dejaron fuera, que es el espíritu de esa sección aunque no su letra. httpRealm NO está en la lista: es la única sobrante que dice algo que la URL no dice, que la credencial es de autenticación HTTP y no de un formulario.

EL 395 TAPA UN AGUJERO DE check-comment-language.py QUE ERA EL ESPEJO DE OTRO YA TAPADO: --all recorría solo git ls-files, o sea lo RASTREADO, así que ejecutarlo antes de git add —que es justo cuando se ejecuta, sobre lo que acabas de escribir— salía verde sobre esos mismos ficheros. El mismo error se había encontrado y arreglado en el OTRO modo, y su comentario seguía ahí a treinta líneas del agujero que quedaba abierto. Reproducido antes de arreglar y comprobado por mutación después.

EL 389 APARECIÓ USANDO LA VAULT REAL, no planificándola, y es el segundo de la Iteración 12 que sale así. Las pantallas se cargan con import() desde el 45 y NO HABÍA NINGÚN ErrorBoundary en toda la aplicación, de modo que un chunk que no llegaba hacía que React desmontara el árbol entero: la última pantalla congelada, sin error y sin más salida que recargar. Arreglado.

Y LO PROVOCA CADA DESPLIEGUE, que es lo que hay que tener presente al desplegar: el Dockerfile copia un dist recién construido sobre /srv, así que los assets anteriores DEJAN DE EXISTIR y sus nombres llevan hash de contenido. Cualquier pestaña que estuviera abierta pide ficheros que ya no están. No hace falta que la pestaña sea vieja: basta con tenerla abierta durante el despliegue.

TRES COSAS DE ESE ARREGLO QUE NO SE DEDUCEN LEYENDO EL CÓDIGO. El aviso dice que recargar BLOQUEA LA VAULT, porque por ADR-007 el token vive solo en memoria y un «recarga y sigue» convertiría una recuperación en lo que parece una expulsión; tiene test para que no se pierda al editar el texto. AutoLock queda FUERA del boundary a propósito, porque es hermano y así sigue contando mientras el aviso está en pantalla — dentro, una vault cuya pantalla ha reventado se quedaría desbloqueada mientras la pestaña siga abierta. Y el árbol se movió de main.tsx a App.tsx para poder montarlo en un test, que hasta ahora era imposible porque colgaba de createRoot en el ámbito del módulo.

Y LO QUE LA SUITE NO PUEDE VER, para no confiar de más: EN JSDOM EL ÁRBOL NO SE DESMONTA. Se comprobó por mutación —quitando el boundary, el hermano sobrevive—, así que los tests verifican que el boundary captura y ofrece salida, NO la catástrofe que evita. Eso solo lo demuestra el navegador, y ahí sí está medido: sin boundary, #root se queda con cero bytes.

EL ADR-017 ESTÁ ESCRITO Y CERRADO, el 28 de agosto de 2026, y decide QUE SÍ: eVault guarda semillas TOTP, dentro del item y del blob cifrado. La 13 lo implementa con la decisión ya tomada. Lo que hay que tener presente sin abrirlo son cuatro cosas.

UNA, LO QUE SE ASUME Y NO TIENE MITIGACIÓN dentro de esa decisión: quien abra la vault tiene también los segundos factores. Pero la frase «convierte dos factores en uno y medio» es imprecisa y el ADR la desglosa — de los ataques que TOTP frena, se pierde EXACTAMENTE uno, el de quien ya tiene la contraseña maestra, y se conservan enteros la brecha del servicio, la contraseña reutilizada y el phishing.

DOS, NO SUBE NINGUNA DE LAS DOS VERSIONES. Ni la del esquema criptográfico, que sigue en 2, ni la del fichero .evault, que sigue en 1. El trigger 1 de ADR-011 sección 6 preveía que «probablemente» habría que subir la del formato, y se reevaluó: no hace falta, porque el .evault serializa item.content entero y la retrocompatibilidad ya la resuelve la forma del blob. El trigger acertó al pedir la revisión y erró en la previsión, y las dos cosas quedan registradas.

TRES, LA SEMILLA NO SALE NUNCA EN EL EXPORT EN CLARO, y el CSV dice a cuántas entradas afecta. Una contraseña en un CSV se rota en cinco minutos; una semilla obliga a reconfigurar el segundo factor cuenta por cuenta. Se apoya en el 380, que arregla que el export en claro pierda campos nuevos en silencio.

Y CUATRO, EL CONTADOR DE SEGUNDOS NO CUENTA COMO ACTIVIDAD para el bloqueo por inactividad. Si contara, tener abierta una entrada con TOTP mantendría la vault viva indefinidamente. autoLock.ts compara marcas de tiempo y no usa temporizadores justamente para no confundir reloj con presencia, y esa distinción hay que conservarla al implementarlo.

Y HAY DOS VERSIONES DISTINTAS, QUE ES LO QUE ESTE DOCUMENTO VENÍA DICIENDO A MEDIAS. Que añadir un campo al blob no obliga a subir version es cierto: esa es la del esquema criptográfico —1 fue base64 sin cifrar, 2 es AES-256-GCM y es la vigente—, está en FOUNDATION.md, y por eso un campo nuevo dentro del JSON cifrado es retrocompatible sin migración y sin que el servidor se entere. Pero el fichero .evault tiene la SUYA, hoy 1, y ADR-011 sección 6 ya dejó escrito que un esquema de item que gana campos con estructura, «por ejemplo TOTP nativo», dispara su reevaluación y probablemente obligue a subir la versión de formato. Leyendo solo la primera mitad, TOTP parece un campo más y gratis. No lo es.

LO QUE HAY QUE SABER ANTES DE AÑADIR UN CAMPO AL BLOB, y son dos cosas que ningún compilador vigila. Los nombres van en español —nombre, usuario, password, url, notas— porque no son identificadores sino el formato del blob, así que un campo nuevo se llama favorito y no favorite: abrir un segundo idioma dentro del mismo objeto serializado es peor que cualquiera de los dos. Y se escribe como favorito?: true y no como booleano, porque FOUNDATION.md manda omitir las claves que no se rellenan; si no, cada uno de los 370 items crece con un campo que dice que no.

EL EXPORT EN CLARO PIERDE EN SILENCIO LO QUE SE AÑADA AL BLOB, y es el 380. El .evault serializa item.content entero y sobrevive a cualquier campo nuevo; el CSV enumera los cinco campos a mano en export.ts. Es exactamente el modo de fallo que ADR-011 sección 2.4 prohíbe para el import —perder datos sin decirlo— aplicado al camino contrario, y hoy no falla SOLO porque no hay campo que perder. Por eso el 380 va después del 377, que crea el primero, y por eso lo que de verdad cierra el issue es el test que falle cuando ItemContent gane un campo más.

EL IMPORT DE FIREFOX NO ES UNA CABECERA MÁS EN EL MAPA, y es el 381. Su CSV no tiene columna de nombre —identifica cada credencial por su URL— y toItem devuelve null cuando falta el nombre, así que hoy el fichero se descartaría entero, fila por fila. Hay que derivar el nombre del host. Y tensiona ADR-011 sección 2.4 de una forma que ese ADR no contempló: es el primer formato donde lo que no cabe son metadatos del programa —guid, formActionOrigin y tres timestamps— y no datos del usuario, de modo que aplicar la regla literal mete seis líneas de ruido en las notas de CADA entrada, y las notas son un campo que la búsqueda mira a propósito.

LO QUE NO HAY QUE REABRIR POR INERCIA: paginar GET /items en el servidor, descartado con la medida delante en la 11 —la petición eran 77 milisegundos de los 2.700—; el acceso desde fuera de la red local, resuelto y verificado; el hosting compartido como vía de acceso, descartado en ADR-015 por quién puede servir el JavaScript; y el panel Filament, que ADR-009 sección 4 sacó del alcance.

LO QUE QUEDA FUERA A PROPÓSITO Y NO ES UN OLVIDO: el código de TOTP, que entra en la 13 con la decisión ya tomada; la auditoría de contraseñas —repetidas, débiles, cortas—, que es enteramente cliente y por eso sería una demostración directa del modelo, pero no cabe; y las carpetas, que las etiquetas cubren sin obligar a que una entrada esté en un solo sitio. Si al usarlas resulta que hacen falta carpetas de verdad, se verá con la vault delante.

Y LO QUE SE MIRA SIN QUE SEA UNA TAREA: las tres señales del hosting compartido como emplazamiento, con el disparador de ADR-013 sección 6. Cuántas veces no se pudo consultar la vault por estar kastor apagado, cuántas se recurrió al gestor anterior, y si Tailscale se desconecta solo. Durante la Iteración 11 kastor estuvo encendido y sirviendo, que es la primera de las tres apuntando a que no hace falta reabrirlo.


CONVENCIONES DE TRABAJO

Git: una rama por issue con el formato tipo/número-descripcion-corta. Merge a master solo mediante PR con squash, un commit por issue. El cuerpo del PR incluye Closes seguido del número para que GitHub cierre el issue automáticamente. Se usa gh CLI.

Definition of Done: criterios de aceptación completos, tests en verde, RBAC validado donde aplique, PR mergeado y este documento actualizado. STATUS.md no hay que tocarlo, lo regenera el CI tras el merge. Los issues con UI se verifican en navegador antes de marcarse como hechos.

Patrones de código heredados de un proyecto anterior: servicios de aplicación con método handle que reciben identificadores explícitos y no acceden a sesión. Double guard, es decir validación en la capa de presentación y también en la capa de aplicación, nunca solo en una. DTOs tipados para transferir datos entre capas. Servicios idempotentes para operaciones de agregación. Tests de aislamiento cross-tenant en todos los servicios críticos.
