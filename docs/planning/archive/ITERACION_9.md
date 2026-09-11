ITERACIÓN 9 — Historial y lecciones aprendidas

Archivo de la Iteración 9, cerrada el 19 de agosto de 2026. Recoge la intención de cada issue y lo que se aprendió al cerrarlo.

Está archivado, no muerto. Es la iteración en la que la vault dejó de servir solo dentro de casa, y aquella en la que más veces se descubrió que una conclusión escrita era falsa. Si alguna vez hay que tocar Tailscale, el frontal de Caddy, el bloqueo por inactividad o el comprobador de idioma, merece la pena leer esto antes de investigar desde cero.

El objetivo se cumplió: la vault se consulta desde fuera de casa desde el 19 de agosto, verificado desde un iPhone por datos móviles con el wifi apagado.

Nota de formato: prosa plana sin Markdown, por la convención del proyecto. Salvo la última sección, LO QUE DECÍA STATUS.md, que conserva el Markdown con que se escribió allí.


QUÉ SE HIZO

Quince issues cerrados, cinco de ellos abiertos por el camino. El plan tenía doce.

Bloque 0, la planificación. El 284.

Bloque 1, la decisión antes del código. El 285, ADR-015, que eligió Tailscale.

Bloque 2, la vault se usa desde fuera de casa. Creció de tres issues a cinco porque el 286 resultó no ser ejecutable: el 295 con ADR-016, el 296 que unificó el origen, y después el 286, el 287 y el 288. Con ellos se cerró la deuda 229.

Bloque 3, lo que llevaba dos iteraciones sin verificarse. El 281, que automatizó el bloqueo por inactividad; el 260, que quedó reducido al móvil; y el 289, la clave de recuperación sobre una vault real.

Bloque 4, la deuda que apareció al planificar. El 251 y el 291.

Fuera de plan salieron el 295, el 296, el 304 y el 305, más cuatro deudas nuevas: el 290, el 303, el 309 y el 305 antes de resolverse.


LO QUE CAMBIÓ DE FONDO

La vault se alcanza desde fuera de la red local sin abrir un puerto del router, con certificado de Let's Encrypt y sin instalar ninguna CA en el dispositivo. Eso cierra lo que ADR-013 registraba como el riesgo real al propósito número uno: mientras la vault solo sirviera en casa, se seguía usando el gestor anterior en paralelo.

Y dos cosas que no estaban planificadas y valen tanto como el objetivo. CORS desapareció del proyecto entero, porque la SPA y la API pasaron a compartir origen. Y el artefacto de la SPA dejó de estar atado a un hostname: un dist construido una vez sirve desde cualquier nombre, lo que además tumbó el motivo por el que ADR-012 había descartado publicar imágenes.


LA LECCIÓN QUE MÁS SE REPITIÓ, Y ESTA VEZ CONTRA UNO MISMO

Una afirmación escrita en un documento que le da autoridad y que nadie volvió a comprobar. Ocho veces en la planificación, y varias más durante la iteración. La vuelta nueva es que la mayoría no eran heredadas de documentos viejos: se escribieron durante esta misma iteración.

El issue de conversión a inglés no existía, aunque CLAUDE.md llevaba dos días diciendo que sí. Probar la clave de recuperación estaba en el SIGUIENTE PASO sin issue. El 229 pedía aplicar una corrección a ADR-012 que ADR-013 ya había hecho el mismo día que se escribió, y la planificación la copió sin comprobarla. ADR-015 decidió conservar dos caminos de acceso sin verificar que el frontal pudiera servirlos, y no podía. El issue 289 afirmaba que recovery_wrapped_key cambiaría al recuperar, y no cambia. Y la conclusión de que en headless no puede haber pestañas ocultas era una generalización a partir de una medición correcta, que dejó dos casos esperando a una persona durante dos iteraciones sin necesidad.

De todas ellas, la más instructiva es la de ADR-015, porque poner la decisión delante del código NO evitó el error: lo que hizo fue que apareciera en un documento y no en una máquina con 370 contraseñas dentro. Eso es lo que compra el método, y conviene no pedirle más.


