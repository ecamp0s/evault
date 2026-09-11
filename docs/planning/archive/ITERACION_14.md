ITERACIÓN 14 — Historial y lecciones aprendidas

Archivo de la Iteración 14, cerrada el 3 de septiembre de 2026. Recoge la intención de cada issue y lo que se aprendió al cerrarlo.

Está archivado, no muerto. Es la iteración en la que la vault se instala en el móvil y se lee sin red, y también aquella en la que el hallazgo más caro no lo encontró ningún test sino una persona que no había construido nada leyendo una pantalla. Si alguna vez hay que tocar el caché del dispositivo, el service worker, la instalación como PWA o cualquier texto que tenga que explicarse solo, merece la pena leer esto antes de investigar desde cero.

El objetivo se cumplió: la aplicación se instala en la pantalla de inicio, arranca sin servidor y deja consultar la vault con kastor apagado de verdad.

Nota de formato: prosa plana sin Markdown, por la convención del proyecto. Salvo la última sección, LO QUE DECÍA STATUS.md, que conserva el Markdown con que se escribió allí.


QUÉ SE HIZO

Veintidós issues, veintiuno cerrados. El plan tenía catorce; los otros ocho aparecieron por el camino. El que queda abierto es el 469, que no es una tarea sino una medida con fecha: vence el 9 de septiembre de 2026.

Bloque 0, la planificación: el 458, que registró ADR-018 y ADR-019.
Bloque 1, el caché en el dispositivo: el 459 la base cifrada por cuenta, el 460 el desbloqueo sin servidor, el 461 el borrado al cerrar sesión y el 462 la pantalla que lo explica y lo enciende.
Bloque 2, la instalación: el 463 la CSP para el service worker, el 464 el manifest y los iconos, y el 465 el service worker.
Bloque 3, lo que se ve sin red: el 466 el aviso con la fecha de los datos y el 467 el rechazo de escrituras.
Bloque 4, la verificación: el 468 con kastor apagado, el 469 los siete días del iPhone y el 470 la lectura de la segunda cuenta.
Bloque 5, el cierre: el 471.

Y fuera de plan: el 476, el 478, el 479, el 490, el 492, el 493, el 496 y el 498.

ADR-019 es el que decide la iteración: caché de solo lectura, apagado por defecto, decidido por dispositivo, con el ciphertext en IndexedDB y nada descifrado en disco. Se escribió corto —153 líneas— a propósito, después de que ADR-018 saliera con 413 para una iteración que se descartó.

Y ADR-018 es justamente eso: quedó APROBADO PERO DIFERIDO. Decide historial de contraseñas, papelera y caducidad de sesión, y todavía no rige. La decisión de no ejecutarlo tiene motivo escrito: el rigor tiene que ser proporcionado a lo que esto es, una instancia personal con dos cuentas reales, y no un producto que deba cumplir normas externas.


LOS CRITERIOS DE SALIDA

Ocho, escritos al planificar el 2 de septiembre de 2026. Seis cumplidos, uno a medias y uno sin verificar. Se dice así en vez de estirar la definición.

