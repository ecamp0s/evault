ITERACIÓN 13 — Historial y lecciones aprendidas

Archivo de la Iteración 13, cerrada el 2 de septiembre de 2026. Recoge la intención de cada issue y lo que se aprendió al cerrarlo.

Está archivado, no muerto. Es la iteración en la que la vault ganó el segundo factor y empezó a decir qué hay mal dentro de ella, y también aquella en la que siete de los veintidós issues los encontró usar la aplicación o correr un verificador a escala real, ninguno leer código. Si alguna vez hay que tocar TOTP, la auditoría, el banco de la vault larga o el diálogo de una entrada, merece la pena leer esto antes de investigar desde cero.

El objetivo se cumplió en sus dos mitades: la semilla vive dentro del item cifrado y la revisión dice qué hay mal.

Nota de formato: prosa plana sin Markdown, por la convención del proyecto. Salvo la última sección, LO QUE DECÍA STATUS.md, que conserva el Markdown con que se escribió allí.


QUÉ SE HIZO

Veintidós issues cerrados. El plan tenía quince; los otros siete aparecieron por el camino y son buena parte del valor.

Bloque 0, la planificación: el 411.
Bloque 1, lo que arrastraba la 12: el 412, desplegar y etiquetar de verdad, y el 413, el CSV real de Firefox.
Bloque 2, el contrato dice la verdad: el 414.
Bloque 3, TOTP: el 415 la librería, el 416 el campo, el 417 el código en pantalla, el 418 el reloj desviado, el 419 el import de Bitwarden y el 420 el aviso del export.
Bloque 4, la auditoría: el 421 el cálculo y el 422 la pantalla.
Bloque 5, la verificación: el 423.
Bloque 6, la deuda y el cierre: el 424 y el 425.

Y fuera de plan: el 427, el 429, el 437, el 439, el 442, el 448, el 450 y el 452.


LOS CRITERIOS DE SALIDA

Seis cumplidos, uno a medias y uno sin verificar, y se dice así en vez de estirar la definición.

El 1, kastor sirviendo el código de la 12 y las 370 con etiquetas puestas: CUMPLIDO, y lo que lo cierra no es el despliegue sino que apareció UNA ENTRADA CON DOS ETIQUETAS A LA VEZ. Es el caso que el argumento de las etiquetas frente a las carpetas predecía, así que las carpetas quedan descartadas con medida y no por inercia.

El 2, un código generado por eVault aceptado por un servicio real: SIN VERIFICAR. Exige una cuenta de prueba en un servicio de verdad y una persona delante, y no se hizo. Los vectores del RFC prueban que el algoritmo es correcto; lo que queda sin probar es la cadena entera contra un tercero.

El 3, los vectores del RFC 6238: CUMPLIDO, y el criterio es el comando.

El 4, una entrada con TOTP abierta quince minutos bloquea la vault igual: CUMPLIDO con reloj real, caso 9 de verify-auto-lock.mjs, con su propio recibo dentro.

El 5, la semilla fuera del CSV en claro y el aviso de a cuántas afecta: CUMPLIDO, comprobado por mutación.

El 6, la auditoría devuelve un recuento y ese recuento BAJA: A MEDIAS. El recuento está —246 de 369— y es de las dos mitades la que se podía hacer sin tocar la vault; la segunda exige cambiar contraseñas reales y no se hizo. Se anota a medias en vez de darlo por bueno con la primera mitad.

El 7, un CSV real de Firefox con datos dentro: CUMPLIDO, y con él cae el criterio 6 de la Iteración 12, que llevaba desde el 28 de agosto sin cumplirse.

El 8, FOUNDATION.md con todos los campos, comprobadores en cero, verificadores en verde y CI en verde: CUMPLIDO, y ejecutado el día del cierre: los ocho límites de verify-large-vault en verde sobre 370 entradas, y ocho de ocho casos de verify-auto-lock en 18,3 minutos de reloj real.


LAS MEDICIONES, TOMADAS AL CERRAR

Tests: 705 en la web (52 ficheros), 263 en la API y 105 del utillaje. Son 1.073, contra los 922 de la planificación.
Cobertura: 94,44 por ciento global y 98,51 en lib/vault, las dos por encima de donde estaban.
Issues abiertos al cerrar: uno, este. PRs abiertos: cero. Alertas de Dependabot: cero.
ADR: diecisiete, ninguno nuevo — y esa ausencia se decidió al planificar en vez de por omisión.


LO QUE APARECIÓ POR EL CAMINO Y NO ESTABA EN EL PLAN

Ocho issues, y el patrón que comparten es el de siempre: ninguno lo encontró una herramienta corriendo sola. Los encontró alguien usando la aplicación, o correr un verificador a escala real, o leer un fichero por otro motivo.