UNA COMPROBACIÓN PUEDE PASAR O FALLAR POR EL MOTIVO EQUIVOCADO, CUATRO VECES

Todas en utillaje escrito durante esta iteración, y todas encontradas por mirar el resultado en vez de aceptarlo.

La guarda del guion de bloqueo anunciaba haber medido que las pestañas de fondo no se estrangulan, midiendo el efecto de un flag que el propio guion pasa a Chromium. isUnlocked comprobaba no estar en la pantalla de desbloqueo, y la de registro también cumple eso, así que un registro fallido parecía correcto. El caso 3 daba por bueno que el aviso hubiera desaparecido, cosa que también es cierta cuando la vault se ha bloqueado y ha desmontado el árbol. Y el comprobador de idioma salió verde con dos líneas en español recién escritas delante, porque comparaba contra HEAD y no contra el árbol de trabajo.

La regla que sale de aquí: una comprobación nueva necesita su mutación el mismo día. Las cuatro se encontraron aplicándola, ninguna leyendo el código.


LO QUE COSTÓ MÁS DE LO PREVISTO

El bloque 2. El 286 parecía instalación y configuración, y resultó que Tailscale da un solo nombre DNS por máquina mientras el despliegue usaba dos, y que la URL de la API se horneaba en el bundle. Eso obligó a un ADR nuevo y a un cambio de arquitectura del frontal antes de poder tocar la máquina. Dos issues y varias horas que no estaban en el plan, y el resultado es mejor que el plan.

El 305, que empezó como un intermitente sin causa y terminó siendo Chromium sin repintar pestañas ocultas: el toast estaba lógicamente descartado y visualmente congelado. Se resolvió bajando los umbrales del bloqueo sin tocar el reloj, lo que permitió pasar de un ciclo de dieciocho minutos a uno de treinta segundos y reproducirlo cuarenta y ocho veces.


LO QUE HAY QUE SABER ANTES DE TOCAR ESTO

Los nombres de máquina de una tailnet se publican en el registro público de Certificate Transparency, así que no pueden nombrar el proyecto. Está en ADR-015 sección 4 y aplica a cualquier máquina que se añada.

El certificado que emite la CA interna de Caddy dura DOCE HORAS, no meses. Se descubrió al escribir el aviso de caducidad, cuya primera versión usaba un umbral fijo de veintiún días y habría nacido en rojo. Por eso el margen de check-cert-expiry.sh es una fracción de la vida del certificado.

Con HTTPS, quien elige el sitio es el SNI y no la cabecera Host. Una petición a https://localhost con -H "Host: evault.local" falla en el handshake y devuelve 000, que parece el servidor caído estando perfectamente. Hay que usar --resolve.

Borrar config/cors.php NO retira CORS: Laravel cae en su valor por defecto, que es allowed_origins con comodín, y la API pasa a responder a cualquier origen. Lo que hay que quitar es el middleware HandleCors. Lo detectó el test que se escribió para verificar la retirada.

El guion de bloqueo registra cuatro cuentas por ejecución y la API permite diez por hora, así que dos ejecuciones seguidas agotan el límite y la tercera falla al arrancar con un mensaje que no se parece a un rate limit.

En Chromium headless SÍ hay pestañas ocultas: abrir una nueva oculta la anterior, aunque /json/activate y Page.bringToFront no lo hagan. Y una vez oculta se estrangula de verdad, hasta un tick por minuto a partir del sexto.


LOS CRITERIOS DE SALIDA

Ocho, y se dice el resultado tal cual salió. Siete cumplidos y uno que se cumplió a medias porque estaba mal escrito, cosa que se explica en vez de estirarse.

El cuarto pedía que recovery_wrapped_key cambiara al recuperar el acceso y que el ciphertext de los items no. La segunda mitad se cumplió, byte a byte. La primera NO, y hace bien: el envoltorio de recuperación cuelga de la clave de vault y no de la maestra, así que recuperar, que es una rotación, no lo toca. El criterio lo escribió quien planificó la iteración sin comprobarlo contra ADR-010. De ahí salió el 309.


