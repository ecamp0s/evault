SPRINT CONTEXT — eVault
Actualizado: 21 de agosto de 2026
Estado: Iteración 10 en curso, planificada el 20 de agosto de 2026. El bloque 0 es el issue 315.

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

La Iteración 10 se planificó el 20 de agosto de 2026 y su objetivo es que el repositorio se lea entero en un idioma, y que el andamiaje que lo vigilaba se jubile. Catorce issues en seis bloques, del 315 al 326 más el 290, el 303 y el 309 que ya existían. El detalle vive en la sección manual de STATUS.md; aquí solo lo que hace falta para retomar el trabajo.

POR QUÉ ESTA Y NO OTRA COSA. ADR-009 sección 4 ordena: primero lo que hace el producto fiable para quien lo usa de verdad, después lo que lo hace legible, y solo después funcionalidad nueva. Las Iteraciones 7, 8 y 9 agotaron la primera columna —contraseñas reales dentro, copia restaurada y leída, acceso desde fuera verificado desde la calle con el wifi apagado—, así que toca la segunda, y ahí lo que pesa es el 290.

LA PRIMERA CAPA ESTÁ CONVERTIDA, que es el 317: lib/vault entero, 907 líneas en 32 ficheros, con crypto.ts a la cabeza. El criterio queda fijado ahí para las cinco capas siguientes: traducir es reescribir el argumento en inglés y no pasar el texto por un traductor. Medido al cerrarla, la capa encogió un 0,9 por ciento —1.159 líneas de comentario a 1.148—, muy por debajo del margen del censo, y los 458 tests siguen en verde con el mismo número de casos.

LA SEGUNDA CAPA TAMBIÉN, que es el 318: api/app, las rutas, la configuración y el bootstrap, 810 líneas en 63 ficheros. Los 260 tests en verde, Larastan en nivel max sin errores y la capa creció dos líneas en vez de encoger.

LA TERCERA CAPA TAMBIÉN, que es el 319: api/tests y api/database, 677 líneas en 41 ficheros, con los 257 nombres de test de la API dentro. Con eso el 290 va por el 60 por ciento.

LA CUARTA CAPA TAMBIÉN, que es el 320: las pantallas, 583 líneas en 35 ficheros. Con eso el 290 va por el 75 por ciento.

Y LA COMPROBACIÓN QUE DEFINE ESA CAPA NO ES LEER EL DIFF, sino comparar todo el texto visible antes y después con dump-ui-text.mjs. Salió IDÉNTICO byte a byte: 43.043 bytes de texto de producción sin una letra distinta. En los tests el volcado sí cambia, porque los nombres de test son cadenas y se traducen; se comprobó aparte que de las 171 cadenas retiradas de los tests NINGUNA es texto de la interfaz, cruzando las dos listas. Leer el diff no habría demostrado eso: son 583 líneas y las frases de la interfaz se parten cruzando saltos de línea, que es la lección del 115.

Y APARECIÓ OTRA NOTA CADUCADA, la tercera de la iteración: ListStates.tsx decía que un componente estaba en inglés «por la convención de idioma» y que el resto del fichero esperaba al 97, cerrado el 4 de agosto. La conversión la deja sin sujeto y en su lugar queda dicho qué pasó.

LA QUINTA CAPA TAMBIÉN, que es el 321: el resto de lib y los componentes, 573 líneas en 27 ficheros, con 76 nombres de test dentro. Con eso el 290 va por el 89 por ciento y lo único que queda es el utillaje. El volcado de texto visible volvió a salir IDÉNTICO byte a byte —los mismos 43.043 bytes—, y de las 145 cadenas que desaparecieron de los tests ninguna es texto de la interfaz, cruzado igual que en la capa anterior.

Y LA SEXTA, QUE CIERRA EL 290, que es el 322: el utillaje, docker y lo que quedaba de web, 282 líneas en catorce ficheros. Las otras 158 de esa capa NO se tradujeron y eso era el plan: viven en check-identifiers.py, sus dos extractores y sus tests, que el 323 borra. Ahora mismo el árbol está en inglés SALVO esos cuatro ficheros, y el comprobador en modo --all los cuenta uno a uno: 158, ni una más.

