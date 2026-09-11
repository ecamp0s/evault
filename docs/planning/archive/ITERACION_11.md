ITERACIÓN 11 — Historial y lecciones aprendidas

Archivo de la Iteración 11, cerrada el 27 de agosto de 2026. Recoge la intención de cada issue y lo que se aprendió al cerrarlo.

Está archivado, no muerto. Es la iteración en la que la vault dejó de ir lenta con las 370 contraseñas que tiene dentro. Si alguna vez hay que tocar la lista, su virtualización, lo que cuesta escribir en la vault o el banco de pruebas que lo vigila, merece la pena leer esto antes de investigar desde cero.

El objetivo se cumplió: la vault de 370 entradas se maneja como una vault de verdad, y verify-large-vault.mjs lo comprueba con un comando.

Nota de formato: prosa plana sin Markdown, por la convención del proyecto. Salvo la última sección, LO QUE DECÍA STATUS.md, que conserva el Markdown con que se escribió allí.


QUÉ SE HIZO

Trece issues cerrados. El plan tenía once y salieron tres más por el camino, de los cuales dos quedan para la 12.

Bloque 0, la planificación. El 347.

Bloque 1, el comando que mide. El 348, escrito antes de arreglar nada.

Bloque 2, la lista larga. El 349 con la virtualización, el 350 con el menú de usuario inalcanzable y el 351 con el buscador que se perdía al recorrer la lista.

Bloque 3, la escritura. El 352 y el 354 juntos, porque eran el mismo defecto visto dos veces, y el 353 con el progreso del import.

Bloque 4, lo que apareció de paso. El 355 con el diálogo mudo, el 356 con las rutas a medio traducir y el 329, la deuda de la iteración anterior sobre la clave de recuperación.

Bloque 5, el cierre. El 357.

Fuera de plan salieron tres, los tres verificando: el 360, el 364 y el 366. El 366 se hizo dentro porque sostenía una afirmación falsa de CLAUDE.md. Los otros dos pasan a la 12.


LO QUE CAMBIÓ DE FONDO, EN NÚMEROS

Todos medidos sobre la vault de 370 entradas, en el mismo portátil, con el mismo comando.

El menú de usuario estaba a 27.464 píxeles con la ventana en 900, y ahora está a 840. Los nodos del DOM eran 7.839 y son 487, con una vault de diez entradas en 289: el DOM dejó de crecer con lo que hay dentro. Pintar la lista costaba 668 milisegundos y cuesta unos 160. Buscar costaba 272 y cuesta unos 46. Borrar una entrada costaba dos peticiones y 437 milisegundos, y cuesta una y unos 110. Importar 370 entradas costaba 740 peticiones y cuatro minutos y diecinueve segundos, y cuesta 370 y quince segundos y medio.

Lo que no cambió, y conviene saberlo antes de leer el criterio 2 como incumplido: desbloquear sigue tardando unos 900 milisegundos, y de ellos la inmensa mayoría son las 600.000 iteraciones de PBKDF2 que derivan la clave. Eso no lo toca nada de esta iteración y no debía tocarlo.


LA LECCIÓN QUE DA SENTIDO A LA ITERACIÓN: EL CAMINO QUE NADIE RECORRE ERA LA VAULT REAL

El objetivo de la iteración no salió de un plan sino de usar la aplicación con 370 entradas dentro, que es algo que nadie había hecho. Aparecieron seis defectos, y ninguno lo veía nada de lo que el repositorio ya tenía: la suite pasaba en verde con los seis dentro, el análisis estático también, y ninguno se ve en un diff. Los tests de la lista montan tres items, así que la lista nunca había sido larga en un test.

Y el primero de los seis lo reportó quien usa la vault a diario, no una herramienta. El menú de usuario a 27.464 píxeles llevaba ahí desde que la vault tiene contenido.

La regla que sale de aquí, y es la quinta vez que este proyecto la escribe: la única forma de encontrar estos defectos es recorrer el camino con los datos reales. Ningún test que monte tres entradas va a encontrar lo que rompe a las trescientas.


