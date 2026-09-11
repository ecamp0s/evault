ITERACIÓN 17 — Historial y lecciones aprendidas

Archivo de la Iteración 17, cerrada el 11 de septiembre de 2026. Recoge la intención de cada issue y lo que se aprendió al cerrarlo.

Está archivado, no muerto. Es la iteración en la que la vault de kastor dejó de estar vacía: tres gestores de contraseñas reconciliados en una sola vault, con las discrepancias decididas por quien la tiene y no por una heurística. Y es también aquella en la que LA PREDICCIÓN ACERTÓ CADA CIFRA Y AUN ASÍ EL IMPORT REAL ENCONTRÓ LO QUE NINGUNA SIEMBRA PODÍA: la lógica era la que se había medido, y la forma de los datos no.

El objetivo se cumplió: las tres fuentes entraron una sola vez. 997 filas quedaron en 669 entradas.

Nota de formato: prosa plana sin Markdown, por la convención del proyecto. Salvo la última sección, LO QUE DECÍA STATUS.md, que conserva el Markdown con que se escribió allí.


QUÉ SE HIZO

Veinticuatro issues cerrados sobre un plan de veintidós: veinte de los planificados hechos —el 531 entre ellos, deuda de la 15 que ya venía dentro del plan—, uno cerrado sin hacer —el 613, Passwords de iOS— y tres de los cuatro que aparecieron por el camino. Dos pasan a la 18: el 624, reconciliar sin red, que estaba planificado, y el 646, que apareció por el camino. Veinticinco PRs mergeados contando el de este cierre, dos de ellos de Dependabot.

Bloque 0, medir y decidir: el 610 midió las fuentes reales sin código, y el 611 registró ADR-022.
Bloque 1, el detector de formato: el 612 pasó de «el primero que encaja» al más específico, con empate rechazado; el 614 trajo NordPass con sus tarjetas y sus notas; y el 531, nuestro propio CSV en claro. El 613, Passwords de iOS, se cerró sin hacer: esa aplicación no exporta CSV.
Bloque 2, el motor: el 615 la identidad por host y usuario, el 616 los grupos y el superviviente, el 617 la fusión campo a campo, el 618 el campo history del blob.
Bloque 3, la interfaz: el 619 la pantalla de reconciliación, el 620 el resumen de tres cifras, el 621 el historial en el editor y «esta es la buena», el 622 el cuarto hallazgo de la auditoría.
Bloque 4, los bordes: el 623 importar por tandas y el 625 el historial fuera del CSV en claro y dentro del .evault. El 624, sin red, NO se hizo, y pasa a la 18.
Bloque 5, la verificación: el 626 dio a verify-large-vault los límites de la reconciliación, el 627 hizo entrar una sola vez las cuatro fuentes sembradas, y el 628 fue la importación real.
Bloque 6, el cierre: el 629 FOUNDATION.md y el 630 este documento.

Fuera de plan: el 646, el 654, el 655 y el 656. Y el 641, que no tuvo issue porque nació como PR: subir vitest a la 5 casi desarma el umbral de cobertura.

EL 624 NO SE HIZO, y no por olvido. Reconciliar sin red necesita leer la vault entera del caché del dispositivo, y eso abre dos preguntas —si el caché tiene todas las entradas, y qué hace una fusión que actualiza una entrada guardada sin conexión— que merecen su propio trabajo y no el final de una iteración. Hoy importar sin red sigue rechazándose como cualquier otra escritura, que es lo que ADR-019 decidió, así que no hay un camino roto: hay uno que no existe todavía.


LOS CRITERIOS DE SALIDA

Ocho, escritos al abrir el 10 de septiembre de 2026. Los ocho cumplidos, y el 1 con una salvedad que se dice en vez de callarla.

El 1, las tres fuentes reales importadas sobre kastor, en tandas, y cada credencial una vez: CUMPLIDO. El 11 de septiembre, por quien tiene la vault y en su navegador: Chrome 618 filas en 527 entradas, Firefox 2 que ya estaban y NordPass 377 que dejaron 142 nuevas y completaron 13. 669 entradas en la base, contadas y con la huella cuadrada. LA SALVEDAD: «cada credencial una vez» se comprobó a ojo, recorriendo la lista y buscando los servicios más usados, y no con un recuento que lo demuestre; y un grupo SIN USUARIO juntó dos cuentas que no eran la misma, que la pantalla ofreció como conflicto y se separaron a mano.

