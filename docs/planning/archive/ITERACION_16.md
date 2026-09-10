ITERACIÓN 16 — Historial y lecciones aprendidas

Archivo de la Iteración 16, cerrada el 10 de septiembre de 2026. Recoge la intención de cada issue y lo que se aprendió al cerrarlo.

Está archivado, no muerto. Es la iteración en la que la vault se abre con la cara, y también aquella en la que el hallazgo más repetido no vino de un test que fallara sino de MUTACIONES QUE NO ENCONTRABAN NADA: cinco veces, en cinco sitios sin relación entre sí, una propiedad afirmada en un comentario y protegida por nada.

El objetivo se cumplió: se desbloquea con Face ID en el iPhone real y con Windows Hello en el portátil, sobre la instancia de kastor.

Nota de formato: prosa plana sin Markdown, por la convención del proyecto.


QUÉ SE HIZO

Veintinueve issues cerrados sobre un plan de diecinueve: los diecinueve planificados, siete que aparecieron por el camino y tres de deuda arrastrada de la Iteración 15.

Bloque 0, la decisión: el 554, que registró ADR-021.
Bloque 1, la primitiva: el 555 la derivación con HKDF, el 556 el alta de la credencial, el 557 abrir el envoltorio.
Bloque 2, el servidor: el 558 la tabla, el 559 alta y revocación, el 560 el desbloqueo público.
Bloque 3, la interfaz: el 561 la pantalla, el 562 el botón en el desbloqueo, el 563 qué se dice sin PRF.
Bloque 4, los bordes: el 564 sin red, el 565 los avisos al rotar la maestra y cambiar el correo.
Bloque 5, la verificación: el 566 el autenticador virtual, el 567 verify-passkey.mjs, el 568 el iPhone.
Bloque 6, el cierre: el 569, el 570, el 571 y el 572.

Fuera de plan: el 574, el 576, el 578, el 579, el 584, el 587 y el 604. Y la deuda de la 15: el 546, el 550 y el 553.

El 531 NO se hizo, y no por olvido: es deuda del import y se movió a la Iteración 17, donde el dedupe va a reescribir el mismo fichero. Arreglarlo aquí habría sido tocarlo dos veces.


LOS CRITERIOS DE SALIDA

Ocho, escritos al abrir el 10 de septiembre de 2026. Siete cumplidos y uno cumplido en su propósito pero no en su enunciado literal. Se dice así en vez de estirar la definición.

El 1, la vault real se abre en el iPhone con Face ID sin teclear la maestra: CUMPLIDO. Sobre kastor, con la iteración desplegada, y con recibo en la base: last_used_at a las 12:34:35, un minuto después de crear el passkey, así que el desbloqueo pasó por el servidor y no por un camino local.

El 2, la misma passkey abre desde donde nunca se dio de alta: CUMPLIDO EN SU PROPÓSITO Y NO EN SU ENUNCIADO. Pedía un segundo dispositivo Apple; lo que se probó fue la APLICACIÓN INSTALADA del mismo iPhone, que nunca registró nada. Y eso demuestra la propiedad mejor que un segundo aparato, porque contrasta con algo medido en ese mismo teléfono: el caché offline NO se comparte entre Chrome y la PWA —es todo el contenido del 546—, y el passkey sí cruza esa frontera. Solo puede hacerlo porque sus dos piezas viven fuera del contenedor de almacenamiento: la credencial en el llavero del sistema y el envoltorio en el servidor. Es la Opción A de ADR-021 sección 2.6 comprobada en el peor caso: con la Opción B, el envoltorio en IndexedDB, la aplicación instalada no habría abierto. Lo que NO se probó es que iCloud Keychain sincronice la credencial a otro aparato, porque no hay un segundo dispositivo Apple a mano.

El 3, un segundo passkey en Chrome sobre Windows convive con el del iPhone y revocar uno no toca al otro: CUMPLIDO, y con evidencia que no se ve desde la interfaz. Con los dos dados de alta: dos credenciales distintas, dos hashes distintos y DOS ENVOLTORIOS DISTINTOS de la misma clave de vault, que es ADR-008 cobrando dividendo. Añadir el segundo no rompió el primero, y está en los relojes: el del iPhone se usó a las 12:43:46, después de crear el de Windows a las 12:42:17. Y revocar tampoco: tras quitar el de Windows, el last_used_at del iPhone avanzó a las 12:45:27, posterior al borrado.