El 429 salió leyendo schema.ts para escribir el contrato del blob: editar una entrada favorita LA DESMARCABA, porque toContent reconstruía el contenido desde el formulario y el PUT manda el contenido entero.

El 437 y el 439 salieron usando la vault real desde un iPhone: no se llegaba al botón de guardar —el diálogo no tenía max-height ni scroll propio— y la fila de etiquetas se pegaba a la primera entrada.

El 450 salió de correr el límite nuevo a 370 entradas: la pantalla de revisión pintaba 738 filas y 4.028 nodos, ×7,2 sobre la lista.

El 452 salió del CI: un test que escribí en el 417 esperaba una cantidad fija de reloj en vez de esperar la condición.

El 442 salió acotando el 413, el 448 de medir el umbral sobre la vault real, y el 427 de que SPRINT_CONTEXT.md incumplía su propia regla de longitud.


LAS LECCIONES

EXTRAPOLAR UNA MEDIDA NO ES MEDIRLA, y costó el 450. El coste de la pantalla de revisión se midió a 120 entradas, dio ×2,5, se dio por bueno y se dijo en voz alta que la preocupación era infundada. A 370 es ×7,2, porque las filas no crecen con la vault sino con LO QUE ESTÁ MAL en la vault. La forma del error es la de siempre: una afirmación tranquilizadora hecha sobre una medida que no era la de la pregunta.

UN COMPROBADOR PUEDE SALIR VERDE SOBRE LA NADA, y pasó dos veces en el mismo sitio. El límite de la revisión salió verde sobre una pantalla vacía —las contraseñas sembradas eran todas buenas— y su ×0,1 solo decía que una página vacía es pequeña; ahora trae recibo y se niega a pasar si no auditó nada. Y el regex que lee el titular iba dentro de un template literal, donde la barra invertida se pierde y termina buscando letras d: decía «0 de 0» sobre una pantalla que pintaba 120 filas, que es un número EQUIVOCADO y no uno ausente, bastante más difícil de ver.

UN TEST ESCRITO CONTRA LA CONSTANTE PASA EN LOS DOS SENTIDOS. Los casos del umbral de «corta» construían sus contraseñas a partir de SHORT_BELOW, así que mover el umbral movía el test con él y todo seguía verde. Se cazó mutando la constante y viendo pasar las diecinueve pruebas. Reescritos con longitudes concretas, mover el umbral rompe tests, que es lo que convierte moverlo en una decisión.

UNA AFIRMACIÓN NO VERIFICADA SE PROPAGA IGUAL QUE UNA VERIFICADA. El hallazgo 2 de la planificación decía que la vault real iba una iteración por detrás. Era falso: kastor corría el código del 409, desplegado a mano y sin issue. Se marcó como no verificado y aun así llegó a STATUS.md, a SPRINT_CONTEXT.md y al cuerpo del 412. El fallo de método fue la inferencia «no hay issue de despliegue, luego no hubo despliegue».

LEER UN VERDE DEL COMANDO EQUIVOCADO. El censo de comentarios estaba en rojo y se dio por bueno porque su veredicto se cortó con tail -2 y lo que se leyó fue el «Todo en orden» de check-docs.py, que venía detrás. Lo cazó el test del utillaje.

Y EL PR 451 SE MERGEÓ CON EL CI EN ROJO, porque el comando encadenaba gh pr merge detrás de la espera sin mirar el resultado. Master estuvo con un test intermitente dentro hasta el 452. No es un fallo del código: es de método, y desde entonces los checks se comprueban en un paso aparte.


LO QUE NO SE HIZO Y POR QUÉ

Probar un código contra un servicio real, que es el criterio 2 y necesita una persona con una cuenta de prueba. Bajar el recuento de la auditoría, que exige cambiar contraseñas de verdad y es trabajo de quien tiene la vault. Leer una semilla desde un código QR, descartado al planificar porque BarcodeDetector solo existe en Chrome y Android y una librería sería una dependencia más en el cliente que sirve el JavaScript que cifra. Consultar brechas ajenas desde la auditoría, que exigiría un ADR propio y se descartó por escrito. Y adelgazar el bundle, que no lo pide ninguna medida.

Y UNA COSA QUE LA ITERACIÓN ENCONTRÓ Y NO ARREGLA: en la vault real hay UNA CONTRASEÑA COMPARTIDA POR 41 ENTRADAS, y otra por 8. No depende de ningún umbral —o dos entradas tienen la misma o no la tienen— y es exactamente el ataque que este proyecto existe para hacer imposible. Cambiarlas es trabajo de quien tiene la vault, y la pantalla ya lleva a cada entrada con el generador dentro.


LO QUE DECÍA STATUS.md

