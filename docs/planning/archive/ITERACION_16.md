ITERACIÓN 16 — Historial y lecciones aprendidas

Archivo de la Iteración 16, cerrada el 10 de septiembre de 2026. Recoge la intención de cada issue y lo que se aprendió al cerrarlo.

Está archivado, no muerto. Es la iteración en la que la vault se abre con la cara, y también aquella en la que el hallazgo más repetido no vino de un test que fallara sino de MUTACIONES QUE NO ENCONTRABAN NADA: cinco veces, en cinco sitios sin relación entre sí, una propiedad afirmada en un comentario y protegida por nada.

El objetivo se cumplió: se desbloquea con Face ID en el iPhone real y con Windows Hello en el portátil, sobre la instancia de kastor.

Nota de formato: prosa plana sin Markdown, por la convención del proyecto. Salvo la última sección, LO QUE DECÍA STATUS.md, que conserva el Markdown con que se escribió allí.


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


LO QUE DECÍA STATUS.md

Hasta el 11 de septiembre de 2026, STATUS.md conservaba el objetivo, los criterios de salida y los riesgos de todas las iteraciones cerradas, y llegó a 288 KB: ya no cabía en una lectura. El 663 los sacó de allí por la regla de una sola fuente de docs/GUIDE.md, y lo que decía de esta iteración está aquí copiado sin tocar, salvo los enlaces relativos, ajustados a esta carpeta.

EL OBJETIVO QUE LLEVABA STATUS.md

**Iteración 16: cerrada el 10 de septiembre de 2026.** Objetivo cumplido: *la vault se abre con la cara.*

**Veintinueve issues cerrados** sobre un plan de diecinueve: los diecinueve, siete que aparecieron por el camino y tres de deuda arrastrada de la 15. `ADR-021` deja de ser una decisión escrita para ser código: se desbloquea con **Face ID en el iPhone real** y con **Windows Hello en el portátil**, sobre la instancia de kastor.

**Siete de los ocho criterios cumplidos, y uno cumplido en su propósito pero no en su enunciado literal.** El detalle y las lecciones están en [docs/planning/archive/ITERACION_16.md](ITERACION_16.md).

