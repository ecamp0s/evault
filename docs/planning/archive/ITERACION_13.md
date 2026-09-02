ITERACIÓN 13 — Historial y lecciones aprendidas

Archivo de la Iteración 13, cerrada el 2 de septiembre de 2026. Recoge la intención de cada issue y lo que se aprendió al cerrarlo.

Está archivado, no muerto. Es la iteración en la que la vault ganó el segundo factor y empezó a decir qué hay mal dentro de ella, y también aquella en la que siete de los veintidós issues los encontró usar la aplicación o correr un verificador a escala real, ninguno leer código. Si alguna vez hay que tocar TOTP, la auditoría, el banco de la vault larga o el diálogo de una entrada, merece la pena leer esto antes de investigar desde cero.

El objetivo se cumplió en sus dos mitades: la semilla vive dentro del item cifrado y la revisión dice qué hay mal.

Nota de formato: prosa plana sin Markdown, por la convención del proyecto.


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