Hasta el 11 de septiembre de 2026, STATUS.md conservaba el objetivo, los criterios de salida y los riesgos de todas las iteraciones cerradas, y llegó a 288 KB: ya no cabía en una lectura. El 663 los sacó de allí por la regla de una sola fuente de docs/GUIDE.md, y lo que decía de esta iteración está aquí copiado sin tocar, salvo los enlaces relativos, ajustados a esta carpeta.

EL OBJETIVO QUE LLEVABA STATUS.md

**Iteración 13: cerrada el 2 de septiembre de 2026.** Objetivo cumplido: *la vault guarda el segundo factor, y empieza a decir qué hay mal dentro de ella.*

**Veintidós issues cerrados**, siete de ellos abiertos por el camino sobre un plan de quince — y esos siete son buena parte del valor. `ADR-017` deja de ser una decisión escrita para ser código: la semilla vive dentro del item cifrado, el código se pinta con su cuenta atrás sin mantener la vault abierta, no sale nunca en el CSV en claro y el import de Bitwarden la lleva a su campo. Y la auditoría existe, calculada enteramente en el cliente porque el servidor no puede hacerla.

**Seis criterios cumplidos, uno a medias y uno sin verificar.** El detalle y las lecciones están en [docs/planning/archive/ITERACION_13.md](ITERACION_13.md).

**Lo que cambió de fondo, y no es TOTP.** Es que la vault empezó a decir la verdad sobre sí misma: **246 de sus 369 contraseñas tienen algo que corregir, y una está compartida por 41 entradas**. Eso no depende de ningún umbral y no lo podía calcular nadie más — hace falta tener las 369 descifradas, y eso solo ocurre dentro del navegador de quien tiene la clave. Es `ADR-001` produciendo una funcionalidad en vez de un límite.

**El patrón de la iteración, y es el más caro de los que arrastra el proyecto: siete de los ocho hallazgos no planificados los encontró usar la aplicación o correr un verificador a escala real.** Ninguno salió de leer código. #429 leyendo `schema.ts` por otro motivo; #437 y #439 desde un iPhone con la vault real; #450 corriendo el límite nuevo a 370 entradas; #452 del propio CI.

**Y tres errores de método propios, que se anotan porque callarlos sería el fallo que este repositorio lleva cinco iteraciones documentando:**

1. **El hallazgo 2 de la planificación era falso.** Decía que la vault real iba una iteración por detrás; kastor corría el código de #409, desplegado a mano y sin issue. Se marcó como no verificado y **aun así se propagó** a `STATUS.md`, a `SPRINT_CONTEXT.md` y al cuerpo de #412. La inferencia «no hay issue de despliegue, luego no hubo despliegue» era el error.
2. **El PR #451 se mergeó con el CI en rojo**, porque el comando encadenaba `gh pr merge` detrás de la espera sin mirar el resultado. Master estuvo con un test intermitente dentro hasta #452.
3. **Se extrapoló una medida en vez de medirla.** El coste de la pantalla de revisión se midió a 120 entradas, dio ×2,5 y se declaró infundada la preocupación. A 370 es ×7,2, porque las filas crecen con lo que está mal en la vault y no con la vault.

**Las mediciones del cierre**, tomadas el 2 de septiembre y no heredadas: **705 tests** en la web (52 ficheros), **263** en la API con 2.720 aserciones, **105** del utillaje — **1.073** en total, contra los 922 de la planificación. Cobertura **94,44 %** global y **98,51 %** en `lib/vault`. Larastan en nivel `max` sin errores, los comprobadores del repositorio en cero, CI en verde, **cero** PRs abiertos y **cero** alertas de Dependabot. Diecisiete ADR: ninguno nuevo, **y esa ausencia se decidió al planificar en vez de por omisión**.

Objetivo original, escrito al planificarla:

Es la segunda iteración que **elige** su objetivo en vez de heredarlo —la primera fue la 7—, y puede hacerlo porque la 12 cerró con el backlog vacío: 195 issues, 195 cerrados. `ADR-009` §4 agotó sus dos primeras columnas —fiabilidad y legibilidad— entre las Iteraciones 7 y 11, así que lo que toca es funcionalidad nueva, que es su tercera y última.

Y no empieza por una decisión, que es lo inusual: `ADR-017` se escribió el 28 de agosto **primero y solo**, precisamente para que guardar semillas TOTP no entrara en un commit de funcionalidad. La decisión está tomada y lo que falta es escribirla en código.

**Quince issues en seis bloques.** Bloque 0, la planificación: #411. Bloque 1, lo que arrastra la 12: #412 y #413. Bloque 2, el contrato dice la verdad: #414. Bloque 3, TOTP: #415, #416, #417, #418, #419 y #420. Bloque 4, la auditoría: #421 y #422. Bloque 5, la verificación en navegador: #423. Bloque 6, la deuda y el cierre: #424 y #425.

