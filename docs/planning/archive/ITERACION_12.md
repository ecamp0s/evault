ITERACIÓN 12 — Historial y lecciones aprendidas

Archivo de la Iteración 12, cerrada el 28 de agosto de 2026. Recoge la intención de cada issue y lo que se aprendió al cerrarlo.

Está archivado, no muerto. Es la iteración en la que la vault de 370 entradas dejó de ser una lista plana, y también aquella en la que el comprobador de idioma resultó tener cuatro agujeros. Si alguna vez hay que tocar el orden de la lista, los favoritos, las etiquetas, el import, el export en claro o check-comment-language.py, merece la pena leer esto antes de investigar desde cero.

El objetivo se cumplió: lo que se usa a diario está arriba y el resto se encuentra sin escribir.

Nota de formato: prosa plana sin Markdown, por la convención del proyecto.


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
