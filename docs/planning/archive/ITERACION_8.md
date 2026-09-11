ITERACIÓN 8 — Historial y lecciones aprendidas

Archivo de la Iteración 8, cerrada el 18 de agosto de 2026. Recoge la intención de cada issue y lo que se aprendió al cerrarlo.

Está archivado, no muerto. Es la iteración en la que lo que guarda las contraseñas dejó de funcionar por fe y pasó a estar comprobado. Si alguna vez hay que restaurar una copia, rotar la contraseña maestra o entender por qué la suite se pone en rojo sin motivo aparente, merece la pena leer esto antes de investigar desde cero.

El objetivo se cumplió: se restauró una copia con las 370 contraseñas reales y se abrió la vault desde ella, y la contraseña maestra se rotó sobre la instancia de verdad en dos segundos.

Nota de formato: prosa plana sin Markdown, por la convención del proyecto. Salvo la última sección, LO QUE DECÍA STATUS.md, que conserva el Markdown con que se escribió allí.


QUÉ SE HIZO

Ocho issues cerrados, tres de ellos abiertos por el camino.

Bloque 0, la planificación. El 262.

Bloque 1, que el verde volviera a significar algo. El 259, el test intermitente, que hubo que arreglar DOS VECES y lo pilló el propio criterio de salida.

Bloque 2, que las copias demostraran que sirven. El 263, que el backup subía copias vacías sin protestar. El 264, que su registro vivía en /tmp. El 265, que una noche sin copia no producía ningún efecto visible.

Bloque 3, verificar sobre los datos reales. El 266, restaurar una copia con las 370 contraseñas. El 267, rotar la contraseña maestra sobre la instancia real.

Fuera de plan salieron el 276, el 277 y el 281.


LO QUE APARECIÓ MIDIENDO, Y NO ESTABA EN NINGÚN DOCUMENTO

El backup subía copias vacías sin protestar. En el destino remoto había ocho copias: siete de 2.378 bytes, que son la vault vacía, y una de 210.855 con las contraseñas dentro. El guion comprobaba cuatro cosas y ninguna miraba si la copia contenía algo. Con treinta copias de retención y un cron diario, un vaciado que nadie notara en treinta días habría rotado las treinta buenas y dejado treinta copias de nada, todas correctamente cifradas y correctamente subidas.

El registro del backup vivía en /tmp, en una máquina que ADR-013 decide apagar a propósito. Se comprobó de la peor manera y a la vez de la mejor: el primer reinicio del día se llevó el registro entero, con la copia del cron de la madrugada y la manual de las diez y media dentro.

El intermitente del 259 no era ninguno de los tres candidatos que el issue listaba. Era el timeout de Vitest sin configurar, o sea cinco segundos, contra un test que tarda 916 milisegundos en máquina ociosa y 2.643 con carga.

Y el 276, que es el hallazgo que más pesa y el que más cerca estuvo de costar datos: compose.yaml fijaba name: evault DENTRO del propio fichero, así que era el mismo en cualquier clon. Un segundo clon en la misma máquina se apropiaba de los contenedores y volúmenes del primero, y un down -v desde él se habría llevado las 370 contraseñas sin que nada avisara.


LECCIONES DE MÉTODO, Y SON LAS QUE MÁS VALEN

LA INFORMACIÓN QUE DETECTARÍA EL PROBLEMA SE PRODUCE Y SE DESCARTA, y esta iteración lo vio dos veces en el mismo repositorio. BackupCommand calcula las filas copiadas y las imprime, y offsite-backup.sh lo invocaba con mayor que dev null. Es palabra por palabra el fallo que dejó al 259 sin identificar durante una iteración entera, cuando se filtró la salida de la suite y se perdió el nombre del único test que falló. Dos meses de diferencia, misma forma.

UNA EXPLICACIÓN QUE ENCAJA CON EL SÍNTOMA NO ES UN DIAGNÓSTICO. La planificación afirmó que los ocho ficheros del intermitente derivaban claves con PBKDF2 sin sustituir. Encajaba: eran lentos, eran de criptografía, el proyecto tiene fama de eso. Era falso, y bastaba abrir el helper que usan para verlo, porque su comentario dice que importa 32 bytes justamente para NO derivar. Se publicó en un issue, en STATUS.md y en el puente antes de que nadie abriera el fichero.

