ITERACIÓN 7 — Historial y lecciones aprendidas

Archivo de la Iteración 7, cerrada el 18 de agosto de 2026. Recoge la intención de cada issue y lo que se aprendió al cerrarlo.

Está archivado, no muerto. Es la iteración en la que eVault dejó de ser un proyecto que funciona y pasó a ser la vault donde están las contraseñas de verdad. Si alguna vez hay que tocar la instancia personal, las copias de seguridad, el cambio de correo o el bloqueo por inactividad, merece la pena leer esto antes de investigar desde cero.

El objetivo se cumplió: hay 370 contraseñas reales dentro, cifradas, con copias que salen de la máquina y una actualización probada con vuelta atrás.

Nota de formato: prosa plana sin Markdown, por la convención del proyecto. Salvo la última sección, LO QUE DECÍA STATUS.md, que conserva el Markdown con que se escribió allí.


QUÉ SE HIZO

Dieciocho issues cerrados, seis de ellos abiertos por el camino y siendo buena parte del valor.

Bloque 0, las decisiones antes del código. El 214 planificó la iteración. El 215 fue ADR-013, que decidió dónde vive la instancia personal y en qué condiciones se opera. El 216 fue ADR-014, el cambio de correo electrónico.

Bloque 1, la fiabilidad que faltaba antes de meter contraseñas reales. El 217 y el 218 cubrieron masterPassword.ts y recovery.ts, que estaban a cero. El 219 puso un umbral de cobertura que falla el CI. El 220 hizo que la vault se bloquee sola por inactividad.

Bloque 2, el cambio de correo. El 221 en la API y el 222 en el cliente.

Bloque 3, la instancia. El 223 limpió los restos del despliegue de prueba, el 224 desplegó, el 225 sacó las copias de la máquina cifradas y el 226 probó la actualización con datos dentro.

Bloque 4, el punto de no retorno. El 227 migró las contraseñas reales y el 228 cerró.

Fuera de plan salieron el 230, el 232, el 246, el 251, el 255 y el 259.


LO QUE APARECIÓ MIDIENDO, Y NO ESTABA EN NINGÚN DOCUMENTO

La planificación destapó cinco cosas de la misma familia, y esa familia es la lección central de la iteración.

Los dos módulos que tocan el material que abre la vault tenían CERO cobertura. masterPassword.ts a cero de 40 líneas y recovery.ts a cero de 107, porque los tests de sus pantallas los sustituían con vi.spyOn. No se veía en el total, que estaba al 89,2 por ciento. Y el issue 202 había afirmado por escrito que masterPassword.ts estaba cubierto, usándolo como argumento para no auditar.

El generador de STATUS.md solo leía 100 issues. El repositorio tenía exactamente 100 al cerrar la Iteración 6, así que funcionaba por casualidad; al crear el issue 214 empezó a mentir, y no fallando sino informando de que el documento ya estaba al día.

ADR-012 sección 2.4 prometía un issue para verificar el hosting compartido. Ese issue no existe: nunca se creó.

Dos PR de Dependabot llevaban once y cuatro días abiertos sin que nada los reportara, porque STATUS.md solo lee issues. Se descubrieron porque alguien preguntó por dos números sueltos.

Y la mitad cliente de la mitigación de la rotación de contraseña estaba declarada Mitigado en STATUS.md sin un solo test.


LECCIONES DE MÉTODO, Y SON LAS QUE MÁS VALEN

UNA AFIRMACIÓN EN UN DOCUMENTO QUE LE DA AUTORIDAD ES LA FORMA MÁS CARA DE ESTE FALLO. Las cinco de arriba son la misma cosa: algo plausible escrito en un sitio con autoridad, que nadie volvió a comprobar. Lo nuevo de esta iteración es dónde vivían dos de ellas: en un ADR y en un issue cerrado, que son precisamente los dos sitios que el proyecto trata como definitivos. Un ADR es inmutable por diseño, así que una afirmación falsa dentro de uno no se corrige: se hereda.

UNA MUTACIÓN QUE NO SE APLICA SE PARECE MUCHO A UNA QUE NO SE DETECTA, y esta vez pasó al revés y fue más engañoso. Al probar el script de copias con un destino roto, el script funcionó y subió la copia. Parecía que no detectaba el fallo; lo que ocurría es que el fallo no llegaba a producirse, porque el .env pisaba la variable del entorno. La conclusión cómoda habría sido que el script no servía.

