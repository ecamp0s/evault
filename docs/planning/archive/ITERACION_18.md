ITERACIÓN 18 — Historial y lecciones aprendidas

Archivo de la Iteración 18, cerrada el 16 de septiembre de 2026. Recoge la intención de cada issue y lo que se aprendió al cerrarlo.

Está archivado, no muerto. Es la iteración en la que la vault salió de la pestaña: una extensión de Chrome que se desbloquea con el mismo passkey que da de alta la web, busca, copia y rellena con un gesto, y no escribe nada. Y es también aquella en la que LOS ADR SE EQUIVOCARON TRES VECES EN HECHOS QUE CITABAN, y las tres se descubrieron al tener que comprobar algo de verdad: un test, un verificador, un recuento que no cuadraba.

El objetivo se cumplió: la vault se abre desde la barra del navegador. El 16 de septiembre, en el portátil de quien la tiene, Windows Hello abrió la vault de kastor desde la extensión, y la huella de las 669 entradas salió idéntica antes y después.

Nota de formato: prosa plana sin Markdown, por la convención del proyecto. Salvo la última sección, LO QUE DECÍA STATUS.md, que conserva el Markdown con que se escribió allí.


QUÉ SE HIZO

Dieciséis issues cerrados sobre un plan de dieciséis —los quince del 662 al 676 y el 646, que venía de la 17—, y cuatro abiertos por el camino que pasan a la 19: el 680, Firefox, y el 694, el 695 y el 696, la deuda de este cierre. Dieciséis PRs mergeados contando el de este cierre; uno de ellos es de Dependabot, el 693, que sustituyó al 682 cuando se le pidió rebasar. El 665 se cerró sin PR, porque era una medida y su resultado está en el propio issue.

Bloque 0, medir y decidir: el 662 planificó; el 665 midió con Windows Hello real que el passkey de la web abre la vault desde una extensión, con el mismo PRF y el mismo envoltorio, y sin CORS; y el 666 registró ADR-023, contestando uno a uno los cinco disparadores que otros ADR habían dejado para este día.
Bloque 1, el utillaje y los documentos: el 663 dejó STATUS.md con solo la iteración en curso, de 288 KB a 19; el 664 recortó SPRINT_CONTEXT.md y CLAUDE.md un 39 por ciento entre los dos y les puso un techo en check-docs.py; el 667 hizo que los verificadores pregunten por el cupo de altas antes de arrancar Chromium; y el 668 probó archify con un solo diagrama.
Bloque 2, la extensión: el 670 creó el paquete extension/, que compila web/src/lib/vault en vez de copiarlo; el 671 desbloquea desde el popup y guarda la clave en un documento offscreen; el 672 busca y copia, y limpia el portapapeles con el popup cerrado; y el 673 rellena con un gesto en la pestaña activa.
Bloque 3, la verificación: el 674 escribió verify-extension.mjs, el cuarto verificador de navegador, y el 675 fue la prueba en el portátil real.
Bloque 4, la vault: el 646 permite olvidar el historial de toda la vault, y el 669 pliega el segundo factor cuando la entrada no tiene semilla.
Bloque 5, el cierre: el 676, este documento.

LA API NO CAMBIÓ. Sobre toda la iteración, su diff es un comentario de config/throttling.php que afirmaba algo que ya no era verdad (667). Ni un endpoint, ni una columna, ni una migración: la extensión habla con la API que ya había.


LOS CRITERIOS DE SALIDA

Ocho, escritos al abrir el 11 de septiembre de 2026. Los ocho cumplidos. El 4 se reformuló durante la iteración porque su enunciado era falso al escribirlo, y se dice aquí en vez de callarlo.

El 1, ADR-023 registrado antes de la primera línea de extension/ y contestando los cinco disparadores: CUMPLIDO. El PR del ADR (679) se mergeó el 11 de septiembre a las 23:02, y el que creó extension/ (681), a las 23:23. Los cinco disparadores —ADR-007 sección 6.1, ADR-008 sección 6.4, ADR-016 sección 6, ADR-018 sección 6.4 y ADR-021 sección 6.3— tienen su respuesta escrita en el ADR. LA SALVEDAD, que no cambia lo decidido: el ADR cita dos hechos falsos. Su sección 2.8 dice que crypto.subtle aparece en un solo fichero, y totp.ts lo usa desde la Iteración 13; y su sección 4 da por imposible verificar el ciclo entero con un autenticador virtual, y el 671 y el 674 lo hicieron.