UN NULL NO ES UNA RESPUESTA: PUEDE SER UNA PREGUNTA MAL HECHA. Se consultó User::first()->recovery_wrapped_key, salió null y se abrió el 277 afirmando que la instancia real no tenía clave de recuperación. Esa columna está en vault_members, y Eloquent devuelve null para un atributo inexistente SIN dar ningún error. La clave estaba desde antes, y lo demostraban las propias copias. El issue no encontró un agujero: lo abrió unos minutos —la clave vieja quedó invalidada al generar otra— y lo cerró.

MUTAR CADA CAMBIO POR SEPARADO, PORQUE EL QUE ARREGLA NO ES SIEMPRE EL QUE UNO CREE. El arreglo del 259 tenía tres piezas y parecían las tres necesarias. Mutándolas una a una resultó que subir el timeout de Testing Library no arreglaba nada: revertirlo deja la suite en verde treinta pasadas de treinta. Quien lo hubiera dado por bueno habría escrito en el código que las tres corrigen, y el siguiente en leerlo habría protegido la línea que no toca. Es la misma lección que el 240 dejó en la iteración anterior.

UN NÚMERO MEDIDO EN CONDICIONES QUE NO SON LAS REALES ES UNA SUPOSICIÓN CON DECIMALES, y esta costó arreglar el mismo issue dos veces. El timeout del 259 se fijó en quince segundos midiendo el test más lento CORRIENDO SOLO SU FICHERO: 916 milisegundos. Pero un test aislado no compite con los otros cuarenta ficheros de la suite, y el mismo test dentro de una pasada completa tarda 2.242. El margen real era 6,7 veces y no las 16 que aparentaba, así que bajo carga volvió a caer — esta vez el test de desbloqueo, que es el único que deriva con PBKDF2 de verdad. Encima el número se había elegido mirando el más lento DE LOS QUE FALLABAN y no el más lento de la suite, de modo que subir el techo no arregló el problema: movió el cuello de botella. Lo encontró el criterio de salida al ejecutarlo, que es justamente para lo que están.

UNA PRUEBA PUEDE COINCIDIR CON EL CÓDIGO POR EL MOTIVO EQUIVOCADO, que es la peor manera de tener razón. Al verificar el aviso de copias en kastor se forzó la ventana a cero días para que la copia contara como vieja; con ventana cero cualquier uptime la supera, así que las dos ramas cayeron por la del cron roto. La prueba decía lo que se esperaba oír sin comprobar nada.

UNA HERRAMIENTA DE VERIFICACIÓN QUE ENSUCIA PRODUCCIÓN NO SE USA. Ensayar ese mismo aviso escribía avisos inventados en el registro de la instancia, porque el log seguía apuntando al de verdad. Hubo que limpiarlo a mano dos veces, y la segunda dejó claro que no era un descuido sino un defecto: si probar algo cuesta ensuciar el sitio donde se mira, no se prueba.

EL PELIGRO APARECE JUSTO CUANDO SE VERIFICA LO CONTRARIO. El 276 no se encontró auditando el Compose: se encontró montando la instancia de restauración que pedía el 266. Es decir, el issue que existe para comprobar que las copias sirven fue el que topó con la forma de destruirlas.

UN CRITERIO QUE CUESTA UNA HORA DE RELOJ SE POSPONE SIEMPRE. El bloqueo por inactividad en navegador lleva dos iteraciones sin verificarse, y no por dificultad técnica: exige cuatro esperas de quince minutos delante de una pantalla. Se saca a utillaje en el 281, con una condición que no se puede negociar — quince minutos reales y estrangulamiento real, porque falsear el reloj reproduce lo que los tests ya cubren.


LO QUE CAMBIÓ DE FONDO, Y NO ES CÓDIGO