POR ESO EL PASO A --all SE MUEVE AL PR DEL 323, y no es un cambio de criterio sino su cumplimiento. La regla era que el check no naciera en rojo; el commit donde puede nacer en verde es el que borra esos cuatro ficheros, no el anterior. Entre un merge y otro no queda ningún estado sin red: check-identifiers.py sigue vivo hasta que el nuevo lo releva, en el mismo PR. Está anotado en los dos issues.

Y APARECIERON TRES IDENTIFICADORES EN ESPAÑOL QUE NINGÚN COMPROBADOR MIRABA: la función como_host y la variable intentos de docker/api/entrypoint.sh, y el fichero entero de test_check_docs.py —RAIZ, Arbol, escribir, ficheros, y sus catorce nombres de test—. check-identifiers.py no lee ni shell ni scripts/tests, así que llevaban ahí desde que se escribieron. Convertidos también, porque el objetivo de la iteración es que el repositorio se lea entero en un idioma y no que un comprobador concreto dé verde.

EL 290 ESTÁ CERRADO Y EL ANDAMIAJE JUBILADO, que es el 323 y el objetivo de la iteración. Fuera del repositorio: check-identifiers.py, english.txt con sus 713 palabras, los dos extractores por AST y sus tests. 1.860 líneas. Y en el mismo PR, check-comment-language.py --all dentro del workflow, en verde sobre el árbol entero: la regla de idioma pasa de vigilarse hacia delante a vigilarse entera, y eso es lo que sustituye al comprobador viejo. Entre un merge y otro no hubo ningún estado sin red.

dump-ui-text.mjs SE QUEDA, y esa era la decisión que el 323 pedía tomar por escrito. No vigila idioma: vuelca el texto visible para compararlo antes y después de un renombrado, que es la comprobación que la Iteración 6 aprendió que hace falta y de la que dependió el criterio de aceptación de cuatro capas de esta. Ahora vive en scripts/ui-text.mjs —el directorio identifiers/ se fue con lo que le daba nombre— y por fin tiene tests propios: siete, incluido el que comprueba que un fichero que no parsea FALLA en vez de volcar menos, que es su modo de fallo peligroso, porque un volcado más corto se parece exactamente a «no ha cambiado nada».

Y UN TEST DEL UTILLAJE SE INVIRTIÓ, como el de la sesión que persiste y el del estado vacío de la lista. Comprobaba que --all siguiera VIENDO la deuda del 290 —código de salida 1—, porque un comprobador que dejara de ver una deuda todavía viva sería peor que no tenerlo. Ahora comprueba lo contrario, que no encuentra nada. Si algún día vuelve a ponerse rojo, la pregunta no es cómo hacerlo pasar: es qué fichero ha vuelto a escribirse en español.

Y LA CUARTA NOTA CADUCADA, en api.test.ts: explicaba que una petición sin respuesta pasa «con la API caída, sin red, o con CORS mal configurado». CORS no existe desde el 296, porque ADR-016 puso la API en el mismo origen que la SPA. Se ha corregido en su sitio en vez de traducir una causa que ya no puede darse. Van cuatro en cinco capas, y la razón es siempre la misma: traducir obliga a leer entero lo que un grep solo mira por encima.

LAS MIGRACIONES NO SE RENOMBRARON, que era el aviso de esa capa: la de 2026_08_02_190000_descartar_vault_items_sin_cifrar.php conserva su nombre en español y ahora lleva escrito dentro por qué. Laravel guarda la cadena completa en la tabla migrations, así que renombrar una ya aplicada le hace creer que hay una nueva sin aplicar y que la aplicada desapareció; en kastor eso es una instancia con 370 contraseñas dentro. Comprobado además con migrate:fresh que todas siguen aplicándose.

