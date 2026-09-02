SPRINT CONTEXT — eVault
Actualizado: 2 de septiembre de 2026
Estado: Iteración 14 en curso desde el 2 de septiembre de 2026. Catorce issues, del 458 al 471.

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
Por qué el proyecto está construido así: los diecinueve ADR en docs/architecture/decisions.
Historial de iteraciones cerradas y sus lecciones: docs/planning/archive.
Modelo de datos y contrato del blob: docs/architecture/FOUNDATION.md, lectura obligatoria antes de tocar la API o de añadir una columna a vault_items.
Qué llave abre qué y qué se pierde con cada una: docs/architecture/KEYS.md, que es de consulta y responde sin abrir ningún ADR.
Comandos, URLs, workflow git e idioma del código: CLAUDE.md en la raíz.
Reglas de la propia documentación: docs/GUIDE.md.


DECISIONES DE ARQUITECTURA CERRADAS

Los diecinueve ADR de docs/architecture/decisions son la fuente de verdad, y son inmutables: si una decisión cambia, se escribe uno nuevo que la supersede. Lo que sigue es el índice para saber cuál abrir, no un sustituto de abrirlo.

Los seis primeros están numerados por profundidad arquitectónica y no por fecha. ADR-001 zero-knowledge. ADR-002 React para la vault y Filament solo para administración, porque el server-side rendering rompería la garantía. ADR-003 monorepo. ADR-004 multi-tenancy sin Spatie teams, con el contexto de tenant explícito en cada llamada porque la API es stateless. ADR-005 arquitectura self-hosteable. ADR-006 TypeScript 6, con un bloqueador verificable detrás.

A partir del 007 la numeración es cronológica. ADR-007 el token de sesión vive solo en memoria, así que recargar no es una expulsión sino el bloqueo de la vault. ADR-008 arquitectura de claves. ADR-009 el proyecto deja de ser un SaaS. ADR-010 clave de recuperación. ADR-011 formato de export e import. ADR-012 estrategia de despliegue. ADR-013 emplazamiento y operación de la instancia personal, que es además donde queda corregida la imprecisión de ADR-012 sección 2.3 al meter Tailscale, Cloudflare y una VPN propia en el mismo saco. ADR-014 cambio de correo electrónico, y de ahí lo único que hay que tener presente sin abrirlo: cambiar el correo SÍ invalida la clave de recuperación, al contrario que rotar la contraseña maestra, porque el correo es el salt del HKDF que deriva sus claves. ADR-015 acceso a la vault desde fuera de la red local, que elige Tailscale y explica por qué el criterio no es la comodidad sino quién puede servir el JavaScript. ADR-016 un solo origen para la SPA y la API, que mueve la API a /api del mismo host y retira CORS, y de ahí lo que hay que tener presente: dos lineamientos de ADR-012 sección 4 dejaron de regir y siguen escritos ahí, porque los ADR son inmutables. ADR-017 los códigos TOTP dentro de la vault, y de ahí lo que hay que tener presente sin abrirlo: SÍ se guardan semillas, dentro del item y del blob cifrado, asumiendo que quien abra la vault tiene también los segundos factores; no sube ninguna de las dos versiones, ni la del esquema criptográfico ni la del fichero de export; y la semilla NO sale nunca en el export en claro, que además dice a cuántas entradas afecta. ADR-018 qué se conserva después de decir que ya no lo quieres —historial de contraseñas, papelera y caducidad de sesión—, y de ahí lo que hay que tener presente sin abrirlo: está APROBADO PERO DIFERIDO, con el precedente de ADR-007, así que decide pero todavía no rige. ADR-019 la vault sin red, que es el que decide la Iteración 14.

Del 012 conviene tener presente una cosa sin abrirlo, porque decide si un despliegue funciona o no: HTTPS no es endurecimiento, es requisito de arranque. Fuera de localhost no existe crypto.subtle en contexto inseguro, así que una instancia servida por http en un dominio propio o en una IP de la red local no es una instalación limitada, es una donde no se puede ni registrar un usuario. Y la excepción de .localhost no rescata nada aquí: vale en la máquina que ejecuta el navegador, no desde otro dispositivo de la red.

Lo único de todo esto que hay que tener en la cabeza sin abrir nada, porque explica la forma de casi todo el código: la contraseña maestra no cifra los items. PBKDF2 con 600.000 iteraciones deriva del par contraseña y correo una clave maestra cuyo único trabajo es ENVOLVER una clave de vault aleatoria de 256 bits, y es esa la que cifra con AES-256-GCM. Por eso cambiar la contraseña maestra es reenvolver 32 bytes en vez de recifrar la vault, y por eso la clave de recuperación puede ser un segundo envoltorio de la MISMA clave sin duplicar nada. El hash que viaja al servidor se deriva de la clave maestra usando la contraseña como salt: quien lo capture consigue una sesión, no el contenido.