LO QUE HIZO POSIBLE EL RESTO: UN BANCO ESCRITO ANTES Y NACIDO EN ROJO

El 348 fue lo primero, y no por orden arbitrario. Es la lección del censo del 316 aplicada: la red va antes del primer arreglo, porque sin un comando que mida, cada arreglo se da por bueno porque se ve más rápido.

Nació en rojo con sus seis límites sobre master, a propósito, y eso es la mitad que da sentido a la otra. Un banco que salga verde sobre el código que se escribió para medir no está midiendo nada.

Y la decisión de diseño que hay que conocer antes de fiarse de un verde: LOS RECUENTOS DECIDEN Y LOS RELOJES SOLO INFORMAN. Un umbral en milisegundos medido en un portátil sale rojo en otro sin que nada esté peor, y un check que falla sin motivo se acaba ignorando entero, que es la lección del 62. Los tiempos se comparan contra la misma vault de diez entradas en la misma ejecución, así que la máquina se cancela, y por sí solos no tumban nada.

La propia ejecución lo demostró en vez de argumentarlo: el import tardó 60 segundos en el banco contra los 4 minutos y 19 medidos a mano unas horas antes, en la misma máquina con otra carga, mientras el recuento de peticiones salía idéntico. Si el reloj decidiera, ese check sería una moneda al aire.


LO QUE LA SUITE NO PUEDE VER, Y HAY QUE SABERLO PARA NO CONFIAR DE MÁS

jsdom no aplica CSS ni hace layout. Eso significa que la virtualización no se puede verificar de verdad en la suite: allí el virtualizador no sabe qué cabe en pantalla, pinta 159 filas de 300 y empieza por la 141 en vez de por la 0. Darle una altura falsa a las filas se probó y no cambió nada, porque sin layout no hay nada debajo a lo que aplicarla.

Lo mismo con todo lo que decide el CSS: que el sidebar mida la ventana, que la barra de herramientas se quede arriba. Los tests comprueban la declaración, no el comportamiento.

Por eso los tests de esas cosas llevan escrito encima qué pueden ver y qué no, y por eso el banco existe. Lo que verifica de verdad es el navegador.


LO QUE SE MIDIÓ Y NO ERA LO QUE SE CREÍA

Las filas de la lista NO miden todas lo mismo. Se empezó suponiendo que sí, porque el avatar de 36 píxeles es más alto que las dos líneas de texto, y medido en navegador son 70 píxeles sin usuario y 74 con él. Eso convirtió la dependencia de virtualización de una preferencia en una necesidad: una implementación a mano con altura constante se habría roto en silencio el día que alguien guardara una entrada sin usuario.

Y de ahí salió la regla de la estimación: va deliberadamente por lo alto, porque los dos errores no son simétricos. Pasarse deja holgura; quedarse corto acorta la página por debajo de su contenido y deja la última entrada sin alcanzar. Medido con una estimación de 68: la fila 369 quedaba 46 píxeles por debajo de la ventana, inalcanzable.

Paginar GET /items quedó descartado con la medida delante, y era el candidato heredado de la Iteración 10. La petición son 77 milisegundos de los 2.700 y el descifrado 25: el resto era React montando 7.839 nodos. Paginar en el servidor no habría tocado el 95 por ciento del coste, y además buscar seguiría exigiendo la vault entera en el cliente, porque el servidor no puede filtrar lo que no puede leer.


UN COMPROBADOR DECLARÓ TERMINADO LO QUE NUNCA MIRÓ

El 366, y es el hallazgo que más lejos llega. check-comment-language.py solo leía líneas que EMPIEZAN por marcador de comentario. Los comentarios JSX empiezan por llave y las continuaciones de un bloque escrito sin asteriscos no empiezan por nada, así que ninguno de los dos se miraba: 196 líneas en 16 ficheros que nunca había leído.

