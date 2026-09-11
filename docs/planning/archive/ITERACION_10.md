ITERACIÓN 10 — Historial y lecciones aprendidas

Archivo de la Iteración 10, cerrada el 21 de agosto de 2026. Recoge la intención de cada issue y lo que se aprendió al cerrarlo.

Está archivado, no muerto. Es la iteración en la que el repositorio pasó a leerse entero en un idioma y en la que se jubiló el andamiaje que lo vigilaba. Si alguna vez hay que tocar la regla de idioma, su comprobador, el censo de comentarios o el volcado de texto visible, merece la pena leer esto antes de investigar desde cero.

El objetivo se cumplió: no queda una línea de prosa española pegada a código, y check-comment-language.py --all sale en verde sobre el árbol entero en cada PR.

Nota de formato: prosa plana sin Markdown, por la convención del proyecto. Salvo la última sección, LO QUE DECÍA STATUS.md, que conserva el Markdown con que se escribió allí.


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


LO QUE DECÍA STATUS.md

Hasta el 11 de septiembre de 2026, STATUS.md conservaba el objetivo, los criterios de salida y los riesgos de todas las iteraciones cerradas, y llegó a 288 KB: ya no cabía en una lectura. El 663 los sacó de allí por la regla de una sola fuente de docs/GUIDE.md, y lo que decía de esta iteración está aquí copiado sin tocar, salvo los enlaces relativos, ajustados a esta carpeta.

EL OBJETIVO QUE LLEVABA STATUS.md

**Iteración 10: cerrada el 21 de agosto de 2026.** Objetivo cumplido: *el repositorio se lee entero en un idioma, y el andamiaje que lo vigilaba se jubila.* No queda una línea de prosa española pegada a código, y `check-comment-language.py --all` sale en verde sobre el árbol entero en cada PR. El historial y las lecciones, en [docs/planning/archive/ITERACION_10.md](ITERACION_10.md).

`ADR-009` §4 fija el orden —primero lo que hace el producto fiable para quien lo usa de verdad, después lo que lo hace legible, y solo después funcionalidad nueva— y **las Iteraciones 7, 8 y 9 agotaron la primera columna**: hay 370 contraseñas reales dentro, se ha restaurado una copia y leído los items descifrados, y la vault se alcanza desde fuera de casa con el ciclo entero verificado desde la calle con el wifi apagado. Toca la segunda, y ahí lo que pesa es #290: **3.993 líneas de comentario en español en 216 ficheros**, y **442 nombres de test**.

Es además la deuda que **jubila infraestructura en vez de añadirla**. Al terminar, `check-identifiers.py`, su lista de 713 palabras, sus dos extractores y sus tests salen del repositorio, porque con la frontera entre idiomas pasando *entre* ficheros no queda nada que comprobar: la regla es evidente al abrir uno. **Medido al borrarlas: 1.885 líneas**, no las 1.860 del issue — `english.txt` tenía 773 y no 748.

**Quince issues planificados en seis bloques; dieciséis cerrados.** Bloque 0, la planificación: #315. Bloque 1, los dos avisos que faltan: #303 y #309. Bloque 2, la conversión: el censo en #316 y después las seis capas, #317, #318, #319, #320, #321 y #322, que cierran #290. Bloque 3, la jubilación: #323. Bloque 4, lo que apareció al medir: #324 y #325. Bloque 5, el cierre: #326. Fuera de plan salió #342, abierto y cerrado dentro.

> **Y ese conteo también falló al escribirse.** Esta sección decía «catorce» sobre los mismos bloques, que son quince contando #290. Es la cifra número seis de esta iteración que no cuadraba, en el documento que las lista.

**No hace falta ADR.** La decisión de idioma se tomó el 17 de agosto de 2026 en #253 y #251 la cerró con sus tres cabos sueltos; esta iteración la ejecuta. La única rama que habría necesitado uno es la opción del borrador de #303 —guardar fuera de la clave contenido escrito dentro de la vault, que es justo lo que `ADR-001` regula— y no es la que se elige: se elige avisar.

