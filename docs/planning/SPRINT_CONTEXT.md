SPRINT CONTEXT — eVault
Actualizado: 31 de agosto de 2026
Estado: Iteración 13 planificada el 31 de agosto de 2026 y en curso. Dieciséis issues, del 411 al 425 más el 427.

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

La Iteración 13 se planificó el 31 de agosto de 2026 y está en curso. Objetivo: la vault guarda el segundo factor, y empieza a decir qué hay mal dentro de ella. Quince issues del 411 al 425, en seis bloques. No lleva ADR nuevo, y eso se decidió al planificar: ADR-017 ya cubre lo único que cambiaba el modelo de amenaza, y la auditoría de contraseñas se resuelve entera dentro del dispositivo.

LO QUE HAY QUE SABER PARA TRABAJAR EN ELLA, sin abrir STATUS.md. La auditoría NO consulta a ningún tercero: repetidas, débiles y cortas se calculan sobre los items ya descifrados en memoria. Consultar brechas ajenas con k-anonimato se descartó por escrito y exigiría un ADR propio antes de una línea de código, así que no se implementa sin decidirlo. La semilla TOTP entra pegando una URI otpauth:// o una base32, y NO leyendo un código QR: BarcodeDetector solo existe en Chrome y Android, y una librería sería una dependencia más en el cliente que sirve el JavaScript que cifra las contraseñas. Y «esta contraseña es antigua» queda fuera porque hoy es incalculable: updated_at es la fecha en que se reescribió el blob, así que renombrar una entrada la rejuvenece.

EL DESPLIEGUE VA PRIMERO Y NO POR COMODIDAD, que es la apuesta de secuenciación de esta iteración. El 412 pone en kastor el código de la 12 —orden, favoritos, etiquetas, filtro e import de Firefox—, y su segunda mitad es la que importa: usar las etiquetas de verdad sobre las 370 y anotar el recuento. Las etiquetas se eligieron sobre las carpetas con un argumento razonable y el riesgo se aceptó con una salida escrita, «si hacen falta carpetas, se verá usándolas», y esa mitigación es HOY INAPLICABLE porque el código de la 12 no está en la máquina. Dejar el despliegue al final la habría pospuesto otra iteración.

La Iteración 12 se cerró el 28 de agosto de 2026 y la vault de 370 entradas dejó de ser una lista plana. Diecinueve issues, cinco de ellos aparecidos por el camino y ninguno encontrado por una herramienta. Siete de los ocho criterios cumplidos; el que falta es importar un CSV real de Firefox con datos dentro, que vuelve en el 413. El detalle y las lecciones están en docs/planning/archive/ITERACION_12.md, y conviene leerlo antes de tocar el orden de la lista, los favoritos, las etiquetas, el import, el export en claro o check-comment-language.py.

LO QUE HAY QUE SABER DE ELLA, sin abrir el archivo. La lista se ordena por nombre al abrir, los favoritos suben arriba y las etiquetas agrupan sin obligar a que una entrada esté en un solo sitio. Los campos del blob son ya siete y no cinco: favorito —true o ausente, nunca false— y etiquetas —omitida cuando está vacía— se sumaron a los cinco originales, y NO ESTÁN DOCUMENTADOS EN FOUNDATION.md, que es lo que arregla el 414. Añadir un campo al blob no obliga a subir version, que es la del esquema criptográfico y no la del contenido. Y verify-large-vault.mjs tiene ya siete límites y no seis.

Y LA LECCIÓN QUE MÁS LEJOS LLEGA, porque vuelve a aplicar entera en la 13: un test verde en los dos sentidos es peor que no tener test. En el 360 se escribió un test que pasaba con el arreglo Y con el arreglo mutado; se tiró, y su guardián se fue al verificador de navegador. La mutación, además, hay que comprobar que se aplicó — una que no se aplica produce exactamente la misma tranquilidad falsa que el bug que busca.

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

EL BLOQUEO POR INACTIVIDAD Y LA CLAVE DE RECUPERACIÓN YA NO SON PROMESAS. El primero se verifica con scripts/verify-auto-lock.mjs en unos diecinueve minutos de reloj real y ocho casos, incluida la pestaña realmente oculta y, desde el 417, un contador TOTP corriendo sin que nadie lo toque; solo el móvil sigue siendo manual. La segunda se probó sobre una vault real restaurada: el ciphertext de los 370 items quedó idéntico byte a byte, que es ADR-008 en producción.

