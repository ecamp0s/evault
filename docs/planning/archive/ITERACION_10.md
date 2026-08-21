ITERACIÓN 10 — Historial y lecciones aprendidas

Archivo de la Iteración 10, cerrada el 21 de agosto de 2026. Recoge la intención de cada issue y lo que se aprendió al cerrarlo.

Está archivado, no muerto. Es la iteración en la que el repositorio pasó a leerse entero en un idioma y en la que se jubiló el andamiaje que lo vigilaba. Si alguna vez hay que tocar la regla de idioma, su comprobador, el censo de comentarios o el volcado de texto visible, merece la pena leer esto antes de investigar desde cero.

El objetivo se cumplió: no queda una línea de prosa española pegada a código, y check-comment-language.py --all sale en verde sobre el árbol entero en cada PR.

Nota de formato: prosa plana sin Markdown, por la convención del proyecto.


QUÉ SE HIZO

Dieciséis issues cerrados. El plan tenía quince, y ya ahí falló una cifra: la planificación decía «catorce» contando los mismos bloques.

Bloque 0, la planificación. El 315.

Bloque 1, los dos avisos que faltaban de la iteración anterior. El 303, que el bloqueo por inactividad descartaba lo escrito en un diálogo sin avisar; y el 309, que recuperar el acceso no invalida la clave usada y nada lo advertía.

Bloque 2, la conversión. El 316 con el censo, y después las seis capas: el 317 con lib/vault, el 318 con api/app y las rutas, el 319 con los tests y las migraciones de la API, el 320 con las pantallas, el 321 con el resto de lib y los componentes, y el 322 con el utillaje. Con ellas se cerró el 290.

Bloque 3, la jubilación. El 323.

Bloque 4, lo que apareció al medir. El 324 con la promesa de Filament y el bloqueo del 21, y el 325 con los dos README de plantilla.

Bloque 5, el cierre. El 326.

Fuera de plan salieron el 342, abierto y cerrado dentro de la propia iteración, y tres deudas nuevas: el 329, el 332 y el 344.


LO QUE CAMBIÓ DE FONDO

El repositorio se lee entero en un idioma. Eran 3.994 líneas de comentario y 461 nombres de test en 217 ficheros, medidos al cerrar sobre el árbol de la planificación; 3.836 se convirtieron y 158 se fueron con el andamiaje que las contenía.

Y la regla de idioma dejó de tener dos comprobadores para tener uno solo que mira más. Hasta aquí había check-identifiers.py vigilando identificadores y check-comment-language.py vigilando la prosa que un cambio AÑADE. Ahora hay un solo comando y en modo --all: mira el árbol entero, porque el árbol entero está en inglés y volver a ensuciarlo tiene que doler el mismo día. Con eso salieron del repositorio 1.885 líneas de infraestructura.

No se tradujo a máquina, y esa fue la apuesta. Estos comentarios explican por qué las cosas son como son y pasarlos por un traductor los habría degradado; el criterio de las seis capas fue reescribir el argumento en inglés. Se fijó en la primera capa, la más argumentativa, y las otras cinco lo copiaron.


LA LECCIÓN QUE MÁS SE REPITIÓ: TRADUCIR OBLIGA A LEER, Y LEER ENCUENTRA LO QUE NINGÚN GREP VE

Seis notas caducadas y tres comentarios huérfanos de su código, ninguno encontrable buscando.

Las notas: el aviso de convivencia de idiomas de BackupTest.php, que CLAUDE.md citaba como el ejemplo de cómo se documenta; el de ListStates.tsx, que remitía al 97 como pendiente cuando se cerró el 4 de agosto; el de api.php, que decía que /health lleva cabeceras CORS, retiradas en el 296; el de api.test.ts, que daba CORS mal configurado como causa de una petición sin respuesta; los cinco nombres de test que citaba el bloque del testTimeout de vite.config.ts, traducidos por las capas anteriores; y la referencia de vault.ts a cripto.test.ts, que se llama crypto.test.ts desde el 317.

Los huérfanos, los tres en la capa de la API: el bloque de recovery de AttemptKey estaba pegado a masterPassword, dos métodos por encima del suyo; el de recovery de throttling.php, dos entradas por encima de su clave; y en api.php, el que explica abilities:* estaba encima de la única ruta que queda FUERA de ese grupo. Los tres, además de descolocados, afirmaban cosas falsas.

La regla que sale de aquí: una conversión no es una tarea mecánica que se pueda delegar a una herramienta, porque su valor no está en el texto resultante sino en haber tenido que leer el anterior.


UN COMPROBADOR PUEDE DAR UN CERO TRANQUILIZADOR, Y ESTA VEZ PASÓ TRES VECES

El censo del 316 existe por la primera: check-comment-language.py marca prosa española, de modo que un comentario BORRADO en vez de traducido se lleva su propio hallazgo y deja el check en verde. Sobre 3.993 líneas repartidas en seis PR, la única red existente premiaba el peor resultado posible.

La segunda es el punto ciego del 324. scripts/hooks/pre-push no tiene extensión y el comprobador decidía por la extensión, así que el fichero llevaba veinte líneas de comentario en español mientras --all respondía «sin problemas en el árbol entero». Ahora los reconoce por el shebang.

La tercera es el 332, y sigue abierta. --measure dice hoy 0 por ciento de detección, porque su corpus son cuatro ficheros vivos del repositorio declarados «en español» y la conversión los dejó en inglés. El único test que lo mira comprueba los falsos positivos, que siguen en cero, así que el CI no lo nota.