El 1, abrir la vault en el móvil con kastor apagado: CUMPLIDO, y apagando kastor de verdad. Desde un iPhone, la aplicación arrancó sin red, desbloqueó la vault cacheada, mostró una entrada con sus datos y se negó a guardar diciendo por qué. La diferencia con el modo offline del navegador salió en el mismo acto y produjo el 490 (#468).

El 2, la aplicación instalada en la pantalla de inicio del iPhone: CUMPLIDO. Arranca sin barra de direcciones y con el icono correcto (#464).

El 3, el caché sigue ahí tras siete días sin abrirla: SIN VERIFICAR. El reloj arrancó el 2 de septiembre a las 17:43 y no vence hasta el 9 a las 17:43, así que al cerrar la iteración no había resultado que anotar. NO se anota como fallido: lo que mide es si Safari poda el almacenamiento de una aplicación instalada, y eso es una propiedad de Safari con una fecha, no una entrega pendiente. Se cerró la iteración sin él y el resultado aterrizará en el propio 469 (#469).

El 4, cerrar sesión deja el dispositivo sin caché: CUMPLIDO, comprobado por mutación (#461).

El 5, la segunda cuenta en el mismo navegador no ve nada de la primera: CUMPLIDO, comprobado por mutación (#461).

El 6, sin red crear o editar dice por qué y no lo intenta: CUMPLIDO, y verificado además en navegador de verdad durante el 468: al modificar un campo e intentar guardar, el aviso se puso en rojo en vez de dejar fallar la petición (#467).

El 7, la segunda cuenta activa el offline sin que nadie se lo explique: A MEDIAS. Encontró la opción sola y la entendió, y eso es la mitad que sale bien. Pero NO llegó sola al caso principal —que el servidor puede estar caído— y solo lo entendió cuando se lo dijeron de viva voz, que es exactamente lo que el criterio definía como fallo del texto. El arreglo fue el texto, que es lo que el criterio pedía, y es el 498. Lo que impide marcarlo cumplido es que ya no se puede volver a medir: no quedan lectores en frío en esta instancia (#470, #498).

El 8, verificadores en verde, comprobadores en cero y CI en verde: CUMPLIDO, y ejecutado el día del cierre y no heredado. Los ocho límites de verify-large-vault en verde sobre 370 entradas, con la revisión marcando 246 de 370 y multiplicando la página por 0,7. verify-auto-lock con ocho de ocho casos en 18,7 minutos de reloj real, incluido el caso 9 con su recibo dentro: el código TOTP pasó de 532115 a 808888 sin que nadie tocara nada, y la vault se bloqueó igual a los 15,8 minutos. check-docs.py y check-comment-language.py --all en cero, los 105 tests del utillaje en verde y Larastan en max sin errores.


LAS MEDICIONES, TOMADAS AL CERRAR

Tests: 823 en la web (64 ficheros), 263 en la API (2.720 aserciones) y 105 del utillaje. Son 1.191, contra los 1.073 del cierre de la 13.
Cobertura: 95,19 por ciento global y 98,69 en lib/vault, con las funciones de lib/vault al 100.
Issues abiertos al cerrar: dos, este y el 469 con su reloj corriendo. PRs abiertos: cero.
Alertas de Dependabot ABIERTAS: cero. La API devuelve dieciséis en total, todas en estado fixed, y contarlas todas da un número que no significa nada.
ADR: diecinueve, dos nuevos —el 018 y el 019—.
Y el recuento de la auditoría sobre la vault real sigue en 246 de 369, con una contraseña compartida por 41 entradas. Se anota como medición y no como criterio: bajarlo exige cambiar contraseñas de verdad y es trabajo de quien tiene la vault.


LO QUE APARECIÓ POR EL CAMINO Y NO ESTABA EN EL PLAN

Ocho issues, y el patrón vuelve a ser el de siempre: ninguno lo encontró una herramienta corriendo sola.

El 490 salió de la verificación del 468, con kastor realmente apagado: sin red la aplicación tardaba varios segundos en pintar, porque «primero la red» significa esperar a que la conexión agote su plazo. Los tests hacen fallar el fetch al instante, así que ahí no se ve.

El 492 salió de usar la aplicación: con kastor parado, la pantalla de desbloqueo no decía nada. Alguien tecleaba su contraseña maestra sin saber si serviría de algo y se enteraba de que estaba sin red una vez dentro. La mitad que decide no es «no hay conexión» sino si este dispositivo guarda copia.

El 493 y el 498 salieron de leer y de que otros leyeran. El primero, del diálogo de import, que no decía por qué no se podía importar sin red; el segundo, entero de la lectura del 470.

El 476 salió de encontrar evault.sinred, una clave en español nacida de un comentario que sostenía que renombrar pierde lo guardado. Vale para una clave que YA existe y no dice nada sobre cómo llamar a una nueva. Las cinco pasaron a inglés aceptando la pérdida a propósito.

El 478 salió de que la regla de idioma decía que los name de los workflows iban en español porque los lee una persona, mientras tres de los cuatro ya estaban en inglés. El principio que lo zanja: en español solo lo que ve el usuario de la aplicación.

El 479 salió al desplegar: git pull pedía usuario en un repositorio público. No eran las credenciales sino HTTP/2 entre git, libcurl y GitHub.

El 496 salió de mirar el menú de usuario para escribir el guion del 470: dos de sus cuatro destinos no llevaban icono.


LAS LECCIONES

UN TEXTO PUEDE FALLAR SIN QUE NINGUNA FRASE SUYA SEA FALSA, y es la lección más cara de la iteración. La pantalla del caché decía todo lo que tenía que decir, incluido el caso del servidor caído. Una persona que no la había construido la leyó entera, la entendió, y aun así se llevó solo la mitad: se quedó con «me quedo sin internet» y le pareció poco útil justo en el dispositivo donde el otro caso aplica más. Eso no lo encuentra un test, ni releerlo uno mismo, ni un diff. Hace falta alguien que no lo haya escrito.

UN AVISO LEÍDO NO ES UN AVISO QUE PESE. El bloque que dice lo que cuesta activar el caché se leyó entero —el ámbar hizo su trabajo— y no apareció en la decisión: salió al comentar el texto, no al decidir. Un coste enunciado sin un «entonces haz esto» deja a quien lee sosteniendo una alarma sobre la que no puede actuar. Lo que faltaba no era menos color sino una instrucción, y por eso el ámbar se quedó y lo que cambió fue el final del párrafo.

EL PRIMER INTENTO DE UNA PRUEBA CON PERSONAS PUEDE NO MEDIR NADA, y el fallo estaba en el instrumento. El guion decía «el menú de arriba a la derecha» sobre un menú que está abajo a la izquierda, así que la lectora no encontró la opción. Lo escribió quien construyó la pantalla, que es exactamente quien no puede ver dónde están las cosas. Un resultado de un instrumento roto se parece mucho a un resultado.

PRECACHEAR DESDE EL HTML DEJA FUERA LOS CHUNKS DE RUTA, y se midió en vez de suponerse. El HTML de entrada nombra los chunks de entrada y nada más, y el worker instala y reclama DESPUÉS de que la página haya pedido sus recursos, así que los de ruta no pasan por él tampoco. Con el servidor apagado, una primera visita no pintaba aplicación y salía el aviso de «hay una versión nueva». Lo cierra build.manifest de Vite, que existe solo para esto.

UNA SALIDA PLAUSIBLE NO ES UNA SALIDA VERIFICADA. El generador de iconos produjo cuatro PNG con buena pinta que eran capturas de su propia página de error: el chromium confinado por snap no puede leer /tmp. Lo cazó que dos iconos de 512 con escalas distintas salieran byte a byte idénticos. Ahora el generador comprueba lo que produjo —caja del dibujo, opacidad, tamaño— y solo copia sobre el bueno si la comprobación pasa; un intento fallido llegó a corromper un icono correcto porque escribía antes de comprobar.

UN TEST QUE PASA CON EL ARREGLO Y SIN ÉL, otra vez y en sitio nuevo. La prueba de la condición de carrera del aviso sin red pasó dos veces con el guardián puesto y quitado: la primera versión dejaba que la sesión volviera a estar en línea, y la segunda resolvía la lectura de la otra cuenta a null justo después. Solo discrimina si esa lectura no se resuelve nunca. Es la lección del 360 reaprendida, y confirma que no basta con saberla.

UN DOCUMENTO MIENTE CON AUTORIDAD, y esta vez lo hizo dos veces sobre la misma medida. SPRINT_CONTEXT.md decía que el reloj del 469 eran las 16:17 cuando el issue decía 17:43 —las 16:17 eran un intento descartado—, y los dos decían «martes 9» cuando el 9 es miércoles. Cualquiera de los dos errores rompe la medida: abrir la PWA antes de tiempo no adelanta el resultado, lo destruye. Lo que debería haber cantado la segunda es que el reloj arrancó en miércoles.

UNA MEDIDA QUE NECESITA TIEMPO REAL NO ES UNA TAREA QUE BLOQUEE UN CALENDARIO, y hubo que aprenderlo dos veces en la misma iteración. Primero proponiendo congelar el despliegue una semana para conservar una hora y media de reloj; después dejando que el 469 bloqueara el cierre entero. El proyecto ya tenía el precedente escrito: la 13 cerró con su criterio del TOTP sin verificar y con dueño conocido. Una observación con fecha se anota y se sigue.

Y UN MENSAJE DE ERROR PUEDE NOMBRAR UNA CAUSA QUE NO ES. «Could not read Username for https://github.com» en un repositorio público, sin credential.helper y con el despliegue anterior funcionando. Buscar por «credenciales» no lleva a ninguna parte: era HTTP/2. Se diagnostica en dos comandos —curl devuelve 200 sobre el mismo endpoint, y git responde si se le quita HTTP/2— y se arregla en el clon y no en global, porque esa máquina convive con otro proyecto.


LO QUE NO SE HIZO Y POR QUÉ

Escribir sin red con cola de sincronización, descartado en ADR-019 y no por esfuerzo: el servidor no puede resolver un conflicto que no puede leer, así que la cola tendría que resolverlo el cliente que vuelva primero, sobre datos que el otro cliente no ha visto. El caché es de solo lectura a propósito.

Ejecutar ADR-018 —historial de contraseñas, papelera y caducidad de sesión—, aprobado y diferido. Está entero escrito y no hay que volver a pensarlo cuando se decida activarlo.

La extensión de Firefox y Chrome, que es donde está el autofill y que exige resolver antes dónde vive la clave desbloqueada, porque Manifest V3 mata el service worker de fondo y eso choca con ADR-007. Y una app nativa de iOS como proveedor de contraseñas, que no se puede hacer con una PWA y es un cliente entero, no una funcionalidad.

Probar un código TOTP contra un servicio real, que sigue siendo el criterio 2 de la 13 y necesita una persona con una cuenta de prueba. Y bajar el recuento de la auditoría, que exige cambiar contraseñas de verdad y es trabajo de quien tiene la vault, empezando por la que comparten 41 entradas.


LO QUE DECÍA STATUS.md

Hasta el 11 de septiembre de 2026, STATUS.md conservaba el objetivo, los criterios de salida y los riesgos de todas las iteraciones cerradas, y llegó a 288 KB: ya no cabía en una lectura. El 663 los sacó de allí por la regla de una sola fuente de docs/GUIDE.md, y lo que decía de esta iteración está aquí copiado sin tocar, salvo los enlaces relativos, ajustados a esta carpeta.

EL OBJETIVO QUE LLEVABA STATUS.md

**Iteración 14: cerrada el 3 de septiembre de 2026.** Objetivo cumplido: *la vault se instala en el móvil y se lee sin red.*

**Veintidós issues, veintiuno cerrados**, ocho de ellos abiertos por el camino sobre un plan de catorce. El que queda abierto es #469, que no es una tarea sino una medida con fecha. `ADR-019` deja de ser una decisión escrita para ser código: la aplicación se instala en la pantalla de inicio, arranca sin servidor y deja consultar la vault con kastor apagado de verdad — verificado apagándolo, no con el modo offline del navegador.

**Seis criterios cumplidos, uno a medias y uno sin verificar.** El detalle y las lecciones están en [docs/planning/archive/ITERACION_14.md](ITERACION_14.md).

**Es la cuarta iteración seguida que elige su objetivo en vez de heredarlo**, y eligió funcionalidad de uso en vez de política. Sobre la mesa había una iteración de red de seguridad —historial, papelera, caducidad de sesión— y se descartó con un argumento explícito: **eVault no es un producto que deba cumplir normas externas, es una instancia personal con dos cuentas reales.** No se tiró: está escrita entera en `ADR-018`, aprobada y diferida.

**Lo que cambió de fondo.** Antes, si kastor no respondía **no había vault**, ni siquiera para leer una contraseña consultada hace diez minutos. Y desde el 26 de agosto de 2026 eso no le pasaba solo a quien administra la máquina: la segunda cuenta no puede diagnosticar por qué kastor calla ni arreglarlo, solo observar que no funciona.

**Lo que abarató la iteración entera, y está en `ADR-019` §1: desbloquear sin red no necesita servidor en absoluto.** Por `ADR-008` el hash de autenticación solo consigue un token y el token solo trae el ciphertext; con el ciphertext ya en el dispositivo no queda nada que pedir, y una contraseña incorrecta falla sola porque AES-GCM no valida su tag.

**Lo que `ADR-019` acepta en voz alta, porque es lo caro de deshacer:** cachear la vault **quita el rate limiting de en medio**. Lo hace aceptable que el proyecto ya asumiera esa propiedad en la Iteración 4 con los ficheros `.evault`, y que las 600.000 iteraciones de PBKDF2 se dimensionaran para eso. Cambia la frecuencia, no la naturaleza — y por eso el caché está **apagado por defecto**.

**El patrón de la iteración, y es distinto al de las anteriores: el hallazgo más caro no lo encontró ninguna herramienta ni ningún verificador, sino una persona que no había construido nada leyendo una pantalla.** El texto del caché no decía nada falso y aun así entregaba la mitad de su utilidad. Los otros ocho hallazgos no planificados siguen el patrón de siempre —usar la aplicación, desplegar, correr algo a escala real—, pero ninguno de ellos habría encontrado ese.

**Y tres errores de método propios, que se anotan porque callarlos sería el fallo que este repositorio lleva seis iteraciones documentando:**

1. **El guion de la prueba con personas lo escribió quien construyó la pantalla, y mandaba al sitio equivocado** — «arriba a la derecha» sobre un menú que está abajo a la izquierda. El primer intento no midió nada, y un resultado de un instrumento roto se parece mucho a un resultado.
2. **`SPRINT_CONTEXT.md` mintió dos veces sobre la misma medida**: decía las 16:17 cuando el reloj del #469 son las 17:43, y «martes 9» cuando el 9 es miércoles. Cualquiera de los dos habría hecho abrir la PWA antes de tiempo, que no adelanta el resultado sino que lo destruye.
3. **Se convirtió una medida de tiempo real en una dependencia de calendario, dos veces.** Primero proponiendo congelar el despliegue una semana para conservar hora y media de reloj; después dejando que #469 bloqueara el cierre entero. El precedente ya estaba escrito: la 13 cerró con su criterio del TOTP sin verificar y con dueño conocido.

LOS CRITERIOS QUE LLEVABA STATUS.md

### Iteración 14, cerrada el 3 de septiembre de 2026

**Seis cumplidos, uno a medias y uno sin verificar.** Se dice así en vez de estirar la definición.

1. **Con kastor apagado, se abre la vault en el móvil y se lee una entrada.** `Cumplido`, y apagando kastor de verdad. Desde un iPhone: arrancó sin red, desbloqueó la vault cacheada, mostró una entrada con sus datos y se negó a guardar diciendo por qué. La diferencia con el modo offline del navegador salió en el mismo acto y produjo #490 — sin red la aplicación tardaba varios segundos en pintar, porque «primero la red» significa esperar a que la conexión agote su plazo, y los tests hacen fallar el fetch al instante (#468).
2. **La aplicación está instalada en la pantalla de inicio del iPhone y arranca sin barra de direcciones.** `Cumplido`, con el icono correcto (#464).
3. **Tras siete días sin abrirla, el caché sigue ahí.** `SIN VERIFICAR`. El reloj arrancó el 2 de septiembre a las 17:43 y no vence hasta el **miércoles 9 a las 17:43**, así que al cerrar no había resultado. **No se anota como fallido**: mide si Safari poda el almacenamiento de una aplicación instalada, que es una propiedad de Safari con fecha y no una entrega pendiente. La iteración cerró sin él y el resultado aterriza en el propio issue (#469).
4. **Cerrar sesión deja el dispositivo sin caché.** `Cumplido`, comprobado por mutación (#461).
5. **Entrar con la segunda cuenta en el mismo navegador no ve nada de la primera.** `Cumplido`, comprobado por mutación (#461).
6. **Sin red, crear o editar dice por qué y no lo intenta.** `Cumplido`, y verificado además en navegador de verdad durante #468: al modificar un campo e intentar guardar, el aviso se puso en rojo en vez de dejar fallar la petición. El rechazo vive en `vault/api.ts` y no en las pantallas, que es el único sitio por el que pasan las tres escrituras (#467).
7. **La segunda cuenta activa el offline sin que nadie se lo explique.** `A MEDIAS`. Encontró la opción sola y la entendió — esa mitad sale bien. Pero **no llegó sola al caso principal**, que el servidor puede estar caído, y solo lo entendió cuando se lo dijeron de viva voz; que es exactamente lo que el criterio definía como fallo del texto. El arreglo fue el texto, que es lo que el criterio pedía, y es #498. Lo que impide marcarlo cumplido es que ya no se puede volver a medir: **no quedan lectores en frío en esta instancia** (#470, #498).
8. **Verificadores en verde, comprobadores en cero y CI en verde.** `Cumplido`, ejecutado el día del cierre y no heredado: los ocho límites de `verify-large-vault.mjs` en verde sobre 370 entradas —con la revisión marcando 246 de 370 y multiplicando la página por 0,7—, `verify-auto-lock.mjs` con **ocho de ocho casos en 18,7 minutos de reloj real** —incluido el caso 9 con su recibo dentro: el código TOTP pasó de 532115 a 808888 sin que nadie lo tocara y la vault se bloqueó igual—, `check-docs.py` y `check-comment-language.py --all` en cero, los 105 tests del utillaje en verde y Larastan en `max` sin errores.

**Los criterios 4 y 5 se comprobaron por mutación y no por observación, y era deliberado**: las dos promesas son invisibles usando la aplicación. Un caché que no se borra funciona perfectamente —la aplicación va más rápida y nada falla— y se descubre el día que importa.
### Iteración 14, en curso

**Ocho criterios, escritos al planificar el 2 de septiembre de 2026.** Se evaluarán uno a uno al cerrar, y se anotarán como salgan.

1. **Con kastor apagado, se abre la vault en el móvil y se lee una entrada.** Apagando kastor de verdad, no con el modo offline del navegador: entre las dos hay diferencias que solo aparecen en la segunda —un DNS que resuelve pero no conecta, timeouts en vez de fallos inmediatos— (#468).
2. **La aplicación está instalada en la pantalla de inicio del iPhone y arranca sin barra de direcciones** (#464).
3. **Tras siete días sin abrirla, el caché sigue ahí.** Es el riesgo de `ADR-019` §7: Safari puede podar el almacenamiento de un sitio a los siete días, y las aplicaciones instaladas *deberían* quedar fuera de esa poda. **Si sale que no se sostiene, se dice y se ajusta la promesa** — la decisión sigue valiendo en escritorio y Android (#469).
4. **Cerrar sesión deja el dispositivo sin caché**, comprobado por mutación (#461).
5. **Entrar con la segunda cuenta en el mismo navegador no ve nada de la primera**, comprobado por mutación (#461).
6. **Sin red, crear o editar dice por qué y no lo intenta**, en vez de dejar fallar la petición (#467).
7. **La segunda cuenta activa el offline sin que nadie se lo explique.** No mide el código: mide si el texto se escribió para alguien que no construyó esto. Si hay que explicárselo, el arreglo es el texto (#470).
8. **Verificadores en verde, comprobadores en cero y CI en verde**, ejecutados el día del cierre.

**Los criterios 4 y 5 se comprueban por mutación y no por observación, y es deliberado**: las dos promesas son invisibles usando la aplicación. Un caché que no se borra funciona perfectamente —la aplicación va más rápida y nada falla— y se descubre el día que importa.

LOS RIESGOS QUE LLEVABA STATUS.md

Los riesgos eran un registro acumulado y sus filas no decían de qué iteración eran, así que cada una vino al archivo de la iteración más reciente que cita. Su estado es el que tenía el día que se retiró de STATUS.md, y NO se ha vuelto a comprobar: varias decían «Abierto» de algo ya cerrado. Un riesgo que siga vivo se reescribe en la tabla de la iteración en curso con su estado de hoy, no se copia de aquí.

| Riesgo | Estado | Detalle |
| --- | --- | --- |
| **Safari poda el almacenamiento a los siete días** | `Abierto al cerrar, con la medida en vuelo y con fecha: 9 de septiembre de 2026, 17:43` | Es el riesgo de `ADR-019` §7 y el que puede vaciar la iteración de contenido en la plataforma que más la necesita. Safari borra el almacenamiento de un sitio tras siete días sin usarlo; las aplicaciones instaladas en la pantalla de inicio **deberían** quedar fuera de esa poda, pero «deberían» no es haberlo visto. **No se da por sabido: se comprueba en el dispositivo real**, y por eso el criterio 3 tarda siete días de calendario y arranca en cuanto exista el manifest. Si no se sostiene, la decisión no cambia —escritorio y Android siguen valiendo— pero la promesa al usuario sí. **La iteración cerró sin este dato a propósito**: una medida que necesita tiempo real no es una tarea que bloquee un calendario, y el precedente estaba escrito —la 13 cerró con su criterio del TOTP sin verificar (#469)** |
| **El caché miente sin avisar** | `Cerrado con mitigación, no eliminado` | La consecuencia asumida en `ADR-019` §6.2: si la contraseña cambió en otro dispositivo, la que se lee sin red es la vieja. **Y el fallo es silencioso por definición** — la aplicación funciona, la entrada aparece, la contraseña se copia y el servicio la rechaza sin decir por qué. Leer una vault de hace tres días creyendo que es la de hoy es peor que no poder leerla. La mitigación es el indicador de #466 y **está puesta**: el aviso dice de cuándo son los datos, que es la mitad que hace el trabajo —«estás sin red» es un estado, una fecha es lo que deja decidir si fiarse—. Sigue sin ser completa, y por eso se cierra como mitigado y no como resuelto: acota el engaño, no lo elimina |
| **El service worker se queda clavado en un shell viejo** | `Cerrado sin materializarse` | El fallo clásico de las PWA: se despliega una versión nueva y el navegador sigue sirviendo la anterior indefinidamente, sin error y sin síntoma. En una aplicación que guarda contraseñas, quedarse en un cliente viejo sin enterarse es exactamente la clase de fallo que este proyecto persigue. **La estrategia de actualización fue dentro de #465 desde el principio, no como parche después**: `skipWaiting` y `clients.claim` para que la versión nueva tome el control sin que nadie borre nada, y las navegaciones **primero a la red** para que un shell viejo no sobreviva mientras haya conexión. El coste está dicho en el propio fichero: una pestaña abierta durante un despliegue puede pedir un chunk que ya no existe, que es el «chunk load error» ordinario de cualquier build con hash |
| **La CSP se verifica solo en desarrollo** | `Cerrado, verificado en producción` | `csp.ts` avisa de dos cosas que aquí se cruzan: la política viaja en un `<meta http-equiv>`, donde hay directivas que se ignoran, y **el build de desarrollo es más permisivo que el de producción**. Hoy `worker-src` está en `'none'` y bloquea el service worker; cambiarlo y comprobarlo solo con `npm run dev` es no comprobarlo. Es la misma forma que el hallazgo de la Iteración 10: un comprobador que devuelve un cero tranquilizador. **Cerrado comprobándolo donde importa**: sobre la instancia real de kastor, el service worker aparece `activated` con 47 entradas en caché, ninguna de `/api/`, y el único mensaje de consola es el bloqueo de `eval` que se busca (#463) |