La Iteración 8 se cerró el 18 de agosto de 2026 y las copias de seguridad dejaron de ser un acto de fe: existían y salían cifradas de la máquina, pero nadie había abierto una vault desde ninguna, y ahí se restauró una con las 370 contraseñas dentro en una instancia limpia y se leyeron items descifrados en un navegador. Ocho issues, tres de ellos abiertos por el camino. El detalle y las lecciones están en docs/planning/archive/ITERACION_8.md, y conviene leerlo antes de tocar el backup, su registro, la retención o el cron que lo dispara.

La Iteración 7 se cerró el 18 de agosto de 2026 y eVault dejó de ser un proyecto que funciona para pasar a ser la vault donde están las contraseñas de verdad, que es el propósito número uno de ADR-009. Dieciocho issues, seis de ellos abiertos por el camino. El detalle y las lecciones están en docs/planning/archive/ITERACION_7.md.

Y LO ÚNICO DE ESAS DOS QUE SIGUE MANDANDO SOBRE EL TRABAJO DE HOY, y por eso se queda aquí en vez de irse al archivo: dentro de kastor hay 370 contraseñas de verdad desde el 18 de agosto de 2026, así que lo que se rompa ahí NO es reproducible y el servidor no puede repararlo, porque no puede leer nada. Lo que hay que saber antes de tocar esa máquina —su reloj no monótono entre arranques, y que docker compose up -d --build no aplica las migraciones sin --force-recreate— está en la sección 7 de DEPLOYMENT.md, que es donde se busca al desplegar.

La Iteración 6 se cerró el 16 de agosto de 2026 y el repositorio dejó de tener afirmaciones que nadie podía comprobar: el código quedó entero en inglés y hay comandos que lo verifican, ejecutados por el CI en cada PR. Catorce issues. El detalle está en docs/planning/archive/ITERACION_6.md.

De ahí salieron tres comandos, y de los tres quedan dos: check-docs.py mira bytes NUL, marcadores de conflicto, los marcadores de sección manual de STATUS.md y las referencias a documentos que no existen; y ui-text.mjs vuelca el texto visible para compararlo antes y después de un renombrado. El tercero era check-identifiers.py, y lo jubiló el 323. Los que quedan tienen tests y el workflow repositorio los ejecuta siempre, sin filtro de paths.

Lo que se fue con el comprobador de identificadores, para saber qué ya no vigila nadie: marcaba las palabras funcionales españolas pegadas a otra —aItem, deVault— y eso ahora no lo ve nada. Se asume, porque con la frontera entre ficheros ese arrastre NUEVO no tiene de dónde venir, y el 382 lo comprobó barriendo el árbol: cero añadidos desde el 21 de agosto de 2026. Lo que esa frase no cubría eran los SUPERVIVIENTES, diez, barridos a mano en el 382. Lo que nunca comprobó fue la gramática: useVaultPersonal son tres palabras inglesas en orden español y pasaba igual. Eso sigue habiendo que verlo leyendo.

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

LA DEUDA QUE HABÍA SE CERRÓ ENTERA EN LA ITERACIÓN 12: el 332, el 344, el 360 y el 364, más el 382 y los dos del comprobador que aparecieron por el camino, el 393 y el 395. No queda ninguna anotada, y esa frase hay que leerla con cuidado: significa que no hay deuda RECONOCIDA, no que no la haya.

Y LA 13 EMPIEZA IGUAL, con cero deuda anotada, comprobado el 31 de agosto de 2026: cero issues abiertos con label deuda y cero alertas de Dependabot abiertas —hay diez, las diez fixed—. Lo más parecido que hay es el 424, el chunk de /styleguide publicado en producción, y no lleva label deuda a propósito: nunca se descarga, porque la ruta solo existe en DEV, así que su coste real hoy es cero bytes transferidos.

