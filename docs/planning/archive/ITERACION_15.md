ITERACIÓN 15 — Historial y lecciones aprendidas

Archivo de la Iteración 15, cerrada el 9 de septiembre de 2026. Recoge la intención de cada issue y lo que se aprendió al cerrarlo.

Está archivado, no muerto. Es la iteración en la que la vault dejó de guardar solo contraseñas, y también aquella en la que la mitad de los hallazgos no vinieron del objetivo sino de mirar lo que ya estaba: una regla de idioma que fabricaba deuda en vez de evitarla, un verificador de despliegue que comprobaba el 0,85 por ciento de los datos, y una funcionalidad entera que nadie usaba porque nadie había preguntado si se entendía.

El objetivo se cumplió: se guardan tarjetas y notas seguras, y hay dos de verdad en la vault de verdad.

Nota de formato: prosa plana sin Markdown, por la convención del proyecto. Salvo la última sección, LO QUE DECÍA STATUS.md, que conserva el Markdown con que se escribió allí.


QUÉ SE HIZO

Veinticuatro issues cerrados sobre un plan de dieciséis. Los ocho de más aparecieron por el camino, y quedan tres abiertos que son deuda anotada.

Bloque 0, la decisión: el 503, que registró ADR-020.
Bloque 1, el modelo: el 504 el tipo y los campos en el blob, el 505 la validación por tamaño, el 506 el guardado.
Bloque 2, el editor: el 507 el selector de tipo, el 508 los campos de la tarjeta, el 509 la nota.
Bloque 3, la lista: el 510 el tipo de un vistazo y el 511 el botón de copiar.
Bloque 4, el resto: el 512 la búsqueda, el 513 el export, el 514 el import y el 515 la auditoría.
Bloque 5, la verificación: el 516 la vault sembrada y el 517 la tarjeta real.
Bloque 6, el cierre: el 518.

Y fuera de plan: el 534, el 535, el 538, el 542, el 543, el 544 y el 545, cerrados; más el 531, el 546 y el 550, que quedan abiertos como deuda.

ADR-020 es el que decide la iteración: tipo dentro del blob, ausente significa login, cinco campos de tarjeta, la tarjeta acotada por tamaño y no validada por forma, y los documentos adjuntos fuera con el argumento medido. Se escribió primero y solo, como ADR-015 en la 9 y ADR-017 en la 13, porque una clave escrita dentro de un item no se renombra nunca.

Esa última frase dejó de ser cierta ocho días después, dentro de la misma iteración, y así es como pasó.


LOS CRITERIOS DE SALIDA

Ocho, escritos al abrir el 8 de septiembre de 2026. Cinco cumplidos, uno a medias, uno cumplido y después deliberadamente deshecho, y uno retirado. Se dice así en vez de estirar la definición.