Y la consecuencia que más se malinterpreta, con test que falla si el aviso desaparece: rotar la contraseña maestra NO invalida la clave de recuperación, porque la clave de vault no cambia. Quien sospeche un robo tiene que regenerarla aparte.


DÓNDE ESTAMOS

La Iteración 14 arrancó el 2 de septiembre de 2026 y va de que la vault se instale en el móvil y se lea sin red. Catorce issues, del 458 al 471, y la decide ADR-019.

HECHO YA: el 458, que registró los dos ADR; el 464, que hace la aplicación instalable; el 463, que abre worker-src a self para que el service worker del 465 pueda registrarse; y el 459, el caché cifrado en el dispositivo.

AL DESPLEGAR EL 476 TODO EL MUNDO TIENE QUE VOLVER A INICIAR SESIÓN, y no es un fallo: las claves con las que la aplicación guarda cosas en el navegador pasaron a inglés y se aceptó perder lo guardado. Se pierden el correo recordado y dos preferencias; no se pierde ninguna contraseña, porque ni el token ni la clave de vault se persisten. AFECTA TAMBIÉN A LA SEGUNDA CUENTA, que conviene avisar antes de desplegar.

DEL 459 HAY QUE SABER TRES COSAS SIN ABRIR NADA. El caché SE INDEXA POR CORREO y no por id de usuario, y no es un descuido: al recargar no hay sesión —ADR-007— y lo único que este navegador recuerda es rememberedUser, que trae nombre y correo; no hay id que consultar justo cuando no hay red para pedirlo. Está APAGADO POR DEFECTO con la preferencia evault.sinred, y el interruptor y su explicación son el 462. Y se escribe desde vault/api.ts y no desde los hooks, porque para cuando los hooks ven los datos ya están descifrados y lo que hay que guardar es el ciphertext.

HAY UN RELOJ CORRIENDO Y SE ROMPE ABRIÉNDOLA: la fase 1 del 469 arrancó el 2 de septiembre de 2026 a las 16:17, con la PWA instalada en el iPhone y la sesión iniciada. NO SE ABRE HASTA EL 9 DE SEPTIEMBRE A LAS 16:17, porque el tope de almacenamiento de Safari se dispara por ausencia de interacción y mirarla a mitad reinicia la cuenta. Lo que decide es si la pantalla de desbloqueo sigue recordando el correo.

LO QUE HAY QUE SABER SIN ABRIR NADA, y son tres cosas. DESBLOQUEAR SIN RED NO NECESITA SERVIDOR: el hash de autenticación solo consigue un token y el token solo trae el ciphertext, así que con el ciphertext ya en el dispositivo no queda nada que pedir, y la contraseña incorrecta falla sola porque AES-GCM no valida su tag. El caché es de SOLO LECTURA y está APAGADO POR DEFECTO, porque quita el rate limiting de en medio —la misma propiedad que un fichero .evault ya tenía desde la Iteración 4—. Y el camino crítico NO es el orden de los bloques sino 458 → 464 → 469: el issue que comprueba que el caché sobrevive siete días sin abrir la aplicación solo necesita el manifest para empezar a contar, así que se arranca pronto o no cabe.

Y LA DECISIÓN DE PLANIFICACIÓN QUE CONVIENE NO PERDER: se descartó como objetivo una iteración de red de seguridad —historial, papelera, caducidad— porque el rigor tiene que ser proporcionado a lo que esto es, una instancia personal con dos cuentas reales y no un producto que deba cumplir normas externas. No se tiró: está escrita entera en ADR-018, aprobada y diferida.

La Iteración 13 se cerró el 2 de septiembre de 2026 y la vault guarda el segundo factor y empieza a decir qué hay mal dentro de ella. Veintidós issues, siete de ellos abiertos por el camino sobre un plan de quince. Seis de los ocho criterios cumplidos, uno a medias y uno sin verificar. El detalle y las lecciones están en docs/planning/archive/ITERACION_13.md, y conviene leerlo antes de tocar TOTP, la auditoría, el banco de la vault larga o el diálogo de una entrada.

LO QUE HAY QUE SABER SIN ABRIR NADA, y son cinco cosas. La semilla vive en el campo totp del blob —URI otpauth:// o base32, tal como se pegó— y nunca sale en el export en claro, que además dice a cuántas entradas afecta. El contador de segundos NO cuenta como actividad del bloqueo, y eso está medido con reloj real en el caso 9 de verify-auto-lock.mjs. La auditoría NO puntúa la fuerza de una contraseña: puntuarla exige un diccionario, y calcular entropía ingenua daría una nota alta justo a las malas, así que informa de tres cosas que se ven sin adivinar. Su umbral de «corta» está en 12 y MEDIDO contra las 369 reales. Y el blob tiene ocho campos, con FOUNDATION.md al día.

EL NÚMERO DE LA ITERACIÓN, y es de la vault y no del código: 246 de 369 contraseñas tienen algo que corregir, y UNA ESTÁ COMPARTIDA POR 41 ENTRADAS. No depende de ningún umbral y no lo podía calcular nadie más que el cliente. Cambiarlas es trabajo de quien tiene la vault.