El 2, en el portátil real, Chrome con la extensión abre la vault de kastor con Windows Hello sin teclear la contraseña maestra, con la cuenta de entradas igual antes y después: CUMPLIDO el 16 de septiembre, por quien tiene la vault (675). Por el nombre de la tailnet y con el passkey que ya estaba dado de alta en la web. Buscó, copió, limpió el portapapeles, rellenó un formulario real y volvió bloqueada tras cerrar el navegador. La huella de DEPLOYMENT.md sección 7: 669 entradas, 166229 bytes hasheados y la misma SHA-256 antes y después.

El 3, la extensión no conserva la clave más tiempo del que dice ADR-023, verificado en navegador: CUMPLIDO (671, 674). verify-extension comprueba que la clave sobrevive a la muerte del service worker y no al bloqueo —que además cierra el documento y revoca el token, preguntado a la API y no a la extensión—, y que cerrar el navegador la borra y deja solo el correo. El plazo de quince minutos lo cubren los tests de keeper.ts con el reloj en la mano; el verificador comprueba lo que pasa cuando vence.

El 4, una sola implementación criptográfica: CUMPLIDO, con el enunciado corregido. Se escribió como «crypto.subtle solo en web/src/lib/vault/crypto.ts», y era falso: totp.ts lo usa para el HMAC de los códigos. Se reformuló como «ningún crypto.subtle en extension/», y eso lo vigilan oneImplementation.test.ts y una regla de ESLint, las dos en el CI; y en la web, cryptoSurface.test.ts falla si aparece un tercer fichero (670).

El 5, api/ cambia solo lo que diga ADR-023: CUMPLIDO. ADR-023 no pedía nada a la API, y lo único que cambió fue un comentario (667).

El 6, los cuatro verificadores ejecutados el día del cierre, verify-extension nacido en rojo, y ninguno puede morir por el cupo de altas sin decirlo antes de arrancar Chromium: CUMPLIDO. Sobre abfd0eb, el master con el último cambio de código, que es la subida de dependencias del 693: verify-auto-lock 8 de 8 en 18,3 minutos, a la tercera ejecución; verify-passkey 4 de 4 en 33 segundos; verify-extension 5 de 5 en 92 segundos; y verify-large-vault con sus once límites en verde sobre 370 entradas, la revisión marcando 205 de 308 y la reconciliación encontrando 96 grupos. verify-extension salió 5 de 5 en rojo sobre el árbol anterior al 671 (674), y los cuatro se niegan a arrancar en unos 300 milisegundos si el cupo no les alcanza (667). LO DE LA TERCERA SE DICE ENTERO: las dos primeras salieron 2 de 8 en rojo, con los casos 7 y 8 encontrando la vault ya bloqueada a los 15,4 y 15,2 minutos. Los textos del aviso eran correctos en las dos, y la captura del fallo los enseña en pantalla; lo que falló fue el instante en que se miran. La máquina se paró cerca de un minuto —el swap al 80 por ciento y otros Chromium arrancando—, el proceso de Node despertó hasta 43 segundos tarde, y la cuenta atrás de los avisos se quedó congelada en 50 y 48 segundos. La tercera, con la máquina en calma y vmstat al lado, salió en verde, pero mirando el aviso a los 14,9 minutos, a seis segundos del bloqueo. Ese margen es la deuda del 695.

El 7, el historial de toda la vault se puede olvidar con un gesto, verificado en navegador sobre datos sembrados: CUMPLIDO (646), nueve de nueve comprobaciones entrando por el menú como una persona. Hacerlo sobre la vault real lo decide quien la tiene, y no se ha hecho.