Las copias dejaron de ser un acto de fe. Antes de esta iteración existían, salían de la máquina y estaban cifradas, y nadie había abierto una vault desde ninguna. Ahora se restauró una con las 370 contraseñas dentro en una instancia limpia y se leyeron items descifrados en un navegador. El procedimiento entero está escrito en la sección 7 de DEPLOYMENT.md, con las tres cosas que costaron tiempo: que no hace falta descifrar nada, que la ruta dentro del contenedor no lleva api delante, y el aviso del nombre de proyecto.

Y ADR-008 dejó de ser un argumento para pasar a ser una medición. Rotar la contraseña maestra sobre 370 contraseñas reales tardó DOS SEGUNDOS, y las huellas tomadas antes y después lo explican: cambiaron password y wrapped_key, y el ciphertext de los items quedó idéntico byte a byte. La contraseña maestra no cifra los items, solo envuelve una clave de vault de 256 bits, así que rotar reenvuelve 32 bytes. Con la consecuencia que más se malinterpreta ya confirmada sobre datos reales: recovery_wrapped_key tampoco cambió, de modo que rotar NO invalida la clave de recuperación.


LO QUE QUEDÓ FUERA, Y POR QUÉ

El bloqueo por inactividad verificado en navegador, issue 260, por segunda iteración consecutiva. Hay una observación de uso real —su autor vio la vault bloquearse sola y tuvo que volver a escribir la contraseña maestra— y eso confirma que el mecanismo dispara fuera de los tests, pero sin horas apuntadas no es una verificación y se dice en vez de estirarlo. La salida es el 281, automatizarlo.

La conversión del código a inglés, issue 251, que abre la Iteración 9 con el volumen ya corregido: 805 nombres de test y unas 3.870 líneas de comentario en 214 ficheros, no los 547 que decía el issue.

Y el acceso a la vault desde fuera de la red local, issue 229, con el mismo criterio con que se dejó fuera de la 7.


LO QUE DECÍA STATUS.md

Hasta el 11 de septiembre de 2026, STATUS.md conservaba el objetivo, los criterios de salida y los riesgos de todas las iteraciones cerradas, y llegó a 288 KB: ya no cabía en una lectura. El 663 los sacó de allí por la regla de una sola fuente de docs/GUIDE.md, y lo que decía de esta iteración está aquí copiado sin tocar, salvo los enlaces relativos, ajustados a esta carpeta.

EL OBJETIVO QUE LLEVABA STATUS.md

**Iteración 8: cerrada el 18 de agosto de 2026.** Objetivo cumplido: *lo que ya guarda contraseñas reales se puede comprobar, en vez de darse por bueno.*

**Ocho issues cerrados**, tres de ellos abiertos por el camino: #276 —un segundo clon podía borrar los datos del primero—, #277 —que resultó ser un falso positivo por una consulta mal hecha— y #281, automatizar el criterio que lleva dos iteraciones sin cumplirse.

**Lo que cambió de fondo:** las copias dejaron de ser un acto de fe. Existían, salían cifradas de la máquina y nadie había abierto una vault desde ninguna; ahora se restauró una con las 370 contraseñas dentro y se leyeron items descifrados en un navegador. Y `ADR-008` dejó de ser un argumento para ser una medición: **rotar la contraseña maestra sobre 370 contraseñas reales tardó dos segundos**, con el ciphertext de los items idéntico byte a byte antes y después.

Su historial y sus lecciones están en `docs/planning/archive/ITERACION_8.md`. La que más se repite, y con dos apariciones en el mismo repositorio: **la información que detectaría el problema se produce y se descarta** — `BackupCommand` calculaba las filas copiadas y el guion lo invocaba con `>/dev/null`, que es palabra por palabra el fallo que dejó a #259 sin identificar una iteración entera.

Objetivo original:

La Iteración 7 metió 370 contraseñas reales en una instancia propia y con eso cambió de categoría todo lo demás: hasta entonces cualquier fallo era reproducible, y desde el 18 de agosto no lo es. Lo que esa iteración **no** hizo —y lo dijo al cerrarse, en vez de estirar la definición— es comprobar que las tres cosas que protegen esos datos funcionan de verdad: la copia de seguridad, la rotación de la contraseña maestra y el bloqueo por inactividad. Dos de sus ocho criterios de salida se quedaron ahí.