El 2, ninguna semilla TOTP ni número de tarjeta acaba en notes, en ningún formato: CUMPLIDO, con test. El recorrido de las cuatro fuentes sembradas lo comprueba sobre cada entrada, y el 531 y el 614 lo fijan para nuestro CSV y para NordPass. El enunciado decía «cinco formatos» contando Passwords de iOS; con esa fuente descartada son los que existen.

El 3, un fichero de NordPass ya no se lee como Chrome, con un test que alimenta todos los formatos a la vez: CUMPLIDO. El 612 prueba el detector sobre todas las firmas juntas, que es lo que dejó pasar el fallo: cada formato tenía su test, y cada test pasaba solo.

El 4, reimportar nuestro export en claro devuelve las tarjetas como tarjetas: CUMPLIDO, con test (531).

El 5, dos fuentes con la misma cuenta y distinta contraseña producen una entrada con historial y marca de sin confirmar, la auditoría la lista, y la marca solo se apaga con el gesto explícito: CUMPLIDO, con tests (618, 621, 622). Y en la vault real: 24 entradas sin confirmar, exactamente las que dejaron las dos tandas con conflicto.

El 6, el historial no sale en el CSV en claro y sí en el .evault con su marca de origen intacta: CUMPLIDO, con tests, y seguido hasta lo que el import escribiría y no solo hasta lo que lee (625).

El 7, los tres verificadores ejecutados el día del cierre, con los límites nuevos de verify-large-vault en verde y su vault sembrada con la forma de las fuentes reales: CUMPLIDO. verify-auto-lock 8 de 8 en 18,4 minutos de reloj real; verify-passkey 4 de 4 en 31 segundos; y verify-large-vault con sus ONCE límites en verde sobre 370 entradas, la revisión marcando 205 de 308, la reconciliación con 96 grupos y 10 en conflicto, y el diálogo midiendo 497 píxeles de contenido en 497 con la dirección de 377 caracteres en pantalla. Ejecutados sobre master el 11 de septiembre, después del último cambio de código, y no heredados. Los límites nuevos no son dos sino tres: el 656 añadió el ancho de la reconciliación.

El 8, el recuento real: CUMPLIDO, y es el número que sustituye al 246 de 369 que se fue con la vault del 544. 512 DE 660 contraseñas tienen algo que corregir: 424 repetidas, con UNA COMPARTIDA POR 70 ENTRADAS, 267 cortas y 77 de un solo tipo. Las nueve entradas que faltan hasta 669 son cuatro tarjetas, una nota y cuatro sin contraseña. Por tandas: Chrome 55 grupos, 11 con conflicto, en unos 30 segundos; NordPass 17 grupos en pantalla —228 en total, 211 sin nada que cambiar—, 14 con conflicto y uno separado a mano, en unos 10 segundos; Firefox, cero escrituras.


LAS MEDICIONES, TOMADAS AL CERRAR

Tests: 1.185 en la web (71 ficheros), 310 en la API (2.842 aserciones) y 127 del utillaje. Son 1.622, contra los 1.445 del cierre de la 16. La API no ganó ninguno porque la iteración no la tocó: ni un endpoint, ni una columna, ni una migración.
Cobertura: 95,14 por ciento global y 98,88 en lib/vault, con las funciones de lib/vault al 100. Y ese 100 sigue queriendo decir algo gracias al 641, que es el que casi lo desarma.
Checks del CI: nueve, los mismos que al cerrar la 16.

Issues abiertos al cerrar: dos, el 624 y el 646, los dos movidos a propósito a la Iteración 18. Issues con el label deuda: cero. PRs abiertos: cero.
Alertas de Dependabot ABIERTAS: cero. Sus dos PRs de la iteración se mergearon (636, 637), y los dos de vitest se cerraron sin mergear porque subían vitest y su cobertura por separado, que es lo que el 641 hizo juntos.
ADR: veintidós, uno nuevo, el 022.
Instancia: desplegada con master del 11 de septiembre, con un usuario, una vault, 669 entradas y dos passkeys. Copia fuera de la máquina después de importar: la 59.


LO QUE APARECIÓ POR EL CAMINO Y NO ESTABA EN EL PLAN

Cuatro issues, y tres de ellos los encontró EL IMPORT REAL en su primera media hora. Es la cifra que justifica haberlo puesto como criterio y no como comprobación.