El 4, revocar deja la cuenta exactamente como antes: CUMPLIDO. Comprobado en el verificador y en producción: tras la revocación quedaron users=1, vaults=1 y vault_members=1, intactos.

El 5, rotar la maestra NO revoca los passkeys y cambiar el correo SÍ, cada cosa dicha donde se hace: CUMPLIDO, con tests que fallan si cualquiera de los dos avisos desaparece.

El 6, tests que fallan si se rompe lo que sostiene el diseño: CUMPLIDO. Uno si PWK y PAH pierden la separación de dominio, escrito usando el hash COMO clave, y otro si userVerification deja de ser required.

El 7, verify-passkey en verde y los tres verificadores ejecutados el día del cierre: CUMPLIDO. verify-passkey 4 de 4 en 33 segundos, verify-large-vault con sus ocho límites sobre 370 entradas y la revisión marcando 205 de 308, y verify-auto-lock con sus ocho casos.

El 8, una copia hecha después de activar un passkey, restaurada en instancia limpia, y el passkey sigue abriendo: CUMPLIDO, y hecho entero. La copia de producción lleva las cinco tablas con el passkey, su envoltorio y su hash. Y el ciclo completo se probó en local con un PRF conocido: instancia destruida hasta users=0 y passkeys=0, restaurada, y el desbloqueo devolvió EL MISMO ENVOLTORIO byte a byte más un token de sesión.


LAS MEDICIONES, TOMADAS AL CERRAR

Tests: 1.019 en la web (68 ficheros), 310 en la API (2.842 aserciones) y 116 del utillaje. Son 1.445, contra los 1.290 del cierre de la 15.
Cobertura: 95,13 por ciento global y 98,73 en lib/vault, con las funciones de lib/vault al 100.
Issues abiertos al cerrar: uno, el 531, que es deuda movida a propósito a la Iteración 17. PRs abiertos: cero.
Alertas de Dependabot ABIERTAS: cero. Había tres a mitad de iteración —js-yaml y dos de hono, las tres desde shadcn, que es devDependency y no llega al bundle— y se cerraron mergeando sus dos PRs. En el histórico hay veinte, todas en estado fixed, y contarlas todas da un número que no significa nada.
ADR: veintiuno, uno nuevo, el 021.
Checks del CI: nueve, uno nuevo. Pint entró en el 584.
Instancia: desplegada, con un usuario, una vault, cero items y un passkey.


LO QUE APARECIÓ POR EL CAMINO Y NO ESTABA EN EL PLAN

Siete issues, y el patrón se parece al de la 15 con una diferencia importante: aquellos salieron de MIRAR lo escrito, y estos de EJECUTAR lo escrito. Ninguno se encontró leyendo.

El 574 salió de buscar cómo probar la separación de dominio del passkey y descubrir que el test equivalente de la clave de recuperación pasaba con la propiedad y sin ella.

El 576 salió de que un check dijo qué hacer, se hizo, y no sirvió.

El 578 salió de escribir el alta del passkey y darse cuenta de que ADR-021 no menciona el rpId en ninguna decisión, mientras ADR-015 hace que la instancia responda a dos nombres.

El 579 salió de que el 556 tuvo que elegir entre dos funciones idénticas sin ningún criterio.

El 584 salió de ejecutar pint --test antes de subir, por si acaso.

El 587 salió de mutar el servicio nuevo y encontrar dos mutaciones que no ponían nada en rojo.

Y el 604 salió de que quien tiene la vault miró una captura de pantalla.


LAS LECCIONES

UNA MUTACIÓN QUE NO ENCUENTRA NADA ES EL HALLAZGO, y pasó CINCO VECES en sitios sin relación entre sí. La separación de dominio de la clave de recuperación (574). Las dos barreras del envoltorio, donde quitar la primera dejaba todo verde porque la segunda tapaba (559). Las protecciones contra el canal de tiempo del login y de la recuperación, prometidas en comentarios desde las Iteraciones 1 y 4 (587). El orden de publicar la sesión (562). Y dos tests míos del camino offline, uno que afirmaba un estado que el beforeEach ya había producido (564).