Y LA LECCIÓN QUE MÁS LEJOS LLEGA: extrapolar una medida no es medirla. El coste de la pantalla de revisión se midió a 120 entradas, dio ×2,5 y se dio por bueno en voz alta; a 370 es ×7,2, porque las filas crecen con LO QUE ESTÁ MAL en la vault y no con la vault. Lo cazó el límite nuevo corrido a escala real, no leer el código.

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

Y LA 13 TAMBIÉN CIERRA CON CERO DEUDA ANOTADA, comprobado el 2 de septiembre de 2026: ningún issue abierto con label deuda y cero alertas de Dependabot. El 424 —el chunk de /styleguide en producción— se abrió y se cerró dentro de la propia iteración, así que no llegó a ser deuda.

Y el hosting compartido, que no tiene issue porque no es deuda sino una decisión pospuesta con criterio. Está descartado COMO VÍA DE ACCESO en ADR-015 y eso no se reabre; lo pospuesto es su uso como emplazamiento, con el disparador de ADR-013 sección 6 y tres señales que decidirán: cuántas veces no se pudo consultar la vault por estar kastor apagado, cuántas se recurrió al gestor anterior, y si Tailscale se desconecta solo.

No es deuda, aunque lo parezca: que el rate limiting cuente peticiones y no solo intentos fallidos. Se evaluó, se descartó con motivo y no hay intención de cambiarlo; está documentado en el código y en un test.


SIGUIENTE PASO

TRABAJAR LA ITERACIÓN 14. El backlog está en GitHub y el orden lo dan las dependencias: lo tomable es lo que no tiene bloqueante abierto. Empieza por el 458, que registra los dos ADR y escribe las secciones manuales de STATUS.md.

LO QUE HAY QUE ARRANCAR PRONTO AUNQUE PAREZCA DEL FINAL: el 469, que tarda siete días de calendario. Se instala en el iPhone en cuanto exista el manifest del 464 y se deja reposar mientras se hace el resto, como los diecinueve minutos de verify-auto-lock.

LO QUE QUEDA PENDIENTE Y TIENE DUEÑO CONOCIDO: probar un código TOTP contra un servicio real, que es el criterio 2 de la 13 y necesita una cuenta de prueba y una persona; y bajar el recuento de la auditoría, que exige cambiar contraseñas de verdad —empezando por la que comparten 41 entradas—. Las dos son trabajo de quien tiene la vault y no del repositorio, y por eso NO son criterio de salida de la 14: se anotarán como medición al cerrar.

LO QUE ESTÁ SOBRE LA MESA SIN DECIDIR: la extensión de Firefox y Chrome, que es donde está el autofill y que exige resolver antes dónde vive la clave desbloqueada, porque Manifest V3 mata el service worker de fondo y eso choca con ADR-007; una app nativa de iOS como proveedor de contraseñas, que NO se puede hacer con una PWA y es un cliente entero y no una funcionalidad; otros tipos de entrada —tarjetas, notas, documentos—; y leer una semilla desde un código QR, descartado en la 13.

LO QUE NO HAY QUE REABRIR POR INERCIA: paginar GET /items, descartado con la medida delante en la 11; el acceso desde fuera de la red local, resuelto; el hosting compartido como vía de acceso, descartado en ADR-015; el panel Filament, fuera de alcance por ADR-009 sección 4; las carpetas, descartadas CON MEDIDA en la 13; y el offline con escritura y cola de sincronización, descartado en ADR-019 porque el servidor no puede resolver un conflicto que no puede leer.

Y LO QUE SE MIRA SIN QUE SEA UNA TAREA: las tres señales del hosting compartido como emplazamiento, con el disparador de ADR-013 sección 6 — teniendo en cuenta que la Iteración 14 DESACTIVA EN PARTE la primera de ellas, según ADR-019 sección 6.3.



CONVENCIONES DE TRABAJO

Git: una rama por issue con el formato tipo/número-descripcion-corta. Merge a master solo mediante PR con squash, un commit por issue. El cuerpo del PR incluye Closes seguido del número para que GitHub cierre el issue automáticamente. Se usa gh CLI.

Definition of Done: criterios de aceptación completos, tests en verde, RBAC validado donde aplique, PR mergeado y este documento actualizado. STATUS.md no hay que tocarlo, lo regenera el CI tras el merge. Los issues con UI se verifican en navegador antes de marcarse como hechos.

Patrones de código heredados de un proyecto anterior: servicios de aplicación con método handle que reciben identificadores explícitos y no acceden a sesión. Double guard, es decir validación en la capa de presentación y también en la capa de aplicación, nunca solo en una. DTOs tipados para transferir datos entre capas. Servicios idempotentes para operaciones de agregación. Tests de aislamiento cross-tenant en todos los servicios críticos.