LO QUE ARREGLA UN BUG NO ES SIEMPRE LA LÍNEA QUE UNO CREE. Al corregir la retención de copias se cambiaron dos cosas: el nombre de fichero, que pasó a llevar un número de secuencia, y la función de ordenación. Al mutar cada una por separado resultó que la ordenación casi no importaba: con la secuencia en el nombre, el sort() de antes habría bastado. Sin esa comprobación, el comentario del código habría atribuido la corrección a la línea equivocada y el siguiente que lo leyera habría protegido lo que no toca.

UN TEST QUE PASA CON Y SIN EL ARREGLO NO PROTEGE DE NADA. Al cubrir la fuga de avisos de sonner se escribió el test antes de subir la dependencia, y pasaba igual quitando el arreglo, porque la versión instalada no tenía el fallo. Era un cero tranquilizador dentro de la propia verificación. La subida de versión tuvo que ir en el mismo commit para que el test significara algo.

EL CAMINO QUE NADIE RECORRE SIGUE SIENDO EL QUE ESTÁ ROTO, y esta vez el que estaba roto era el de actualizar. DEPLOYMENT.md afirmaba que las migraciones se aplican solas al arrancar, y con el comando que daba no se aplican: el código va por volumen, así que un git pull no cambia la imagen, y sin cambio de imagen compose no recrea el contenedor. La migración de prueba se quedó pendiente con los contenedores tres horas arriba y sin un solo error, dejando código nuevo con esquema viejo.

VERIFICAR SOLO EL CAMINO QUE UNO ESPERA RECORRER FALLA TRES VECES DE TRES. Pasó con el typecheck, que no lo hacen ni vitest ni eslint sino npm run build. Pasó con la suite de la API, filtrada por los tests que se esperaba tocar cuando el que falló era otro. Y pasó al evaluar el criterio 8 de esta misma sección, donde se filtró la salida y se perdió el nombre del único test que falló.

UN ERROR QUE NO NOMBRA SU CAUSA MANDA A BUSCAR AL SITIO EQUIVOCADO, y salió tres veces. npm ci con un Node viejo instala sin protestar y revienta después dentro de jsdom. La contraseña de MySQL leída del .env con dólar y paréntesis la expande PowerShell en la máquina local y produce un Access denied que parece un problema de credenciales. Y age no encontrando la clave en el servidor parece que falte algo, cuando es la garantía del cifrado asimétrico funcionando.


LO QUE CAMBIÓ DE FONDO, Y NO ES CÓDIGO

La regla de idioma. Hasta el 17 de agosto la frontera entre español e inglés pasaba por dentro de cada fichero, y eso obligaba a vigilarla con 1.585 líneas de comprobador y una lista de 692 palabras. La observación que lo cambió fue de su autor y era correcta: con la frontera entre ficheros no hay nada que comprobar. Lo ya escrito se convierte en el issue 251, y el comprobador se retira con esa conversión y no antes.

Y la naturaleza de la máquina de despliegue. Hasta esta iteración cualquier fallo era reproducible; a partir del 18 de agosto hay 370 contraseñas que no están en ningún otro sitio. Eso es lo que la iteración entera venía preparando, y es la razón de que la migración fuera lo último y no lo primero.


LO QUE QUEDÓ FUERA, Y POR QUÉ

El acceso a la vault desde fuera de la red local, issue 229. Se dejó a propósito porque puede acabar resolviéndose con una instancia en hosting compartido en vez de con un túnel, y esa decisión no era de esta iteración. Queda con la diferencia entre Tailscale, Cloudflare, una VPN propia y el hosting compartido ya razonada según quién termina el TLS.

La conversión del código a inglés, issue 251, que es el trabajo que permite jubilar el comprobador.

El .npmrc con engine-strict se hizo, issue 255. El test intermitente que apareció al evaluar el criterio 8 quedó abierto en el 259, sin identificar.


LO QUE DECÍA STATUS.md

Hasta el 11 de septiembre de 2026, STATUS.md conservaba el objetivo, los criterios de salida y los riesgos de todas las iteraciones cerradas, y llegó a 288 KB: ya no cabía en una lectura. El 663 los sacó de allí por la regla de una sola fuente de docs/GUIDE.md, y lo que decía de esta iteración está aquí copiado sin tocar, salvo los enlaces relativos, ajustados a esta carpeta.