El 646 salió de leer ADR-018 con el 621 delante: aquel ADR decidió que el historial se olvida en dos granularidades, la entrada y la vault entera, y la segunda no estaba en ningún issue. Pasa a la 18.

El 654 salió de la primera tanda real. Las URL de Chrome llegan a 377 caracteres sin un espacio, y una sola ensanchaba la pantalla de reconciliación hasta 2.935 píxeles en una ventana de 468, cortándolo todo por la derecha. La lógica estaba bien —55 grupos y 11 conflictos, la predicción exacta—; lo que fallaba era la forma.

El 655 salió de que quien tiene la vault miró la pantalla de desbloqueo al recargar: el botón de olvidar la cuenta llevaba una clase de centrar que solo actúa dentro de un contenedor flex, y no lo estaba.

Y el 656 salió del 654: su test en jsdom solo podía comprobar la declaración, y el guardián de una maqueta tiene que ser un navegador. verify-large-vault siembra ahora una dirección de 377 caracteres y tiene un límite más, once.

Y DOS COSAS QUE APARECIERON Y NO SON ISSUES. La primera vez que se abrió el import en kastor salió LA PANTALLA DE ANTES DEL 644, porque la pestaña llevaba abierta desde antes del despliegue: el service worker nuevo toma el control, pero una página ya cargada sigue con su código hasta que se recarga. Es la contrapartida que public/sw.js deja escrita a propósito, y lo que queda es un paso del despliegue: recargar. Y al cerrar, la tabla de riesgos de STATUS.md tenía TRES FILAS CADUCADAS que decían «abierto, con issue» de issues ya cerrados —el 546 y el 550, cerrados el 10 de septiembre ANTES de que esa tabla se escribiera, y el 531—. La planificación las copió sin comprobarlas.


LAS LECCIONES

SEMBRAR LA FORMA DE LOS DATOS REALES Y NO SOLO SU NÚMERO, y es la del 610 una vez más. El 610 midió cuántas filas se repiten, en qué grupos y cuántos discrepan, y el banco del 626 sembró esa proporción con cuidado: el 59 por ciento, el grupo de nueve, un diez por ciento de conflictos. Y todas las direcciones sembradas eran cortas, porque la longitud de una URL no estaba en la tabla. La primera tanda real la rompió en un minuto. Medir es escoger qué se mide, y lo que no se mide se siembra con el valor más cómodo.

UNA PREDICCIÓN HECHA CON EL CÓDIGO REAL VALE MÁS QUE UNA APROXIMACIÓN QUE SE LE PARECE. medir.py, el script del 610, es Python y aproxima la identidad; antes de importar se pasaron los tres ficheros por parseImportFile, groupDuplicates y planImport desde un test temporal que solo imprimía recuentos. Dio 527, 141 más 13 y 668, y la importación real dio exactamente eso más la entrada separada a mano. Con esa predicción delante, el «Importar 154» de NordPass se pudo confirmar en vez de creerse, y la pantalla vieja de la primera vez se reconoció como vieja porque sus números no cuadraban.

TRES TESTS ESCRITOS PARA CONFIRMAR UNA SUPOSICIÓN LA DESMINTIERON: que dos formatos no podían empatar en especificidad (612), que la entrada sin dirección seguía detectándose (615) y que dos tarjetas nunca se agrupaban (617). Las tres acabaron cambiando una regla, y ninguna se habría encontrado leyendo el código.

DOS ESCRITORES DEL MISMO CAMPO YA DISCREPABAN, y se encontró en el 621. La rotación y la fusión recortaban el historial cada una a su manera, de modo que cambiar una contraseña podía tirar una candidata de otro gestor y apagar la marca sin que nadie decidiera nada. Ahora hay un solo tope, en lib/vault/history.ts. Y el 625 encontró la misma forma en otra parte: un solo recuento de lo que el CSV en claro retiene, con la frase del segundo factor, anunciaba como «sin su segundo factor» una entrada que solo tenía contraseñas anteriores. Un nombre en singular que se queda cuando el conjunto crece es un fallo que no rompe nada.

VITEST 5 ESTUVO A UNA LÍNEA DE DESARMAR EL UMBRAL DE COBERTURA EN SILENCIO (641). perFile dejó de leerse fuera del glob, y el error pasó a informar del agregado en vez de nombrar el fichero. La comprobación que queda escrita en vite.config.ts es la que lo encontró: plantar un fichero sin tests y leer si el error lo nombra.