El 8, el formulario de un login sin semilla ya no lleva el segundo factor desplegado, con verify-auto-lock entero en verde después: CUMPLIDO (669). verify-auto-lock salió 8 de 8 el mismo día del cambio, con el caso 9 escribiendo la semilla tras desplegar el campo, y otra vez en el cierre.


LAS MEDICIONES, TOMADAS AL CERRAR

Tests: 1.223 en la web (75 ficheros), 310 en la API (2.842 aserciones), 160 del utillaje y 108 en la extensión (12 ficheros). Son 1.801, contra los 1.622 al abrir. La API no ganó ninguno porque la iteración no la tocó.
Cobertura: 95,63 por ciento global y 98,98 en lib/vault, con las funciones de lib/vault al 100.
Checks del CI: diez, uno más que al abrir: Extension, que construye, analiza y prueba extension/ cuando cambia algo de ella o de web/, porque compila su código.

Issues abiertos al cerrar: cinco, los cinco de la 19: el 624, reconciliar sin red, que ya venía movido; el 680, Firefox; y el 694, el 695 y el 696, la deuda de este cierre. Issues con el label deuda: tres, esos tres. PRs abiertos: cero.
Alertas de Dependabot ABIERTAS: cero. Su único PR de la iteración, el 682, se cerró solo al pedirle rebasar y lo sustituyó el 693, que subía once dependencias en vez de una —React 19.3, zod 4.6 y Vite 8.3 entre ellas—. Se mergeó el día del cierre, después de pasar en local la suite con cobertura y las builds de la web y de la extensión, y los cuatro verificadores corrieron sobre él.
ADR: veintitrés, uno nuevo, el 023.
Instancia: desplegada el 16 de septiembre con abfd0eb, con un usuario, una vault, 669 entradas y dos passkeys, y el frontend nuevo comprobado dentro de la imagen. Copia fuera de la máquina de antes de desplegar: la 65.
Los documentos que se leen al empezar: CLAUDE.md 23 KB y SPRINT_CONTEXT.md unos 34, con techos de 28 y 41 que comprueba check-docs.py.


LO QUE APARECIÓ POR EL CAMINO Y NO ESTABA EN EL PLAN

Cuatro issues, y los cuatro pasan a la 19.

El 680 salió de revisar ADR-023: quien tiene la vault preguntó si la extensión podía funcionar en Firefox, y al comprobarlo resultó que Firefox en Windows SÍ da PRF a la web. passkey.ts y ADR-021 afirmaban lo contrario, y con esa frase Firefox habría quedado descartado sin mirarlo. Lo que falta es medirlo desde una extensión y decidir dónde se custodia la clave, porque Firefox no tiene documentos offscreen.

El 694 es la deuda de este cierre: verify-extension no tiene ningún caso de rellenar. Rellenar se verificó en navegador dos veces —con una sonda fuera del repositorio en el 673 y a mano en el 675—, pero no se puede repetir con un comando, y es justo el camino donde el navegador encontró lo que jsdom no puede ver.

El 695 salió de verificar este cierre: verify-auto-lock mira el aviso de los casos 7, 8 y 9 en un instante fijo, a los 14 minutos y 45 segundos, y la vault se bloquea a los 15. Su propio comentario dice que el aviso hay que vigilarlo porque solo existe sesenta segundos, y los casos 2 y 3 lo vigilan; estos tres no. Con la máquina parada un minuto, el instante pasó de largo dos veces.

El 696 salió de leer el log del servidor de desarrollo mientras se buscaba la causa del anterior: desde el 693, React 19.3 imprime «Encountered a script tag» en cada carga, por el script que inyecta next-themes 0.4.6. React 19.2.4 no tenía ese aviso. No cambia nada visible ni en producción, pero un error que sale siempre enseña a no leer la consola.

Y LO QUE APARECIÓ SIN SER UN ISSUE. Las cinco de la planificación, que están en LO QUE DECÍA STATUS.md y se resolvieron dentro de la iteración. Las dos trampas del verificador de la extensión, que están en la lección tercera.