Las tres son la misma familia que el 184: un cero que tranquiliza sobre algo que el auditor no ha mirado.


LO QUE SE MIDIÓ Y NO CUADRABA, QUE ES CASI TODO

Esta iteración se planificó remidiendo, y aun así ninguna cifra heredada resultó correcta.

La deuda del 290 estaba escrita como 3.904 en CLAUDE.md, 3.950 en SPRINT_CONTEXT.md y 3.993 al planificar; medida al cerrar sobre el mismo árbol de la planificación son 3.994 en 217 ficheros y 461 nombres de test, y las diferencias vienen de que el comprobador cambió por el camino. El andamiaje jubilado estaba escrito como 1.585 líneas en CLAUDE.md y 1.604 en STATUS.md; el issue lo corrigió a 1.860 y lo borrado fueron 1.885, porque english.txt tenía 773 líneas y no 748.

El README público decía 238 tests de API y 368 de web cuando son 260 y 458, hablaba de once ADR cuando son dieciséis, y su nota final decía que la prosa del código está en español — cierta cuando se escribió y falsa por culpa de esta misma iteración.

La conclusión no es que haya que medir mejor: es que una cifra escrita en prosa caduca en silencio, y la única que no lo hace es la que produce un comando que cualquiera puede ejecutar.


LO QUE COSTÓ MÁS DE LO PREVISTO

Nada de la conversión, que salió por donde estaba previsto. Lo que se llevó el tiempo extra fue el bloque 4: dos issues de documentación que resultaron ser un barrido. Al comprobar con curl qué servía cada host —en vez de leerlo— apareció que api.evault.localhost seguía respondiendo aunque el 296 lo retirara, que app.evault.localhost/api no llegaba a PHP-FPM, y que admin.evault.localhost servía la raíz de Laravel esperando un panel que ADR-009 sección 4 había sacado del alcance. El Caddy de la máquina nunca recibió el cambio de ADR-016 y nadie lo notó porque el proxy de Vite lo tapaba.


LO QUE HAY QUE SABER ANTES DE TOCAR ESTO

El censo va por fichero y no sobre el total, y el margen está medido: convertir keyInMemory.ts a mano quitó un 7,1 por ciento y unlock.ts un 0. Se permite perder el 15 por ciento con un suelo de 3 líneas, así que detecta la pérdida DESPROPORCIONADA y no cualquier pérdida: en un fichero de 43 líneas de comentario, borrar 6 pasa y borrar 7 no.

Un host retirado de Caddy sigue respondiendo 200. Cualquier nombre acabado en .localhost resuelve a loopback y entra en el bloque del puerto, donde Caddy responde 200 con cero bytes al no casar ningún handle. Lo que distingue «retirado» de «sirviendo» es el tamaño del cuerpo, no el código.

El bloque de Caddy del entorno de desarrollo está escrito en SETUP.md, y eso es nuevo. Ese fichero vive en /etc/caddy, no se versiona y necesita sudo, así que su única copia estaba en una máquina: por eso la documentación y la realidad divergieron durante cinco días sin que nada lo notara.

La comprobación que vale para un renombrado no es leer el diff: es comparar todo el texto visible antes y después con scripts/ui-text.mjs. Salió idéntico byte a byte en las cuatro capas de frontend, 43.043 bytes. Y en los tests el volcado sí cambia, porque los nombres de test son cadenas: hay que cruzar aparte que ninguna de las cadenas retiradas sea texto de la interfaz.

git no versiona directorios vacíos. SETUP.md llevaba nueve iteraciones diciendo que mobile/ y extension/ están creadas, y no existen ni pueden existir hasta que tengan algo dentro.


LOS CRITERIOS DE SALIDA

Ocho, y se dice el resultado tal cual salió. Siete cumplidos y uno que no, y no se estira la definición para que cuadre.

El quinto pedía los 788 tests en verde Y EN EL MISMO NÚMERO. Están en verde y son 791: 458 en web, 260 en la API y 73 del utillaje. El criterio estaba mal escrito, y por una razón que era visible al escribirlo: la misma iteración añadía tests por diseño —el 303 y el 309 con sus avisos, el 316 con el censo, el 323 con los del volcado, el 325 con los del README—, y retiraba los 384 del comprobador jubilado. Lo que el criterio quería decir sí se cumplió: convertir el nombre de un test no cambió lo que prueba ni hizo desaparecer ningún caso, y la cobertura subió en vez de bajar, del 93,12 al 93,24 global y del 98,64 al 98,68 en lib/vault.

El segundo se cumple con una precisión que el criterio no decía: borrar un comentario a propósito pone el censo en rojo cuando la pérdida supera el margen del fichero. Se comprobó con la mutación al cerrar, borrando primero seis líneas de un fichero que permite seis —pasa— y después nueve —falla—.


LO QUE QUEDA ABIERTO

Tres deudas, las tres encontradas en esta iteración. El 329, que el bloqueo por inactividad también se lleva la clave de recuperación recién generada, y su primera mitad no es perder trabajo sino quedarse con una cuenta que cree tener clave de recuperación. El 332, el corpus de --measure. Y el 344, el andamiaje de frontend que arrastra api/ y que este proyecto no usa.

Y una cosa que ya no es deuda y conviene decirlo: la afirmación de que la deuda del 290 «ya no crece sin que nadie lo vea» se retira de SPRINT_CONTEXT.md al cerrar, porque la deuda no existe. Dejarla sería exactamente el mecanismo que produjo la mitad de los hallazgos de esta iteración.