**No hace falta ADR nuevo, y eso se decide en la planificación en vez de por omisión.** `ADR-017` cubre entero lo único de esta iteración que cambiaba el modelo de amenaza. La auditoría de contraseñas se resuelve **enteramente dentro del dispositivo** —repetidas, débiles y cortas, sobre los items ya descifrados en memoria—, así que no sale nada del navegador y el modelo no cambia ni una línea. Consultar brechas ajenas con k-anonimato —los cinco primeros caracteres del SHA-1 de cada contraseña hacia un servicio externo— **sí** habría exigido ADR propio antes de una línea de código, y se descarta por escrito para que la próxima sesión no lo implemente sin decidirlo.

**La decisión de secuenciación, que es la apuesta de esta iteración: el despliegue va primero, y no por comodidad.** #412 no es «poner al día una máquina»: es lo único que permite ejecutar una mitigación que se aceptó por escrito y que hoy es inaplicable. Las etiquetas se eligieron sobre las carpetas con un argumento razonable y el riesgo se asumió con una salida concreta —«si hacen falta carpetas, se verá usándolas»—, y **no hay etiquetas que usar** porque el código de la 12 no está en kastor. Poner el despliegue al final habría dejado esa comprobación para la 14, que es como se posponen tres iteraciones seguidas.

**Las mediciones que sostienen el plan**, tomadas al planificar el 31 de agosto de 2026 y no heredadas: **0 issues abiertos**, **558 tests** en la web (45 ficheros), **263** en la API con 2.720 aserciones, **101** del utillaje —**922** en total—, cobertura del **93,95 %** global, CI en verde en los tres workflows, `check-docs.py` y `check-comment-language.py --all` en cero, **cero** PRs abiertos y **cero** alertas de Dependabot abiertas (hay diez, las diez `fixed`). El chunk mayor del bundle son 342 kB, 110 kB gzip.

**Lo que apareció al medir y no estaba en ningún documento.** Cuatro hallazgos, y los dos primeros son el patrón que este proyecto arrastra desde el criterio 7 de la Iteración 4 — **una afirmación escrita en un documento que le da autoridad y que nadie volvió a comprobar**:

1. **`FOUNDATION.md` no documenta `favorito` ni `etiquetas`.** El contrato del blob sigue siendo los cinco campos originales, mientras `web/src/lib/vault/types.ts` dice «The contract is fixed in docs/architecture/FOUNDATION.md» y `ADR-017` §4 manda documentar **ahí** el campo TOTP. La Iteración 12 añadió dos campos al blob y no tocó el documento que se los fija; `grep -c favorito` sobre él devuelve `0`. Sale a #414, y lo que lo hace notable es que la iteración que empieza iba a remitir a ese documento por tercera vez.
2. ~~**La vault real va una iteración por detrás.**~~ **ERA FALSO, comprobado el 1 de septiembre de 2026 al ejecutar #412.** Se escribió que el último despliegue fue #373 con el código de la Iteración 11, y de ahí que las etiquetas no estuvieran en kastor y su mitigación —«si hacen falta carpetas, se verá usándolas»— fuera inaplicable. **kastor corría `acffc0d` (#409), casi el final de la Iteración 12, desplegado el 28 de agosto a las 21:05**, con `evault-web:latest` construida a esa misma hora. Hubo un despliegue a mano, sin issue. **El fallo de método es la inferencia y no el dato**: se dedujo «no hay issue de despliegue después del #373, luego no hubo despliegue». Es el patrón que esta misma lista enumera —una afirmación puesta en un documento que le da autoridad y que nadie volvió a comprobar—, cometido dentro de la planificación que lo denuncia; se marcó como no verificado y aun así se propagó a `SPRINT_CONTEXT.md` y al cuerpo de #412. **Lo que sí se midió al desplegar responde la misma pregunta mejor**: la última escritura de la vault principal es del 28 de agosto a las 09:05 y la de la segunda de ese día a las 19:20, las dos **anteriores al despliegue**. En los cuatro días que las etiquetas llevaban disponibles no se escribió ni un solo item, y cualquier etiquetado habría movido `updated_at`. No es evidencia contra las etiquetas: es que no hubo uso que observar.
3. **Nada puede calcular «esta contraseña es antigua».** `updated_at` es la fecha en que se reescribió el blob, así que renombrar una entrada la rejuvenece y no dice nada de cuándo cambió la contraseña. El cuarto aviso clásico de una auditoría es hoy **incalculable**, y hacerlo bien exige una fecha dentro del blob, que es una decisión de esquema. **Se deja fuera a propósito** y se anota, en vez de implementarlo mal sobre el dato que hay a mano.
4. **El chunk de `/styleguide` se publica en producción** aunque la ruta solo exista con `import.meta.env.DEV`: `dist/assets/StyleGuide-KHIcJiji.js`, 3.359 bytes en un build de producción. Nunca se descarga —la ruta no está registrada—, así que el coste real es cero bytes transferidos; lo que queda es una pantalla de desarrollo dentro del artefacto que sirve la instancia con las contraseñas reales. Sale a #424 con prioridad baja. Apareció midiendo el bundle para decidir si adelgazarlo entraba en el alcance.

