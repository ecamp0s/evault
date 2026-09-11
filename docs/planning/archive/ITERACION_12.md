ITERACIÓN 12 — Historial y lecciones aprendidas

Archivo de la Iteración 12, cerrada el 28 de agosto de 2026. Recoge la intención de cada issue y lo que se aprendió al cerrarlo.

Está archivado, no muerto. Es la iteración en la que la vault de 370 entradas dejó de ser una lista plana, y también aquella en la que el comprobador de idioma resultó tener cuatro agujeros. Si alguna vez hay que tocar el orden de la lista, los favoritos, las etiquetas, el import, el export en claro o check-comment-language.py, merece la pena leer esto antes de investigar desde cero.

El objetivo se cumplió: lo que se usa a diario está arriba y el resto se encuentra sin escribir.

Nota de formato: prosa plana sin Markdown, por la convención del proyecto. Salvo la última sección, LO QUE DECÍA STATUS.md, que conserva el Markdown con que se escribió allí.


QUÉ SE HIZO

Diecinueve issues cerrados. El plan tenía catorce; los otros cinco aparecieron por el camino, y ninguno lo encontró una herramienta.

Bloque 1, lo que arrastraba la 11: el 373, desplegar en kastor y medir desde el iPhone.
Bloque 2, la decisión que abre la 13: el 374, contar semillas TOTP en la vault real, y el 375, el ADR-017.
Bloque 3, la lista se recorre: el 376, el orden, y el 377, los favoritos.
Bloque 4, la vault se agrupa: el 378, las etiquetas, y el 379, el filtro.
Bloque 5, el intercambio de ficheros: el 380, el export en claro, y el 381, el import de Firefox.
Bloque 6, la deuda: el 382, el 393, el 395, el 332, el 360, el 364 y el 344.
Bloque 7, el cierre: el 384.

Y fuera de plan: el 389, el 393, el 395 y el 401, más el 383 de planificación.


LOS CRITERIOS DE SALIDA

Siete cumplidos y uno no cumplido, que se dice en vez de estirar la definición.

El 1, kastor sirviendo el código de la Iteración 11 verificado desde el iPhone: CUMPLIDO. Solo la mitad del «después», porque el «antes» no lo midió nadie al planificar la 11 y ya era imposible cuando se escribió el criterio.

El 2, las 370 ordenadas por nombre al abrir la vault sin tocar nada: CUMPLIDO.

El 3, marcar un favorito lo sube arriba y sobrevive a recargar y a bloquear y desbloquear: CUMPLIDO, y comprobado en navegador entero y no solo con tests. Recargar bloquea la vault por ADR-007, así que ese caso prueba las dos mitades de una vez.

El 4, una entrada con etiquetas exportada a .evault e importada EN UNA INSTANCIA LIMPIA conserva sus etiquetas: CUMPLIDO, y hecho como pedía: se exportó, se cerró sesión, se registró OTRA cuenta con OTRA contraseña maestra, y las etiquetas llegaron. Un test unitario no habría valido, y el criterio lo decía.

El 5, el export en claro no pierde nada sin decirlo: CUMPLIDO.

El 6, un CSV REAL exportado por Firefox importado con nombres reconocibles: NO CUMPLIDO. Se verificaron las cabeceras contra un export real, carácter a carácter, y las nueve columnas tienen destino decidido. Lo que no se hizo es la ida y vuelta con datos dentro, porque ese fichero lleva contraseñas en claro y no debe salir de la máquina de su dueño. Queda para quien tenga el fichero, y se anota como no cumplido en vez de darlo por bueno con la verificación de al lado.

El 7, verify-large-vault.mjs en verde: CUMPLIDO, y ahora son SIETE límites y no seis, porque el del retorno del foco se añadió ahí.

El 8, ADR-017 cerrado con el recuento del 374 dentro y la versión del formato decidida: CUMPLIDO.


LAS MEDICIONES, TOMADAS AL CERRAR

Tests: 557 en la web (45 ficheros), 263 en la API y 101 del utillaje. Son 921, contra los 841 de la planificación.
Cobertura: 93,95 por ciento global y 98,77 en lib/vault, las dos por encima de donde estaban.
Issues abiertos al cerrar: uno, este. Eran cuatro al planificar.
PRs abiertos: cero. Alertas de Dependabot: cero.
ADR: diecisiete, uno más.


LO QUE APARECIÓ POR EL CAMINO Y NO ESTABA EN EL PLAN

Cinco issues, y el patrón que comparten es que ninguno lo encontró una herramienta: los encontró alguien usando la aplicación o leyendo un fichero por otro motivo.