El 1, una tarjeta real en la vault real leída desde el móvil: CUMPLIDO. Una American Express con sus cinco campos, guardada en kastor y leída desde el iPhone con la aplicación instalada (#517).

El 2, una nota segura real: CUMPLIDO, lo mismo (#517).

El 3, las 370 entradas anteriores se abren sin haberlas tocado: CUMPLIDO, Y DESPUÉS DESHECHO A PROPÓSITO. Se comprobó al crear la tarjeta sobre la vault real, con las 639 entradas de entonces abriéndose igual. Y después la propia iteración las borró: el 544 vació la instancia para que el renombrado de los campos no necesitara migración. El criterio se cumplió mientras existió su objeto, y decirlo de otra forma sería maquillarlo.

El 4, api sin un solo cambio: CUMPLIDO, y medido con precisión. Desde el commit que abre la iteración hasta el cierre, git diff sobre api sale vacío. El único cambio del rango más amplio es un composer.lock de Dependabot mergeado ANTES de abrirla.

El 5, la auditoría no cuenta tarjetas ni notas y el recuento vuelto a leer: A MEDIAS. La primera mitad está hecha y comprobada por mutación. La segunda NO, y ya no se puede: el 246 de 369 se refería a una vault que se borró. No es una tarea pendiente, es una medida sin objeto.

El 6, el número de la tarjeta no aparece en el DOM de la lista: CUMPLIDO, con test, igual que la contraseña (#510).

El 7, los ocho límites de verify-large-vault en verde con los tres tipos: CUMPLIDO, sobre 370 entradas y en la ejecución completa, no en la corta. La revisión marcó 205 de 308 (#516).

El 8, alguien que no construyó la pantalla crea una tarjeta sin explicaciones: RETIRADO EL 9 DE SEPTIEMBRE, y el motivo importa más que el criterio. Pedía involucrar a la segunda persona de la instancia, que no es una probadora: tiene cuenta porque se le ofreció la aplicación, no porque la pidiera. ADR-018 ya había decidido que el rigor debe ser proporcionado a una instancia personal, y el archivo de la Iteración 14 ya anotaba que NO QUEDAN LECTORES EN FRÍO AQUÍ. El criterio pedía exactamente lo que el proyecto tenía escrito como agotado, y lo escribió quien planificó sin releer aquello. Se sustituyó por el juicio de quien usa la vault, que confirmó lo que el criterio medía: la etiqueta del código de seguridad le llevó al anverso de una Amex y metió los cuatro dígitos sin que nadie se lo dijera.


LAS MEDICIONES, TOMADAS AL CERRAR

Tests: 922 en la web (64 ficheros), 263 en la API (2.720 aserciones) y 105 del utillaje. Son 1.290, contra los 1.191 del cierre de la 14.
Cobertura: 95,31 por ciento global y 98,71 en lib/vault, con las funciones de lib/vault al 100.
Issues abiertos al cerrar: tres, y los tres son deuda: el 531, el 546 y el 550. PRs abiertos: cero.
Alertas de Dependabot ABIERTAS: cero.
ADR: veinte, uno nuevo, el 020.
Instancia: vaciada y reconstruida. Un usuario, una vault, cero items al cerrar, con la clave de recuperación configurada.
Y el recuento de la auditoría ya no existe: se fue con la vault que medía.


LO QUE APARECIÓ POR EL CAMINO Y NO ESTABA EN EL PLAN

Diez issues, y esta vez el patrón cambia: los de las iteraciones anteriores salían de usar la aplicación o de desplegar. Aquí la mitad salió de MIRAR LO QUE YA ESTABA ESCRITO Y COMPROBAR SI SEGUÍA SIENDO VERDAD.

El 542 salió de que la lista de excepciones de la regla de idioma tenía cinco entradas y tres eran falsas, una de ellas desde siempre: la clave del state de react-router nunca estuvo en español. Y lo que las hacía dañinas no era estar obsoletas sino que FABRICABAN ESPAÑOL NUEVO — tipo, titular, numero y caducidad nacieron en español el 8 de septiembre porque la lista decía que los campos del blob van en español. Un día antes de que se retirara.

El 543 y el 544 salieron de ahí: renombrar los nueve campos, y vaciar la instancia para no tener que migrarlos.

El 538 salió de que un número no cuadraba al desplegar: se habían añadido dos entradas y la huella de verificación salió idéntica. GROUP_CONCAT trunca a group_concat_max_len, que vale 1024, así que la huella cubría 1.024 de 120.300 bytes. El comando que DEPLOYMENT.md proponía para comprobar que un despliegue no se había llevado nada verificaba el 0,85 por ciento de los datos, y la sección afirmaba que era «lo que de verdad prueba que los datos están iguales».

El 534 y el 535 salieron de usar la aplicación con una tarjeta de verdad: el número oculto estorbaba y la caducidad pedía una barra a mano.

El 545 salió de preguntar. El 546 y el 550, de intentar dejar los dispositivos limpios para el reset. Y el 531, de comprobar qué hace el import con nuestro propio CSV en claro.


LAS LECCIONES

LA MUTACIÓN ENCONTRÓ LO QUE LA SUITE NO, CINCO VECES. Y no en el código: en los tests. Un test que comprobaba PRESERVED_FIELDS pasaba igual con la decisión invertida. Otro afirmaba un atributo rows que field-sizing-content ignora, así que iba verde sobre un cambio que no cambiaba nada. Otro sobre el portapapeles dejaba pasar copiar sin limpiarlo. Otro sobre un hueco vacío miraba textContent, que un span vacío no llena. Y otro tecleaba 09/2024 carácter a carácter, donde una máscara golosa acaba en el mismo sitio. Los cinco los escribí para proteger una propiedad y ninguno la protegía. La suite no lo dice; mutar el código sí.

UN COMPROBADOR SE COMPRUEBA ANTES DE CREERLE, y esta vez el roto era el del despliegue. La huella de GROUP_CONCAT es la misma familia que el PerformanceObserver de largeVault.mjs y el grep sin -a del 184: un número tranquilizador que no mide lo que dice. Lo delató que dos entradas nuevas no movieran la huella. Ahora el comando imprime la longitud al lado, que es lo que lo habría delatado a la primera.

UNA LISTA DE «NO TOCAR» SE CONVIERTE EN UNA INSTRUCCIÓN DE «CÓMO NOMBRAR». La de CLAUDE.md estaba escrita como memoria de por qué ciertas cosas no se renombran, y acabó dictando el idioma de los campos nuevos. Tres de sus cinco entradas eran falsas y nadie lo había comprobado en meses. De ahí la regla nueva: si una excepción deja de ser cierta, se borra el mismo día.

Y LA VARIANTE DE ESO QUE MÁS CARO SALIÓ: la dificultad se había convertido en prohibición. Renombrar un campo del blob es caro —el servidor no puede convertir lo que no puede leer— y de ahí se había deducido que no se podía. Se podía: con una migración en el cliente o con una base vacía. Lo que faltaba en la lista no era el motivo sino LA SALIDA.

UNA FUNCIONALIDAD PUEDE ESTAR CORRECTA Y NO SERVIRLE A NADIE. El segundo factor tiene ADR propio, 50 tests contra los vectores del RFC 6238 y un caso de verify-auto-lock con recibo. Y llevaba sin usarse desde que existe, porque el texto explicaba CÓMO rellenar el campo y nunca QUÉ era. Ningún test lo detecta, ninguna revisión de código lo detecta: solo lo dice quien la iba a usar, y solo si se le pregunta. Se explicó, y la respuesta fue que ahora se entiende y aun así no se quiere — que es la primera vez que se puede distinguir eso de «no se lo han explicado».

EL RIGOR TIENE QUE SER PROPORCIONADO, Y ESTA VEZ LO ROMPIÓ LA PLANIFICACIÓN. El criterio 8 pedía un protocolo de prueba con una segunda persona, para una instancia personal de dos cuentas donde una de ellas no pidió estar. ADR-018 ya lo había decidido y la Iteración 14 ya lo había anotado como agotado. La lección no es sobre pruebas con usuarios: es que planificar sin releer lo que el propio proyecto decidió produce exigencias que contradicen sus decisiones.

Y EL CIERRE ENCONTRÓ ALGO QUE NADIE MÁS PODÍA ENCONTRAR, que es la razón de que los verificadores se ejecuten el día del cierre y no se hereden. Al correr verify-auto-lock salieron TRES DE OCHO CASOS EN ROJO, y no por el bloqueo: los tres decían «timed out waiting for: the new entry dialog». El renombrado del 543 había cambiado el id del campo de notas, y scripts/browser/vault.mjs esperaba a #notas en cuatro sitios. El CI NO ejecuta esos verificadores —a propósito, porque conducen un navegador de verdad y un check intermitente se acaba ignorando entero, que es la lección del 62—, así que nada lo habría dicho.

Y hubo un segundo tramo del mismo hallazgo, más silencioso: verify-large-vault había salido en verde el mismo día, en el 516, PERO ANTES DEL RENOMBRADO. Citar aquella ejecución al cerrar habría sido heredar una medida caducada de horas. Se volvió a ejecutar después del renombrado, y ahí sí valía.

Arreglados los cuatro selectores, los dos verificadores quedaron en verde el día del cierre: verify-auto-lock con OCHO DE OCHO casos en 18,3 minutos de reloj real —incluido el caso 9 con su recibo dentro: el código TOTP pasó de 615627 a 949554 sin que nadie lo tocara y la vault se bloqueó igual a los 15,8 minutos— y verify-large-vault con sus ocho límites sobre 370 entradas, con la revisión marcando 205 de 308.

Y UNA DE HERRAMIENTA, PORQUE SE PAGÓ ENTERA: un renombrado se verifica comparando el texto visible, no leyendo el diff. El compilador quedó limpio y los 922 tests en verde con CINCO frases españolas rotas dentro. Una de ellas estaba partida por una interpolación en JSX, con la palabra sola en su línea, así que ninguna auditoría línea a línea la habría visto. Es exactamente el fallo del 115, y ui-text.mjs existe por él.


LO QUE DECÍA STATUS.md

Hasta el 11 de septiembre de 2026, STATUS.md conservaba el objetivo, los criterios de salida y los riesgos de todas las iteraciones cerradas, y llegó a 288 KB: ya no cabía en una lectura. El 663 los sacó de allí por la regla de una sola fuente de docs/GUIDE.md, y lo que decía de esta iteración está aquí copiado sin tocar, salvo los enlaces relativos, ajustados a esta carpeta.

EL OBJETIVO QUE LLEVABA STATUS.md

**Iteración 15: cerrada el 9 de septiembre de 2026.** Objetivo cumplido: *la vault guarda algo más que contraseñas.*

**Veinticuatro issues cerrados** sobre un plan de dieciséis. Los ocho de más aparecieron por el camino, y quedan tres abiertos como deuda. `ADR-020` deja de ser una decisión escrita para ser código: se guardan tarjetas y notas seguras, hay dos de verdad en la vault de verdad, y las 370 entradas anteriores no necesitaron migración porque **`tipo` ausente significa login**.

**Cinco criterios cumplidos, uno a medias, uno cumplido y después deshecho a propósito, y uno retirado.** El detalle y las lecciones están en [docs/planning/archive/ITERACION_15.md](ITERACION_15.md).

**Y es la iteración en la que la mitad del valor no vino del objetivo.** Los diez issues no planificados no salieron de usar la aplicación —que es el patrón de las cinco anteriores— sino de **mirar lo que ya estaba escrito y comprobar si seguía siendo verdad**. Tres hallazgos, y los tres tenían la misma forma: una afirmación en el sitio que le da autoridad, que nadie había vuelto a comprobar.

**El primero fabricaba deuda.** La lista de excepciones de la regla de idioma en `CLAUDE.md` tenía cinco entradas y **tres eran falsas** —una de ellas desde siempre: la clave del `state` de react-router nunca estuvo en español—. Y lo dañino no era que estuvieran obsoletas sino que **fabricaban español nuevo**: `tipo`, `titular`, `numero` y `caducidad` nacieron en español el 8 de septiembre porque la lista decía que los campos del blob van en español. Un día antes de que se retirara. De ahí salieron el #542, el #543 y el #544.

**El segundo mentía sobre un despliegue.** La huella que `DEPLOYMENT.md` §7 proponía para comprobar que una actualización no se había llevado nada **cubría el 0,85 % de los datos** —`GROUP_CONCAT` trunca a 1024 bytes y lo hace en silencio— mientras la sección afirmaba que era «lo que de verdad prueba que los datos están iguales». Lo delató que dos entradas nuevas no movieran la huella (#538).

**Y el tercero era una funcionalidad entera.** El segundo factor tiene ADR propio, cincuenta tests contra los vectores del RFC 6238 y un caso de `verify-auto-lock` con recibo, y **llevaba sin usarse desde que existe** — porque el texto explicaba *cómo* rellenar el campo y nunca *qué* era. Se explicó, y la respuesta fue que ahora se entiende y aun así no se quiere: la primera vez que se puede distinguir eso de «no se lo han explicado» (#545).

**Lo que cambió de fondo, y no estaba planificado: los campos del blob pasaron a inglés.** Era lo último que quedaba en español dentro del código, y llevaba años protegido por un argumento que era cierto a medias — renombrarlos deja ilegible lo guardado, sí, **pero eso no es una prohibición sino un precio**, y hay dos formas de pagarlo: una migración en el cliente o una base vacía. Se eligió la segunda: **la instancia se vació y se reconstruyó** (#544).

**El error de método propio, y va primero porque lo cometió la planificación:** el criterio 8 pedía que la tarjeta la creara alguien que no hubiera construido la pantalla. Eso exigía involucrar a la segunda persona de la instancia, que **no es una probadora**. `ADR-018` ya había decidido que el rigor debe ser proporcionado a una instancia personal, y el archivo de la Iteración 14 ya anotaba que **no quedan lectores en frío aquí**. El criterio pedía exactamente lo que el proyecto tenía escrito como agotado.

**Y el propio cierre encontró algo que nadie más podía encontrar**, que es exactamente para lo que existe el criterio de ejecutar los verificadores el día del cierre. `verify-auto-lock` salió con **tres de ocho casos en rojo** — y no por el bloqueo: el renombrado del #543 había cambiado el id del campo de notas y el guion esperaba a `#notas` en cuatro sitios. **El CI no ejecuta esos verificadores, a propósito**, así que nada lo habría dicho. Y `verify-large-vault` había salido verde ese mismo día, pero **antes** del renombrado: citarlo habría sido heredar una medida caducada de horas.

**Y la lección que más veces se repitió: la mutación encontró lo que la suite no, cinco veces, y siempre en los tests.** Un test sobre `PRESERVED_FIELDS` que pasaba con la decisión invertida; uno que afirmaba un `rows` que `field-sizing-content` ignora; uno que dejaba pasar copiar sin limpiar el portapapeles; uno que miraba `textContent` para detectar un hueco vacío; y uno que tecleaba `09/2024` donde una máscara golosa acaba igual. Los cinco se escribieron para proteger una propiedad y ninguno la protegía.
**Iteración 15: en curso, abierta el 8 de septiembre de 2026.** Objetivo: *la vault guarda algo más que contraseñas.*

**Dieciséis issues planificados**, del #503 al #518, en seis bloques. `ADR-020` decide los tipos de entrada: **tarjetas y notas seguras**, con una clave `tipo` que vive dentro del blob y cuya ausencia significa login — de modo que **las 370 entradas que ya existen no se tocan y no hay migración de ninguna clase**.

**Lo pidió quien tiene la vault**, el 3 de septiembre de 2026, junto con la extensión de navegador. Se eligió esto y no la extensión porque la extensión no puede empezar sin resolver antes dónde vive la clave desbloqueada bajo Manifest V3, y eso choca de frente con `ADR-007`: es un ADR antes que un issue, y queda como candidato de la 16.

**Lo que hoy pasa y esta iteración corrige.** Una tarjeta solo cabe metiendo el número en el campo de notas de un login, y ese campo **lo indexa la búsqueda** y **sale en la columna `note` del CSV en claro**. El número con el que se paga está tratado como un comentario.

**La decisión que da peso a la iteración, y es la única que no se puede rectificar en un PR: los nombres de los campos.** Una clave escrita dentro de un item no se renombra nunca —el servidor no puede leerla para migrarla—, así que `ADR-020` va primero y solo, como `ADR-015` en la 9 y `ADR-017` en la 13.

**Y una que salió al revisar el plan y no de escribirlo:** el código de seguridad se llama `csc` y no `cvv`. CSC es el término genérico; **CVV2** es de Visa, **CVC2** de Mastercard y **CID** de American Express y Discover. Llamarlo `cvv` habría metido el nombre de una marca dentro de todas las tarjetas guardadas, con su suposición de tres dígitos — y **los de American Express son cuatro**. De ahí sale la regla que gobierna toda la validación de la tarjeta: **se acota el tamaño y no se impone la forma**, porque una Amex tiene además **15 dígitos y no 16**, y equivocarse significa negarse a guardar una tarjeta que el usuario tiene en la mano.

**Lo que queda fuera y por qué, para que no se reabra: los documentos adjuntos.** Se pidieron con lo demás. No entran porque no son un campo del blob: `GET /items` devuelve **todos** los items sin paginar —escrito así a propósito, porque el servidor no puede filtrar lo que no puede leer—, así que un adjunto se descargaría entero en cada carga y acabaría además en el IndexedDB de `ADR-019`. Necesitan tabla y endpoint propios con descarga bajo demanda, que es su propio ADR y su propia iteración.

**Una propiedad comprobable de toda la iteración: `api/` no se toca.** Ni endpoint, ni columna, ni migración, ni subida de `version`. Es el criterio de salida 4 y se verifica con `git diff --stat master -- api/`.

LOS CRITERIOS QUE LLEVABA STATUS.md

### Iteración 15, cerrada el 9 de septiembre de 2026

**Cinco cumplidos, uno a medias, uno cumplido y después deshecho a propósito, y uno retirado.** Se dice así en vez de estirar la definición.

1. **Una tarjeta real en la vault real, leída desde el móvil.** `Cumplido`. Una American Express con sus cinco campos, en kastor, leída desde el iPhone con la aplicación instalada (#517).
2. **Una nota segura real.** `Cumplido`, lo mismo (#517).
3. **Las entradas anteriores se abren sin haberlas tocado.** `Cumplido, y después deshecho a propósito`. Se comprobó sobre la vault real con sus 639 entradas abriéndose igual — y después la propia iteración las borró, porque el #544 vació la instancia para que el renombrado de los campos no necesitara migración. El criterio se cumplió mientras existió su objeto, y decirlo de otra forma sería maquillarlo.
4. **`api/` sin un solo cambio.** `Cumplido`, y medido con precisión: desde el commit que abre la iteración, `git diff -- api/` sale **vacío**. El único cambio del rango más amplio es un `composer.lock` de Dependabot mergeado **antes** de abrirla.
5. **La auditoría no cuenta tarjetas ni notas, y el recuento vuelto a leer.** `A MEDIAS`. La primera mitad, hecha y comprobada por mutación — y el hallazgo fue que la exclusión **ya tenía cuatro guardianes**, mientras que lo que nada vigilaba era que una tarjeta tampoco se audita **por su número** (#515). La segunda mitad **no se hizo y ya no se puede**: el 246 de 369 se refería a una vault que se borró. No es una tarea pendiente, es una medida sin objeto.
6. **El número de la tarjeta no aparece en el DOM de la lista.** `Cumplido`, con test, igual que la contraseña. Ni siquiera sus cuatro últimos dígitos, que son los que pide un banco por teléfono (#510).
7. **Los ocho límites de `verify-large-vault` en verde con los tres tipos.** `Cumplido`, sobre 370 entradas y en la ejecución completa. La revisión marcó **205 de 308**, con la proporción de contraseñas malas contada sobre las entradas **con** contraseña — que es lo que el #516 existía para no equivocar (#516).
8. **Alguien que no construyó la pantalla crea una tarjeta sin explicaciones.** `RETIRADO el 9 de septiembre`, y el motivo pesa más que el criterio: pedía involucrar a la segunda persona de la instancia, que tiene cuenta porque se le ofreció la aplicación y no porque la pidiera. `ADR-018` ya había decidido que el rigor debe ser proporcionado, y la Iteración 14 ya anotaba que **no quedan lectores en frío aquí**. Se sustituyó por el juicio de quien usa la vault, que confirmó lo que el criterio medía: la etiqueta «Código de seguridad» le llevó al **anverso** de una Amex y metió los **cuatro** dígitos sin que nadie se lo dijera.

**El criterio 4 es el que más dice por lo poco que cuesta comprobarlo.** Veinticuatro issues, un renombrado de nueve campos del blob y un reset completo de la instancia, y el servidor no necesitó una línea.
### Iteración 15, en curso

**Ocho criterios, escritos al abrirla el 8 de septiembre de 2026.** Ninguno evaluado todavía.

1. **Una tarjeta de verdad guardada en la vault real y leída desde el móvil.** Con sus cinco campos, en la instancia donde están las contraseñas de verdad y no en una de prueba (#517).
2. **Una nota segura de verdad, lo mismo.** Es el tipo que no necesita ni un campo nuevo, y por eso el que mide si la pantalla se entiende sin ayuda de los campos (#517).
3. **Las 370 entradas existentes se abren sin haberlas tocado.** `tipo` ausente sigue significando login, y no se ejecutó ninguna migración ni ninguna reescritura sobre ellas (#504, #517).
4. **`api/` sin un solo cambio en toda la iteración.** `git diff --stat master -- api/` vacío. Es la afirmación central de `ADR-020` §10 y es comprobable en un comando (#518).
5. **La auditoría no cuenta tarjetas ni notas, comprobado por mutación.** Quitar la exclusión tiene que poner un test en rojo. Hoy solo lo afirma un comentario escrito cuando no existía ninguno de los dos casos (#515).
6. **El número de la tarjeta no aparece en el DOM de la lista**, con test, igual que la contraseña — ni entero ni con los últimos cuatro dígitos, que son precisamente los que pide un banco por teléfono (#510).
7. **Los ocho límites de `verify-large-vault` en verde sobre una vault sembrada con los tres tipos**, con la proporción de contraseñas malas calculada sobre las entradas **con contraseña** y no sobre el total (#516).
8. **Alguien que no construyó la pantalla crea una tarjeta sin que se lo expliquen.** Es la lección más cara de la 14 aplicada como criterio, y aquí se juega en una etiqueta concreta: «Código de seguridad» tiene que llevar a la persona al sitio correcto de su tarjeta **sin decirle cuántos dígitos tiene ni dónde está impreso**, porque son cuatro y al anverso en una Amex y tres y al dorso en las demás. El guion de esa prueba lo revisa quien no lo escribió, que es la otra lección del #470 (#517).

**El criterio 4 es el más barato de comprobar y el que más dice**, y por eso está escrito como criterio y no como comentario: si al cerrar hubiera un solo cambio en `api/`, significaría que algo del contenido se le escapó al blob hacia el servidor.

LOS RIESGOS QUE LLEVABA STATUS.md

Los riesgos eran un registro acumulado y sus filas no decían de qué iteración eran, así que cada una vino al archivo de la iteración más reciente que cita. Su estado es el que tenía el día que se retiró de STATUS.md, y NO se ha vuelto a comprobar: varias decían «Abierto» de algo ya cerrado. Un riesgo que siga vivo se reescribe en la tabla de la iteración en curso con su estado de hoy, no se copia de aquí.

| Riesgo | Estado | Detalle |
| --- | --- | --- |
| **Un nombre de campo mal elegido es para siempre** | `Abierto, mitigado por el orden de trabajo` | Es el riesgo central de la Iteración 15 y el único que no se puede rectificar en un PR. Una clave escrita dentro de un item **no se renombra nunca**: el objeto se cifra tal cual, así que sus claves son lo que hay dentro de cada entrada ya guardada, y el servidor no puede repararlo porque no puede leerlo. La mitigación es de método y no técnica: `ADR-020` va **primero y solo**, con los cinco nombres decididos y argumentados antes de escribir una línea. Ya evitó uno — `cvv` habría metido el nombre de Visa y su suposición de tres dígitos dentro de todas las tarjetas, y **los de American Express son cuatro** |
| **Un cliente viejo abre una tarjeta** | `Abierto, y silencioso por definición` | Durante un tiempo puede haber un móvil con la versión anterior en el caché de `ADR-019` mostrando una entrada que no entiende. **No rompe** —los campos son opcionales— y **no la destruye** si respeta la regla de `FOUNDATION.md` §2, que es la que #429 pagó por escribir: el `PUT` manda el contenido entero y no un parche, así que una clave que no viaja **deja de existir, sin que nada falle**. Lo que hace el riesgo real es que su único guardián es esa regla, y una regla no es un test |
| **La vault sembrada deja de parecerse a la real** | `Abierto, y es el criterio 7` | La proporción de contraseñas malas de `verify-large-vault` —dos de cada tres— **está medida sobre la vault de verdad** (#448), y el límite de la revisión mide cuánto multiplica la página lo que está **mal**. Si al sembrar notas y tarjetas esa proporción pasa a calcularse sobre el total en vez de sobre las entradas con contraseña, **el límite sigue pasando pero mide menos de lo que cree**, que es la peor forma de romper un verificador. El guardián que se niega a pasar sin auditar nada es lo que hay que comprobar que sigue sirviendo |
| **El export en claro lleva ahora un número de tarjeta** | `Aceptado, no mitigado` | `ADR-020` §9.2 lo decide a propósito: es coherente con que ese fichero lleve las contraseñas y con la única razón por la que existe, que es **irse**. No sigue a `totp` porque la semilla es persistente —rehacerla obliga a reconfigurar el segundo factor servicio a servicio— y una tarjeta se reemite en una llamada. Lo que sube es lo que cuesta perder ese fichero, y eso no se mitiga: se sabe |