EL OBJETIVO QUE LLEVABA STATUS.md

**Iteración 7: cerrada el 18 de agosto de 2026.** Objetivo cumplido: *eVault deja de ser un proyecto que funciona y pasa a ser la vault donde están mis contraseñas de verdad.*

Es el propósito número uno de `ADR-009` §1 y llevaba esperando desde la Iteración 4. Lo que lo hizo esperar ya no existe: la guía de despliegue está verificada desde la Iteración 5, y al planificar esta el backlog estaba **vacío por primera vez** — 100 issues de 100 cerrados, cero deuda con issue, CI en verde y cero alertas de Dependabot. Es la primera iteración desde la 3 que elige su objetivo en vez de heredarlo.

**Dieciocho issues cerrados**, seis de ellos abiertos por el camino y siendo buena parte del valor: #230 el generador de `STATUS.md` truncando a 100 issues, #232 los PR de Dependabot invisibles, #246 el mapa de los secretos que su autor pidió por no aclararse, #251 el cambio de la regla de idioma, #255 el `engine-strict` y #259 un test intermitente sin identificar.

**Lo que cambió de fondo:** hay 370 contraseñas reales dentro. Hasta esta iteración cualquier fallo del proyecto era reproducible —bases de datos de prueba, ficheros de ejemplo, despliegues que se podían tirar—; a partir de ahora no, y el servidor no puede repararlo porque no puede leer nada. Eso es lo que la iteración entera venía preparando, y la razón de que la migración fuera lo último.

Su historial y sus lecciones están en `docs/planning/archive/ITERACION_7.md`. La que más se repite, y ya con nombre propio: **una afirmación escrita en un documento que le da autoridad es la forma más cara de este fallo** — y esta vez dos de las cinco vivían en un ADR y en un issue cerrado, que son los dos sitios que el proyecto trata como definitivos.

**Diecinueve issues planificados en cinco bloques.** Bloque 0, las decisiones antes del código: #214, `ADR-013` en #215 y `ADR-014` en #216. Bloque 1, la fiabilidad que falta antes de meter contraseñas reales: #217, #218, #219 y #220. Bloque 2, el cambio de correo: #221 y #222. Bloque 3, la instancia: #223, #224, #225 y #226. Bloque 4, el punto de no retorno y el cierre: #227 y #228. Fuera de bloque, lo que salió al planificar: #229 y #232 como deuda, y #230 ya cerrado.