Las cinco comparten forma: NO CAMBIAN NINGUNA RESPUESTA. Mismo mensaje, mismo estado, mismas cabeceras. Lo que cambian es cuánto tarda, o qué queda escrito, o en qué orden pasan las cosas — y eso no lo ve una aserción sobre un status. La suite no lo dice; mutar el código sí.

Y SU COROLARIO, QUE ES NUEVO: NO TODA MUTACIÓN QUE SOBREVIVE ES UN HUECO. En el 565, sacar el borrado de los passkeys fuera de la transacción no rompía nada, y la razón es que con el fallo lanzado dentro el borrado no se ejecuta en ninguno de los dos casos: son observacionalmente equivalentes. Se anotó en el test en vez de inventarle una prueba imposible. Forzar un test ahí habría sido inventar uno para que un número quedara mejor.

MEDIR EL TIEMPO SERÍA EL ARREGLO EQUIVOCADO, y es lo que hace utilizable la lección anterior. Un test que compara duraciones es intermitente en un runner cargado, y un check intermitente se acaba ignorando entero, que es la lección del 62. Lo determinista es DE CUÁNTOS BCRYPT está hecha la duración, así que lo que se cuenta son invocaciones de Hash::check.

UN MENSAJE CORRECTO QUE DICE QUÉ HACER Y NO DEJA HACERLO, tres veces y en tres sitios distintos. El check de SPRINT_CONTEXT decía que escribir una línea en el cuerpo del PR le dejaba pasar, y el workflow no volvía a leer ese cuerpo (576). El guardián de la copia decía «repite con --min-ratio=0» y el guion que lo lanzaba no tenía forma de pasarle argumentos (553). Y ADR-018 nombra su campo del blob en español veinticuatro veces, siete días antes de que esa regla se retirara (571). Las tres son la misma forma: un texto exacto y un camino cerrado. La tercera se desarmó ANTES de que mordiera, que es la primera vez que este proyecto llega a tiempo.

VERIFICAR EN NAVEGADOR ENCUENTRA LO QUE NINGÚN TEST VE, tres veces y una de ellas grave. toLocaleDateString sin locale pinta el 9 de octubre como 9/10/2026, que en una pantalla en español se lee como 9 de septiembre y está mal por un mes sin parecerlo (561). Al pulsar el passkey sin autenticador, el diálogo del sistema se queda esperando, y el formulario de la contraseña maestra estaba deshabilitado mientras tanto: el camino principal quedaba inalcanzable en la única pantalla cuyo trabajo es volver a entrar (562). Y dos botones a cero píxeles, que solo se ve mirando (604).

UN DOBLE ESCRITO PARA LA MITAD DEL PROBLEMA MODELA MAL LA OTRA MITAD, EN SILENCIO. El autenticador falso se escribió cuando solo existía el registro, y modelaba la aserción como el caso pobre. Al llegar el desbloqueo, seis tests fallaron a la primera por un motivo que no tenía nada que ver con el desbloqueo (557).

UNA DECISIÓN QUE PARECÍA DE ESTILO RESULTÓ FORZADA POR UNA RESTRICCIÓN. El salt del HKDF parecía elegible, y el correo parecía la opción por simetría con ADR-010. No lo era: el hash de autenticación se deriva ANTES de tener token, así que cualquier otro salt habría que pedirlo, y eso obliga a un oráculo de enumeración de cuentas o a guardarlo en el dispositivo, que mata el desbloqueo desde un segundo contenedor. La simetría resultó ser una consecuencia y no el argumento.

Y LA VERIFICACIÓN CONTRA UNA IMPLEMENTACIÓN DE VERDAD LLEGÓ TARDE Y VALIÓ LA PENA. Hasta el 566, todo el passkey estaba probado contra un doble escrito a mano: eso demuestra qué hace nuestro código CON una respuesta, no que una implementación real dé esa respuesta. El autenticador virtual de CDP confirmó las seis propiedades asumidas, incluida una que no es obvia —los bytes llegan ya en el registro, así que el camino de dos pasos existe para autenticadores que no lo hacen—. Y el iPhone y Windows Hello confirmaron lo que ninguna de las dos cosas podía: que funciona en el hardware para el que se construyó, y que Windows Hello devuelve el PRF, que es el primer autenticador de plataforma no-Apple confirmado en este proyecto.