Y BackupTest.php LLEVABA LA NOTA DE CONVIVENCIA DE IDIOMAS —«los de arriba se quedan en español hasta la conversión de #290»— que CLAUDE.md cita como el ejemplo de cómo se documenta. Al convertir el fichero esa nota perdió su sujeto y se fue con él. Es el primer sitio donde la conversión retira andamiaje en vez de solo traducir, y CLAUDE.md habrá que ajustarlo al cerrar la iteración.

Y LO QUE ENCONTRÓ, que ningún grep habría visto: TRES COMENTARIOS HUÉRFANOS DE SU CÓDIGO. El bloque de recovery de AttemptKey estaba pegado a masterPassword, dos métodos por encima del suyo; el de recovery de throttling.php, dos entradas por encima de su clave; y en api.php, el que explica abilities:* estaba encima de la única ruta que queda FUERA de ese grupo. Los tres, además de descolocados, afirmaban cosas falsas: dos remitían al 119 como migración pendiente —se cerró el 4 de agosto— y api.php decía que /health lleva cabeceras CORS, que se retiraron en el 296. Se han devuelto a su sitio y se ha escrito qué dejó de ser cierto y cuándo, en vez de borrarlo en silencio. Traducir obliga a leer cada comentario entero, y eso es lo que los destapó.

Y APARECIÓ UN LÍMITE DEL COMPROBADOR QUE HABRÍA COSTADO INFORMACIÓN. Marcaba prosa INGLESA que cita ejemplos españoles: search.ts no puede explicar cómo se quitan los acentos sin decir que «cafe» encuentra «Café» ni que el precio es que «ano» encuentre «año». La salida cómoda habría sido borrar los ejemplos, que es justo la pérdida que el censo existe para impedir. Ahora el detector ignora el texto entre comillas angulares, en comentarios y en nombres de test, y eso se midió antes de adoptarlo: cero falsos positivos sobre 351 líneas inglesas y ni una línea menos de detección.

EL CENSO YA ESTÁ, que es el 316 y la red que faltaba. scripts/check-comment-language.py --census cuenta líneas de comentario POR FICHERO y falla cuando uno pierde más de lo que encoge una traducción fiel. El margen está medido y no elegido a ojo: convertir keyInMemory.ts a mano quitó un 7,1 por ciento y unlock.ts un 0. Va por fichero y no sobre el total, y eso se demostró con la mutación: al borrar un bloque entero, el TOTAL DEL REPOSITORIO SUBÍA mientras un fichero perdía seis líneas. Si la pérdida es deliberada se justifica con una línea «Censo: <motivo>» en el cuerpo del PR, porque el 323 borra un fichero a propósito.

EL VOLUMEN, MEDIDO EL 20 DE AGOSTO Y NO HEREDADO: 3.993 líneas de comentario en español en 216 ficheros, y 442 nombres de test de los 795 que hay. Se convierte en seis capas: lib/vault 907 líneas, api/app y las rutas 811, los tests y las migraciones de la API 677, las pantallas 584, el resto de lib y los componentes 574, y el utillaje con lo que queda 440. De esas últimas 440, ciento cincuenta y ocho NO se traducen porque se van con el andamiaje.

LO QUE HAY QUE TENER DELANTE ANTES DE CONVERTIR UNA LÍNEA, y es la apuesta de la iteración. El modo de fallo aquí no es traducir mal: es TRADUCIR BORRANDO. El comprobador marca prosa española, así que un comentario borrado desaparece del informe igual que uno convertido y el check da verde — la única red que hay premia el peor resultado posible. Por eso el censo del 316 va primero y no después. Y el criterio de conversión es que traducir es reescribir el argumento en inglés, no pasar el texto por un traductor: se fija en lib/vault, que es la capa más argumentativa, y las otras cinco lo copian.

EL ORDEN NO ES POR TAMAÑO Y ESO ES DELIBERADO. lib/vault primero porque es el núcleo criptográfico y lo que se abre antes que nada; api antes que las pantallas porque en la API los comentarios son argumento y en las pantallas son descripción, que tolera mejor el cansancio de la cuarta capa. Y el paso del comprobador a --all va en el MISMO PR que deja el árbol limpio: un check que nace en rojo se acaba ignorando entero, que es la lección del 62. Al ejecutarlo resultó ser el PR del 323 y no el del 322, por aritmética: al terminar la última capa quedan exactamente 158 líneas de prosa española y están en los cuatro ficheros que el 323 borra.