**La decisión de secuenciación, que es la apuesta de esta iteración.** El bloque 1 va **antes** del despliegue y la migración de contraseñas reales va **última**, con seis bloqueantes declarados. No se le confían contraseñas reales a una vault cuya rotación no está verificada, y una vez migradas un fallo cuesta datos que no están en ningún otro sitio. **Es la primera iteración en la que eso es cierto**: hasta ahora todo era reproducible. El umbral de cobertura (#219) va además después de los dos issues de tests, por la lección de #62 — un check que nace en rojo se acaba ignorando entero.

**Lo que apareció al planificar, y que no estaba en ningún documento.** Cinco hallazgos, los cinco del mismo patrón y todos con issue:

1. **Los dos módulos que tocan el material que abre la vault tienen cero cobertura.** `masterPassword.ts` a 0 de 40 líneas y `recovery.ts` a 0 de 107, porque los tests de sus pantallas los sustituyen con `vi.spyOn`. No se veía en el total, que está al 89,2 %. Y **#202 había afirmado por escrito que `masterPassword.ts` estaba cubierto**, usándolo como argumento para dejar la auditoría fuera de su alcance — mientras pedía en su propio texto «si se quiere esa auditoría, es otro issue y empieza midiendo» (#217, #218).
2. **La clave de la vault no vence nunca** mientras la pestaña siga abierta. Los tokens caducan a las 12 horas desde #149; la clave que descifra, no (#220).
3. **El generador de `STATUS.md` solo leía 100 issues y decía que el documento estaba al día.** El repositorio tenía exactamente 100, así que funcionaba por casualidad. Cerrado en #230, y con los primeros tests que `status.py` ha tenido nunca.
4. **Dos PR de Dependabot llevaban días abiertos y nada los reportaba**, porque `STATUS.md` solo lee issues (#232).
5. **`ADR-012` §2.4 afirma que «queda issue abierto» para verificar el hosting compartido, y ese issue no existe.** Nunca se creó (#229).

Los cinco son **afirmaciones escritas en documentos que les daban autoridad y que nadie volvió a comprobar**, que es la lección que este proyecto arrastra desde el criterio 7 de la Iteración 4. La vuelta nueva que aporta esta planificación: dos de las cinco estaban **en un ADR y en un issue cerrado**, es decir en los dos sitios que el proyecto trata como definitivos.

**Lo que se dejó fuera a propósito.** El acceso a la vault desde fuera de la red local (#229): puede acabar resolviéndose con una instancia en hosting compartido en vez de con un túnel, y esa decisión no es de esta iteración. Queda con la distinción entre Tailscale, Cloudflare Tunnel, VPN propia y hosting compartido ya razonada por quién termina el TLS y quién ve el JavaScript servido — que es la parte que `ADR-012` §2.3 mete en un solo saco y que solo es cierta de una de las cuatro. Fuera también el borrado de cuenta, que en una instancia de un usuario con acceso a la base de datos no aporta nada, y el TOTP nativo, que es funcionalidad nueva y `ADR-009` §4 la pone en último lugar.

LOS CRITERIOS QUE LLEVABA STATUS.md

### Iteración 7, cerrada

Ocho criterios. **Seis cumplidos, uno parcial y uno sin verificar**, y ninguno dado por bueno leyendo: los que se podían ejecutar se ejecutaron el día del cierre. Los dos que no llegan son los que exigen un navegador y tiempo real, y se dice en vez de estirar la definición para que cuadren.

La regla que sale de las tres iteraciones anteriores y que aquí se aplica desde el principio: **si un criterio se puede comprobar con un comando, el criterio es ese comando** — y el comando vive en el repositorio. Los que no se pueden comprobar así se evalúan **ejecutándolos**, nunca leyendo código ni diffs.

Dos de ellos tienen una forma que este proyecto no había usado antes: el 2 y el 3 no describen un estado deseable sino **una comprobación que tiene que fallar cuando el código se rompe**. Es la respuesta directa a que cinco hallazgos de la planificación fueran afirmaciones que nadie podía comprobar.

1. ✅ **La instancia personal sirve la vault por HTTPS y guarda contraseñas reales.** La primera mitad **cumplida el 17 de agosto** y verificada como pedía el criterio: **desde otro dispositivo de la red y en un navegador real**, no desde la máquina que sirve — la excepción de `.localhost` vale donde corre el navegador, así que probarlo en kastor habría sido un falso verde. Registro completado, item creado, recarga bloqueando la vault y descifrado al desbloquear. Y la comprobación que de verdad demuestra el modelo, hecha contra la base de datos real: la cadena guardada **no aparece** en `vault_items` —`coincidencias: 0`— y lo que hay son 172 bytes de `ciphertext` con `version 2` (#224). **Y la segunda mitad, cumplida el 18 de agosto**: las contraseñas reales están dentro. **370 items**, todos con `version 2` —el esquema cifrado—, ninguno vacío y ninguno sin nonce, con longitudes de 100 a 360 bytes. Se hizo copia inmediatamente después y se comprobó que llevaba las 370 filas y que llegó al destino remoto (#227).
2. ⬜ **`npx vitest run --coverage` no deja ningún módulo de `lib/vault/` a cero, y el CI falla si vuelve a pasar.** El umbral es por fichero y no global, porque un umbral global es exactamente el instrumento que no vio ninguno de los tres casos —`ExportDialog`, `masterPassword.ts` y `recovery.ts` (#217, #218, #219).
3. ✅ **Mover el `api.put` delante del reenvolvido en `masterPassword.ts` rompe un test.** Aplicada la mutación el día del cierre: **5 de 7 tests en rojo**.
4. ⬜ **La vault se bloquea sola tras el plazo decidido** — **NO verificado, y es el único criterio que se queda sin cumplir.** Los 24 tests de #220 cubren la lógica, incluido el caso del temporizador estrangulado moviendo el reloj sin ejecutar temporizadores. Lo que falta es lo que ningún test sustituye: abrir la aplicación, dejarla quince minutos con la pestaña de fondo y mirar. Queda como deuda en #260
5. 🔶 **Cambiar el correo, salir, entrar con el nuevo y ver los items intactos** — cubierto por 41 tests entre #221 y #222, incluido que la clave de recuperación nueva se deriva del correo nuevo, comprobado descifrando. **No se ha ejecutado sobre la instancia real, y es deliberado**: hacerlo ahí significa re-derivar las claves de una vault con 370 contraseñas reales dentro, y no es una operación para probar. Detalle original
6. ✅ **Un backup producido por el cron —no hecho a mano para la ocasión— y guardado fuera de kastor, restaurado en una instancia limpia.** Lo que se verifica es la cadena entera, y la parte que nunca ha corrido es justo la automática. Con el aprendizaje de #159 delante: una copia que su dueño no puede recuperar es un cero tranquilizador con otra forma. **Cumplido el 17 de agosto, y la cadena entera recorrida**: el cron disparó solo y produjo `evault-000007`, cifrada con X25519 y subida al destino remoto, comprobando que ahí no hay nada legible. Después se descargó y se descifró **en otra máquina, con la clave privada que el servidor no tiene**, y salió un JSON válido cuyo `created_at` —19:38:01— coincide con el nombre del fichero: es la copia del cron y no una hecha a mano. Lo que no se repitió aquí es el `evault:restore`, que ya se verificó en #129 contra una base de datos vaciada y tiene sus tests. Y una condición que no estaba escrita y ahora sí: **la clave privada no puede vivir en el mismo proveedor que las copias**, o ese proveedor tiene el candado y la llave (#225).
7. ✅ **Actualizar la instancia con datos dentro sin perder nada**, con la vuelta atrás **ejecutada de verdad** y no descrita. Verificado el ciclo entero el 17 de agosto sobre la instancia real: copia previa, migración sobre `vault_items` —una tabla con filas—, actualización, `rollback` y regreso, comparando **huellas SHA-256** de `vault_items` y `vault_members` y no solo el número de filas: idénticas antes y después.

   Y el criterio se ganó su razón de ser, porque encontró que **la guía documentaba un procedimiento que no aplica las migraciones**: `up -d --build` no recrea el contenedor cuando la imagen no cambia, y como el código va por volumen, un `git pull` con migraciones nuevas no la cambia. La migración se quedó `Pending` con los contenedores tres horas arriba, **sin ningún error**: código nuevo y esquema viejo. Corregido con `--force-recreate` y con la alternativa de lanzar `migrate` a propósito (#226).
8. 🔶 **Pest, Vitest, Larastan en nivel `max`, los tres comprobadores del repositorio en cero y CI en verde.** Medido el día del cierre: **263 tests en la API**, **442 en la web** con el umbral de cobertura pasando, **73 del utillaje**, Larastan `max` sin errores, y `check-identifiers --all` y `check-docs` en cero. **Parcial y no cumplido por una razón:** la primera ejecución de la suite web dio 1 test en rojo que no se capturó, y seis ejecuciones posteriores pasaron. Hay un intermitente y está abierto en #259; dar el criterio por limpio sería justo lo que esta iteración persigue.

Y la guarda que la Iteración 6 aprendió a poner en toda comparación, que aquí aplica a los criterios 2, 5 y 7: **exigir haber medido algo.** Dos volcados vacíos dan un `diff` idéntico, y un criterio evaluado contra la nada sale cumplido.

LOS RIESGOS QUE LLEVABA STATUS.md

Los riesgos eran un registro acumulado y sus filas no decían de qué iteración eran, así que cada una vino al archivo de la iteración más reciente que cita. Su estado es el que tenía el día que se retiró de STATUS.md, y NO se ha vuelto a comprobar: varias decían «Abierto» de algo ya cerrado. Un riesgo que siga vivo se reescribe en la tabla de la iteración en curso con su estado de hoy, no se copia de aquí.

| Riesgo | Estado | Detalle |
| --- | --- | --- |
| **Un fallo cuesta datos que no están en ningún otro sitio** | `Materializado el 18 de agosto: ya hay 370 contraseñas reales` | Es nuevo y cambia de categoría todo lo demás: hasta ahora cualquier fallo era reproducible —bases de datos de prueba, ficheros de ejemplo, despliegues que se podían tirar y rehacer— y a partir de #227 la instancia guarda contraseñas reales que no existen en otra parte. El servidor además **no puede reparar nada**, porque no puede leer nada. Mitigación en tres partes, todas de secuenciación y no de código: el bloque 1 entero va antes del despliegue, #227 va última con seis bloqueantes declarados, y el origen del que se migra **no se borra hasta haber verificado la copia** — con la secuencia escrita en el issue: importar, verificar, backup, usar la vault unos días, y solo entonces retirar el origen |
| **La mitad cliente de una mitigación sin un solo test** | `Cerrado en #217` | `STATUS.md` declaraba `Mitigado` el riesgo de la rotación y la recuperación describiendo dos mitades. La del servidor está verificada rompiéndola a propósito en `RotateMasterPasswordTest`. **La del cliente —«el reenvolvido entero antes de enviar la primera petición»— la afirmaba un comentario en `masterPassword.ts` y no la comprobaba nada**: hoy se puede mover el `api.put` delante del `Promise.all` y el CI sigue verde en 379 tests. Es el peor sitio del proyecto para no tener cobertura, porque el modo de fallo es dejar al usuario fuera de una vault que nadie puede reparar. Va a #217 y #218, con las mutaciones concretas, y el criterio de salida 3 lo mide |
| **Un módulo a cero es invisible cuando el total está bien** | `Cerrado en #219: el umbral por fichero lo detecta` | `ExportDialog` a cero de 39 sentencias hasta #202, `masterPassword.ts` a cero de 40 y `recovery.ts` a cero de 107 — con la web al 89,2 %. Las tres veces se encontró **leyendo una tabla de cobertura a mano y por casualidad mientras se hacía otra cosa**, que no es un método. Y el caso de `recovery.ts` enseña la forma exacta que tiene de esconderse: `Recover.tsx` marca **100 % de sentencias** encima de un módulo al 0 %, porque el test sustituye la función con `vi.spyOn`. Mitigación en #219: umbral **por fichero y no global**, porque el global es justo el instrumento que no vio ninguno de los tres |
| **La instancia vive en una máquina que no está siempre encendida** | `Aceptado, con la decisión escrita` | kastor se apaga a veces, a propósito y avisado. Lo inmediato es que no se puede acceder, y eso es aceptado. Lo que hay que registrar es el resto: **el cron de backup no corre** —con el matiz que lo suaviza, que sin uso tampoco hay datos nuevos, así que lo que importa es el desfase entre el último backup y el último cambio y no el tiempo apagada—; **arranca desactualizada**, semanas sin parches en la máquina que guarda las contraseñas, de donde sale una regla de orden: tras un apagado largo se actualiza antes de usarla; y el alias mDNS **queda publicado apuntando a nada**, que es inocuo pero confunde el diagnóstico porque el nombre resuelve y parece un fallo de la aplicación. Lo que **no** es problema, y merece quedar escrito para que nadie lo investigue dos veces: los certificados de `tls internal`, que Caddy renueva al arrancar. Y el riesgo de fondo, que no es técnico: **si no se puede llegar a la vault cuando se necesita, no se usa; y si no se usa, se sigue con el gestor anterior y hay dos fuentes de verdad divergiendo.** El peligro de una instancia intermitente no es perder datos, es que la vault quede a medio poblar. **Decidido en `ADR-013`: la intermitencia se asume y no se combate**, porque los apagados son deliberados y no averías; lo que el ADR aporta es que las consecuencias queden escritas en vez de supuestas, incluida la que no es obvia —que lo que importa no es el tiempo apagada sino el desfase entre la última copia y el último cambio |
| **Un backup en el mismo disco que los datos** | `Cerrado en #225: salen cifradas y a otro proveedor` | No es una copia de seguridad: si los volúmenes de Docker y el fichero del cron están los dos en kastor, un fallo de ese disco se lleva las dos cosas a la vez, encendida o apagada. Salió de preguntar qué problemas trae que la máquina esté apagada, y es el hallazgo más importante de la planificación. `ADR-011` §5 ya apuntaba ahí al decir que el backup del servidor y el export cifrado son **complementarios y no redundantes**: uno protege del borrado accidental, el otro de la pérdida de la máquina, y solo existía el primero. A favor juega el modelo: `BackupCommand` escribe cuatro tablas en un JSON propio, **sin el `.env` ni la `APP_KEY`**, y los datos de usuario ya salen cifrados, así que la copia se puede sacar de la máquina sin ceremonia — «un dividendo directo del zero-knowledge que casi nunca se cobra», dice el propio comando. Lo que sí lleva son los hashes de autenticación y las claves envueltas, que no descifran nada pero no conviene repartir, de modo que `ADR-013` decidió cifrarlo antes de que salga. **Y lo decidió con cifrado asimétrico**, que es lo que compra la propiedad que importa: la clave pública vive en la máquina y la privada no, así que **la máquina que produce la copia no puede leerla** — quien comprometa el servidor no obtiene los backups anteriores. La contrapartida asumida es simétrica a la de `ADR-001` con la contraseña maestra: perder la clave privada convierte las copias en basura, y por eso se custodia donde la clave de recuperación y se comprueba en la primera restauración. Implementación en #225 |
| **Cambiar el correo invalida la clave de recuperación** | `Implementado en #221 y #222; sin ejecutar sobre la instancia real` | Y es la **inversa exacta** de lo que la interfaz ya afirma en otro sitio, así que se va a malinterpretar: rotar la contraseña maestra NO invalida la clave de recuperación —la clave de vault no cambia—, pero cambiar el correo SÍ, porque `deriveRecoveryKeys` usa el correo normalizado como salt del HKDF (`crypto.ts:352`) y de ahí salen tanto el `wrapKey` como el `authHash`. El modo de fallo es el peor posible en un gestor: **dejar al usuario con una clave de recuperación que ya no sirve y que él cree que sirve**, y eso no se descubre hasta el día que hace falta. `ADR-014` eligió **no dejar terminar la operación sin entregar una clave nueva**, que es el patrón que #128 ya validó: exigir la clave vieja habría empujado a guardarla en el mismo dispositivo, y avisar sin bloquear deja sin red a quien cierre el aviso. A quien no tenía clave no se le inventa una obligación, porque `recovery_wrapped_key` es nullable a propósito y el servidor lo distingue. Y hay un modo de fallo silencioso aparte: si el servidor normaliza el correo distinto que el cliente, la clave maestra derivada no coincidirá y la vault no abrirá **sin dar ningún error en el momento del cambio** (#221) |
| **El comprobador se escribe a la medida de lo que ya pasa** | `Mitigado, y vuelve a aplicar en la Iteración 7` | La mitigación de #189 se aplicó entera y funcionó. Vuelve a aplicar en #219, donde el umbral de cobertura **se fija midiendo lo que hay** y no eligiendo un número: eso es literalmente escribirlo a la medida de lo que ya pasa, y se acepta a conciencia porque lo que ese issue cierra no es «poca cobertura» sino «cero invisible». Detalle original: era el riesgo mayor de la Iteración 6, y ya se materializó una vez: el inventario de #160 se quedó corto **tres veces seguidas** —ámbito `web/src` y `api/app`, `vite.config.ts` fuera de `src/`, y ninguna búsqueda que viera el destructuring— y lo inventarió quien tenía que cumplir el criterio. Dicho como lo dejó escrito el propio #160: **cuando el método de medida lo elige quien va a cumplir el criterio, el criterio se mide a sí mismo.** Mitigación en #189, en tres partes: el comando se escribe y se commitea **antes** de renombrar nada, publica su recuento de partida sobre `master`, y trae sus propios tests con identificadores plantados a propósito —en español y en inglés, y uno dentro de un fichero con un byte NUL— verificados rompiendo el comprobador y no viéndolos pasar |
| **Un check que nace en rojo se acaba ignorando entero** | `Mitigado dos veces por la misma vía` | Funcionó en la Iteración 6 y se repite en la 7: #219 va declarado como bloqueado por #217 y #218, de modo que el umbral de cobertura entra en verde y desde ese momento cualquier rojo significa algo. Detalle original: Si el check de identificadores de #62 aterriza con cien pendientes, el CI queda rojo en todos los PR y el equipo aprende a mirar hacia otro lado — que es justo lo que el propio #62 dice de su vía de escape. Mitigación: **#62 va después de #160 y #161**, declarado como dependencia nativa, para que el check entre en verde y desde ese momento cualquier rojo signifique algo. El coste aceptado es que el CI tarda cuatro bloques en protegernos |