No es funcionalidad nueva y es deliberado: `ADR-009` §4 pone «lo que hace el producto fiable para quien lo usa de verdad» por delante de todo lo demás, y ahora mismo hay un usuario con todas sus contraseñas dentro.

**Nueve issues en cinco bloques.** Bloque 0, la planificación: #262. Bloque 1, que el verde vuelva a significar algo: #259. Bloque 2, que las copias demuestren que sirven: #263, #264 y #265. Bloque 3, verificarlo sobre los datos reales: #266, #267 y #260. Bloque 4, el cierre: #268. No hace falta ADR: `ADR-013` §5.2 ya decidió que las copias se comprueban restaurando y no el día que hagan falta, y esta iteración es aplicar esa decisión.

**La decisión de secuenciación, que es la apuesta de esta iteración: restaurar va antes que rotar.** Rotar la contraseña maestra sobre 370 items reales es la operación más peligrosa del plan —si se queda a medias, el acceso se pierde—, así que no se hace hasta haber restaurado de verdad una copia y haber visto la vault abrirse desde ella. Es la forma de la Iteración 7, el bloque de fiabilidad antes del despliegue, aplicada ahora a una máquina donde el fallo ya no es reproducible. Y **#259 va antes que todo**, porque comprobar el backup contra una suite que falla dos de cada tres veces bajo carga es construir sobre arena.

**Lo que apareció al planificar, y que no estaba en ningún documento.** Cuatro hallazgos. Los tres primeros son de la misma familia que la lección central de la Iteración 7 —algo plausible escrito en un sitio con autoridad que nadie volvió a comprobar— y **dos de ellos son literalmente el mismo fallo de método**:

1. **El intermitente de #259 está reproducido, y no era ninguno de los tres candidatos que el issue listaba.** Treinta pasadas capturando la salida entera: **20 en rojo y 10 en verde**, y no repartidas al azar — las rojas caen exactamente en la ventana en que la máquina estaba ocupada con las otras mediciones de esta planificación, y la suite volvió sola al verde al retirarlas, sin tocar una línea de código. La causa es **presión de CPU contra unos timeouts sin configurar**: el de Vitest estaba en su valor por defecto de 5.000 ms y el test más lento tarda **916 ms en máquina ociosa y 2.643 ms con carga**, un margen que la contención se come. El error dominante es `Test timed out in 5000ms`, 52 veces. **Corregido sobre la marcha al empezar #259, porque la primera explicación era falsa**: se escribió que los ocho ficheros derivaban claves con PBKDF2 sin sustituir, y el helper que usan importa 32 bytes justamente para evitarlo — el más frágil de todos no deriva nada. Lo que tienen en común no es criptografía sino que renderizan React en jsdom y teclean con `userEvent`; ninguno está en `lib/`. Y el nombre que faltaba: `ItemDialog.test.tsx > crear > guarda una entrada nueva con lo que se ha escrito`, en 20 de las 30 pasadas. Importa más de lo que parecía porque **los runners de CI tienen 2 núcleos**: lo que aquí hay que provocar, allí es la condición normal.
2. **El backup sube copias vacías sin protestar.** En el destino remoto hay ocho copias: siete de **2.378 bytes** —la vault vacía— y una de **210.855**, que es la única con las contraseñas dentro y se hizo a mano. `offsite-backup.sh` comprueba cuatro cosas y ninguna mira si la copia contiene algo, así que una base de datos vacía pasa las cuatro y escribe el mismo «copia cifrada y subida». Con `KEEP_REMOTE=30` y un cron diario, **un vaciado que nadie note en 30 días rota las 30 copias buenas**. Y el detalle que lo convierte en la misma lección: `BackupCommand` **sí** calcula las filas copiadas y las imprime, pero el script lo invoca con `>/dev/null` — la información que detectaría el problema se produce y se descarta, que es palabra por palabra el fallo que dejó a #259 sin identificar durante una iteración (#263).
3. **La evidencia de que el backup corre vive en `/tmp`.** El crontab escribe ahí, y `ADR-013` decide que esa máquina se apaga a propósito. La pregunta «¿cuándo fue la última copia buena?» no tiene forma de responderse en la máquina (#264). Al lado, el caso que nadie cubre: **que el cron no llegue a correr** no produce ningún efecto visible (#265).
4. **#251 dimensiona su trabajo con el 68 % del volumen real**, y se corrige ahora que está medido para que la Iteración 9 lo tome con la cifra buena: **805 nombres de test en español** y no 547, porque faltaban los 260 de `api`; **214 ficheros** con prosa española y no 192, porque faltaban `api/app` entero y `scripts` entero; **~3.870 líneas de comentario**, cifra que no constaba en ningún sitio; y **1.600 líneas** de infraestructura a jubilar, no 1.585.

**Lo que queda fuera a propósito.** La conversión del código a inglés (#251), que da para una iteración entera y va a la 9. Y el acceso a la vault desde fuera de la red local (#229), con el mismo criterio con que se dejó fuera de la 7: su decisión es de alcance y no de esta iteración.

LOS CRITERIOS QUE LLEVABA STATUS.md

### Iteración 8, cerrada

Ocho criterios. **Siete cumplidos y uno sin verificar**, y ninguno dado por bueno leyendo: los que se podían ejecutar se ejecutaron el día del cierre. El que falta es el mismo que quedó sin cumplir en la Iteración 7, y se dice en vez de estirar la definición por segunda vez.

**Dos de ellos fallaron al evaluarlos, y eso es exactamente para lo que están.** El 1 destapó que el arreglo de #259 movía el cuello de botella en vez de quitarlo, y hubo que hacerlo dos veces. El 2 estaba a medias por no tener Docker en la máquina de desarrollo, y se completó levantando una instancia aparte en el servidor.

Ocho criterios. Se mantiene la regla de las tres iteraciones anteriores: **si un criterio se puede comprobar con un comando, el criterio es ese comando** — y el comando vive en el repositorio. Los demás se evalúan **ejecutándolos**, nunca leyendo código ni diffs.

Tres de ellos tienen la forma que estrenó la Iteración 7 —el 1, el 2 y el 4 no describen un estado deseable sino **una comprobación que tiene que fallar cuando el código se rompe**—, porque es la única que distingue un verde de un cero tranquilizador.

1. ✅ **La suite pasa 30 veces seguidas con la máquina cargada a propósito.** `./scripts/suite-under-load.sh` da **30 verdes de 30**, contra las 20 rojas de 30 del punto de partida. **Y costó dos intentos**: el primer arreglo fijó el timeout midiendo el test más lento *corriendo solo su fichero* —916 ms— cuando dentro de una pasada completa tarda **2.242 ms**, así que el margen real era 6,7x y no 16x. Al evaluar este criterio salieron 6 rojas de 14 y hubo que rehacerlo contando desde el test más caro **de la suite entera** (#259).
2. ✅ **Vaciar la base de datos y lanzar el backup FALLA y no sube nada.** Verificado en tres niveles: 7 tests nuevos, dos mutaciones que caen —sin la comprobación 3 tests, sin el desglose 1— y el guion completo ejecutado contra una **instancia de prueba con Compose real**, que sale con código 1 sin escribir ninguna copia y sin llegar a llamar a `age` ni a `rclone`. Con un solo item dentro, el mismo comando sí escribe y reporta `Filas copiadas: 4` (#263).
3. ✅ **El log del backup sigue estando después de reiniciar kastor.** Con dos reinicios el mismo día, y el arranque quedó **entre** las dos líneas del registro: la de las 13:14 sobrevivió y la de las 13:18 se añadió detrás. El primer reinicio, anterior al despliegue, demostró lo contrario: `/tmp/evault-backup.log` desapareció con la copia del cron de la madrugada dentro (#264).
4. ✅ **Parar el cron produce un aviso visible, y con el cron corriendo no avisa.** Las dos ramas provocadas en kastor con la **misma copia vieja**, cambiando solo el uptime: con la máquina 8 días encendida avisa del cron roto y sale con error; recién arrancada dice que estuvo apagada y no alarma. La primera verificación de esto **no demostraba nada** —se forzó la ventana a cero días, y con ventana cero cualquier uptime la supera— y hubo que rehacerla (#265).
5. ✅ **Una copia con las 370 contraseñas se restaura en una instancia limpia y la vault se abre desde ella.** Restaurada, y comprobado **en navegador**: 370 items y contraseñas leídas descifradas, que es lo que ningún conteo sustituye. Quince minutos de reloj en total, de los que `evault:restore` son **diez segundos**. La copia usada no es del cron sino del guion lanzado a mano, y la clave de recuperación no se probó contra lo restaurado — probarla **cambia la contraseña maestra**, así que su sitio es una instancia desechable y pasa a la 9 (#266).
6. ✅ **La contraseña maestra rotada sobre la instancia real.** Hecho el 18 de agosto y **en dos segundos** con 370 contraseñas dentro. Las huellas tomadas antes y después lo demuestran mejor que cualquier conteo: `password` y `wrapped_key` cambiaron, y el **ciphertext de los items quedó idéntico byte a byte** — es `ADR-008` en producción, reenvolviendo 32 bytes en vez de recifrar la vault. Y `recovery_wrapped_key` **tampoco cambió**, lo que confirma medido que rotar no invalida la clave de recuperación. Items legibles después, y vuelta a entrar con la contraseña nueva verificada en navegador (#267).
7. ⬜ **La vault se bloquea sola tras quince minutos en un navegador real** — **NO verificado, y es el único criterio que se queda sin cumplir, por segunda iteración consecutiva.** Hay una observación de uso real: durante la sesión del cierre la vault se bloqueó sola y hubo que volver a escribir la contraseña maestra, lo que confirma que el mecanismo dispara fuera de los tests. Pero **sin horas apuntadas no es una verificación** y no se estira. La causa de fondo no es técnica: exige cuatro esperas de quince minutos delante de una pantalla, y un criterio que cuesta eso se pospone siempre. Sale a #281, automatizarlo con reloj real (#260).
8. ✅ **Pest, Vitest, Larastan en nivel `max`, los tres comprobadores del repositorio en cero y CI en verde.** 270 tests en la API, 442 en la web, 73 del utillaje, Larastan sin errores, `check-identifiers` y `check-docs` en cero.

LOS RIESGOS QUE LLEVABA STATUS.md

Los riesgos eran un registro acumulado y sus filas no decían de qué iteración eran, así que cada una vino al archivo de la iteración más reciente que cita. Su estado es el que tenía el día que se retiró de STATUS.md, y NO se ha vuelto a comprobar: varias decían «Abierto» de algo ya cerrado. Un riesgo que siga vivo se reescribe en la tabla de la iteración en curso con su estado de hoy, no se copia de aquí.

| Riesgo | Estado | Detalle |
| --- | --- | --- |
| **Un número medido en condiciones que no son las reales** | `Materializado en #259, y costó arreglarlo dos veces` | El timeout de la suite se fijó midiendo el test más lento **corriendo solo su fichero**: 916 ms. Dentro de una pasada completa, compitiendo con los otros 40, el mismo test tarda **2.242 ms**, así que el margen real era 6,7x y no los 16x que aparentaba. Y el número se eligió mirando el más lento **de los que fallaban** en vez del más lento de la suite, de modo que subirlo no quitó el problema: lo movió al único test que deriva con PBKDF2 real. Lo destapó el criterio de salida al ejecutarlo, que es para lo que están. No hay comando para esto: la mitigación es recordar que **una medida tomada fuera de las condiciones reales es una suposición con decimales** (#259) |
| **Una copia de seguridad vacía es indistinguible de una buena** | `Abierto, con issue` | `offsite-backup.sh` comprueba la cabecera de `age`, que `rclone` no falle, que el fichero esté en el destino y la retención — y **ninguna de las cuatro mira si la copia contiene algo**. Una base de datos vacía produce una copia de 2.378 bytes que pasa las cuatro y escribe el mismo «copia cifrada y subida» que una de 210.855 con las 370 contraseñas dentro. Con `KEEP_REMOTE=30` y un cron diario, un vaciado que nadie note en 30 días **rota las 30 copias buenas y deja treinta copias de nada**, todas correctamente cifradas y correctamente subidas. Lo que lo convierte en la misma lección que el riesgo del test intermitente: **la información que lo detectaría ya se produce y se descarta** — `BackupCommand` calcula e imprime las filas copiadas, y el script lo invoca con `>/dev/null` (#263) |
| **La máquina no conserva su propia historia** | `Abierto, con issue` | El log del backup vive en `/tmp` y `ADR-013` decide que esa máquina se apaga a propósito, así que la evidencia de que el cron corrió desaparece en cada arranque: hoy el log tiene una línea. La pregunta que hay que poder responder sobre una copia —«¿cuándo fue la última buena?»— no tiene forma de responderse ahí (#264). Es la segunda vez que esta máquina falla por no conservar su historia; la primera fue #240, con el reloj no monótono entre arranques. Y al lado, el caso que ningún guion cubre porque no llega a ejecutarse: **que el cron no corra no produce ningún efecto visible** (#265) |
| **Arreglar el intermitente sustituyendo la derivación** | `No aplica a #259; vigente para MasterPassword.test.tsx` | Se advirtió como la salida cómoda de #259, y al abrir el código resultó que **no hay derivación que sustituir** en siete de los ocho ficheros que fallan: el riesgo no aplica a ese arreglo. Sigue vigente para cualquier trabajo sobre `MasterPassword.test.tsx`, que sí deriva. Lo que enseñó de verdad: `vi.spyOn` sobre una función real es un patrón que este repositorio ya se ha comido una vez. **Repetiría exactamente el agujero que destapó la Iteración 7** — así fue como `masterPassword.ts` y `recovery.ts` acabaron a cero de cobertura con el total al 89,2 % y sus dos pantallas marcando 90 % y 100 %. Si la solución pasa por no derivar de verdad en tests de pantalla, lo que se deja de ejercitar tiene que quedar cubierto por otro lado y dicho en el issue |
| **Rotar la contraseña maestra sobre 370 items reales** | `Mitigado por secuenciación en la Iteración 8` | Es la operación más peligrosa del plan: toca el material que abre la única vault con datos reales, y un fallo a media rotación deja el acceso perdido en una máquina que no puede repararlo porque no puede leer nada. La mitigación es de orden y no de código, igual que la de #227 en la iteración anterior: **#266 va antes que #267**, es decir que no se rota hasta haber restaurado de verdad una copia y haber visto la vault abrirse desde ella, con la clave de recuperación a mano y comprobada |
| **Un test intermitente convierte el verde en ruido** | `Reproducido al planificar la Iteración 8; abierto` | Al evaluar el criterio 8 de la Iteración 7, la primera pasada dio **1 test en rojo y no se capturó cuál**; el fallo de método que lo dejó sin identificar quedó escrito: se filtró la salida por la línea de resumen y se descartó el nombre, que era la única información que hacía falta. **Al planificar la 8 se hizo bien y quedó reproducido**: 30 pasadas capturando la salida entera, **20 rojas y 10 verdes**, con las rojas cayendo exactamente en la ventana en que la máquina estaba cargada con otras mediciones — y volviendo sola al verde al retirarlas, sin tocar código. **No era ninguno de los tres candidatos que #259 listaba**: ni `setup.test.tsx` ni `AutoLock.test.tsx` aparecen una sola vez. La causa es presión de CPU contra unos timeouts sin configurar —`Test timed out in 5000ms` 52 veces— y el más frágil tiene nombre: `ItemDialog.test.tsx > crear > guarda una entrada nueva con lo que se ha escrito`, 20 de 30, que tarda 916 ms en ocioso y 2.643 con carga. La explicación inicial —que derivaban claves con PBKDF2— **era falsa y se corrigió al empezar el issue**: el helper que usan importa 32 bytes precisamente para no derivar. Sigue sin ignorarse por lo mismo que en #186 —«ocho pasadas en verde en local y fallo a la primera en CI»—, y ahora con un agravante medido: **los runners de CI tienen 2 núcleos**, así que lo que aquí hay que provocar allí es la condición normal (#259) |