Y AL CONVERTIR LAS PANTALLAS, el texto que ve el usuario se queda en español. La frontera es entre ficheros de código y documentación, no entre idiomas de la interfaz. La comprobación que sirve no es leer el diff sino comparar todo el texto visible antes y después con dump-ui-text.mjs, y esa herramienta NO se jubiló con el comprobador de identificadores aunque viviera en su mismo directorio: hace otra cosa y sigue teniendo trabajo. Desde el 323 es scripts/ui-text.mjs.

EL BLOQUE 1 YA ESTÁ HECHO, y son los dos avisos que faltaban. El 303: el aviso de bloqueo dice lo que se va a perder, y SOLO cuando hay algo que perder —decirlo siempre entrenaría a saltarse la frase justo el día que es verdad—, con un segundo aviso tras el bloqueo que se queda hasta que se descarta, porque esto salta precisamente cuando no hay nadie delante. Verificado en navegador real con el caso 7 nuevo de verify-auto-lock.mjs, leyendo el texto de la pantalla a los 14,8 minutos. Y el 309: recuperar el acceso NO invalida la clave usada —el envoltorio cuelga de la clave de vault y no de la maestra, así que recuperar es una rotación— y ahora se avisa en el formulario y al llegar al login. Lo que lo da por bueno no es que el aviso aparezca: es que LA MISMA CLAVE SE USÓ DOS VECES SEGUIDAS en navegador y funcionó las dos.

NO SE GUARDA BORRADOR de lo escrito en un diálogo, y queda escrito por qué: sería contenido de la vault cifrado con una clave que se acaba de descartar, que es lo que ADR-001 regula. La pérdida se acepta; lo que se arregló es que deje de ser una sorpresa.


LO QUE APARECIÓ AL PLANIFICAR Y NO ESTABA EN NINGÚN DOCUMENTO son cinco hallazgos, en la sección manual de STATUS.md. Dos conviene tenerlos aquí porque afectan a lo que se lee al empezar. El primero: la deuda del 290 CRECIÓ 65 LÍNEAS durante la Iteración 9, medido contra su propia planificación; la red del 291 llegó al final, así que la frase de este documento que decía que ya no crece era cierta hacia delante y ocultaba lo de atrás. El segundo: CLAUDE.md y SETUP.md prometen un futuro panel Filament que ADR-009 sección 4 sacó del alcance, y Filament no está ni instalado.

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

El 290, convertir a inglés los comentarios y los nombres de test que quedan en español: 3.993 líneas en 216 ficheros y 442 nombres de test, remedido el 20 de agosto de 2026 con el propio comprobador. ES EL OBJETIVO DE LA ITERACIÓN 10 y está partido en seis capas, del 317 al 322. Jubila el comprobador de identificadores y sus 1.860 líneas, en el 323. OJO CON EL NÚMERO, porque cambió: hasta el 19 de agosto esta deuda se citaba como el 251, y el 251 era la DECISIÓN de si migrar, no la migración. CLAUDE.md afirmaba desde el 17 que la conversión era un issue aparte y ese issue no existía; se creó al planificar la Iteración 9.

Ya no crece sin que nadie lo vea, y eso es lo que cerró el 291: scripts/check-comment-language.py marca la prosa española que un cambio AÑADE. Mira lo añadido y no el árbol a propósito, porque nacería en rojo y un check que nace en rojo se acaba ignorando entero, que es la lección del 62. PERO OJO CON ESA FRASE, porque hasta el 20 de agosto ocultaba la mitad: la red llegó AL FINAL de la Iteración 9, y midiendo contra su propia planificación —check-comment-language.py --base 454cce0— esa iteración añadió 65 LÍNEAS de prosa española a la deuda que declaraba contenida. Es cierta hacia delante y lo era desde el commit ec8046d, no antes. Cuando el 290 termine, se le pasa --all y no hace falta escribir otro.