**El desglose de la conversión, medido al planificar y no heredado:**

| Capa | Líneas | Ficheros | Issue |
|---|---|---|---|
| `web/src/lib/vault` | 907 | 32 | #317 |
| `api/app` + `routes`/`config`/`bootstrap` | 811 | 63 | #318 |
| `api/tests` + `api/database` | 677 | 41 | #319 |
| `web/src/pages` | 584 | 35 | #320 |
| `web/src/lib` (resto) + `components` | 574 | 27 | #321 |
| `scripts`, `scripts/tests`, `docker` y el resto de `web/` | 440 | 18 | #322 |

Los 442 nombres de test en español —de 795 totales, en 69 ficheros— caen dentro de esas mismas capas y van con ellas. Y **158 de las 440 líneas de la última capa no se traducen: se van con el andamiaje** en #323, así que la capa que cierra es de 282 líneas reales.

**La decisión de secuenciación, que es la apuesta de esta iteración.**

**El censo va primero, antes de convertir una sola línea.** El modo de fallo aquí no es traducir mal: es **traducir borrando**. Si un comentario español desaparece en vez de convertirse, el hallazgo desaparece con él y `check-comment-language.py` da verde — **la única red que hay premia el peor resultado posible**, sobre 3.993 líneas repartidas en seis PR que nadie va a leer línea a línea. Y este repositorio ya sabe qué pasa con las redes que llegan al final: es el hallazgo 1 de abajo, con 65 líneas de nombre.

**`lib/vault` va primero y solo**, como #153 en la 5, #214 en la 7 y `ADR-015` en la 9. Es el núcleo criptográfico y lo que abre antes que nada quien lea este repositorio evaluando criterio técnico; son 907 líneas donde los comentarios explican *por qué* PBKDF2 envuelve una clave en vez de cifrar los items. Ahí se fija el criterio que copian las cinco capas siguientes —**traducir es reescribir el argumento en inglés, no pasar el texto por un traductor**— con la cabeza fresca y no con tres mil líneas de fatiga encima.

**`api` va antes que `web/src/pages`**, invirtiendo el orden de tamaño a propósito: en la API los comentarios son argumento —por qué `AttemptKey` combina IP y correo, por qué el aislamiento se comprueba dos veces—, y las pantallas son sobre todo descripción y toleran mejor el cansancio.

**Y el paso a `--all` va en el mismo PR que deja el árbol limpio, no antes.** Un check que nace en rojo se acaba ignorando entero, que es la lección de #62 y la razón de que #291 mirara lo añadido y no el árbol. **Al ejecutar el plan resultó ser el PR de #323 y no el de #322**, y por una razón aritmética: al terminar la última capa quedan exactamente 158 líneas de prosa española, y las cuatro que las contienen son las que #323 borra. `--all` entra en verde en el commit que las retira, que es lo que la regla pedía.

**Lo que apareció al medir, y no estaba en ningún documento.** Cinco hallazgos, y cuatro son el patrón que este proyecto arrastra desde el criterio 7 de la Iteración 4 — **una afirmación escrita en un documento que le da autoridad y que nadie volvió a comprobar**:

1. **La deuda de #290 creció 65 líneas durante la Iteración 9, y la red llegó al final de ella.** `./scripts/check-comment-language.py --base 454cce0` —la planificación de la 9— marca **65 líneas** de prosa española añadidas desde entonces. `SPRINT_CONTEXT.md` afirma que «ya no crece sin que nadie lo vea», y es cierto **a partir del 19 de agosto**: sobre `ec8046d`, el commit de #291, el comprobador sale limpio. Pero la iteración que escribió esa frase aportó 65 líneas a lo que dice haber contenido, y eso no está en ninguna parte. **Es la forma nueva del patrón**: no una afirmación falsa, sino una cierta que oculta lo que pasó antes de serlo.
2. **Tres cifras de la misma deuda en tres documentos.** 3.904 en `CLAUDE.md` y en la cabecera de `check-identifiers.py`, 3.950 en `SPRINT_CONTEXT.md`, y **3.993 en 216 ficheros** medido hoy con la propia herramienta. Es la tercera vuelta sobre esta cifra concreta: ya se corrigió al planificar la Iteración 8 —el 68 % del volumen real— y otra vez al planificar la 9.
3. **El panel Filament lo sacó del alcance `ADR-009` §4, y tres documentos lo seguían prometiendo como futuro** — retirado en #324 el 21 de agosto de 2026. `CLAUDE.md` líneas 11 y 73, y `docs/development/SETUP.md` líneas 17 y 91. **Filament no está en `api/composer.json` ni hay directorio `api/app/Filament`**, y el ADR dice literalmente que el panel de administración de plataforma «sale del alcance». Con dos agravantes sobre el patrón habitual: está en los dos documentos que se leen al empezar cada sesión, y **no es que nadie lo comprobara, es que una decisión ya había decidido lo contrario**. **Y no estaba sola**: `scripts/hooks/pre-push` afirmaba en su cabecera que «el issue #21 está bloqueado» porque GitHub no permitiría rulesets, y #21 se cerró el 3 de agosto de 2026 — el repositorio es público y el ruleset existe. Ese texto además solo se abre cuando algo falla, que es el peor momento para leer algo falso. **El hook no sobra por ello y eso va escrito en el issue**: el ruleset cubre lo irreversible —borrar `master`, reescribir su historia— pero **no exige pull request**, porque GitHub no admite bypass a Actions en un repositorio personal y el workflow `status` escribe `STATUS.md` en `master`; el push directo lo sigue cubriendo solo el hook, y eso es lo que dice ahora su cabecera (#324).
4. **Las cifras del andamiaje tampoco cuadran.** `english.txt` tiene **713** palabras y `CLAUDE.md` y el propio comprobador dicen 692. Y lo que la conversión jubila son **1.860 líneas** —el comprobador, la lista, los dos extractores y sus tests—, no las 1.585 de `CLAUDE.md` ni las 1.604 de esta misma sección. Ni contando solo los tres ficheros que `CLAUDE.md` nombra sale su número: son 1.636 (#323).
5. **`web/README.md` era la plantilla de Vite sin tocar y `api/README.md` la de Laravel**, en un repositorio público cuyo segundo propósito, por `ADR-009` §1, es que alguien lo lea evaluando criterio técnico. Son lo primero que GitHub muestra al entrar en esos directorios. El de la raíz, en cambio, estaba cuidado. La vuelta nueva: **ni siquiera los escribió este proyecto** — los escribió un generador, y llevaban ahí desde la Iteración 1. **Reescritos el 21 de agosto de 2026**, y desde entonces `check-docs.py` comprueba que todo README nombre el proyecto: una propiedad positiva y no una lista de plantillas conocidas, porque una lista de prohibidos falla en silencio con el generador que nadie apuntó (#325).

**Las mediciones que sostienen el plan**, tomadas al planificar y no heredadas: **3 issues abiertos** al empezar, **437 tests en la web, 260 en la API y 91 del utillaje**, cobertura del **93,12 %** global y **98,64 %** en `lib/vault`, CI en verde, **cero alertas de Dependabot abiertas** —diez corregidas— y cero PRs abiertos.

**Y remedidas al cerrar**, que es donde este proyecto se equivoca más: **458 tests en la web, 260 en la API y 73 del utillaje** —791 en total—, cobertura del **93,24 %** global y **98,68 %** en `lib/vault`, las dos por encima de donde estaban. El utillaje baja de 91 a 73 porque los 384 tests de `check-identifiers.py` se fueron con él en #323 y llegaron los siete del volcado y los cuatro de los READMEs. De la conversión: **3.994 líneas de comentario y 461 nombres de test en 217 ficheros** al medir hoy sobre el árbol de la planificación, de las cuales **3.836 convertidas** y **158 retiradas** con el andamiaje. Los números de arriba y los de aquí no son comparables sin más, **y eso también es un hallazgo**: el comprobador cambió por el camino —#317 le enseñó a ignorar el texto entre comillas angulares y #324 a mirar los ejecutables sin extensión—, así que medir hoy un árbol de hace cinco días no devuelve el número de entonces.

La caída respecto a los 442 y 270 de la Iteración 9 **no es una pérdida silenciosa**, y se comprueba en `990662c`: `api/tests/Unit/CorsOriginsTest.php` se borró y siete tests de web se retiraron en #298, al desaparecer CORS del proyecto. El utillaje sube de 73 a 91 por los tests de #291.

**Lo que queda fuera a propósito.** **La carga de los 370 items sin paginar**: `GET /items` devuelve la lista entera y `listItems` la descifra completa en cada carga. Apareció al medir, no está roto, y **nadie ha medido qué tarda en el iPhone por la tailnet**, que es el uso real. Meterlo aquí sería la inercia que este plan evita. Y las tres señales del hosting compartido, que no son una tarea sino algo que se mira tras unas semanas de uso, con el disparador de `ADR-013` §6.

LOS CRITERIOS QUE LLEVABA STATUS.md

### Iteración 10, cerrada el 21 de agosto de 2026

Ocho criterios. Se mantiene la regla de las cinco iteraciones anteriores: **si un criterio se puede comprobar con un comando, el criterio es ese comando** — y el comando vive en el repositorio. Los demás se evalúan **ejecutándolos**, nunca leyendo código ni diffs.

Tres tienen la forma que estrenó la Iteración 7 —el 2, el 3 y el 4 no describen un estado deseable sino **una comprobación que tiene que fallar cuando el trabajo se hace mal**—, y aquí eso importa más que de costumbre: una conversión de 3.993 líneas produce un verde tranquilizador con demasiada facilidad, porque **borrar el comentario también quita el hallazgo**.

**Resultado: siete cumplidos y uno no.** El quinto pedía los tests «en el mismo número» y estaba mal escrito, cosa que se explica abajo en vez de estirarse. El detalle de la iteración está en [docs/planning/archive/ITERACION_10.md](ITERACION_10.md).

1. ✅ **`./scripts/check-comment-language.py --all` sale en verde, y es lo que el CI ejecuta en cada PR.** Las dos mitades cumplidas: el árbol quedó limpio con #322 y el comprobador pasó a `--all` dentro del workflow `repositorio` en #323, en el mismo commit que borra los cuatro ficheros que guardaban las últimas 158 líneas. **Comprobado en el log del job y no en local**: `✓ comentarios y nombres de test en inglés: sin problemas en el árbol entero` (#322, #323).
2. ✅ **Borrar un comentario a propósito pone el censo en rojo** — con una precisión que el criterio no decía y que conviene dejar escrita: **cuando la pérdida supera el margen del fichero**. Rehecha la mutación al cerrar, sobre `autoLock.ts`, que tiene 43 líneas de comentario y permite perder 6: borrar un bloque de 6 pasa, borrar uno de 9 —7 líneas de comentario— falla con `43 -> 36 líneas, 7 menos (se permitían 6)`. El margen es deliberado, porque una traducción fiel también encoge un poco; lo que el censo detecta es la pérdida **desproporcionada** (#316).
3. ✅ **`git ls-files | grep check-identifiers` devuelve vacío y el CI sigue verde.** Con las **1.860 líneas** fuera, ninguna referencia colgada —`check-docs.py` en cero— y decidido por escrito qué pasa con el volcado de texto visible: **se queda**, pasa a `scripts/ui-text.mjs` porque el directorio `identifiers/` se va con lo que le daba nombre, y estrena siete tests propios. No vigila la regla de idioma y sí tiene trabajo (#323).
4. ✅ **El volcado de texto visible es idéntico antes y después de convertir las pantallas** — y en las cuatro capas de frontend, no solo en esa: **43.043 bytes iguales byte a byte** cada vez, comparados contra `origin/master` con `scripts/ui-text.mjs`. En los tests el volcado sí cambia, porque los nombres de test son cadenas, así que se cruzó aparte que ninguna de las cadenas retiradas fuera texto de la interfaz: 171 en #320 y 145 en #321, ninguna. — `scripts/ui-text.mjs`, que hasta #323 se llamaba `dump-ui-text.mjs` y vivía bajo `identifiers/`. Ni una palabra de interfaz cambiada: la frontera es entre ficheros de código y documentación, no entre idiomas de la interfaz. Y con la guarda que la Iteración 6 aprendió a poner en toda comparación — **exigir haber medido algo**, porque dos volcados vacíos dan un `diff` idéntico (#320).
5. ❌ **Los 788 tests en verde y en el mismo número** — en verde sí, en el mismo número **no**: son **791**, repartidos en 458 web, 260 API y 73 del utillaje. **El criterio estaba mal escrito**, y era visible al escribirlo: la propia iteración añadía tests por diseño —#303 y #309 con sus avisos, #316 con el censo, #323 con los del volcado, #325 con los del README— y retiraba los 384 del comprobador jubilado. Lo que el criterio quería decir sí se cumplió: **ningún caso desapareció al convertir un nombre**, y la cobertura subió en vez de bajar —**93,24 %** global contra 93,12, y **98,68 %** en `lib/vault` contra 98,64—. Se deja marcado como no cumplido en vez de estirar la definición, que es lo que se hizo en la 7, la 8 y la 9.
6. ✅ **Reproducido el escenario de #303 —diálogo abierto con texto dentro, quince minutos sin tocar— el aviso dice lo que se va a perder.** Vivido en navegador real y con reloj real, sin falsear el tiempo: **6 de 6 casos en verde en 18,3 minutos**, con el texto leído de la pantalla — «se perderá lo que has escrito sin guardar» a los 14,8 minutos, y «Se ha descartado lo que estabas escribiendo, sin guardar» todavía visible después de bloquear (#303).
7. ✅ **Tras recuperar el acceso con la clave de recuperación, la interfaz advierte que esa clave sigue valiendo y ofrece regenerarla.** Ciclo entero en navegador contra la API local, y con la comprobación que lo demuestra de verdad: **la misma clave se usó dos veces seguidas y funcionó las dos**. Sin eso se probaría que el aviso aparece; con eso se prueba que dice la verdad (#309).
8. ✅ **Ninguna afirmación del repositorio da por vigente lo que ya no lo está, y los dos READMEs hablan de eVault.** Las dos comprobaciones pasan, y el criterio se quedó corto: al barrer aparecieron **seis afirmaciones más** que tampoco eran ciertas — `mobile/` y `extension/` dados por creados cuando git no versiona directorios vacíos, `VITE_API_URL` citada en `index.html` como causa viva, y cuatro cifras del README público, incluida la que decía que la prosa del código está en español. **Y ahora hay un check que impide la reincidencia en un caso**: `check-docs.py` comprueba que todo README nombre el proyecto, verificado con mutación (#324, #325).

LOS RIESGOS QUE LLEVABA STATUS.md

Los riesgos eran un registro acumulado y sus filas no decían de qué iteración eran, así que cada una vino al archivo de la iteración más reciente que cita. Su estado es el que tenía el día que se retiró de STATUS.md, y NO se ha vuelto a comprobar: varias decían «Abierto» de algo ya cerrado. Un riesgo que siga vivo se reescribe en la tabla de la iteración en curso con su estado de hoy, no se copia de aquí.

| Riesgo | Estado | Detalle |
| --- | --- | --- |
| **La conversión se resuelve borrando en vez de traduciendo** | `Cerrado sin materializarse` | Es el modo de fallo propio de esta iteración y el que **ninguna red existente detecta**: `check-comment-language.py` marca prosa española, así que un comentario borrado desaparece del informe igual que uno convertido, y el comprobador da verde. Sobre 3.993 líneas en seis PR, nadie va a leer el diff línea a línea. El resultado sería lo contrario del objetivo — el argumento de #290 es justamente que esos comentarios explican *por qué* las cosas son como son. Se cubrió con el censo de #316, que fue **antes** de convertir la primera línea y no después. **Ningún fichero superó su margen en las seis capas**, y al cerrar la mutación se rehízo para comprobar que el censo sigue detectando: borrar 7 líneas de comentario en un fichero que permite 6 lo pone en rojo (#316) |
| **Traducir a máquina degrada lo que hacía legible el repositorio** | `Cerrado: no se tradujo a máquina` | `CLAUDE.md` lo dice desde el 17 de agosto: traducir a máquina comentarios que explican *por qué* las cosas son como son «los degradaría, y son buena parte de lo que hace legible este repositorio». Un comentario convertido palabra a palabra conserva la información y pierde el motivo, que es lo único que valía. La mitigación es de método y no de herramienta: **traducir es reescribir el argumento en inglés**, el criterio se fijó en la primera capa —`lib/vault`, la más argumentativa— y las demás lo copiaron. **Y esa decisión pagó por sí sola**: leer cada comentario entero destapó seis notas caducadas y tres comentarios huérfanos de su código, ninguno encontrable con un grep (#317) |
| **Retirar el comprobador viejo antes de que el nuevo cubra el árbol** | `Cerrado sin materializarse` | `check-identifiers.py` era lo único que detectaba el arrastre de idioma de un comentario a la variable de al lado, y `check-comment-language.py` solo miraba las líneas **añadidas**. Retirar el primero mientras el segundo no corriera en `--all` habría dejado un hueco sin que nada lo señalara. Por eso #323 va después de #322 y el paso a `--all` va **en el mismo PR que borra el comprobador viejo**, que es el de #323: entre un merge y otro no hay ningún estado sin red, y el orden es la mitigación y no una preferencia. **Ocurrió así:** el PR de #323 borra los cinco ficheros y enciende `--all` en el mismo commit (#322, #323) |
| **Seis capas mecánicas y el error se concentra en la última** | `Cerrado sin materializarse` | Convertir 3.993 líneas es trabajo largo y repetitivo, y la calidad cae según avanza. Por eso el orden **no es por tamaño**: `lib/vault` y `api/app` —donde los comentarios son argumento— van primero, y las pantallas y el utillaje —donde son descripción— van al final. La última capa fue además la más pequeña de verdad: 158 de sus 440 líneas se fueron con el andamiaje en vez de traducirse. **La medida al cerrar no muestra degradación**: el volcado de texto visible salió idéntico en las cuatro capas de frontend y el censo no marcó ningún fichero en ninguna (#317, #318, #322) |
| **La deuda de la conversión crece mientras espera** | `Cerrado: la deuda ya no existe` | La Iteración 8 la dejó dicha como congelada —«convivirán los dos idiomas mientras tanto, y eso es deliberado»—, y **no estaba congelada**. Se cubrió con #291, y desde `ec8046d` el comprobador sale limpio. Pero la red llegó **al final** de la iteración, y midiendo contra `454cce0` —su planificación— la 9 añadió **65 líneas** de prosa española a la deuda que declaró contenida. El riesgo quedó cerrado hacia delante y **materializado hacia atrás**, que es la única forma honesta de anotarlo. **Y se cierra del todo aquí**: la deuda no existe, así que no puede crecer, y lo que la vigila mira el árbol entero desde #323 (#290, #291, #323) |
| **Una lista de permitidos admite una palabra del idioma que prohíbe** | `Retirado con la lista en #323` | Es el modo de fallo propio de `english.txt`, y no es que se le escape una palabra: es que **se admita una española**. Pasó dos veces en la Iteración 6, las dos por añadir en bloque la salida del comando sin leerla. Primero `pie`, que entró pensando en *pie chart* y en el código es pie de página, y que por eso dejó pasar un prop en cinco ficheros. Después cinco de golpe —`esta`, `llega`, `nunca`, `raiz`, `ya`— que venían de identificadores recién escritos en un test. **El test que protege la lista no las detectó**, porque comprueba tildes y eñes y las cinco son ASCII puro. La mitigación era procedimental y estaba escrita en la cabecera del propio fichero: una palabra entraba cuando su uso **actual** en el código era inglés. No había comando para esto, y el riesgo se va con el fichero: `english.txt` salió del repositorio en #323 |