Y el hosting compartido, que no tiene issue porque no es deuda sino una decisión pospuesta con criterio. Está descartado COMO VÍA DE ACCESO en ADR-015 y eso no se reabre; lo pospuesto es su uso como emplazamiento, con el disparador de ADR-013 sección 6 y tres señales que decidirán: cuántas veces no se pudo consultar la vault por estar kastor apagado, cuántas se recurrió al gestor anterior, y si Tailscale se desconecta solo.

No es deuda, aunque lo parezca: que el rate limiting cuente peticiones y no solo intentos fallidos. Se evaluó, se descartó con motivo y no hay intención de cambiarlo; está documentado en el código y en un test.


SIGUIENTE PASO

EMPEZAR POR EL 412, DESPLEGAR LA ITERACIÓN 12 EN KASTOR, que ya no tiene nada por delante. Es el único issue de la 13 que no depende de nada y que otro no puede adelantar, porque necesita la máquina y la vault real. Antes de tocar nada: comprobar que la copia de la noche anterior existe y NO está vacía, y desplegar con --force-recreate, porque el código va por volumen y sin cambio de imagen Compose no recrea el contenedor ni aplica migraciones. Su segunda mitad es etiquetar de verdad las 370 y anotar el recuento.

EL 429 YA ESTÁ ARREGLADO, y lo que deja escrito importa más que el fallo: toContent() parte de lo que había guardado y no de un objeto vacío, así que el editor no puede destruir lo que no entiende —ni siquiera una clave escrita por un cliente más nuevo—. Y EDITOR_FIELDS es un Record sobre keyof ItemContent, de modo que el campo TOTP del 416 no compilará hasta que alguien diga si el formulario lo edita o hay que conservarlo, igual que PLAIN_EXPORT obliga en el export. El fallo era que editar una entrada favorita LA DESMARCABA. toContent() reconstruye el contenido desde los campos del formulario y favorito no está entre ellos, así que la clave que no viaja en el PUT deja de existir. Apareció leyendo schema.ts para escribir el 414, no lo encontró ninguna herramienta, Bloqueaba al 412 —no convenía desplegar los favoritos rotos sobre las 370 reales— y al 416, porque con una semilla TOTP la misma pérdida cuesta reconfigurar el segundo factor cuenta por cuenta. Apareció leyendo schema.ts para escribir el 414, y no lo encontró ninguna herramienta.

EL 414 YA ESTÁ, y de ahí sale la regla que hay que respetar al añadir el campo TOTP: un cliente que lea un item con un campo que no conoce TIENE QUE CONSERVARLO al reescribirlo, porque el PUT manda el contenido entero y no un parche. Está escrita en FOUNDATION.md, que ahora describe las siete claves del blob y no cinco.

EL 415 Y EL 416 YA ESTÁN. lib/vault/totp.ts genera códigos por RFC 6238 sobre crypto.subtle, sin dependencia nueva, y el blob tiene ya OCHO campos: totp guarda la SEMILLA —URI otpauth:// o base32, tal como se pegó— y nunca el código. Con eso quedan libres el 417, el 419 y el 420.

LO QUE HAY QUE SABER DEL CAMPO SIN ABRIR NADA. Se llama totp y no una palabra española, y es decisión escrita: no es una palabra de ningún idioma sino la sigla del estándar. Se valida LEYÉNDOLA con parseTotp al guardar, no con un regex, porque lo que hay que rechazar es una semilla que decodifica a los bytes equivocados y esa se parece a una buena. Y el editor enseña el código que saldría AHORA, que es la mitigación de lo peor que esto puede hacer: comparar ese número con la aplicación que aún está instalada, antes de retirarla, convierte un error irreversible en una errata.

Y EL 417 YA ESTÁ, QUE ES DONDE ESE CÓDIGO PASA A PARPADEAR: TotpCode.tsx lo repinta cada segundo con su cuenta atrás y su botón de copiar, y lee el reloj en cada tick en vez de restar uno, por la misma razón que autoLock.ts —los navegadores estrangulan los temporizadores de las pestañas ocultas, así que un contador que resta se queda atrás y enseñaría como válido un código ya caducado.