El 329, que el bloqueo por inactividad también se lleva la clave de recuperación recién generada y el import a medias. Salió al arreglar el 303, y la primera mitad NO es perder trabajo: createRecoveryKey manda la clave al servidor ANTES de enseñarla, así que un bloqueo deja una cuenta con has_recovery_key en true y una clave que su dueño nunca llegó a ver. Se entera el día que la necesita. El mecanismo del 303 lo deja a una línea de resolverse, pero la pantalla de la clave merece decidirse aparte.

Y el hosting compartido, que no tiene issue porque no es deuda sino una decisión pospuesta con criterio. Está descartado COMO VÍA DE ACCESO en ADR-015 y eso no se reabre; lo pospuesto es su uso como emplazamiento, con el disparador de ADR-013 sección 6 y tres señales que decidirán: cuántas veces no se pudo consultar la vault por estar kastor apagado, cuántas se recurrió al gestor anterior, y si Tailscale se desconecta solo.

No es deuda, aunque lo parezca: que el rate limiting cuente peticiones y no solo intentos fallidos. Se evaluó, se descartó con motivo y no hay intención de cambiarlo; está documentado en el código y en un test.


SIGUIENTE PASO

El 324 —la promesa de Filament, que ADR-009 sección 4 sacó del alcance y que tres documentos siguen prometiendo, más los dos avisos del hook pre-push— y el 325, que son los dos README de plantilla, el de Vite y el de Laravel, en un repositorio público cuyo segundo propósito es que alguien lo lea evaluando criterio técnico. Después, el 326 cierra la iteración.

LO QUE HAY QUE HACER ANTES DE ABRIR LA PRIMERA CAPA, porque sin ello el trabajo se puede dar por bueno estando mal: el censo del 316. Convertir 3.993 líneas en seis PR es exactamente el trabajo donde borrar un comentario pasa por haberlo traducido, y el comprobador no distingue las dos cosas.

LO QUE NO HAY QUE REABRIR POR INERCIA: el acceso desde fuera de la red local, que está resuelto y verificado; el hosting compartido como vía de acceso, descartado en ADR-015 por quién puede servir el JavaScript; y el panel Filament de administración, que ADR-009 sección 4 sacó del alcance y que el 324 va a borrar de los documentos que aún lo prometen.

Y LO QUE SE MIRA SIN QUE SEA UNA TAREA: las tres señales del hosting compartido como emplazamiento, con el disparador de ADR-013 sección 6. Cuántas veces no se pudo consultar la vault por estar kastor apagado, cuántas se recurrió al gestor anterior, y si Tailscale se desconecta solo en algún dispositivo. Si en dos o tres semanas las tres son cero o casi, se cierra la puerta con la medición delante en vez de por silencio.

Lo que queda fuera de la 10 a propósito y puede ser candidato de la 11: la carga de los 370 items sin paginar. GET /items devuelve la lista entera y el cliente la descifra completa en cada carga; no está roto, pero nadie ha medido qué tarda en el iPhone por la tailnet, que es el uso real.


CONVENCIONES DE TRABAJO

Git: una rama por issue con el formato tipo/número-descripcion-corta. Merge a master solo mediante PR con squash, un commit por issue. El cuerpo del PR incluye Closes seguido del número para que GitHub cierre el issue automáticamente. Se usa gh CLI.

Definition of Done: criterios de aceptación completos, tests en verde, RBAC validado donde aplique, PR mergeado y este documento actualizado. STATUS.md no hay que tocarlo, lo regenera el CI tras el merge. Los issues con UI se verifican en navegador antes de marcarse como hechos.

Patrones de código heredados de un proyecto anterior: servicios de aplicación con método handle que reciben identificadores explícitos y no acceden a sesión. Double guard, es decir validación en la capa de presentación y también en la capa de aplicación, nunca solo en una. DTOs tipados para transferir datos entre capas. Servicios idempotentes para operaciones de agregación. Tests de aislamiento cross-tenant en todos los servicios críticos.