Y UN TERCER HECHO FALSO EN LOS ADR, encontrado al cerrar. Durante el 675 los tokens de kastor bajaron de 5 a 2 sin que la extensión borrara ninguno, y la explicación era el código que emite las sesiones: antes de dar un token nuevo, borra los caducados de la cuenta. Eso quiere decir que los tokens caducan, y caducan desde el 177, del 7 de agosto: cada token nace con 12 horas de vida y Sanctum rechaza el caducado, con test. ADR-018 sección 2.5, escrito el 2 de septiembre, leyó 'expiration' => null en config/sanctum.php y concluyó que un token vale para siempre; ADR-023 lo repitió diciendo que esa caducidad «sigue diferida». Lo único diferido de esa sección es el endpoint para cerrar las demás sesiones. Los ADR no se tocan; está anotado como sexta advertencia en SPRINT_CONTEXT.md.


LAS LECCIONES

UNA SOLA MEDIDA NO AUTORIZA UNA CONCLUSIÓN SI HAY UNA ALTERNATIVA OBVIA SIN PROBAR. El 665 midió que copiar una credencial del autenticador virtual entre dos pestañas pierde el secreto del PRF, y ADR-023 sección 4 concluyó que el ciclo entero no se podía verificar en automático. Lo de copiar era cierto; la conclusión no. En la misma pestaña, navegando de la web a la extensión, la credencial y su PRF se conservan, y el 674 cubre por eso el ciclo entero. Se descubrió en el 671, cuando hubo que verificar de verdad.

UN ADR REPITE LO QUE LEE, Y LO QUE LEE PUEDE SER FALSO, y esta iteración lo encontró tres veces. La sección 2.8 de ADR-023 copió de crypto.ts y de SPRINT_CONTEXT.md que crypto.subtle vive en un solo fichero, y el criterio 4 copió lo mismo; se descubrió al escribir el test que lo habría hecho fallar (670). Y ADR-023 repitió de ADR-018 que la caducidad del token está diferida, cuando lleva en vigor desde agosto; se descubrió al explicar un recuento que no cuadraba. En los dos casos la frase estaba escrita con autoridad en varios sitios y ninguno había mirado el código.

CUANDO UN VERIFICADOR FALLA, LA PRIMERA SOSPECHA TIENE QUE SER EL VERIFICADOR, y el 674 lo cobró dos veces en una hora. Un Chromium de una ejecución interrumpida se había quedado con el puerto, y las ejecuciones siguientes lo conducían a él con la carpeta de la extensión ya borrada: todo fallaba con ERR_BLOCKED_BY_CLIENT, que se lee exactamente como «el navegador ya no admite --load-extension». Se llegó a mover los perfiles fuera de /tmp por una teoría sobre el confinamiento de snap que no era la causa. Y Page.navigate devuelve ese mismo error para cualquier navegación a una página de extensión que sí carga, así que creerle paró una ejecución que pasaba. Ahora el verificador se niega a arrancar con el puerto ocupado y le pregunta al documento qué es.

UNA CIFRA ESCRITA NO ES LA CIFRA DE LA MÁQUINA. El cierre de la 17 hizo cuentas con un límite de diez altas por hora que este clon no aplicaba, porque su .env decía mil y ningún documento lo mencionaba; y CLAUDE.md contaba cinco cuentas donde verify-passkey registraba cuatro, y la cabecera de verify-auto-lock cinco donde eran ocho. El 667 no corrigió las cifras: hizo que los verificadores pregunten a la API, y que register() falle si una ejecución registra más de lo que declaró.

UNA REGLA SIN COMPROBADOR VUELVE A ROMPERSE, y SPRINT_CONTEXT.md lo demostró dos veces. Dice en su propio segundo párrafo que llegó a 450 líneas en la Iteración 1 y dejó de servir, y volvió a crecer hasta 60 KB. El 664 recortó y después puso el techo, en ese orden, para que el check no naciera en rojo; y el mensaje del check dice que se corta y no que se sube el número, porque un techo sin esa frase se sube.

NUEVE COMPROBACIONES EN VERDE NO DICEN QUE LO QUE SE DIBUJA SEA VERDAD. El validador de archify rechazó seis defectos reales de maquetación antes de aceptar el diagrama, y aceptó sin protestar una leyenda que llamaba «async batch» a la flecha del hash de autenticación. Era el vocabulario de la herramienta, no el del dominio, y en el escaparate del repositorio habría sido una afirmación falsa (668).