NUEVE de ellas seguían en español. Sobrevivieron a la conversión entera de la Iteración 10 por ser invisibles a la herramienta que la declaró terminada, y con ellas la afirmación de CLAUDE.md de que la prosa española pegada a código es un descuido y no una zona pendiente no fue cierta hasta el 27 de agosto, aunque llevara escrita desde el 21.

Y dentro del mismo fichero había otra afirmación falsa: un comentario decía que --all tiene el fichero entero y no tiene ese problema. Lo tenía, porque findings iba línea a línea en los dos modos. Esa frase se dejó escrita y corregida, como recordatorio.

Es el mismo patrón que el proyecto arrastra desde el criterio 7 de la Iteración 4 y que la Iteración 10 encontró seis veces: una afirmación escrita en un sitio con autoridad que nadie volvió a comprobar. Esta vez la afirmación estaba dentro de la propia herramienta que servía para comprobar.


LO QUE COSTÓ MÁS DE LO PREVISTO, Y FUE UN ERROR DE MÉTODO PROPIO

Tres veces se verificó en local con un comando más flojo que el del CI, y las tres las atrapó el CI: npx vitest run en vez de npm run test:coverage, que no mira el umbral de cobertura; y npx tsc --noEmit en vez de npm run build, que ejecuta tsc -b e incluye los ficheros de test. La red que funcionó fue la de GitHub y no la propia.

La regla, para la próxima: verificar con los comandos que ejecuta el CI, que están escritos en CLAUDE.md, y no con parientes suyos más rápidos.


LOS CRITERIOS DE SALIDA

Siete de los ocho cumplidos y uno no cumplido, y se dice en vez de estirar la definición.

El 1, el banco en verde habiendo nacido en rojo: cumplido, y las dos mitades.

El 2, la lista pintada en menos de 800 milisegundos: CUMPLIDO A MEDIAS Y EL CRITERIO ESTABA MAL ESCRITO. Mezclaba dos cosas que no se arreglan igual: el total es de unos 894 milisegundos porque unos 740 son PBKDF2 derivando la clave, y eso no baja con nada de esta iteración. Lo que el criterio quería medir, el pintado, pasó de 668 a unos 156 milisegundos. La mitad que sí se cumple entera es la otra: los nodos del DOM dejaron de crecer con el número de entradas.

El 3, buscar en menos de 100 milisegundos: cumplido, 46 medidos. Y la mitad que lo hace verdad y no solo rápido, que la búsqueda siga encontrando entre las 370 y no entre las pintadas, tiene test.

El 4, importar 370 en 372 peticiones o menos y en segundos: cumplido, 370 y 15,7 segundos. Y sigue diciendo cuántas entraron si se corta a la mitad, con test.

El 5, borrar con una sola petición: cumplido, y comprobado con dos pestañas que lo borrado en una desaparece de la otra al volver a la lista pasados los treinta segundos de frescura. No es instantáneo, y decirlo importa más que la cifra.

El 6, el menú dentro de la ventana: cumplido, y comprobado por mutación — al quitar las clases el banco vuelve a rojo con 8.972 píxeles.

El 7, la vault de 370 abierta desde el iPhone por la tailnet con los números apuntados antes y después: NO CUMPLIDO. Exige un dispositivo que no se conduce desde aquí, y además kastor sigue con el código anterior a esta iteración, así que medir hoy daría los números de antes. Y su otra mitad ya no es recuperable: el «antes» desde el iPhone no se midió nunca al planificar, de modo que el criterio pedía una comparación que ya era imposible cuando se escribió.

El 8, que un bloqueo con la clave de recuperación en pantalla deje de dejar una cuenta que cree tener una clave que nadie vio: cumplido, verificado en navegador con reloj real en el caso 8 de verify-auto-lock.mjs. Y la decisión de fondo quedó escrita en vez de tomada por omisión: el registro en el servidor NO se reordena, y el aviso nombra la clave y dice qué hacer.


LO QUE QUEDA ABIERTO

El 360, que al cerrar un diálogo el foco no vuelve al botón que lo abrió, y que hay un comentario de ItemRow.tsx que lo usa como argumento para una decisión de diseño. Está observado con un clic programático y hay que reproducirlo a mano antes de tocar nada.