El 389 salió usando la vault real de noche: la aplicación se había quedado sin responder y recargar la arreglaba. El síntoma que se notó fue que el botón de limpiar la búsqueda no hacía nada, y ese botón no tenía ningún defecto. Lo que había debajo es que NO HAY NINGÚN ErrorBoundary en la aplicación y todas las rutas se cargan con import(), así que el fallo de un chunk desmonta el árbol entero. Y lo provoca CADA DESPLIEGUE, porque el Dockerfile copia un dist nuevo sobre /srv y los hashes viejos dejan de existir.

El 393 salió copiando el patrón de un componente: una frase española entera sin un solo acento vivía en el árbol mientras --all decía que el árbol estaba limpio.

El 395 salió de que un PR se cayó en el CI por nueve líneas que en local habían salido verdes: --all recorría solo lo rastreado por git, así que ejecutarlo antes de git add mentía sobre los ficheros que estabas a punto de subir.

El 401 salió acotando el 381: una fila de Chrome sin nombre se descarta, y había que decidir si debía llamarse como su host.

Y ya cerrando, verificando el criterio 4 en el navegador, apareció que el diálogo de import seguía diciendo «Chrome o Bitwarden» después de que el 381 le enseñara a leer Firefox. Se arregló en el mismo PR del cierre, con test.


LAS LECCIONES

LO QUE JSDOM NO PUEDE VER, Y HAY QUE DEJARLO ESCRITO. Dos veces en esta iteración un test verde no significaba nada. En el 389, quitar el ErrorBoundary y renderizar un lazy que rechaza deja al hermano VIVO en jsdom, así que la suite no puede ver la catástrofe que el arreglo evita. En el 360 fue peor: se escribió un test del retorno del foco que pasaba con el arreglo Y con el arreglo mutado, o sea que no guardaba nada. Se tiró y el guardián se fue al verificador de navegador, que ahora tiene siete límites. Un test verde en los dos sentidos es peor que no tener test.

Y LA MUTACIÓN HAY QUE COMPROBAR QUE SE APLICÓ. La primera vez que se mutó el arreglo del 360 no se verificó que el reemplazo hubiera funcionado; solo al repetirlo con comprobación se vio que sí se aplicaba y que el test seguía verde igual. Una mutación que no se aplica produce exactamente la misma tranquilidad falsa que el bug que busca.

MEDIR CAMBIA LAS DECISIONES, Y DOS VECES FUE AL REVÉS DE LA INTUICIÓN. En el 393, «y» parecía la compañera obvia de «con» para la lista de palabras: medida contra 8.103 líneas de prosa inglesa, no aportaba NADA —las mismas dos líneas— y arriesgaba con space-y-2. Y en el 401, derivar el nombre de una fila de Chrome sin él parecía obviamente mejor: sobre un export real de 618 credenciales, cero filas lo tienen vacío, así que el caso no ocurre.

EXTRAER UN CORPUS PUEDE REPRODUCIR EL BUG QUE VIENE A ARREGLAR. En el 332, el primer intento de sacar el corpus español de la historia leyó de un commit que ya había pasado la primera capa de conversión, y produjo un corpus «español» lleno de inglés con un 39,2 por ciento que parecía un hallazgo sobre el detector. Se cazó mirando qué líneas quedaban sin detectar: estaban en inglés.

UN COMPROBADOR PUEDE ARREGLAR UN AGUJERO Y DEJAR EL MISMO ABIERTO A TREINTA LÍNEAS. Es el 395, y lo notable es que la función de al lado lleva escrito el argumento correcto —un fichero nuevo «would sail past this in local use»— aplicado solo a la otra mitad del comando.

CUATRO AGUJEROS EN LA MISMA HERRAMIENTA, Y SON DE DOS CLASES. El 184, el 324, el 366 y el 395 son de DÓNDE MIRA el comprobador. El 393 es de QUÉ RECONOCE. La distinción importa porque se arreglan por separado y porque la segunda no se cierra del todo: un nombre de test como «copia el usuario sin programar vaciado» no tiene acentos ni palabras funcionales, así que es invisible por diseño y hubo que verlo leyendo.

UNA AFIRMACIÓN PUEDE SER CIERTA Y CIEGA A LA VEZ. La frase de CLAUDE.md que decía que el arrastre de identificadores españoles «no tiene de dónde venir» era cierta del arrastre NUEVO —cero añadidos desde el 21 de agosto, medido— y no decía nada de los supervivientes, que eran diez. Queda acotada en vez de retirada.