VERIFICAR EN NAVEGADOR SIGUE ENCONTRANDO LO QUE NINGÚN TEST VE, y aquí con una vuelta: la verificación con datos sembrados encontró una pantalla en la que ELEGIR ERA IMPOSIBLE —las dos opciones de cuál se queda se llamaban igual (619)—, y la verificación con datos reales encontró una en la que LEER ERA IMPOSIBLE (654). La primera la ve cualquiera que mire; la segunda solo quien mira con los datos de verdad.

UN ADR APROBADO Y DIFERIDO ES INVISIBLE POR PARTIDA DOBLE, y fue la primera lección de la iteración, antes de escribir código: se planificó un campo nuevo para el historial que ADR-018 ya había decidido un mes antes. No estaba en el código ni en lo que se lee al empezar. Quedan dos partes de ese documento diferidas —la papelera y la caducidad del token— y el mismo mecanismo sigue armado para ellas.

Y UNA MÍA DE MÉTODO, porque salió dos veces en el mismo día. Al hacer que el límite del 656 naciera en rojo, la primera ejecución salió roja POR EL MOTIVO EQUIVOCADO: la medida vive dentro de una template literal, donde \s llega como una s a secas, y el recibo leía 70 caracteres en vez de 377. El comentario de al lado ya avisaba de que ahí las barras van dobles. Y al parar los servidores, un pgrep casó con la propia shell del comando y la mató a mitad, que es una lección ya escrita en la memoria de este proyecto. Las dos son la misma: un aviso escrito junto al código solo sirve si se lee antes de escribir la línea de al lado. Un rojo solo vale si se lee por qué es rojo.


LO QUE DECÍA STATUS.md

Hasta el 11 de septiembre de 2026, STATUS.md conservaba el objetivo, los criterios de salida y los riesgos de todas las iteraciones cerradas, y llegó a 288 KB: ya no cabía en una lectura. El 663 los sacó de allí por la regla de una sola fuente de docs/GUIDE.md, y lo que decía de esta iteración está aquí copiado sin tocar, salvo los enlaces relativos, ajustados a esta carpeta.

EL OBJETIVO QUE LLEVABA STATUS.md

**Iteración 17: cerrada el 11 de septiembre de 2026.** Objetivo cumplido: *las tres fuentes entraron una sola vez.*

**997 filas de Chrome, Firefox y NordPass quedaron en 669 entradas** sobre la instancia de kastor, importadas por quien tiene la vault en su navegador, y con 24 sin confirmar a propósito. La predicción, hecha pasando los ficheros por el código real antes de importar, **acertó cada cifra**. Veinticuatro issues cerrados sobre un plan de veintidós; el #624 y el #646 pasan a la 18.

**Los ocho criterios cumplidos, el 1 con una salvedad.** El detalle y las lecciones están en [docs/planning/archive/ITERACION_17.md](ITERACION_17.md).

**Y la lección que la cierra es la del #610 una vez más: sembrar la forma de los datos reales y no solo su número.** El banco sembraba el 59 % de filas repetidas, el grupo de nueve y un 10 % de conflictos, todo medido; y direcciones cortas, porque la longitud de una URL no estaba en la tabla. La primera tanda real encontró en un minuto una de 377 caracteres que cortaba la pantalla por la derecha (#654).

Lo que sigue es la planificación con la que se abrió.

Importar Chrome, Firefox y NordPass sobre la vault vacía de kastor y que **cada credencial exista una vez**, con las discrepancias decididas por quien tiene la vault y no por una heurística. Lo decide [`ADR-022`](../../architecture/decisions/ADR-022-reconciliar-al-importar.md).

**Y encaja con el modelo mejor que casi nada de lo que hay, por el mismo motivo que las etiquetas y la auditoría: solo lo puede hacer el cliente.** Para saber que dos entradas son la misma cuenta hay que leerlas, y eso solo ocurre dentro del navegador de quien tiene la clave. Es `ADR-001` produciendo una funcionalidad en vez de una restricción. **La API no cambia: ni un endpoint, ni una columna.**

**El orden lo manda un reloj.** La vault está vacía desde el reset del #544, y ese es el único momento en que importar varias fuentes se puede hacer bien a la primera: cada contraseña que entre antes hay que reconciliarla a mano después. Decidido el 10 de septiembre: **no se importa nada hasta que el dedupe exista**.