LO QUE QUEDA ABIERTO

Cuatro deudas, tres de ellas encontradas en esta iteración. El 290, convertir a inglés los comentarios y nombres de test, que es la más grande y ahora tiene issue y red. El 303, que el bloqueo por inactividad descarta lo escrito en un diálogo sin avisar. El 309, que usar la clave de recuperación no la invalida y nada lo advierte. Y del móvil solo queda lo que ningún navegador de escritorio reproduce.

El hosting compartido queda pospuesto con sus señales de reevaluación escritas, no olvidado. Y el cabo de ADR-012 sección 2.4 —la promesa de un issue de verificación que nunca existió— se cierra aquí: con el hosting descartado como vía de acceso en ADR-015, esa verificación pierde demanda y deja de estar pendiente.


LO QUE DECÍA STATUS.md

Hasta el 11 de septiembre de 2026, STATUS.md conservaba el objetivo, los criterios de salida y los riesgos de todas las iteraciones cerradas, y llegó a 288 KB: ya no cabía en una lectura. El 663 los sacó de allí por la regla de una sola fuente de docs/GUIDE.md, y lo que decía de esta iteración está aquí copiado sin tocar, salvo los enlaces relativos, ajustados a esta carpeta.

EL OBJETIVO QUE LLEVABA STATUS.md

**Iteración 9: cerrada el 19 de agosto de 2026.** Objetivo cumplido: *la vault se puede consultar desde fuera de casa, y lo que lleva dos iteraciones sin verificarse queda verificado.*

**Quince issues cerrados**, cinco de ellos abiertos por el camino, sobre un plan de doce. El bloque 2 creció de tres a cinco porque **#286 resultó no ser ejecutable**: Tailscale da un solo nombre DNS por máquina y el despliegue usaba dos, así que hizo falta `ADR-016` y un cambio del frontal antes de poder tocar la máquina.

**Lo que cambió de fondo:** la vault se alcanza desde fuera sin abrir un puerto del router, con certificado de Let's Encrypt y sin instalar ninguna CA. Eso cierra lo que `ADR-013` registraba como el riesgo real al propósito número uno. Y dos cosas no planificadas que valen tanto: **CORS desapareció del proyecto** y **el artefacto de la SPA dejó de estar atado a un hostname**.

Su historial y sus lecciones están en `docs/planning/archive/ITERACION_9.md`. La que más se repite, con una vuelta nueva: **una afirmación escrita en un documento con autoridad que nadie volvió a comprobar** — ocho veces, y la mayoría **escritas durante esta misma iteración**, no heredadas. La más instructiva es la de `ADR-015`, porque poner la decisión delante del código **no evitó el error**: hizo que apareciera en un documento en vez de en una máquina con 370 contraseñas dentro.

Y una segunda, en utillaje propio y cuatro veces: **una comprobación puede pasar o fallar por el motivo equivocado**. Las cuatro se encontraron aplicando su mutación, ninguna leyendo el código.

Objetivo original:

La Iteración 7 metió 370 contraseñas reales en una instancia propia y la 8 demostró que se pueden recuperar. Lo que ninguna de las dos hizo es que se puedan **usar**: la instancia vive en la red local, y una contraseña se necesita justo cuando no se está en casa. `ADR-013` registra eso como el riesgo que de verdad amenaza el propósito número uno — que empuja a seguir usando el gestor anterior en paralelo, y entonces la vault propia no sirve para lo que se construyó.

El orden lo fija `ADR-009` §4: primero lo que hace el producto fiable para quien lo usa de verdad, después lo que lo hace legible. Por eso el acceso remoto va delante de la conversión del código a inglés, que es la deuda más grande pero es legibilidad.