EL NAVEGADOR SIGUE ENCONTRANDO LO QUE LOS TESTS NO VEN, y en esta iteración tres veces. Un campo dentro de un contenedor de 0×0 con overflow hidden mide 200×24, checkVisibility dice que se ve, y se rellenaba (673). Borrar el portapapeles con navigator.clipboard desde el documento offscreen resuelve y no borra nada, y desde el popup sin foco no copia (672). Y el popup de verify-extension tiene todo su HTML en el DOM antes de que su código haya preguntado nada: enviar el formulario en ese instante no hace nada y no dice nada (674).

UN VERIFICADOR EN ROJO EL DÍA DEL CIERRE NO SE REPITE HASTA QUE SALGA VERDE: SE EXPLICA. La segunda ejecución de verify-auto-lock se lanzó creyendo que la primera había fallado por la carga de otras herramientas, y falló igual sin ellas. Lo que la explicó no fue repetirla, sino cruzar sus horas con las del log de la API y ver que Node y el navegador habían despertado tarde a la vez. Solo entonces tuvo sentido la tercera, y con vmstat al lado para que un tercer rojo dejara la prueba.

Y UNA MÍA DE MÉTODO, que costó trabajo y pudo costar más. Al comprobar por mutación el 669, deshice la mutación con git checkout sobre un fichero cuyo cambio aún no estaba en ningún commit, y se llevó el cambio entero junto con la mutación. Se vio en el siguiente git diff y se reaplicó, pero una mutación se hace sobre trabajo guardado —en un commit o con una copia—, porque la herramienta que la deshace no distingue entre las dos.


LO QUE DECÍA STATUS.md

Al cerrar esta iteración, su texto de las tres secciones manuales de STATUS.md se movió aquí, como pide docs/GUIDE.md desde el 663, y salió de allí. Está copiado sin tocar, salvo el párrafo que abre el objetivo, los criterios evaluados y el estado de los riesgos, que se pusieron al día el día del cierre.

EL OBJETIVO QUE LLEVABA STATUS.md

**Iteración 18: cerrada el 16 de septiembre de 2026.** Objetivo cumplido: *la vault se abre desde la barra del navegador.*