### Eran cuatro fuentes y son tres

**Passwords de iOS no exporta CSV.** Lo único que ofrece es transferir directamente a otro gestor, así que no hay fichero que leer — el #613 se cerró sin hacer. La vía de transferir el llavero a Chrome y reexportar se descartó porque **mete el llavero de Apple en la cuenta de Google**, que es una decisión rara mientras se monta una vault zero-knowledge, y además dejaría el CSV de Chrome ya mezclado.

Se asume lo que cuesta: **lo que solo esté en el llavero de Apple no entra en la vault.**

Y en la práctica son dos: **Firefox aporta 2 entradas de 997.**

### Lo que midió el #610, que decide media iteración

| Fuente | Entradas |
|---|---|
| Chrome | 618 |
| NordPass | 377 |
| Firefox | 2 |
| **Suma** | **997** |
| **Tras reconciliar** | **668** |

**329 duplicados en 261 grupos**, de los cuales 225 cruzan fuentes y **36 son internos de una sola** — Chrome guarda la misma cuenta una vez por URL de formulario, y hay un host con **9 copias y dos contraseñas entre ellas**. El dedupe sirve aunque solo hubiera una fuente.

**Y el número que más decisiones cambió: solo 25 de los 261 grupos tienen contraseñas discrepantes.** En los otros 236 no hay nada que elegir. Eso dice que la pantalla no puede pedir 261 decisiones, y que el hallazgo nuevo de la auditoría enciende **el 4 % de la vault** — así que la advertencia de `audit.ts`, la de #62, no muerde aquí.

**El criterio de identidad se eligió midiendo, no argumentando:**

| Criterio | Grupos | Cruzan fuentes | Contraseñas distintas |
|---|---|---|---|
| **A** `nombre+usuario` — el que ya existía | 131 | 93 | 16 |
| **B** `host+usuario` | 260 | 225 | 24 |
| **C** `host+usuario` normalizados | **261** | **225** | **25** |
| **D** dominio registrable `+usuario` | 262 | 222 | 41 |

**El criterio de hoy ve la mitad de los duplicados que hay.** Y **D queda descartado con evidencia**: funde `dev.`, `pre.` y `elcomercio.multidiario.com`, que son entornos distintos con credenciales distintas a propósito.

### La lección que esta iteración ya dejó, antes de escribir una línea de código

**Se planificó proponiendo un campo nuevo para guardar la contraseña que pierde una reconciliación, y `ADR-018` ya lo había decidido un mes antes** — el campo, su tope de tres, su fecha y su olvido explícito. Se descubrió escribiendo el `ADR-022`.

Un ADR **aprobado y diferido** es invisible por partida doble: no está en el código, y tampoco está en lo que se lee al empezar. Es de la misma familia que la trampa que el #571 desarmó en ese mismo documento, y esta vez llegó a morder.

LOS CRITERIOS QUE LLEVABA STATUS.md

### Iteración 17, cerrada el 11 de septiembre de 2026

**Los ocho cumplidos, y el 1 con una salvedad** que se dice en vez de callarla.