Y UN COMENTARIO PUEDE ARGUMENTAR DESDE ALGO QUE NO EXISTE. ItemRow.tsx descartaba un menú desplegable porque «el diálogo devuelve el foco al elemento que lo abrió», y ningún diálogo lo devolvía. Era falso al escribirse; desde el 360 es cierto, y el isConnected del arreglo es exactamente el caso que ese comentario describía.


LO QUE NO SE HIZO Y POR QUÉ

El código de TOTP, que entra en la 13 con el ADR-017 ya escrito. La auditoría de contraseñas —repetidas, débiles, cortas—, que es enteramente cliente y por eso sería una demostración directa del modelo, y no cabía. Y las carpetas, que las etiquetas cubren sin obligar a que una entrada esté en un solo sitio; si hacen falta, se verá usándolas.


LO QUE DECÍA STATUS.md

Hasta el 11 de septiembre de 2026, STATUS.md conservaba el objetivo, los criterios de salida y los riesgos de todas las iteraciones cerradas, y llegó a 288 KB: ya no cabía en una lectura. El 663 los sacó de allí por la regla de una sola fuente de docs/GUIDE.md, y lo que decía de esta iteración está aquí copiado sin tocar, salvo los enlaces relativos, ajustados a esta carpeta.

EL OBJETIVO QUE LLEVABA STATUS.md

**Iteración 12: cerrada el 28 de agosto de 2026.** Objetivo cumplido: *la vault de 370 entradas deja de ser una lista plana — lo que se usa a diario está arriba, y el resto se encuentra sin escribir.* El historial y las lecciones, en [docs/planning/archive/ITERACION_12.md](ITERACION_12.md).

**Diecinueve issues cerrados**, catorce del plan y **cinco que aparecieron por el camino** — y ninguno de esos cinco lo encontró una herramienta: los encontró alguien usando la aplicación o leyendo un fichero por otro motivo.

| | Al planificar | Al cerrar |
|---|---|---|
| Tests | 486 web · 260 API · 95 utillaje = **841** | 557 · 263 · 101 = **921** |
| Cobertura global | 93,4 % | **93,95 %** |
| Cobertura de `lib/vault` | 98,72 % | **98,77 %** |
| Issues abiertos | 4, todos `deuda` | **1**, el del cierre |
| ADR | 16 | **17** |

**Siete de los ocho criterios cumplidos y uno no**, que se dice en vez de estirar la definición. El que falta es el 6: importar un CSV **real** de Firefox. Sus cabeceras se verificaron carácter a carácter contra un export real y las nueve columnas tienen destino decidido, pero la ida y vuelta con datos dentro exige un fichero con contraseñas en claro que no debe salir de la máquina de su dueño.

**El criterio 4 sí se hizo como pedía**, y merece decirse porque era el más fácil de falsear: se exportó a `.evault`, se cerró sesión, se registró **otra cuenta con otra contraseña maestra**, y las etiquetas llegaron. Un test unitario no habría valido, y el criterio lo decía.

## Las lecciones, que son de método

**Dos veces un test verde no significó nada.** En #389, quitar el `ErrorBoundary` y renderizar un `lazy` que rechaza deja al hermano **vivo** en jsdom, así que la suite no puede ver la catástrofe que el arreglo evita. En #360 fue peor: el test del retorno del foco pasaba con el arreglo **y con el arreglo mutado**. Se tiró, y el guardián se fue al verificador de navegador — que ahora tiene **siete** límites.

**Y una mutación hay que comprobar que se aplicó.** La primera vez que se mutó el arreglo de #360 no se verificó el reemplazo. Una mutación que no se aplica produce exactamente la misma tranquilidad falsa que el defecto que busca.

**Medir cambió la decisión dos veces, y en contra de la intuición.** En #393, `y` parecía la compañera obvia de `con` en la lista de palabras: medida contra 8.103 líneas de prosa inglesa real, **no aportaba nada** y arriesgaba con `space-y-2`. En #401, derivar el nombre de una fila de Chrome sin él parecía obviamente mejor: sobre un export real de **618 credenciales**, cero filas lo tienen vacío.

**Extraer un corpus puede reproducir el defecto que viene a arreglar.** En #332, el primer intento leyó de un commit que ya había pasado la primera capa de conversión y produjo un corpus «español» lleno de inglés, con un 39,2 % que parecía un hallazgo. Se cazó mirando qué líneas quedaban sin detectar.

**El comprobador de idioma tenía cuatro agujeros, y son de dos clases.** #184, #324, #366 y #395 son de **dónde mira**. #393 es de **qué reconoce** — y esa no se cierra del todo: un nombre de test sin acentos ni palabras funcionales es invisible por diseño, y hubo que verlo leyendo.