**Lo que queda fuera a propósito.** Adelgazar el bundle, que no lo pide ninguna medida: 110 kB gzip en el chunk mayor y las rutas ya van diferidas desde la Iteración 6. Leer una semilla desde un código QR, decidido al planificar: `BarcodeDetector` solo existe en Chrome y Android —y el iPhone es el dispositivo desde el que se usa esta vault—, y una librería sería una dependencia más en el cliente que sirve el JavaScript que cifra las contraseñas, justo lo que `ADR-017` §5.5 subraya como parte de por qué la decisión se aprobó. Las semillas entran pegando una URI `otpauth://` o una base32, que es la opción «no puedo escanear» que todos los servicios ofrecen. Y las carpetas, que las etiquetas cubren y que #412 pone en condiciones de decidirse con la vault delante.

LOS CRITERIOS QUE LLEVABA STATUS.md

### Iteración 13, cerrada el 2 de septiembre de 2026

**Seis cumplidos, uno a medias y uno sin verificar.** Se dice así en vez de estirar la definición.

1. **Kastor sirve el código de la Iteración 12 y las 370 tienen etiquetas puestas de verdad.** `Cumplido`, y lo que lo cierra no es el despliegue sino la medida: apareció **una entrada con dos etiquetas a la vez** —`Education` y `Shopping`—, que es el caso que el argumento de #378 predecía y que una carpeta habría roto. Cuatro etiquetas distintas y 10 items reescritos, cruzado desde el servidor contando `updated_at` sin leer nada del contenido (#412).
2. **Un código generado por eVault lo acepta un servicio real.** `SIN VERIFICAR`. Exige una cuenta de prueba en un servicio de verdad y una persona delante, y no se hizo. Los vectores del RFC prueban que el algoritmo es correcto; lo que queda sin probar es la cadena entera contra un tercero. Se anota como no verificado en vez de darlo por bueno con el criterio 3, que mide otra cosa.
3. **`vitest run totp` pasa los vectores del RFC 6238.** `Cumplido`: 50 tests en 3 ficheros. El criterio es el comando (#415).
4. **Dejar abierta una entrada con TOTP quince minutos bloquea la vault igual.** `Cumplido` con reloj real, caso 9 de `verify-auto-lock.mjs`, **con su propio recibo dentro**: lee el código dos veces con dos minutos de separación y se niega a pasar si no cambió (#417, #423).
5. **La semilla no aparece en el CSV en claro y el diálogo dice a cuántas entradas afecta.** `Cumplido`, comprobado por mutación: marcar la columna como exportable deja 4 tests en rojo (#420).
6. **La auditoría sobre las 370 devuelve un recuento, y ese recuento baja.** `A MEDIAS`. El recuento está —**246 de 369**, con 200 repetidas, 129 cortas y 30 de un solo tipo— y es la mitad que se podía hacer sin tocar la vault. La segunda exige cambiar contraseñas reales y es trabajo de quien la tiene. Se anota a medias en vez de darlo por bueno con la primera (#421, #422, #448).
7. **Un CSV real de Firefox, con datos dentro, importado y reconocible.** `Cumplido`, y **con él cae el criterio 6 de la Iteración 12**, que llevaba desde el 28 de agosto sin cumplirse. Dos credenciales, dos entradas, ninguna perdida, nombradas `accounts.google.com` y `t3.movistar.es` (#413).
8. **`FOUNDATION.md` describe todos los campos del blob, los comprobadores en cero, los dos verificadores en verde y el CI en verde.** `Cumplido`, y ejecutado el día del cierre y no heredado: `verify-large-vault.mjs` con **los 8 límites en verde** sobre 370 entradas, y `verify-auto-lock.mjs` con **8 de 8 casos en 18,3 minutos de reloj real** — incluido el caso 9, el del contador TOTP, con su recibo dentro: el código pasó de 407159 a 563941 sin que nadie tocara nada. Larastan en `max` sin errores, `check-docs.py` y `check-comment-language.py --all` en cero, y CI en verde.

**Lo que estos criterios deliberadamente no pedían** —que el bundle adelgace, que la API pagine, que se lea un QR, que eVault consulte brechas ajenas— sigue sin pedirse.
### Iteración 13, en curso

Ocho criterios. Se mantiene la regla de las seis iteraciones anteriores: **si un criterio se puede comprobar con un comando, el criterio es ese comando** — y el comando vive en el repositorio. Los demás se evalúan **ejecutándolos**, nunca leyendo código ni diffs.

Escritos con las dos correcciones que la 12 aplicó y que aquí siguen valiendo: cada uno mide **una** cosa, y el «antes» de todos es medible el día de la planificación. Y tres de ellos —el 2, el 4 y el 5— no describen un estado deseable sino **una comprobación que tiene que fallar cuando el trabajo se hace mal**, que en esta iteración importa más que de costumbre: **un TOTP mal implementado no produce un error, produce seis dígitos plausibles**, y no hay forma de mirar un código y ver que está mal.

1. **Kastor sirve el código de la Iteración 12, y las 370 entradas tienen etiquetas puestas de verdad**, con el recuento: cuántas tienen al menos una y cuántas etiquetas distintas salieron. El «antes» es **cero**, medible hoy. Mide una cosa: que las etiquetas se usan, que es la mitigación escrita del riesgo con el que se eligieron (#412).
2. **Un código generado por eVault lo acepta un servicio real**, sobre una cuenta de prueba y no una real. Es la única prueba que vale, porque ningún test sustituye a que el servidor de otro diga que sí (#415, #416, #417).
3. **`vitest run totp` pasa los vectores del RFC 6238.** El criterio es el comando (#415).
4. **Dejar abierta una entrada con TOTP quince minutos bloquea la vault igual**, en navegador y con reloj real, en `verify-auto-lock.mjs`. Es el agujero que `ADR-017` §2.4 dejó señalado, y tiene esta forma a propósito: **si el contador cuenta como actividad, este caso sale en rojo**. Comprobado además por mutación, verificando que la mutación se aplicó — que es la lección que la 12 aprendió con el #360 (#417, #423).
5. **La semilla no aparece en el CSV en claro, y el diálogo dice a cuántas entradas afecta.** Comprobado por mutación: quitar la exclusión tiene que poner un test en rojo (#420).
6. **La auditoría sobre las 370 reales devuelve un recuento, y ese recuento baja**: al menos las repetidas quedan arregladas, con el número antes y después. **Las dos mitades**, porque sin la segunda esto es una pantalla y no una herramienta (#421, #422).
7. **Un CSV real de Firefox, con datos dentro, importado y con las entradas nombradas de forma reconocible.** Es el criterio 6 de la Iteración 12, que quedó `NO CUMPLIDO`, y se vuelve a pedir entero en vez de darlo por bueno con la verificación de cabeceras que ya se hizo (#413).
8. **`FOUNDATION.md` describe todos los campos del blob, los comprobadores del repositorio en cero, los dos verificadores de navegador en verde y el CI en verde.** Medido el día del cierre y no heredado de la planificación (#414, #423).

**Lo que estos criterios deliberadamente no piden** —que el bundle adelgace, que la API pagine, que se lea un QR, que eVault consulte brechas ajenas— sigue sin pedirse.

LOS RIESGOS QUE LLEVABA STATUS.md

Los riesgos eran un registro acumulado y sus filas no decían de qué iteración eran, así que cada una vino al archivo de la iteración más reciente que cita. Su estado es el que tenía el día que se retiró de STATUS.md, y NO se ha vuelto a comprobar: varias decían «Abierto» de algo ya cerrado. Un riesgo que siga vivo se reescribe en la tabla de la iteración en curso con su estado de hoy, no se copia de aquí.

| Riesgo | Estado | Detalle |
| --- | --- | --- |
| **Un segundo factor guardado a medias es peor que ninguno** | `Cerrado sin materializarse` | Es el riesgo propio de esta iteración. Una base32 mal decodificada, un `digits=8` ignorado o un `algorithm=SHA512` tratado como SHA-1 **no producen ningún error**: producen seis dígitos plausibles que el servicio rechaza. Y para cuando se descubre, el código QR original ya no está y la aplicación anterior se desinstaló — el segundo factor se ha perdido, y recuperarlo es reconfigurarlo cuenta por cuenta. La mitigación es de secuencia y no de código: **al guardar la semilla se enseña el código actual**, para compararlo con la aplicación anterior ANTES de retirar nada. Y lo que no se sabe leer se rechaza al guardar, no al usar, que es lo que `ADR-017` §4 quiere decir con «no se inventan valores por defecto silenciosos» (#416) **CERRADO**: la mitigación de secuencia se implementó —al guardar la semilla el editor enseña el código actual, para compararlo con la aplicación todavía instalada— y lo que no se sabe leer se rechaza al guardar y no al usar. No se materializó (#416) |
| **El contador de un segundo mantiene la vault abierta para siempre** | `Cerrado, y medido con reloj real` | `ADR-017` §2.4 lo dejó escrito como el caso concreto que la implementación tiene que resolver: **un contador que se refresca cada segundo no es actividad del usuario**. Si lo fuera, tener abierta una entrada con TOTP —que es el estado normal de quien la usa— convertiría el bloqueo por inactividad en algo que no dispara nunca. `autoLock.ts` compara marcas de tiempo en vez de usar temporizadores precisamente para no confundir reloj con presencia. **Y el fallo es invisible**: no hay síntoma, solo una vault que sigue abierta. Por eso el criterio 4 tiene la forma de una comprobación que falla cuando el trabajo se hace mal, y por eso vive en el verificador de navegador y no en la suite (#417, #423) **CERRADO**: caso 9 de `verify-auto-lock.mjs`, verde el 31 de agosto — el código pasó de 912778 a 794033 sin que nadie tocara nada, aviso a los 14,3 minutos y bloqueo a los 15,7. Y con recibo: el caso se niega a pasar si el código no cambió, porque una vault que se bloquea con el contador muerto da el mismo verde que un componente roto (#417, #423) |
| **El contador repinta la lista y deshace la Iteración 11** | `Materializado en #450, y cerrado` | La 11 dejó números medidos —156 ms al pintar, 46 al buscar, **487 nodos del DOM con 370 entradas**— y esta iteración mete un temporizador por segundo y una vista nueva que enumera entradas. Dos filos concretos: **las filas no miden todas lo mismo** —70 px sin usuario y 74 con él—, y un repintado por segundo en la lista sería exactamente lo que la 11 quitó. El código se pinta **solo en la entrada abierta**, y la pantalla de la auditoría es otra lista larga a la que aplica todo lo anterior. `node scripts/verify-large-vault.mjs` es lo que lo vigila (#417, #422, #423) **SE MATERIALIZÓ, y no por donde se esperaba.** El contador no repinta la lista: se pinta solo en la entrada abierta. Lo que sí deshizo los números fue la PANTALLA de la auditoría, que pintaba 738 filas y 4.028 nodos sobre 370 entradas — ×7,2 contra los 557 de la lista. Lo encontró el límite de #423 corrido a escala real, no leer el código. Acotada a veinte filas por sección: ×0,7 (#450) |
| **La auditoría marca «débil» lo que no lo es y se ignora entera** | `Cerrado el 1 de septiembre de 2026: medido` | Es la lección de #62 —un check que nace en rojo se acaba ignorando— aplicada a un aviso en vez de a un check, y con un agravante: cuando se ignora la auditoría, se dejan de leer también los avisos que sí valen. **El umbral se mide contra las 370 reales antes de elegirlo**, no se elige un número redondo y se comprueba después. Si marca 300 de 370, el umbral está mal aunque el argumento sea impecable, y el número que se elija se escribe con la medida al lado (#421)  **MEDIDO sobre las 369 contraseñas reales**: 129 cortas (35 %), 200 repetidas (54 %), 30 de un solo tipo (8 %), **246 con algo que corregir** y **123 limpias**. El listón era «si marca 300 de 370 está mal» y 129 está lejos, así que el umbral se queda en 12 y pasa a estar escrito con lo que marca. **Y lo que la medición encontró sin buscarlo**: una contraseña compartida por **41 entradas**, y otra por 8 — eso no depende de ningún umbral (#421, #422, #448)|
| **Una pantalla cuyo trabajo es agrupar contraseñas por igualdad** | `Cerrado sin materializarse` | La auditoría existe para decir qué entradas comparten contraseña, y ese es exactamente el sitio donde pintar una contraseña deja de parecer raro. No añade nada frente a un atacante que ya tiene la vault abierta —ya las tiene todas— pero sí frente a quien mire por encima del hombro, que es el escenario real de un portátil. **Dice «estas cuatro comparten contraseña», no cuál.** Lo mismo con la semilla TOTP: se cuenta, no se enseña (#422) **CERRADO**: la pantalla dice «la comparten 3» y nunca cuál, con dos tests que lo fijan mirando el `body` entero. Es la garantía que #421 no podía sostener —`repeatedGroups` devuelve los items, contraseña incluida— y que solo se puede sostener donde se pinta (#422) |
| **Un reloj desviado se lee como «eVault está roto»** | `Cerrado` | `ADR-017` §5.4 lo asume y pide resolverlo. No depende de que nada falle: un portátil que estuvo suspendido, un móvil con la hora en manual o **la propia kastor** —cuyo reloj no es monótono entre arranques, como documentó #240— producen códigos correctos para un instante equivocado. La mitigación es la cabecera `Date` de una respuesta que iba a llegar igual: **avisa, no corrige**. Generar con la hora del servidor ataría los códigos a que haya red —cuando TOTP existe para no necesitarla—, escondería un reloj mal puesto que rompe otras cosas, y metería al servidor en un camino del que `ADR-001` lo tiene fuera (#418) **CERRADO**: se lee la cabecera `Date` de respuestas que iban a llegar igual y se avisa donde se ve el código, nombrando la causa y la dirección. El umbral es un paso entero y no está elegido a ojo: por debajo de 30 segundos lo absorbe la tolerancia de los servicios (#418) |
| **La semilla acaba donde acaban las cosas que no se tratan como secretos** | `Cerrado el 1 de septiembre de 2026` | Una semilla TOTP es un secreto **persistente**: una contraseña se rota en cinco minutos, una semilla obliga a reconfigurar el segundo factor con su código QR y sus códigos de respaldo. Hoy `login_totp` de Bitwarden cae en `notas` por la regla de `ADR-011` §2.4, y **`notas` es un campo que la búsqueda mira**. `ADR-017` §4 lo cierra en tres sitios a la vez: no se pinta en la lista, no se muestra sin una acción explícita, no se escribe en ningún registro — y no sale nunca en el export en claro (#419, #420) **CERRADO**: el #419 mapea `login_totp` a su campo, así que la semilla deja de caer en `notas` —que es lo que la búsqueda lee—. Y con un matiz que no estaba previsto y se escribe: una semilla que NO se puede leer sigue yendo a las notas, porque escribirla en el campo daría códigos plausibles que nadie acepta y descartarla sería perderla en silencio, que es lo que `ADR-011` §2.4 llama el peor fallo posible. Es un mal menor asumido a conciencia, no un descuido (#419, #420) |
| **Desplegar sobre las 370 contraseñas reales** | `Cerrado sin materializarse, en tres despliegues` | Heredado de la 12 y sin cambios: en kastor hay contraseñas de verdad desde el 18 de agosto, así que **lo que se rompa ahí no es reproducible** y el servidor no puede repararlo porque no puede leer nada. El modo de fallo concreto está documentado y se olvida igual: `docker compose up -d --build` **no aplica las migraciones ni recrea el contenedor** si la imagen no cambia, y el código va por volumen, de modo que un `git pull` deja una instancia que parece desplegada y no lo está. Hace falta `--force-recreate`. La mitigación es comprobar que la copia de la noche anterior existe y **no está vacía** antes de tocar nada — el backup se niega a subir copias vacías desde la Iteración 8, pero eso se verifica, no se supone (#412) **NO SE MATERIALIZÓ**, en tres despliegues del 1 y el 2 de septiembre de 2026. Lo que lo evitó fue el orden y no la suerte: copia comprobada antes de tocar nada las tres veces, `--force-recreate` con los tres ficheros de compose, y la verificación que `DEPLOYMENT.md` exige —la fecha del `dist` servido y una cadena del código nuevo dentro de `/srv/assets`— en vez de dar por desplegado lo que abre. Los datos quedaron intactos las tres veces: 637 items, todos `version 2`, cero vacíos y cero sin nonce (#412) |
| **El CSV real de Firefox exige un fichero que no debe existir** | `Cerrado el 2 de septiembre de 2026` | Es la razón exacta por la que el criterio 6 de la 12 quedó sin cumplir, y no ha cambiado: verificar la ida y vuelta **con datos dentro** exige un export con contraseñas en claro, y un fichero de trabajo con contraseñas dentro es lo que este proyecto existe para no tener. **El recuento es el entregable; el contenido no sale de la pantalla**: ni a este documento, ni al issue, ni a un fichero temporal, ni al portapapeles. Y el issue lo cierra quien tenga el fichero, no una suite (#413) **CERRADO como el issue pedía**: el fichero no salió de la máquina de su dueño y el entregable fueron los recuentos — 2 credenciales, 2 entradas, ninguna perdida, nombradas `accounts.google.com` y `t3.movistar.es`. Con dos filas no se ve nada de escala, y eso se anota como no cubierto en vez de estirarlo (#413) |
| **Las etiquetas resultan no ser lo que hacía falta** | `Cerrado el 1 de septiembre de 2026: eran lo que hacía falta` | Se eligen etiquetas y no carpetas con un argumento razonable —una entrada no tiene por qué estar en un solo sitio— pero **es un argumento y no una medida**: nadie ha organizado todavía estas 370 entradas de ninguna forma. El riesgo no es que las etiquetas sean peores, es darlas por buenas sin volver a mirar. La mitigación es de cierre y no de diseño: #384 pregunta explícitamente qué apareció **usando** lo construido que no estaba previsto, que es la lección con la que la 11 se cerró (#378, #384)  **DESENLACE, medido sobre la vault real y no argumentado**: al etiquetarla desde el iPhone apareció **una entrada con dos etiquetas a la vez, `Education` y `Shopping`**. Ese es exactamente el caso que el argumento de #378 predecía y que una carpeta habría roto: habría obligado a elegir un grupo y perder el otro. La ventaja que justificó las etiquetas **se materializó en el uso real**, así que el riesgo se cierra con la vault delante en vez de por silencio. Cuatro etiquetas distintas, `Gmail` en dos entradas, y **10 items reescritos** entre las 09:25 y las 10:47 — cruzado desde el servidor contando `updated_at`, sin leer nada del contenido, que es el modelo funcionando (#412)|