1. **Las tres fuentes reales importadas sobre kastor, en tandas, y cada credencial una vez.** `Cumplido`. Chrome 618 filas en 527 entradas, Firefox 2 que ya estaban, NordPass 377 que dejaron 142 nuevas y completaron 13: **669 entradas**, contadas en la base y con la huella cuadrada. **La salvedad:** «cada credencial una vez» se comprobó a ojo, no con un recuento; y un grupo **sin usuario** juntó dos cuentas distintas, que la pantalla ofreció como conflicto y se separaron a mano (#628).
2. **Ninguna semilla TOTP ni número de tarjeta acaba en `notes`.** `Cumplido`, con test sobre cada entrada de las cuatro fuentes sembradas. Decía «cinco formatos» contando Passwords de iOS; descartada esa fuente, son los que existen (#612, #614, #531).
3. **NordPass ya no se lee como Chrome, con todos los formatos a la vez.** `Cumplido`: el detector se prueba sobre todas las firmas juntas (#612).
4. **Reimportar nuestro CSV en claro devuelve las tarjetas como tarjetas.** `Cumplido`, con test (#531).
5. **Historial con marca de sin confirmar, listada por la auditoría, y solo el gesto la apaga.** `Cumplido`, con tests; en la vault real, **24** entradas sin confirmar (#618, #621, #622).
6. **El historial fuera del CSV en claro y dentro del `.evault` con su origen.** `Cumplido`, seguido hasta lo que el import escribiría (#625).
7. **Los tres verificadores el día del cierre.** `Cumplido`: `verify-auto-lock` 8 de 8 en 18,4 min; `verify-passkey` 4 de 4 en 31 s; `verify-large-vault` con sus **once** límites sobre 370 entradas —la revisión marcando 205 de 308, la reconciliación con 96 grupos y 10 en conflicto, y el diálogo a 497 px de 497 con la dirección de 377 caracteres en pantalla—. Los límites nuevos son tres y no dos: el #656 añadió el del ancho.
8. **El recuento real.** `Cumplido`: **512 de 660** contraseñas con algo que corregir —424 repetidas con **una compartida por 70 entradas**, 267 cortas, 77 de un solo tipo—. Sustituye al 246 de 369 de la vault del #544 (#628).

**El criterio 1 hizo su trabajo antes de cumplirse:** la predicción con el código real acertó cada cifra, y aun así la primera tanda real encontró el #654 —una URL de 377 caracteres ensanchaba la pantalla hasta cortarla— y la recarga encontró el #655. Tres de los cuatro issues que aparecieron por el camino los encontró la importación real.
### Iteración 17, en curso

**Ocho criterios, escritos al abrirla el 10 de septiembre de 2026.** Ninguno evaluado todavía.

1. **Las tres fuentes reales importadas sobre kastor, en tandas, y cada credencial existe una vez.** Sobre la instancia real y con las contraseñas de verdad, no sobre ficheros sembrados. Es el criterio que da sentido a los otros siete (#628).
2. **Ninguna semilla TOTP ni número de tarjeta acaba en `notes`, en ninguno de los cinco formatos.** Hoy pasa en tres —Passwords de iOS, NordPass y nuestro propio CSV— y `notes` es el único campo que la búsqueda indexa (#612, #614, #531).
3. **Un fichero de NordPass ya no se lee como Chrome.** Con un test que alimenta **los cinco formatos a la vez**: uno por fichero es lo que dejó pasar esto, porque cada caso pasaba solo (#612).
4. **Reimportar nuestro propio export en claro devuelve las tarjetas como tarjetas.** La tabla de `ADR-011` §3 lleva «CSV propio» escrito entre los formatos de entrada desde que se cerró, así que hoy el código contradice al ADR (#531).
5. **Dos fuentes con la misma cuenta y distinta contraseña producen una entrada con historial y marca de sin confirmar, y la auditoría la lista.** Y la marca **no se apaga por ninguna vía que no sea el gesto explícito**, con test (#618, #621, #622).
6. **El historial no sale en el CSV en claro y sí en el `.evault`, con su marca de origen intacta.** Una copia que devolviera el historial perdiendo el «sin confirmar» dejaría la revisión hecha sin que nadie la hubiera hecho (#625).
7. **Los tres verificadores ejecutados el día del cierre**, con los dos límites nuevos de `verify-large-vault` en verde y su vault sembrada al 59 % de filas repetidas — incluido el grupo de nueve (#626).
8. **El recuento real de la vault tras importar**: cuántas traía cada fuente, cuántas quedaron, cuántos grupos se reconciliaron y cuántos quedaron en conflicto. **Es el número que sustituye al 246 de 369** que se fue con la vault del #544 (#628).

**El criterio 1 es el único que ningún test puede sustituir, y por el mismo motivo que el criterio 2 de la 16:** cuatro ficheros sembrados demuestran que la reconciliación agrupa lo que le pasamos; tres exports de verdad demuestran que agrupa lo que hay. Si los 261 grupos medidos en el #610 no aparecen al importar, eso es un hallazgo y se escribe.

LOS RIESGOS QUE LLEVABA STATUS.md

Los riesgos eran un registro acumulado y sus filas no decían de qué iteración eran, así que cada una vino al archivo de la iteración más reciente que cita. Su estado es el que tenía el día que se retiró de STATUS.md, y NO se ha vuelto a comprobar: varias decían «Abierto» de algo ya cerrado. Un riesgo que siga vivo se reescribe en la tabla de la iteración en curso con su estado de hoy, no se copia de aquí.

| Riesgo | Estado | Detalle |
| --- | --- | --- |
| **Una pestaña abierta desde antes del despliegue sigue con el código viejo** | `Materializado en el #628, aceptado` | La primera vez que se abrió el import en kastor salió **la pantalla de antes del #644**: el service worker nuevo toma el control, pero una página ya cargada ejecuta su código hasta que se recarga. Es la contrapartida que `public/sw.js` deja escrita a propósito —la alternativa deja a alguien en un cliente viejo sin decírselo— y lo que queda es un paso del despliegue: **recargar**. Se reconoció porque los números de la pantalla no cuadraban con la predicción |
| **Sin usuario, la identidad se queda en el host** | `Abierto, visible` | `ADR-022` identifica por host y usuario; **cuando no hay usuario, todas las entradas de un host caen en un grupo**. En el #628 juntó dos cuentas de Google distintas, una de ellas de un Workspace. El error queda del lado que la persona ve y decide —la pantalla lo ofrece como conflicto—, pero la identidad sin usuario es más débil de lo que el ADR deja ver |
| **Fusionar es lo único que esta iteración hace que puede perder datos** | `Cerrado en el import real, sin pérdida` | Todo lo demás del proyecto añade; esto **decide qué no se guarda**. La mitigación no es un test sino la forma de la decisión: la heurística agrupa y **propone**, decide una persona, y lo que no gana **va al historial en vez de descartarse** (`ADR-022` §2.2 y §2.3). El día que alguien añada un «aplicar a todos» sin revisar, esa mitigación se evapora sin que ningún test se ponga rojo **En el #628 no se perdió nada.** El único casi fallo fue un grupo **sin usuario** que juntaba dos cuentas distintas: la pantalla lo ofreció como conflicto y se separó a mano, que es exactamente la mitigación funcionando |
| **El historial deja de significar una sola cosa** | `Cerrado: las tres lectoras lo distinguen, con test` | Una entrada puede ser una contraseña **retirada** —lo que `ADR-018` decidió— o una **candidata sin confirmar** que salió de una reconciliación. Todo lo que lo lea tiene que distinguirlas: la pantalla, la auditoría y el export. Si alguna las mezcla, una candidata se presenta como retirada, que es exactamente lo que `ADR-018` §2.3 prohibía al decir que el import no fabrica historia **Las tres lo distinguen desde el cierre de la 17**: el editor pinta «sin confirmar» o «retirada» (#621), la auditoría cuenta solo las candidatas (#622) y el `.evault` conserva el `origin` hasta lo que el import escribiría (#625) |
| **Un ADR aprobado y diferido es invisible por partida doble** | `Materializado al abrir la iteración` | La 17 se planificó proponiendo un campo nuevo para el historial, y `ADR-018` ya lo había decidido un mes antes con su tope, su fecha y su olvido explícito. **No está en el código y tampoco en lo que se lee al empezar**, así que ni buscar ni leer `SPRINT_CONTEXT` lo encontraba. Se descubrió escribiendo el `ADR-022`. Quedan dos partes de ese documento todavía diferidas —la papelera y la caducidad del token— y el mismo mecanismo sigue armado para ellas |
| **La marca de pendiente puede encenderse en media vault** | `Cerrado antes de existir, con medida` | Es el #62 aplicado a un aviso: una auditoría que marca casi todo se ignora entera, y con ella se van los avisos que sí valían. **Medido antes de escribir la pantalla**: 25 conflictos sobre 668 entradas, el **4 %** — el más pequeño de los cuatro hallazgos. Si al importar de verdad sale muy distinto, hay que volver a mirar la presentación antes de darla por buena (#610, #622) **En la vault real: 24 de 669**, el 3,6 % |
| **El historial guarda contraseñas viejas, que son secretos** | `Abierto, heredado de `ADR-018` §5` | La vault pasa a custodiar más secretos de los que su dueño metió, y algunos se retiraron precisamente porque estaban comprometidos. `ADR-022` **amplía** la consecuencia: ya no es solo lo que se rotó, es lo que dos gestores discrepaban. Las mitigaciones son las de aquel ADR y no hay más: el tope de tres y el olvido explícito El olvido de toda la vault de una vez es el #646, que pasa a la 18 |
| **Los CSV de origen son contraseñas en claro en un disco** | `Cerrado por procedimiento` | Las tres exportaciones del #610 llevaban 997 contraseñas legibles. Se midieron en local, no salieron del repositorio ni de la máquina, y **se borraron con `shred` al terminar** en vez de dejarlas «para luego»: el #628 las vuelve a exportar cuando le toque, y así además llegan frescas — una contraseña cambiada por el camino entraría vieja y con pinta de correcta **Los del #628 corrieron la misma suerte**: destruidos con `shred` en la máquina de desarrollo y sus originales en la carpeta de descargas de Windows, junto con dos exports de NordPass del 18 de agosto y su copia en hoja de cálculo que seguían allí desde la Iteración 7 |
| **Se importa a mano antes de que el dedupe exista** | `Cerrado sin materializarse` | La vault lleva vacía desde el #544 y la tentación crece con cada semana. **Cada contraseña que entre antes hay que reconciliarla a mano después**, y entonces ya no se sabe cuál vino de dónde. No hay mitigación técnica: es la decisión del 10 de septiembre, y aguanta hasta el #628 **La decisión aguantó**: la vault pasó de cero entradas a 669 el 11 de septiembre, ya con el dedupe |
| **El caché no es «por dispositivo» y la pantalla hace creer que sí** | `Cerrado: #546, el 10 de septiembre de 2026` | En iOS, Safari, Chrome y **cada aplicación instalada** tienen almacenamientos separados, mientras la pantalla y `ADR-019` §3 y §4 dicen «dispositivo» seis veces. **Le ocurrió a quien tiene la vault**: creía que su iPhone guardaba copia y la app instalada no guardaba ninguna. El fallo no es que la pantalla mienta sobre su estado —diría bien que no hay copia— sino que **la palabra hace innecesario ir a mirar**, y el precio se paga el único día que el caché sirve para algo. Se le suma que esa pantalla **lee una preferencia y no el almacén**, y que esa preferencia cambió de nombre en el #476 **Esta fila decía «abierto» al planificar la 17 y el #546 ya estaba cerrado**, desde antes de escribirla; se corrigió al cerrar |
| **Reimportar nuestro propio CSV degrada un secreto** | `Cerrado: #531` | Exportar en claro y volver a importar devuelve la tarjeta como login **y manda el número a `notas`**, que es el único campo que la búsqueda indexa. Nuestro CSV tiene la firma de Chrome, así que se detecta como Chrome. **No es silencioso** —el import informa de las columnas movidas, que es `ADR-011` §2.4— pero informar de que se ha degradado un secreto no es lo mismo que no degradarlo. Un secreto que la lista se niega a pintar (#510) y que la búsqueda se niega a indexar (#512) entra por la puerta de atrás Cerrado en la 17, junto con el detector que leía NordPass como Chrome (#612) |
| **El botón que borra la copia no parece un botón** | `Cerrado: #550, el 10 de septiembre de 2026` | «Olvidar esta cuenta en este dispositivo» es `variant="ghost"` con texto atenuado: semánticamente un `<button>`, visualmente un pie de texto. **Es el único sitio que borra la copia cifrada de un dispositivo para una cuenta concreta**, y el procedimiento de limpieza del reset se apoyó en él — y quien tiene la vault no lo había visto nunca, estando delante de esa pantalla muchas veces **Caducada igual que la del #546**: cerrado antes de que esta tabla se escribiera. Y el mismo botón volvió en el #655, esta vez por estar mal centrado |
| **La vault vieja sigue siendo legible sin red en el portátil de la segunda cuenta** | `Aceptado, no mitigado` | El reset borró su cuenta del servidor, pero **el caché de un dispositivo no se toca al vaciar la base**: se indexa por correo y solo se borra al cerrar sesión o al apagar la opción. Si ese portátil tenía copia, puede seguir abriendo su vault antigua sin conexión indefinidamente. **Son sus datos en su máquina y no hay fuga**, pero es un estado raro que conviene que no sorprenda |
| **Nadie va a verificar el criterio 2 de la Iteración 13** | `Cerrado por decisión, no por olvido` | «Un código generado por eVault lo acepta un servicio real» necesitaba a alguien usando el segundo factor. El #545 preguntó, y la respuesta fue que ahora se entiende y aun así no se va a usar. **Deja de ser una tarea pendiente y pasa a ser una propiedad conocida**: esa cadena contra un tercero no se probará mientras nadie use la funcionalidad |