**Y es la iteración en la que el hallazgo más repetido no vino de un test que fallara, sino de mutaciones que no encontraban nada.** Cinco veces, en cinco sitios sin relación: la separación de dominio de la clave de recuperación (#574), la segunda barrera del envoltorio (#559), las protecciones contra el canal de tiempo del login y de la recuperación (#587), el orden de publicar la sesión (#562) y dos tests míos del camino offline (#564). Las cinco comparten forma: **no cambian ninguna respuesta**. Mismo mensaje, mismo estado, mismas cabeceras — lo que cambian es cuánto tarda, o qué queda escrito, o en qué orden pasan las cosas.

**Su corolario, que es nuevo: no toda mutación que sobrevive es un hueco.** En el #565 una era observacionalmente equivalente, y se anotó en el test en vez de inventarle una prueba imposible.

**Un mensaje correcto que dice qué hacer y no deja hacerlo, tres veces.** El check de `SPRINT_CONTEXT` (#576), el guardián de la copia (#553) y `ADR-018` nombrando su campo en español siete días antes de que esa regla se retirara (#571). La tercera se desarmó **antes** de que mordiera, que es la primera vez que este proyecto llega a tiempo.

**Verificar en navegador encontró lo que ningún test veía, tres veces**, y una era grave: al pulsar el passkey sin autenticador, el formulario de la contraseña maestra quedaba deshabilitado esperando un diálogo que quizá nadie iba a resolver — el camino principal inalcanzable en la única pantalla cuyo trabajo es volver a entrar (#562).

**Y una decisión que parecía de estilo resultó forzada.** El *salt* del HKDF parecía elegible; no lo era: el hash de autenticación se deriva **antes** de tener token, así que cualquier otro habría que pedirlo — y eso obliga a un oráculo de enumeración de cuentas o a atarlo a un dispositivo.
**Iteración 16: en curso, abierta el 10 de septiembre de 2026.** Objetivo: *la vault se abre con la cara.*

**Diecinueve issues planificados**, del #554 al #572, en seis bloques, más tres de deuda arrastrada: #546, #550 y #553. `ADR-021` decide desbloquear la vault con un **passkey**: un tercer envoltorio de la misma clave de vault, derivado de la extensión **PRF** de WebAuthn, que se abre con Face ID, Touch ID o Windows Hello. **La contraseña maestra sigue siendo el camino principal y el passkey es un atajo revocable**, exactamente como la clave de recuperación.

**El problema que resuelve no es la comodidad, es la entropía.** `ADR-007` decidió que el token vive solo en memoria, así que **recargar es un bloqueo**, y una PWA en iOS se recarga sola más de lo que nadie querría. Una contraseña maestra que se teclea cuarenta veces al día en una pantalla táctil acaba siendo una contraseña maestra más corta.

**Lo que hace que esto no invente nada:** `ADR-008` decidió que la maestra no cifra los items sino que **envuelve** una clave de vault aleatoria, y `ADR-010` ya explotó esa estructura una vez para la clave de recuperación. Este es el mismo movimiento por **tercera** vez.

**La decisión que un revisor va a mirar primero: el servidor no verifica WebAuthn.** Recibe un hash donde esperaría una firma. El argumento de `ADR-021` §2.4 es que el PRF **solo se produce tras la verificación de usuario**, así que poseerlo *es* la prueba —igual que poseer la clave de recuperación—, y quien consiga un token sin él se lleva bytes opacos: sin la clave de envoltura no se abre nada, y esa clave no está en el servidor. Lo que se ahorra a cambio es **ninguna librería WebAuthn en el servidor**: nada de CBOR, COSE ni cadenas de atestación en una API que hoy solo guarda blobs y hashes. La premisa de la que depende —que el token solo trae *ciphertext*— queda escrita como trigger de reevaluación.

**La decisión que parecía de estilo y resultó forzada: el *salt* del HKDF es el correo.** La alternativa —un *salt* aleatorio— habría evitado que cambiar el correo revoque los passkeys, que es un modo de fallo conocido y molesto. No se puede: el hash de autenticación se deriva **antes** de tener token, y cualquier otro *salt* habría que pedirlo, lo que obliga a un endpoint público indexado por correo —un oráculo de enumeración de cuentas— o a guardarlo en el dispositivo, lo que mata el desbloqueo desde un segundo aparato. Se asume la consecuencia y `ADR-014` gana un paso.

**Varios passkeys y no uno, decidido por lo que viene después.** Una credencial de iCloud Keychain cubre iPhone, iPad y Mac, y no existe en Chrome ni en Firefox sobre Windows — que es donde se ha pedido la extensión. Con una sola, activarla en el portátil apagaría el móvil, y ese límite no se descubre leyendo: se descubre perdiendo el acceso.

**Y lo que la iteración desbloquea sin ser su objetivo: la extensión de navegador**, que llevaba dos iteraciones parada porque Manifest V3 mata el service worker de fondo y eso choca con `ADR-007`. Con el passkey, la extensión **no custodia la clave: la re-deriva con un toque biométrico**, y que el service worker muera deja de importar. El dato está verificado —desde Chrome 122 y Firefox 150 una extensión puede indicar un `rpId` de sus `host_permissions`— y lo que queda por medir decide la forma de `ADR-022`, en la 17.

**Lo que NO se toca, y merece decirse porque es la mitad del valor: el blob.** `ItemContent` no gana ningún campo, no hay migración de contenido, y **ni la versión del esquema criptográfico ni la del formato `.evault` suben**. Esto no es contenido: es una forma más de llegar a la clave que lo abre.

**Y una ausencia razonada: el #531 no entra.** Es deuda del import y se va a la 17, porque toca `import.ts` y el detector de formato, que es justo lo que la 17 reescribirá para deduplicar. Arreglarlo ahora sería tocar el mismo fichero dos veces, y no corre prisa: **no se importa nada hasta que el dedupe exista**, decidido el 10 de septiembre con la vault vacía delante.

LOS CRITERIOS QUE LLEVABA STATUS.md

### Iteración 16, cerrada el 10 de septiembre de 2026

**Siete cumplidos y uno cumplido en su propósito pero no en su enunciado literal.** Se dice así en vez de estirar la definición.

1. **Face ID abre la vault real sin teclear la maestra.** `Cumplido`, sobre kastor con la iteración desplegada, y con recibo: `last_used_at` a las 12:34:35, un minuto después de crear el passkey, así que el desbloqueo pasó por el servidor (#568).
2. **La misma passkey abre desde donde nunca se dio de alta.** `Cumplido en su propósito, NO en su enunciado`. Pedía un segundo dispositivo Apple; se probó **la aplicación instalada del mismo iPhone**, que nunca registró nada. Y demuestra la propiedad mejor que un segundo aparato, porque en ese teléfono el caché offline **no** se comparte entre Chrome y la PWA (#546) y el passkey **sí** — solo puede ser así porque la credencial vive en el llavero del sistema y el envoltorio en el servidor. Es la Opción A de `ADR-021` §2.6 en el peor caso: con la B, el envoltorio en IndexedDB, la PWA no habría abierto. **Lo que no se probó** es que iCloud Keychain sincronice a otro aparato (#568).
3. **Varios conviven y revocar uno no toca al otro.** `Cumplido`, con Windows Hello. Con los dos: dos credenciales, dos hashes y **dos envoltorios distintos de la misma clave de vault**. Y los relojes lo dicen: el del iPhone se usó a las 12:43:46 —después de crear el de Windows— y a las 12:45:27, **después de revocarlo** (#568).
4. **Revocar deja la cuenta exactamente como antes.** `Cumplido`: tras la revocación, `users=1 vaults=1 vault_members=1` intactos (#559, #568).
5. **Rotar la maestra NO los revoca y cambiar el correo SÍ**, cada cosa dicha donde se hace, con tests que fallan si el aviso desaparece. `Cumplido` (#565).
6. **Dos tests que fallan si se rompe lo que sostiene el diseño.** `Cumplido`: la separación de dominio, comprobada usando el hash **como** clave, y `userVerification: 'required'` (#555, #556).
7. **Los tres verificadores ejecutados el día del cierre.** `Cumplido`: `verify-passkey` 4 de 4 en 33 s; `verify-large-vault` con sus ocho límites sobre **370 entradas**, con la revisión marcando 205 de 308; y `verify-auto-lock` con sus ocho casos (#567, #572).
8. **Una copia hecha después de activar un passkey, restaurada, y el passkey sigue abriendo.** `Cumplido, y entero`. La copia de producción lleva las cinco tablas con el envoltorio y el hash dentro. Y el ciclo se probó completo en local con un PRF conocido: instancia destruida hasta `users=0 passkeys=0`, restaurada, y el desbloqueo devolvió **el mismo envoltorio byte a byte** más un token (#558, #572).

**El criterio 2 es el que más enseña, y por el motivo contrario al esperado:** se cumplió por una vía que no estaba en su enunciado, y esa vía demostraba más. El mismo teléfono que rompió la promesa del caché en el #546 validó la decisión del envoltorio en el #578.
### Iteración 16, en curso

**Ocho criterios, escritos al abrirla el 10 de septiembre de 2026.** Ninguno evaluado todavía.

1. **La vault real se abre en el iPhone con Face ID, sin teclear la maestra.** Sobre la instancia de kastor y la aplicación instalada, no sobre `localhost` ni sobre Safari de escritorio (#568).
2. **La misma passkey abre desde un segundo dispositivo Apple donde nunca se dio de alta.** Es el criterio que demuestra que guardar el envoltorio en el servidor era la decisión correcta; si falla, la Opción A de `ADR-021` §2.6 estaba equivocada y hay que decirlo en vez de estirar la definición (#568).
3. **Un segundo passkey en Chrome sobre Windows convive con el del iPhone, y revocar uno no toca al otro.** Es lo que la Opción B de `ADR-021` §2.5 habría hecho imposible (#568).
4. **Revocar deja la cuenta exactamente como antes de activarlo**, y la contraseña maestra sigue abriendo (#559).
5. **Rotar la maestra NO revoca los passkeys y cambiar el correo SÍ**, cada cosa dicha en la pantalla donde se hace, con tests que fallan si cualquiera de los dos avisos desaparece (#565).
6. **Dos tests que fallan si se rompe lo que sostiene el diseño**: uno si `PWK` y `PAH` pierden la separación de dominio —escrito comparando los dos valores entre sí, no contra una constante grabada—, y otro si `userVerification` deja de ser `required` (#555, #556).
7. **`verify-passkey.mjs` en verde sobre autenticador virtual, y los tres verificadores ejecutados el día del cierre.** No heredados de antes en la iteración: es la lección del #543, donde un renombrado dejó tres de ocho casos en rojo y nada lo habría dicho (#567, #572).
8. **Una copia hecha después de activar un passkey, restaurada en instancia limpia, y el passkey sigue abriendo.** `BackupContents` tiene lista explícita de tablas y **una tabla nueva no entra sola**; si nadie la añade, la restauración deja una vault que abre con la maestra y no con la cara, y eso no se descubre hasta que hace falta (#558, #572).

**El criterio 2 es el que más dice, y es el único que ningún test puede sustituir.** Mide una propiedad que no está en el código sino en la decisión: que el envoltorio viva en el servidor y no en el dispositivo. Un autenticador virtual no puede fingir la sincronización de iCloud Keychain.