El 364, que el workflow repositorio no se puede disparar a mano porque el paso del censo usa github.event.before, vacío en workflow_dispatch. Es una capacidad declarada que nunca se ejercitó, y el día que el disparo por pull_request se cayó era la única vía que quedaba.

El 332 y el 344 siguen donde estaban, fuera de esta iteración a propósito. Y el 332 tiene ahora un dato que lo refuerza: --measure dice cero por ciento de detección el mismo día en que el detector encontró nueve líneas reales.

Del entorno queda una cosa que no es del repositorio y conviene saber: durante tres PR seguidos GitHub tardó unos veinte minutos en disparar los checks del pull request. No era del proyecto y se resolvió solo cada vez, pero parece un error del CI, hay que tenerlo en cuenta para el futuro.


LO QUE DECÍA STATUS.md

Hasta el 11 de septiembre de 2026, STATUS.md conservaba el objetivo, los criterios de salida y los riesgos de todas las iteraciones cerradas, y llegó a 288 KB: ya no cabía en una lectura. El 663 los sacó de allí por la regla de una sola fuente de docs/GUIDE.md, y lo que decía de esta iteración está aquí copiado sin tocar, salvo los enlaces relativos, ajustados a esta carpeta.

EL OBJETIVO QUE LLEVABA STATUS.md

**Iteración 11: cerrada el 27 de agosto de 2026.** Objetivo cumplido: *la vault de 370 contraseñas se maneja como una vault de verdad.* El historial y las lecciones, en [docs/planning/archive/ITERACION_11.md](ITERACION_11.md).

| Sobre 370 entradas | Al planificar | Al cerrar |
|---|---|---|
| Menú de usuario | a **27.464 px**, ventana de 900 | a **840 px** |
| Nodos del DOM | **7.839** | **487** (289 con diez entradas) |
| Pintar la lista | **668 ms** | **~156 ms** |
| Buscar | **272 ms** | **~46 ms** |
| Borrar una entrada | **2 peticiones**, 437 ms | **1 petición**, ~110 ms |
| Importar 370 | **740 peticiones**, 4 min 19 s | **370 peticiones**, 15,7 s |

**Trece issues cerrados**, once del plan y dos que aparecieron verificando. Bloque 0, la planificación: #347. Bloque 1, el comando que mide: #348. Bloque 2, la lista larga: #349, #350 y #351. Bloque 3, la escritura: #352, #354 y #353. Bloque 4, lo que apareció de paso: #355, #356 y #329. Bloque 5, el cierre: #357. Fuera de plan y hecho dentro: #366.

**El objetivo no salió de un plan sino de usar la aplicación con 370 entradas dentro**, que es algo que nadie había hecho. `ADR-009` §4 ponía la funcionalidad nueva en tercer lugar y las tres columnas anteriores estaban agotadas, así que tocaba TOTP y organizar la vault. No tocó: aparecieron seis defectos medidos, **ninguno visible para nada de lo que el repositorio ya tenía** — la suite pasa en verde con los seis dentro, porque los tests de la lista montan tres items.

**Y el primero lo reportó quien usa la vault a diario, no una herramienta.**

**Lo que hizo posible el resto fue escribir el banco primero.** #348 nació en rojo con sus seis límites sobre `master`, a propósito, y esa es la mitad que da sentido a la otra. Su decisión de diseño hay que conocerla antes de fiarse de un verde: **los recuentos deciden y los relojes solo informan**, porque un umbral en milisegundos medido en un portátil sale rojo en otro sin que nada esté peor.

**Lo que la suite no puede ver, y está escrito donde toca:** jsdom no aplica CSS ni hace layout, así que la virtualización no se verifica ahí — allí el virtualizador pinta 159 filas de 300 y empieza por la 141. Lo que verifica de verdad es el navegador, y por eso el banco existe.