**En el portátil de quien tiene la vault, Windows Hello abrió la vault de kastor desde la extensión de Chrome** con el passkey que ya estaba dado de alta en la web, y la huella de las 669 entradas salió idéntica antes y después (#675). Dieciséis issues cerrados sobre un plan de dieciséis; el #680, Firefox, y el #694, el #695 y el #696, la deuda del cierre, pasan a la 19.

**Los ocho criterios cumplidos; el 4 con su enunciado corregido**, porque el original era falso al escribirlo. El detalle y las lecciones están en [docs/planning/archive/ITERACION_18.md](ITERACION_18.md).

**Y la lección que la cierra: una sola medida no autoriza una conclusión si hay una alternativa obvia sin probar.** `ADR-023` §4 dio por imposible verificar el ciclo entero con un autenticador virtual porque copiar la credencial pierde el PRF; navegando en la misma pestaña no lo pierde, y el #674 lo verifica entero.

Lo que sigue es la planificación con la que se abrió.

**Quince issues planificados**, del #662 al #676, más el #646, que viene de la 17. Es la **extensión de navegador**, el candidato principal desde el 3 de septiembre de 2026, y **solo Chrome en esta iteración**, por los datos: Firefox aportó 2 entradas de 997 en el #610, y el portátil con Windows Hello usa Chrome. Firefox se mide en el #665 y no se construye todavía.

**Lo que la hace posible ahora y no antes: el passkey.** Manifest V3 mata el service worker de fondo, y eso chocaba con `ADR-007`: no había sitio donde guardar la clave desbloqueada. Con `ADR-021`, la extensión **no custodia la clave: la re-deriva con un toque biométrico**. Que funcione así depende de algo que `ADR-021` §1 anotó y nadie ha medido con PRF, y por eso **el primer issue es una medida y el segundo un ADR**, los dos antes de una línea de `extension/`.

**Cinco ADR dejaron escrito un disparador para este día**, y `ADR-023` tiene que contestarlos todos. Es la lección de la 17 aplicada antes de empezar: un ADR aprobado y diferido es invisible por partida doble.

| ADR | Qué deja pendiente |
|---|---|
| `ADR-007` §6.1 | Un cliente que no desbloquea con comodidad obliga a revisar el token en memoria |
| `ADR-008` §6.4 | El presupuesto de CPU: 600.000 iteraciones de PBKDF2 dentro de una extensión |
| `ADR-016` §6 | CORS, si una extensión llega a necesitarlo |
| `ADR-018` §6.4 | Las 12 horas del token se eligieron para un cliente que recarga |
| `ADR-021` §6.3 | El *salt* del PRF y el `rpId` pasan a ser contrato entre dos clientes |

**Seis bloques.** Bloque 0, medir y decidir: #662, #665 y #666 (`ADR-023`). Bloque 1, el utillaje y los documentos: #663, #664, #667 y #668. Bloque 2, la extensión: #670, #671, #672 y #673. Bloque 3, la verificación: #674 y #675. Bloque 4, la vault: #646 y #669. Bloque 5, el cierre: #676.

**Lo que se decidió al planificar, para que no se reabra por inercia:**

- **#624 pasa a la 19.** Reconciliar sin red no tiene un camino roto, tiene uno que no existe todavía.
- **La papelera y la caducidad del token de `ADR-018` siguen diferidas**, y ahora con motivo: la caducidad la tiene que revisar `ADR-023` contra un cliente que no recarga, y la papelera se decide con la extensión delante.
- **El segundo factor se pliega y no se retira** (#669). Quien tiene la vault dijo que el campo es ruido en el formulario; el #545 decidió no retirarlo, y plegarlo respeta esa decisión sin superseder `ADR-017`.
- **archify entra como prueba de un solo diagrama** (#668), fijado a un commit revisado y sin copiarlo dentro del repositorio.
- **`STATUS.md` se adelgaza primero** (#663): con 288 KB ya no cabe en una lectura, y la planificación de esta misma iteración tropezó con eso.

### Lo que apareció al planificar y no estaba en ningún documento

1. **El límite de diez altas por hora que citó el cierre de la 17 no es el de este clon.** `api/.env` tiene `THROTTLE_REGISTER_ATTEMPTS=1000` desde el 27 de agosto de 2026 y `config()` lo confirma, así que o el cierre corrió contra otra API o la cuenta se hizo con la cifra del documento. **Y SETUP.md no menciona el ajuste**, así que en un clon nuevo el problema es real. Es el patrón de siempre, una afirmación con autoridad que nadie volvió a comprobar, y lo recoge el #667.
2. **Un comentario defensivo que sobrevivió a su motivo**: `api/config/throttling.php` dice que `CLAUDE.md` lista sus claves entre las excepciones de idioma, y esa lista la retiró el #542. Es el mismo mecanismo que el #542 describe. Al #667.
3. **Un superviviente de la conversión de idioma**: `copyToClipboard` documenta `@param vaciarDespues`, y el parámetro se llama `clearAfterwards`. Al #672.
4. **La limpieza del portapapeles no sobreviviría a la extensión tal como está.** La SPA la programa con un `setTimeout`, y el popup de una extensión se cierra en cuanto la persona hace clic en la página para pegar: el temporizador muere justo en el caso normal. Salió al comprobar lo que afirmaba el cuerpo del #672, que decía algo falso sobre `clipboard.ts`.
5. **Los documentos que se leen al empezar suman unos 19.000 *tokens***: `SPRINT_CONTEXT.md` 49 KB y `CLAUDE.md` 29 KB. El primero dice de sí mismo que hay que mantenerlo corto, y nada lo comprueba. Al #664.

**Lo que queda fuera a propósito:** Firefox, que se mide y no se construye; el autocompletado al cargar la página, que no se plantea ni aunque `ADR-023` admita rellenar con un gesto (#673); y escribir desde la extensión, que es de solo lectura en esta iteración.

**Las mediciones al abrir**, tomadas el 11 de septiembre de 2026 y no heredadas del cierre: **1.185 tests** en la web (71 ficheros), **310** en la API con 2.842 aserciones y **127** del utillaje, **1.622** en total; cobertura del **95,14 %** global y **98,88 %** en `lib/vault`, con sus funciones al 100 %. Coinciden con las del cierre de la 17, porque entre las dos no hay código. **Dos issues abiertos** antes de planificar, **cero** de deuda, **cero** PRs y **cero** alertas de Dependabot abiertas; el CI, en verde en los cuatro workflows sobre `e0a7ca9`.

LOS CRITERIOS QUE LLEVABA STATUS.md

### Iteración 18, cerrada el 16 de septiembre de 2026

**Ocho criterios, escritos al abrirla el 11 de septiembre de 2026. Los ocho cumplidos, el 4 con su enunciado corregido.** La evaluación uno a uno está en [docs/planning/archive/ITERACION_18.md](ITERACION_18.md).

1. **`ADR-023` registrado antes de la primera línea de `extension/`**, contestando uno a uno los cinco disparadores: `ADR-007` §6.1, `ADR-008` §6.4, `ADR-016` §6, `ADR-018` §6.4 y `ADR-021` §6.3 (#665, #666).
2. **En el portátil real, Chrome con la extensión abre la vault de kastor con Windows Hello sin teclear la contraseña maestra**, y la cuenta de entradas es la misma antes y después (#675).
3. **La extensión no conserva la clave de vault más tiempo del que dice `ADR-023`**, verificado en navegador y no solo afirmado en un comentario (#671, #674).
4. **Una sola implementación criptográfica**: **ningún `crypto.subtle` en `extension/`**, vigilado por un test y por ESLint en el CI. Se escribió como «`crypto.subtle` solo en `web/src/lib/vault/crypto.ts`», y eso era falso al escribirlo: `totp.ts` lo usa desde la Iteración 13 para el HMAC de los códigos (#670).
5. **`api/` cambia solo lo que diga `ADR-023`**, y probablemente nada. Se comprueba con `git diff --stat` sobre la iteración.
6. **Los cuatro verificadores ejecutados el día del cierre**, `verify-extension` nacido en rojo, y ninguno puede morir por el cupo de altas sin decirlo antes de arrancar Chromium (#667, #674).
7. **El historial de toda la vault se puede olvidar con un gesto**, verificado en navegador sobre datos sembrados. Hacerlo en la vault real lo decide quien la tiene (#646).
8. **El formulario de un login sin semilla ya no lleva el segundo factor desplegado**, con `verify-auto-lock` entero en verde después del cambio (#669).

**El criterio 2 es el único que ningún test puede sustituir, y por el mismo motivo que el criterio 2 de la 16:** un autenticador virtual es el modelo de Chromium y no el de Windows. Si Windows Hello no entrega el PRF a una extensión, eso es un hallazgo del #665 y cambia la forma de `ADR-023`, no el criterio.

LOS RIESGOS QUE LLEVABA STATUS.md

| Riesgo | Estado | Detalle |
| --- | --- | --- |
| **Windows Hello no entrega el PRF a una extensión** | `Cerrado sin materializarse: medido en el #665` | **Sí lo entrega**, y el mismo que a la web: con Windows Hello real, el passkey que dio de alta la SPA abrió desde la extensión el envoltorio que la SPA guardó, también desde el popup. Lo que sigue es la planificación. Todo el diseño descansa en que la extensión re-deriva la clave con el passkey en vez de custodiarla. `ADR-021` §1 anotó que una extensión puede usar el `rpId` de sus `host_permissions`, **pero nadie lo ha medido con PRF ni con un autenticador real**. Si falla, hay dos salidas y ninguna tumba la iteración: un passkey propio de la extensión, que la tabla de varios passkeys de `ADR-021` ya admite, o la contraseña maestra dentro de la extensión pagando el PBKDF2 que `ADR-008` §6.4 anticipaba. Por eso la medida va primera y sola. |
| **La extensión amplía la superficie de ataque del cliente** | `Cerrado: construido como lo decidió ADR-023` | `ADR-023` lo acota así: solo lectura, sin content scripts declarados, rellenar solo con un gesto, en el marco principal y en el host de la entrada, y ningún permiso de más. Lo que sigue es la planificación. Un gestor de contraseñas en el navegador es el blanco clásico: permisos amplios, rellenar en iframes de otro origen, formularios invisibles. La mitigación es de alcance y va escrita antes del código: solo lectura, sin autocompletar al cargar la página, rellenar solo con un gesto y en el host de la entrada si `ADR-023` lo admite (#673), y permisos mínimos en el manifiesto (#670). |
| **Dos copias de la criptografía** | `Cerrado: vigilado en el CI desde el #670` | Si `extension/` copia `lib/vault` en vez de importarla, las dos divergen y la que se queda atrás cifra mal con autoridad. Es el criterio 4, y no se comprueba con un grep que alguien tiene que acordarse de lanzar: `extension/src/oneImplementation.test.ts` rechaza la palabra en el código de la extensión y la regla de ESLint avisa antes, en el editor (#670). |
| **El portapapeles no se limpia con el popup cerrado** | `Cerrado sin materializarse: verificado en el #674 y a mano en el #675` | Lo limpia el documento *offscreen* que custodia la clave, que sobrevive al popup y al service worker (medido). Lo que sigue es la planificación. La SPA limpia con un `setTimeout`, y el popup se cierra en cuanto se hace clic en la página para pegar. Sin decidir quién limpia —el service worker con `chrome.alarms`, un documento *offscreen*—, la contraseña copiada se quedaría en el portapapeles. Está en el #672 y en los casos del #674. |
| **Plegar el segundo factor rompe un verificador que el CI no ejecuta** | `Cerrado sin materializarse: typeTotpSeed despliega el campo, y verify-auto-lock salió 8 de 8` | `typeTotpSeed` enfoca `#totp` directamente y el caso 9 de `verify-auto-lock` fallaría con el campo plegado. Ya pasó al cerrar la 15 con `#notas`. El #669 no se cierra sin ese verificador ejecutado entero. |
| **archify es código ajeno en la máquina que hace `ssh kastor`** | `Cerrado: fijado a 64b1ba0, leído antes y sin copiarse al repositorio` | Una skill ejecuta con los permisos de quien la usa, y el repositorio cambia a diario. Fijado a un commit revisado, leído antes de ejecutarlo, con la consulta de actualizaciones apagada y sin copiarse dentro de este repositorio. Si la prueba no convence, no deja nada. |
| **Adelgazar `STATUS.md` pierde texto que no está en ningún archivo** | `Cerrado sin materializarse (#663)` | Las secciones manuales son lo único irrecuperable de ese fichero. El #663 comprueba iteración por iteración que su archivo contiene lo que se quita **antes** de quitarlo, y mueve lo que falte. |
| **El historial guarda contraseñas viejas, que son secretos** | `Mitigado: el #646 permite olvidarlo entero; hacerlo lo decide quien tiene la vault` | La vault custodia más secretos de los que su dueño metió: **24 entradas con candidatas sin confirmar** desde el import real, y contraseñas retiradas que a veces se retiraron precisamente por estar comprometidas. La mitigación de `ADR-018` es el tope de tres y el olvido explícito, y hoy solo existe la mitad pequeña, entrada a entrada. El #646 trae la otra —olvidar el de toda la vault—, avisando aparte de las entradas sin confirmar, porque ahí olvidar es resolver el conflicto tirando una contraseña que puede ser la buena. |
| **Una pestaña abierta desde antes de un despliegue sigue con el código viejo** | `Abierto, pasa a la 19: es un paso del despliegue y no se puede cerrar` | El service worker nuevo toma el control, pero una página ya cargada ejecuta su código hasta que se recarga: la primera apertura del import en kastor enseñó la pantalla de antes del #644. En la 18 despliega el cierre (#676) y el #669 cambia el formulario de todas las entradas, así que **recargar la pestaña es un paso del despliegue** y el cierre lo lleva en sus criterios. |