**Catorce issues en seis bloques.** Bloque 0, la planificación: #284. Bloque 1, la decisión antes del código: `ADR-015` en #285. Bloque 2, la vault se usa desde fuera de casa: `ADR-016` en #295, su implementación en #296, y después #286, #287 y #288, que cierran la deuda #229. Bloque 3, lo que lleva dos iteraciones sin verificarse: #281, #260 y #289. Bloque 4, la deuda que apareció al planificar: #251 y #291. Bloque 5, el cierre: #292.

**El bloque 2 creció de tres issues a cinco el 19 de agosto**, y no por alcance añadido sino porque #286 resultó no ser ejecutable. Ver el hallazgo 8.

**La vía está elegida y es Tailscale**, por un criterio que no admite mitigación: **no ve el JavaScript servido**. Quien controla el JavaScript controla el cifrado en el cliente, porque puede servir una versión que se quede la contraseña maestra — es el único agujero que el README reconoce como no cubierto y del que `ADR-001` no protege. Eso descarta Cloudflare Tunnel y el hosting compartido, que sí lo ven. Frente a una VPN propia, Tailscale además no abre puertos y emite certificado válido dentro de la tailnet, lo que elimina instalar la CA interna a mano en cada dispositivo.

**La decisión de secuenciación, que es la apuesta de esta iteración.** El `ADR-015` va **primero y solo**, como #153 en la 5 y #214 en la 7: la vía está elegida, pero tocar el TLS de la instancia con las contraseñas reales sin la decisión escrita es cómo se acaba con una configuración que nadie sabe por qué es así. Y `ADR-013` §1 dejó ese hueco a propósito —«esa decisión merece su propio ADR»—, así que el `ADR-015` no corrige nada: **decide**. Y el bloque 3 va **después** del 2 y no antes, porque #281 necesita una instancia desechable y montarla sale más barato con el acceso ya resuelto.

**Lo que apareció al medir, y no estaba en ningún documento.** Ocho hallazgos, y siete son el mismo patrón que el proyecto arrastra desde el criterio 7 de la Iteración 4 — **una afirmación escrita en un documento que le da autoridad y que nadie volvió a comprobar**:

1. **El issue de conversión a inglés no existe.** `CLAUDE.md` línea 170 dice que la conversión «es un issue aparte»; no había ninguno. #251 es de *decidir*, y su propio cuerpo dice «No es una propuesta de migrar». `SPRINT_CONTEXT.md` lo trataba como si fuera el de conversión. **Es palabra por palabra lo que #229 encontró en `ADR-012` §2.4**, y esta vez el documento es el que se lee al empezar cada sesión. Creado como #290.
2. **#251 seguía abierto pidiendo una decisión ya tomada** el 17 de agosto de 2026 en #253. Tres de sus cuatro casillas estaban resueltas; la cuarta no: `auto` y `cursor` siguen en `english.txt`, líneas 58 y 582.
3. **«Probar la clave de recuperación» estaba en el SIGUIENTE PASO de `SPRINT_CONTEXT.md` sin issue.** Es el criterio de salida 5 de la Iteración 7, implementado y probado con 41 tests pero nunca ejecutado sobre una instancia real. Creado como #289.
4. **Nada comprueba la mitad nueva de la regla de idioma.** `check-identifiers.py` mira identificadores, no comentarios ni nombres de test. En los **dos primeros días** de la regla se añadieron **14 líneas de comentario en español** sin que nada las señalara. La regla se incumple sin coste, que es exactamente por lo que afirmar la anterior no bastó tres veces (#153, #160, #189). Sale a #291.
5. **La cabecera del propio comprobador está desactualizada**: `check-identifiers.py` línea 12 sigue citando «547 nombres de test», cifra corregida a 805 al planificar la Iteración 8.
6. **La regla no dice qué hacer al editar un fichero que ya está en español.** «Todo lo nuevo en inglés» y «lo ya escrito se queda hasta su conversión» chocan ahí. Se resolvió a mano en #271 y el razonamiento quedó **en un comentario de un fichero de tests**, no en `CLAUDE.md`.
7. **#229 pide aplicar una corrección a `ADR-012` §2.3 que `ADR-013` §1 ya había aplicado**, el mismo día en que #229 se escribió: la tabla de las cuatro vías está ahí, con el criterio del JavaScript servido y con «`ADR-012` no se supersede por esto». Y el hallazgo tiene una vuelta que los seis anteriores no tienen: **esta planificación lo copió de #229 sin comprobarlo**, y lo escribió en el primer issue del plan y en esta misma sección antes de verificarlo al redactar el `SPRINT_CONTEXT`. Es el fallo que el repositorio lleva cinco iteraciones documentando, cometido mientras se documentaba. Corregido en #285 y en #229.
8. **`ADR-015` decidió algo que no se podía implementar, y lo destapó la primera hora de #286.** Tailscale da **exactamente un nombre DNS por máquina**; el despliegue usa **dos hostnames**, `evault.local` y `evault-api.local`; y la URL de la API **se hornea en el bundle en tiempo de build**. No hay dónde poner el segundo host, y aunque lo hubiera, un artefacto apunta a una sola API — así que los dos caminos que su decisión 4 quería conservar no podían convivir. Sale a `ADR-016` (#295) y su implementación (#296), y #286 se replanteó para depender de ellos. **La vuelta nueva del patrón:** no es una afirmación heredada de un documento viejo, es una escrita el día anterior; poner la decisión delante del código no evitó el error, pero hizo que apareciera en un documento en vez de en una máquina con 370 contraseñas dentro.

**Las mediciones que sostienen el plan**, tomadas al planificar y no heredadas: 4 issues abiertos al empezar, 442 tests en web, 270 en la API, 73 del utillaje, cobertura del 93,09 % global y 98,64 % en `lib/vault`, CI en verde, cero alertas de Dependabot y cero PRs abiertos.

**Y el volumen de la conversión, remedido**: **3.904 líneas de comentario en español en 214 ficheros** —`web/src` 2.085 en 99, `api` 1.550 en 104, `scripts` 269 en 11— y **~754 nombres de test**. Jubila **1.604 líneas** de infraestructura.

**Lo que queda fuera a propósito.** La conversión del código a inglés (#290), por `ADR-009` §4: es legibilidad y va detrás de la fiabilidad. Sale de esta iteración con su issue creado por fin y con la red que impide que siga creciendo, que es lo que la hace esperable sin coste. Y el punto flojo de `RecoveryKey.tsx`, al 61 % de sentencias y 50 % de funciones: se anota porque apareció al medir, pero cubrir una pantalla no es el objetivo de esta iteración y no se mete por inercia.

LOS CRITERIOS QUE LLEVABA STATUS.md

### Iteración 9, cerrada

Ocho criterios. **Siete cumplidos y uno a medias**, y ese se explica en vez de estirarse: **estaba mal escrito**. Ninguno se dio por bueno leyendo — los que se podían ejecutar se ejecutaron el día del cierre.

1. ✅ **La vault se abre desde fuera de la red local y lo creado desde fuera está cifrado.** Verificado el 19 de agosto a las 11:30 desde un iPhone con **datos móviles de Movistar y el wifi apagado**, que es la condición sin la cual esto no verifica nada. El item creado desde fuera está en la base de datos con `version 2`, 144 bytes de `ciphertext` y 16 de `iv`, y **su nombre no aparece en claro por ningún lado**: cero coincidencias. Y el tráfico llegó por Tailscale, medido en el peer — `iphone175`, 89.308 bytes (#288).
2. ✅ **Con Tailscale desconectado, la vault NO responde.** Comprobado en el móvil con el wifi todavía apagado, y desde esta máquina de desarrollo, que no está en la tailnet y sirvió de control negativo: el nombre ni siquiera resuelve (#286, #288).
3. ✅ **Un dispositivo sin la CA interna completa el ciclo, y el certificado avisa antes de caducar.** El iPhone **nunca tuvo la CA instalada**: `evault.local` le da `ERR_CERT_AUTHORITY_INVALID` y el nombre de la tailnet carga sin un solo aviso — control positivo y negativo en el mismo aparato. El aviso es `scripts/check-cert-expiry.sh`, en el cron a las 4, y **su margen es una fracción de la vida del certificado y no un número de días**: la primera versión usaba 21 días fijos y habría nacido en rojo, porque el certificado de la CA interna dura **doce horas** (#287).
4. 🔶 **La clave de recuperación abre una instancia restaurada** — cumplido en su mitad importante, **y el criterio estaba mal escrito en la otra**. El ciphertext de los 370 items quedó **idéntico byte a byte**, que es `ADR-008` en producción: recuperar reenvuelve 32 bytes y no recifra nada. Pero pedía además que `recovery_wrapped_key` **cambiara**, y no cambia — **y hace bien**: el envoltorio de recuperación cuelga de la clave de vault y no de la maestra, así que recuperar, que es una rotación, no lo toca. Lo escribió quien planificó la iteración sin comprobarlo contra `ADR-010`. De ahí salió #309 (#289).
5. ✅ **Subir `INACTIVITY_LIMIT_MS` a una hora pone en rojo la verificación automatizada.** Aplicada la mutación: **2 de 3 casos en rojo con `exit 1`**. Y sin ella, **5 de 5 en verde en 18,3 minutos de reloj real**, sin falsear el tiempo. Incluye el caso que #281 dio por imposible — pestaña realmente oculta, con estrangulamiento medido a **4,9 ticks/min frente a 60** (#281, #260, #304).
6. ✅ **Un PR que añada un comentario en español queda en rojo, y los 214 ficheros que ya lo están no.** Las dos mitades: la mutación lo pone en rojo con `exit 1`, y la tasa de falsos positivos está **medida y no supuesta** — **cero sobre 333 líneas inglesas**, con 76,6 % de detección sobre las españolas (#291).
7. ✅ **`auto` y `cursor` resueltos, y `CLAUDE.md` dice qué hacer al editar un fichero ya en español.** Ninguna de las dos se usa como palabra española —`autoFocus`, `mx-auto`, `autoLock`; y los cursores de paginación de GraphQL—, así que se quedan **con el motivo escrito en la propia lista**. Y la regla que faltaba: lo que se añade va en inglés, lo que ya estaba se queda (#251).
8. ✅ **Pest, Vitest, Larastan en nivel `max`, los comprobadores del repositorio en cero y CI en verde.** Medido el día del cierre: **260 tests en la API** con 2.711 aserciones, **437 en la web** con cobertura del **93,12 %**, **91 del utillaje**, Larastan `max` sin errores, los **cuatro** comprobadores en cero —identificadores, documentación, idioma de comentarios y utillaje—, CI en verde y **cero alertas de Dependabot**.

LOS RIESGOS QUE LLEVABA STATUS.md

Los riesgos eran un registro acumulado y sus filas no decían de qué iteración eran, así que cada una vino al archivo de la iteración más reciente que cita. Su estado es el que tenía el día que se retiró de STATUS.md, y NO se ha vuelto a comprobar: varias decían «Abierto» de algo ya cerrado. Un riesgo que siga vivo se reescribe en la tabla de la iteración en curso con su estado de hoy, no se copia de aquí.

| Riesgo | Estado | Detalle |
| --- | --- | --- |
| **Un tercero en el camino puede servir el JavaScript** | `Mitigado por la elección de Tailscale (#285)` | Es el vector que decide toda la Iteración 9, y el único agujero que el README reconoce como no cubierto por el modelo: **quien controla el JavaScript servido controla el cifrado en el cliente**, porque puede servir una versión que se quede la contraseña maestra, y `ADR-001` no protege de eso. Descarta Cloudflare Tunnel, que termina el TLS en su borde, y el hosting compartido, que además aloja la base de datos. Tailscale solo transporta paquetes que no puede abrir. **El riesgo no desaparece, se traslada**: se sigue dependiendo de un tercero para la coordinación de la malla, aunque no para el tráfico ni para el TLS, y eso va escrito en el ADR en vez de omitirse (#285) |
| **Tocar el TLS de la instancia que guarda las contraseñas reales** | `Abierto, con issue` | Los 370 items no son reproducibles y lo que se rompa ahí no se arregla desde el servidor, que no puede leer nada. Y el modo de fallo no es una degradación: **sin HTTPS no existe `crypto.subtle`**, así que una instancia mal servida no es una instalación limitada sino una donde no se puede ni desbloquear. `ADR-012` lo dice — HTTPS no es endurecimiento, es requisito de arranque. La mitigación es que el acceso desde la red local se comprueba **antes** de dar por hecho cada issue, no al final (#286, #287) |
| **Un certificado que caduca en una máquina que se apaga a propósito** | `Abierto, con issue` | `ADR-013` decide apagar kastor, y un certificado con renovación automática asume una máquina encendida. Es exactamente la forma del riesgo de #265 —una noche sin copia no producía ningún efecto visible— y del de #240 —el reloj no es monótono entre arranques, así que los timestamps de systemd del arranque en curso mienten. Se cubre exigiendo que haya forma de **saberlo antes de que caduque**, no el día que deje de funcionar (#287) |
| **Una verificación de acceso remoto hecha desde el wifi de casa** | `Abierto, y es el modo de fallo propio del objetivo` | Es la versión de esta iteración de **el camino que nadie recorre es el que está roto**, con el agravante de que este camino se puede creer recorrido sin haberlo recorrido: el dispositivo que verifica está normalmente en casa, y todo funcionaría igual por la red local. La mitigación no es técnica sino de método — apuntar el operador móvil y que el wifi estaba apagado, y comprobar el negativo del criterio 2 (#288) |
| **Una afirmación escrita en un documento que le da autoridad** | `Materializado cinco veces al planificar la Iteración 7` | Es la misma clase de fallo que el criterio 7 de la Iteración 4, pero medida de golpe y con dos apariciones nuevas que obligan a subirla de categoría. Las cinco: **#202 afirmó que `masterPassword.ts` estaba cubierto** y lo usó para dejar la auditoría fuera de alcance, cuando está a cero (#217); el generador de `STATUS.md` decía «ya estaba al día» omitiendo 17 issues (#230); **`ADR-012` §2.4 promete un issue de hosting compartido que nunca se creó** (#229); dos PR de Dependabot llevaban días abiertos sin que nada los reportara (#232); y la mitad cliente de la mitigación de rotación estaba declarada `Mitigado` sin un solo test (#217). **Lo nuevo, y es lo que la hace peor de lo que se creía: dos de las cinco viven en un ADR y en un issue cerrado**, es decir en los dos sitios que este proyecto trata como definitivos y no vuelve a mirar. Un ADR es inmutable por diseño, así que una afirmación falsa dentro de uno no se corrige: se hereda. Mitigación disponible solo para las comprobables: convertirlas en comando. Para las que viven en prosa de un ADR no hay comando, y eso queda dicho |
| **La clave que descifra no vence nunca** | `Resuelto en #220, pendiente de verificar en navegador (#260)` | Los tokens de sesión caducan a las 12 horas desde #149, pero `keyInMemory.ts` solo se vacía al recargar o llamando a `forget()`, y el único `setTimeout` del frontend es el del portapapeles. Se endureció la mitad barata —un token robado da una sesión, no el contenido— y quedó sin endurecer la que guarda los secretos. Es lo que el comentario del propio fichero dice que un gestor de contraseñas no puede permitir, aplicado al caso que no cubre: no hace falta guardar la clave en disco para que alguien con el dispositivo entre, basta con no soltarla. Va a #220, y trae un modo de fallo silencioso propio: **un `setTimeout` no mide el tiempo en una pestaña en segundo plano** porque el navegador lo estrangula, así que hay que comparar marcas de tiempo o el bloqueo llega cuando ya no protege |
