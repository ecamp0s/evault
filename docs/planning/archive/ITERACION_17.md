ITERACIÓN 17 — Historial y lecciones aprendidas

Archivo de la Iteración 17, cerrada el 11 de septiembre de 2026. Recoge la intención de cada issue y lo que se aprendió al cerrarlo.

Está archivado, no muerto. Es la iteración en la que la vault de kastor dejó de estar vacía: tres gestores de contraseñas reconciliados en una sola vault, con las discrepancias decididas por quien la tiene y no por una heurística. Y es también aquella en la que LA PREDICCIÓN ACERTÓ CADA CIFRA Y AUN ASÍ EL IMPORT REAL ENCONTRÓ LO QUE NINGUNA SIEMBRA PODÍA: la lógica era la que se había medido, y la forma de los datos no.

El objetivo se cumplió: las tres fuentes entraron una sola vez. 997 filas quedaron en 669 entradas.

Nota de formato: prosa plana sin Markdown, por la convención del proyecto.


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
