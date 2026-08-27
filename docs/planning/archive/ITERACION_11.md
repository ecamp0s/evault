ITERACIÓN 11 — Historial y lecciones aprendidas

Archivo de la Iteración 11, cerrada el 27 de agosto de 2026. Recoge la intención de cada issue y lo que se aprendió al cerrarlo.

Está archivado, no muerto. Es la iteración en la que la vault dejó de ir lenta con las 370 contraseñas que tiene dentro. Si alguna vez hay que tocar la lista, su virtualización, lo que cuesta escribir en la vault o el banco de pruebas que lo vigila, merece la pena leer esto antes de investigar desde cero.

El objetivo se cumplió: la vault de 370 entradas se maneja como una vault de verdad, y verify-large-vault.mjs lo comprueba con un comando.

Nota de formato: prosa plana sin Markdown, por la convención del proyecto.


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