**Un comprobador declaró terminado lo que nunca miró**, y es el hallazgo que más lejos llega (#366): `check-comment-language.py` no leía los comentarios JSX ni las continuaciones de bloque —**196 líneas en 16 ficheros**— y **nueve seguían en español**, supervivientes de la conversión de la Iteración 10 por ser invisibles a la herramienta que la declaró acabada.

LOS CRITERIOS QUE LLEVABA STATUS.md

### Iteración 11, cerrada el 27 de agosto de 2026

**Siete de ocho cumplidos, uno no cumplido.** Se dice así en vez de estirar la definición, que es lo que la Iteración 10 corrigió y las tres anteriores no hicieron.

1. **`node scripts/verify-large-vault.mjs` en verde, habiendo nacido en rojo.** `Cumplido`, y las dos mitades: sobre `master` fallaban sus seis límites, y al cerrar salen los seis en verde con código de salida 0 (#348).
2. **La lista pintada en menos de 800 ms.** `A medias, y el criterio estaba mal escrito.` Mezclaba dos cosas que no se arreglan igual: el total son ~894 ms porque ~740 son PBKDF2 derivando la clave, y eso no baja con nada de esta iteración. Lo que el criterio quería medir —el pintado— pasó de **668 ms a ~156**. La otra mitad sí se cumple entera: **289 nodos con 10 entradas y 487 con 370**, así que el DOM dejó de crecer con lo que hay dentro (#349).
3. **Buscar en menos de 100 ms por pulsación.** `Cumplido`: **46 ms** contra los 272 de partida. Y la mitad que lo hace verdad y no solo rápido —que la búsqueda siga encontrando entre las 370 y no entre las pintadas— tiene test propio (#349).
4. **Importar 370 en 372 peticiones o menos, y en segundos.** `Cumplido`: **370 peticiones y 15,7 s**, contra 740 y 4 min 19 s. Y sigue diciendo cuántas entraron si se corta a la mitad, con test (#352, #353).
5. **Borrar con una sola petición.** `Cumplido`: **1 petición y ~110 ms**, contra 2 y 437. Comprobado con dos pestañas que lo borrado en una desaparece de la otra al volver a la lista pasados sus treinta segundos de frescura. **No es instantáneo**, y decirlo importa más que la cifra (#354).
6. **El menú de usuario dentro de la ventana.** `Cumplido`: a **840 px** de una ventana de 900, contra 27.464. Comprobado **por mutación**: al quitar las clases el banco vuelve a rojo con 8.972 px (#350).
7. **La vault de 370 abierta desde el iPhone por la tailnet, con los números antes y después.** `NO CUMPLIDO`. Exige un dispositivo que no se conduce desde aquí, y kastor sigue con el código anterior a esta iteración, así que medir hoy daría los números de antes. **Y su otra mitad ya no era recuperable cuando se escribió**: el «antes» desde el iPhone no se midió al planificar, de modo que el criterio pedía una comparación imposible desde el primer día. Pasa a la Iteración 12, con el despliegue por delante.
8. **Un bloqueo con la clave de recuperación en pantalla ya no deja una cuenta que cree tener una clave que nadie vio.** `Cumplido`, verificado en navegador con reloj real en el caso 8 de `verify-auto-lock.mjs`. Y la decisión de fondo quedó **escrita en vez de tomada por omisión**: el registro en el servidor no se reordena, y el aviso nombra la clave y dice qué hacer con ella (#329).

**Lo que estos criterios deliberadamente no pedían** —que el bundle adelgace, que la API pagine, que aparezca funcionalidad nueva— sigue sin pedirse. Paginar `GET /items` quedó además descartado con la medida delante: la petición eran 77 ms de los 2.700.

LOS RIESGOS QUE LLEVABA STATUS.md

Los riesgos eran un registro acumulado y sus filas no decían de qué iteración eran, así que cada una vino al archivo de la iteración más reciente que cita. Su estado es el que tenía el día que se retiró de STATUS.md, y NO se ha vuelto a comprobar: varias decían «Abierto» de algo ya cerrado. Un riesgo que siga vivo se reescribe en la tabla de la iteración en curso con su estado de hoy, no se copia de aquí.

| Riesgo | Estado | Detalle |
| --- | --- | --- |
| **Virtualizar la lista esconde una contraseña** | `Abierto` | Es el riesgo propio de esta iteración y el peor que tiene: al pintar solo lo visible, un filtro mal conectado busca entre las filas pintadas en vez de entre las 370, y una entrada **deja de aparecer**. No falla, no avisa, y quien la busca concluye que no la guardó — sobre la vault donde están las contraseñas de verdad desde la Iteración 7. La mitigación es el criterio 3, que no pide velocidad sino que la búsqueda siga encontrando entre todas; y el banco de pruebas de #348, que se escribe **antes** de virtualizar (#349) |
| **Los umbrales del banco de pruebas se ajustan a una máquina** | `Abierto` | Los números de partida se midieron en un portátil concreto. Un umbral apretado al milisegundo sale en rojo en otra máquina sin que nada esté peor, y un check que falla sin motivo se acaba ignorando entero — la lección de #62. Lo que se está arreglando es un orden de magnitud, no un margen: 2.700 ms no es 800. Las salidas están en #348: umbrales generosos, o una medida relativa contra una vault pequeña (#348) |
| **La caché actualizada a mano miente** | `Abierto` | Dejar de invalidar y actualizar la caché con lo que la respuesta trae es lo que quita el segundo de cada borrado, y es también la forma de que la pantalla enseñe una vault que ya no existe. **Hay dos dispositivos con la misma vault abierta** —el portátil y el iPhone, que es el uso real desde la Iteración 9—, así que no es un caso teórico. Un item que parece existir molesta; uno que existe y no aparece es una contraseña perdida a ojos de quien la busca. El criterio 5 lo comprueba con dos pestañas (#354) |
| **Acelerar el import se lleva por delante su garantía** | `Abierto` | El bucle de hoy es lento y **correcto**: si algo falla a la mitad, lo escrito se queda y se dice cuánto entró. Escribir con concurrencia o invalidar solo al final puede romper esa cuenta justo cuando más importa, que es cuando falla. Y hay un segundo filo: 370 peticiones en paralelo se parecen mucho a lo que un rate limiter existe para frenar, así que el limitador de la API se mira antes y no después (#352) |
| **La primera dependencia nueva del cliente en varias iteraciones** | `Abierto` | Virtualizar bien —teclado, redimensionado, alturas variables— es donde una implementación a mano falla, y `@tanstack/react-virtual` es del mismo autor que la librería de queries que ya se usa. Pero es una dependencia más en el cliente que sirve el JavaScript que cifra las contraseñas, y `ADR-001` dice que el modelo protege la base de datos, no la integridad de ese JavaScript. La decisión se toma escrita en #349, no de paso |
| **Cambiar las rutas y no cambiar la regla** | `Abierto` | #356 pasa las rutas a inglés, y eso contradice lo que `CLAUDE.md` dice hoy sobre los textos que ve el usuario. Si la excepción no se escribe **con su motivo** en el mismo PR, la próxima sesión encontrará cinco rutas contra la regla y las traducirá de vuelta. Es el mecanismo exacto que produjo la mitad de los hallazgos de la Iteración 10. Y el cabo silencioso: la clave que los guards escriben en el `state` de react-router **no se toca**, porque no está tipada y renombrarla a medias rompe sin decir nada (#356) |
| **La lista larga escondía más de lo que se midió** | `Abierto` | Los seis defectos salieron de **una** sesión con la vault llena, no de un barrido sistemático: se recorrió la lista, se buscó, se importó, se exportó y se borró una entrada. No se probaron con 370 dentro el diálogo de item, la rotación de contraseña maestra, el cambio de correo ni el bloqueo por inactividad. **Que la muestra fuera pequeña y aun así diera seis hallazgos es la señal, no el consuelo.** El banco de pruebas de #348 es lo que convierte «probar con la vault llena» en algo que se hace con un comando en vez de a mano cada vez |