LA GARANTÍA DE ADR-017 §2.4 ESTÁ CERRADA Y MEDIDA CON RELOJ DE VERDAD: un contador TOTP corriendo NO mantiene la vault abierta. Es el caso 9 de verify-auto-lock.mjs, y trae su propio recibo dentro —lee el código dos veces con dos minutos de separación y se niega a pasar si no CAMBIÓ—, porque una vault que se bloquea con el contador muerto no demuestra nada. Verde el 31 de agosto de 2026: el código pasó de 912778 a 794033 sin que nadie tocara nada, aviso a los 14,3 minutos, bloqueo a los 15,7, y el código fuera de la pantalla después. Ocho de ocho casos en verde en 18,3 minutos.

Y LA SEMILLA NO SALE EN EL EXPORT EN CLARO NI SE VA EN SILENCIO: PLAIN_EXPORT la marca 'withheld' —primer uso de esa variante desde que el 380 construyó el tipo— y desde el 420 la confirmación dice, ANTES de descargar, a cuántas entradas afecta y que habrá que reconfigurarlas con su código QR. El recuento se calcula leyendo PLAIN_EXPORT y no nombrando totp, así que el próximo campo retenido se cuenta solo.

Y DE AHÍ SALE UN AVISO QUE NO SE DEDUCE MIRANDO EL CÓDIGO: los vectores publicados NO detectan un contador escrito en 32 bits. El más lejano del RFC, T=20000000000, está pasado 2^31 SEGUNDOS pero su contador es 666.666.666, que cabe de sobra en 32 bits, así que la tabla entera pasa con la implementación rota. Se descubrió mutando setBigUint64 a setUint32 y viendo los 29 tests en verde. El test que sí lo detecta está calculado aparte, en 2^32 × 30 segundos.

CON ESO EL 412 SIGUE LIBRE, y era el primero por orden.

LA CADENA DE TOTP, en orden: 415, luego 416 —el campo, que fija su nombre exacto—, luego 417 —el código en pantalla— y de ahí el 418. El 419 y el 420 cuelgan del 416 y pueden ir en paralelo. La auditoría es independiente: 421 y luego 422.

LO QUE NO SE PUEDE DAR POR BUENO CON UN TEST EN VERDE, y es lo que más se va a olvidar: que el contador de segundos NO mantenga la vault abierta. jsdom no puede verlo, así que su guardián es un caso nuevo en verify-auto-lock.mjs, en el 423, y se comprueba por mutación verificando que la mutación se aplicó.

LO QUE NO HAY QUE REABRIR POR INERCIA: paginar GET /items, descartado con la medida delante en la 11; el acceso desde fuera de la red local, resuelto y verificado; el hosting compartido como vía de acceso, descartado en ADR-015; el panel Filament, que ADR-009 sección 4 sacó del alcance; las carpetas, que las etiquetas cubren y que el 412 pone en condiciones de decidirse con la vault delante; adelgazar el bundle, que no lo pide ninguna medida —110 kB gzip en el chunk mayor y las rutas ya van diferidas—; y consultar brechas ajenas desde la auditoría, descartado al planificar la 13.

Y LO QUE SE MIRA SIN QUE SEA UNA TAREA: las tres señales del hosting compartido como emplazamiento, con el disparador de ADR-013 sección 6. Durante la 12 kastor estuvo encendido y sirviendo, y se desplegó dos veces sin incidencias, que es la primera de las tres apuntando a que no hace falta reabrirlo.


CONVENCIONES DE TRABAJO

Git: una rama por issue con el formato tipo/número-descripcion-corta. Merge a master solo mediante PR con squash, un commit por issue. El cuerpo del PR incluye Closes seguido del número para que GitHub cierre el issue automáticamente. Se usa gh CLI.

Definition of Done: criterios de aceptación completos, tests en verde, RBAC validado donde aplique, PR mergeado y este documento actualizado. STATUS.md no hay que tocarlo, lo regenera el CI tras el merge. Los issues con UI se verifican en navegador antes de marcarse como hechos.

Patrones de código heredados de un proyecto anterior: servicios de aplicación con método handle que reciben identificadores explícitos y no acceden a sesión. Double guard, es decir validación en la capa de presentación y también en la capa de aplicación, nunca solo en una. DTOs tipados para transferir datos entre capas. Servicios idempotentes para operaciones de agregación. Tests de aislamiento cross-tenant en todos los servicios críticos.