**Una afirmación puede ser cierta y ciega a la vez.** La frase de `CLAUDE.md` sobre el arrastre de identificadores era cierta del arrastre **nuevo** —cero añadidos desde el 21 de agosto, medido— y muda sobre los supervivientes, que eran diez. Queda **acotada**, no retirada.

**Y un comentario puede argumentar desde algo que no existe.** `ItemRow.tsx` descartaba un menú desplegable porque «el diálogo devuelve el foco al elemento que lo abrió», y ninguno lo devolvía. Desde #360 es cierto.

**Lo que queda fuera a propósito:** el código de TOTP, que entra en la 13 con `ADR-017` ya escrito; la auditoría de contraseñas; y las carpetas, que las etiquetas cubren sin obligar a que una entrada esté en un solo sitio.

LOS CRITERIOS QUE LLEVABA STATUS.md

### Iteración 12, cerrada el 28 de agosto de 2026

**Siete cumplidos, uno no cumplido.** Se dice así en vez de estirar la definición.

Escritos para no repetir los dos errores de la 11 —el criterio 2 mezclaba dos cosas y el 7 pedía una comparación ya imposible—, así que cada uno mide **una** cosa y el «antes» de todos era medible al planificar.

1. **Kastor sirviendo el código de la Iteración 11, verificado desde el iPhone.** `Cumplido`, con la mitad que era posible: solo el «después», porque el «antes» no lo midió nadie al planificar la 11. Lista en torno a un segundo, búsqueda rápida, y las 370 recorridas de un tirón sin tirones (#373).
2. **Las 370 ordenadas por nombre al abrir la vault, sin tocar nada.** `Cumplido` (#376).
3. **Marcar un favorito lo sube arriba y sobrevive a recargar y a bloquear y desbloquear.** `Cumplido`, y comprobado **en navegador entero**, no solo con tests. Recargar bloquea la vault por `ADR-007`, así que ese caso prueba las dos mitades de una vez (#377).
4. **Una entrada con etiquetas exportada a `.evault` e importada en una instancia limpia conserva sus etiquetas.** `Cumplido`, **y hecho como pedía**: se exportó, se cerró sesión, se registró otra cuenta con otra contraseña maestra, y `trabajo` y `dinero` llegaron. Un test unitario no habría valido, y el criterio lo decía (#378).
5. **El export en claro no pierde nada sin decirlo.** `Cumplido`, y lo que lo cierra no es el CSV sino que **el compilador obliga a decidir**: `PLAIN_EXPORT` es un `Record` sobre `keyof ItemContent`. Comprobado por mutación dos veces (#380).
6. **Un CSV real exportado por Firefox se importa con las entradas nombradas de forma reconocible.** `NO CUMPLIDO`. Las cabeceras se verificaron **carácter a carácter** contra un export real y las nueve columnas tienen destino decidido; lo que falta es la ida y vuelta **con datos dentro**, que exige un fichero con contraseñas en claro y no debe salir de la máquina de su dueño. Se anota como no cumplido en vez de darlo por bueno con la verificación de al lado (#381).
7. **`verify-large-vault.mjs` en verde.** `Cumplido`, y ahora son **siete** límites y no seis: el del retorno del foco se añadió ahí porque jsdom no puede verlo (#376, #377, #379, #360).
8. **`ADR-017` cerrado, con el recuento de #374 dentro y la versión del formato decidida.** `Cumplido` (#375).

**Lo que estos criterios deliberadamente no pedían** —TOTP funcionando, que el bundle adelgace, que la API pagine— sigue sin pedirse.

LOS RIESGOS QUE LLEVABA STATUS.md

Los riesgos eran un registro acumulado y sus filas no decían de qué iteración eran, así que cada una vino al archivo de la iteración más reciente que cita. Su estado es el que tenía el día que se retiró de STATUS.md, y NO se ha vuelto a comprobar: varias decían «Abierto» de algo ya cerrado. Un riesgo que siga vivo se reescribe en la tabla de la iteración en curso con su estado de hoy, no se copia de aquí.

| Riesgo | Estado | Detalle |
| --- | --- | --- |
| **Desplegar sobre las 370 contraseñas reales** | `Abierto` | Es el riesgo propio del bloque 1 y el peor de la iteración: en kastor hay contraseñas de verdad desde el 18 de agosto, así que **lo que se rompa ahí no es reproducible** y el servidor no puede repararlo, porque no puede leer nada. El modo de fallo concreto está documentado y se olvida igual: `docker compose up -d --build` **no aplica las migraciones ni recrea el contenedor** si la imagen no cambia, y el código va por volumen, de modo que un `git pull` deja una instancia que parece desplegada y no lo está. Hace falta `--force-recreate`. La mitigación es comprobar que la copia de la noche anterior existe y **no está vacía** antes de tocar nada — el backup se niega a subir copias vacías desde la Iteración 8, pero eso se verifica, no se supone (#373) |
| **Contar semillas TOTP obliga a mirar secretos** | `Abierto` | #374 pide un recuento sobre la vault real, y lo que hay que contar son credenciales de segundo factor arrastradas al campo de notas. **El recuento es el entregable; el contenido no sale de la pantalla**: ni a este documento, ni al issue, ni a un fichero temporal, ni al portapapeles — que además tiene borrado por tiempo y eso lo hace parecer más seguro de lo que es. Un fichero de trabajo con semillas dentro es exactamente lo que este proyecto existe para no tener (#374) |
| **TOTP entra como funcionalidad y no como decisión** | `Abierto` | Guardar la semilla junto a la contraseña **convierte dos factores en uno y medio**, porque quien abra la vault tiene las dos mitades. Otros gestores lo hacen igual y la comodidad es enorme, y por eso el riesgo no es que se decida mal: es que **no se decida** y aparezca implementado en un commit de funcionalidad. La mitigación es de orden y no de código — `ADR-017` va primero y solo, y la 12 no escribe TOTP. Si la decisión resulta ser «no se guardan», también cierra el tema por escrito en vez de dejarlo dando vueltas otra iteración (#375) |
| **Organizar devuelve la lista a donde estaba** | `Abierto` | La Iteración 11 dejó números medidos —156 ms al pintar, 46 al buscar, 487 nodos del DOM con 370 entradas— y esta iteración mete un orden, una estrella por fila y una barra de etiquetas encima. Dos filos concretos: **las filas no miden todas lo mismo** —70 px sin usuario y 74 con él—, así que una estrella cambia lo que mide una fila y la estimación del virtualizador con ella; y calcular las etiquetas existentes recorre los 370 items descifrados, que si se hace **en cada pulsación** del buscador es literalmente el defecto que #351 arregló. La mitigación es el criterio 7: `verify-large-vault.mjs` en verde, ejecutado a mano porque el CI no lo corre (#376, #377, #379) |
| **El export en claro se lleva por delante la migración de quien se va** | `Abierto` | El CSV es el formato que se usa **para irse a otro gestor**, que es el momento exacto en que perder datos en silencio es irreversible: se importa en el destino, se ve «370 entradas» y se borra el origen. Hoy no falla solo porque no hay campo que perder, y #377 crea el primero. **Lo que cierra el riesgo no es arreglar el export sino el test que falle cuando `ItemContent` gane un campo más**: sin él, el próximo campo repite esto y nadie se entera. Y hay un caso que no es el mismo — una semilla TOTP en un CSV en claro no es «un campo que se pierde», es un segundo factor en la carpeta de descargas (#380) |
| **Nombrar las entradas de Firefox por su host produce 370 entradas parecidas** | `Abierto` | El CSV de Firefox no trae columna de nombre, así que hay que derivarlo de la URL. Quien tenga varias cuentas en el mismo servicio acaba con varias entradas llamadas igual, distinguibles solo por el usuario — y la detección de duplicados de `findDuplicates()` compara precisamente `nombre` + `usuario`, así que **puede marcar como repetidas entradas que no lo son, o dejar de marcar las que sí**. Hay que comprobar la ida y vuelta sobre un export real y no solo sobre el fichero de test, que es la forma de este proyecto de equivocarse desde la Iteración 5: el camino que nadie recorre es el que está roto (#381) |
| **Un comprobador de prosa produce falsos positivos** | `Cerrado en falsos positivos; abierto en lo contrario, #332` | Detectar idioma en comentarios es más difícil que en identificadores, y **un falso positivo cansa más que un fallo escapado**: `no`, `se`, `esta`, `final` y `general` son palabras de los dos idiomas. Al medir para esta planificación produjeron **5 falsos positivos de 19 líneas marcadas**, un 26 %. Si el comprobador molesta se acabará saltando, que es el destino del check que nace en rojo de #62. La tasa hay que medirla y escribirla, no suponerla. **Al cerrar son 0 falsos positivos sobre 351 líneas inglesas**, y #317 los bajó a cero enseñándole a ignorar el texto entre comillas angulares, que es como una prosa inglesa cita un ejemplo español. **Pero la otra mitad de esa medida se rompió**: la detección dice hoy 0 %, porque el corpus «en español» de `--measure` son cuatro ficheros vivos que la conversión dejó en inglés. Es #332, y sigue abierto (#291, #332) |
