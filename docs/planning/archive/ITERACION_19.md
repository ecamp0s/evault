ITERACIÓN 19 — Historial y lecciones aprendidas

Archivo de la Iteración 19, cerrada el 29 de septiembre de 2026. Recoge la intención de cada issue y lo que se aprendió al cerrarlo.

Está archivado, no muerto. Es la iteración en la que ADR-018 pasó a regir entero y en la que se pudo borrar la cuenta: nada se pierde sin querer —la papelera y «Deshacer»— y nada queda abierto sin saberlo —las sesiones abiertas, que se ven y se cierran—. Y es también aquella en la que CINCO DIAGNÓSTICOS PLAUSIBLES RESULTARON FALSOS, y lo que los desmintió fue siempre medir un paso más: un portapapeles, un reloj, una base de datos, una mutación y un criterio de issue.

El objetivo se cumplió: nada se pierde sin querer y nada queda abierto sin saberlo.

Nota de formato: prosa plana sin Markdown, por la convención del proyecto. Salvo la última sección, LO QUE DECÍA STATUS.md, que conserva el Markdown con que se escribió allí.


QUÉ SE HIZO

Diecinueve issues cerrados: los doce planificados del 706 al 717, los cuatro de la deuda de la 18 —694, 695, 696 y 705—, el 703 —el entorno de Docker, que se hizo el día antes de planificar— y dos que aparecieron por el camino, el 725 y el 730. Dieciocho PRs mergeados contando el de este cierre. El 716 se cerró sin PR, porque era una medida y su resultado está en el 680.

Bloque 0, planificar: el 706.
Bloque 1, la deuda y el utillaje: el 695 hizo que verify-auto-lock vigile el aviso y siga el reloj de pared; el 705 trajo al frente el lector del portapapeles de verify-extension; el 694 le dio a verify-extension dos casos de rellenar; y el 696 quitó next-themes.
Bloque 2, la papelera: el 707 en la API —deleted_at, listar, restaurar con el mismo id y borrar del todo—; el 708, la purga a los treinta días; el 709, la pantalla; y el 710, «Deshacer».
Bloque 3, las sesiones: el 711 en la API, con el cliente en el nombre del token; el 712, la pantalla, con un sexto caso en verify-extension; y el 725, que recargar no deje una sesión por recarga.
Bloque 4, borrar la cuenta: el 713, ADR-024; el 714, la API; y el 715, la pantalla.
Bloque 5, Firefox: el 716, la medida.
Bloque 6, el cierre: el 717, este documento.

Y el 730, que no estaba en ningún bloque: las altas simultáneas morían en MySQL por un deadlock.

LA API SÍ CAMBIÓ, al contrario que en la 18: una migración —deleted_at en vault_items, la primera columna que la tabla gana desde que se creó—, un comando de consola —evault:purge-trash—, y seis endpoints nuevos: la papelera, las sesiones y borrar la cuenta.


LOS CRITERIOS DE SALIDA

Nueve, escritos al abrir el 28 de septiembre de 2026.

El 1, borrar una entrada la deja en la papelera, de donde se restaura con el mismo id y el mismo blob, y «Deshacer» la devuelve: CUMPLIDO. El 707 lo prueba en la API —restaurar deja la fila idéntica, updated_at incluido— y el 709 y el 710 en navegador: borrar dos entradas, verlas en la papelera con sus fechas, restaurar una, borrar la otra del todo, y deshacer un borrado solo con el teclado, con el foco vuelto a la fila restaurada.

El 2, la papelera se vacía sola: PENDIENTE DEL DESPLIEGUE. evault:purge-trash purga lo vencido, se pone al día tras días sin correr y purga una entrada justo en el purges_at que anunció la papelera, con test (708); en el MySQL de desarrollo purgó una entrada de hace treinta y un días. Falta instalar su cron en kastor y comprobar que corre.

El 3, una copia conserva la papelera y una restauración la devuelve: CUMPLIDO (707). BackupTest restaura una copia con una entrada en la papelera y la devuelve con la misma fecha, y restaura una copia anterior a la columna con todas sus entradas vivas, que es lo que tendrá kastor el día del despliegue.

El 4, se cierran las demás sesiones sin rotar la maestra, verificado con la extensión desbloqueada: CUMPLIDO (711, 712). El sexto caso de verify-extension desbloquea el popup, vuelve a la web, cierra las demás desde «Sesiones abiertas», pregunta a la API si el token de la extensión vale —401— y reabre el popup, que se bloquea sin culpar a la red.

El 5, ADR-024 registrado antes de la primera línea que borra una cuenta: CUMPLIDO. Su PR (726) se mergeó aprobado por quien tiene la vault antes del de la API (727). Borrar deja cero filas de la cuenta en seis tablas, contadas sobre las tablas en crudo para que la papelera no escape, con tests de aislamiento cross-tenant; en MySQL, una cuenta de 370 entradas no dejó nada huérfano.

El 6, el PRF desde una extensión de Firefox, medido con Windows Hello real: CUMPLIDO (716). Firefox 155 en Windows abrió desde una extensión el envoltorio que guardó la web. El resultado y la sonda entera están en el 680.

El 7, los cuatro issues de deuda cerrados y los cuatro verificadores en verde el día del cierre: PENDIENTE DE COMPLETAR. Los cuatro issues están cerrados. Sobre 718d229: verify-passkey 4 de 4 en 26 segundos, verify-extension 8 de 8 en 122 segundos, y verify-large-vault con sus once límites en verde. verify-auto-lock, pendiente.

El 8, kastor desplegada con la copia de antes fuera de la máquina y la huella de las entradas vivas idéntica: PENDIENTE.

El 9, cero PRs de Dependabot abiertos: PENDIENTE. Al cerrar había cuatro —el 700, el 701, el 734 y el 737, que sustituyó al 702— y dos alertas de seguridad de severidad media, las dos de ip-address, que cierra el 734.


LAS MEDICIONES, TOMADAS AL CERRAR

Tests: 1.279 en la web (81 ficheros), 379 en la API (3.058 aserciones), 108 en la extensión y 161 del utillaje. Son 1.927, contra los 1.801 al abrir.
Cobertura: 95,52 por ciento global y 98,86 en lib/vault, con las funciones de lib/vault al 100.
ADR: veinticuatro, uno nuevo, el 024.
Issues abiertos al cerrar, sin contar este: dos, el 624, en el backlog y sin iteración, y el 680, Firefox, desbloqueado por la medida. Issues con el label deuda: cero.
Los documentos que se leen al empezar: CLAUDE.md 23,9 KB con techo de 28; SPRINT_CONTEXT.md llegó a 40,9 KB con techo de 41, a 91 bytes de él en el 725, y este cierre lo recorta.


LO QUE APARECIÓ POR EL CAMINO Y NO ESTABA EN EL PLAN

EL 705, abierto el 27 de septiembre, la víspera de planificar: verify-extension salía 4 de 5 porque su lector del portapapeles recibía una cadena vacía. Se sospechó del snap de Chromium —se había actualizado una hora antes—, de WSLg, del entorno de Docker del 703, del sandbox de Claude Code y de Chromium en general, y se midieron las cinco con una sonda mínima: ninguna. Lo que era: en Chromium 153 y en Chrome for Testing 154, LO QUE ESCRIBE UNA PESTAÑA QUE NO ESTÁ AL FRENTE SE PIERDE aunque writeText diga que sí, y el lector era una pestaña abierta detrás de la del popup. Para descartar el snap, quien tiene la vault lo revirtió a mano, y la reversión desmintió la hipótesis.

EL 725 lo enseñó la pantalla del 712 en cuanto se miró: cinco sesiones «Navegador» que eran un navegador. Cada recarga bloquea la vault y desbloquear inicia sesión, y el token anterior seguía vivo sus doce horas. Pasaba desde el 177, en agosto, y hasta que existió la lista nadie podía verlo. Se arregló por la vía que la pestaña recuerde en sessionStorage el ID de su token —no el token— y lo mande al volver a entrar.

EL 730 salió de verificar el 695: verify-auto-lock registra ocho cuentas a la vez, y en MySQL cinco de cada ocho altas morían con un deadlock. El alta bloqueaba filas que no existían en tres sitios —un lockForUpdate sobre el correo, otro sobre la vault personal y un DELETE por rango de los tokens caducados—, e InnoDB toma bloqueos de hueco en los tres. SQLite no los tiene, y por eso ningún test lo vio. Con los tres quitados, 48 de 48 altas con dieciséis a la vez.

Y EL RELOJ DE WSL2, que no es un issue sino un hecho medido: su reloj de pared adelanta un 3,6 por ciento sobre el monótono, unos treinta segundos en los trece minutos y medio que espera verify-auto-lock. Los temporizadores miden tiempo monótono y la aplicación mide tiempo de pared, así que un sleep largo llegaba tarde a todos los casos a la vez sin que nada se hubiera parado. Es probable que los «26 a 43 segundos tarde» del cierre de la 18, atribuidos a una máquina parada, fueran esto.


LAS LECCIONES

UNA COINCIDENCIA DE FECHAS NO ES UNA CAUSA, y el 705 lo cobró. El snap de Chromium se actualizó a las 23:08 y el fallo apareció a las 00:13: la hipótesis se escribió en el diagnóstico con autoridad, se pidió a quien tiene la vault revertir un paquete del sistema para probarla, y era falsa. Lo que encontró la causa fue desconfiar de la propia sonda cuando todas las variantes fallaban igual: si nada funciona, lo que tienen en común es la prueba.

EL RELOJ QUE MIDE LA ESPERA NO ES EL QUE MIDE LA APLICACIÓN. Un sleep de trece minutos y medio en Node son trece minutos y medio monótonos; en este WSL2, en tiempo de pared, son treinta segundos más. El verificador informaba «el proceso despertó tarde» y la explicación que se escribió en la 18 fue que la máquina se había parado. Se descubrió porque dos ejecuciones seguidas dieron el mismo retraso exacto con la máquina a carga 0,5: un atasco no se repite al segundo.

SQLITE NO VE LO QUE HACE MYSQL. La suite corre en SQLite en memoria, y es la decisión correcta para una suite; pero los bloqueos de hueco solo existen en InnoDB, y tres sitios del alta los tomaban. Una operación que se hace a la vez —altas, logins— se prueba contra la base de verdad con varias peticiones simultáneas, y la regla que queda es concreta: ni lockForUpdate sobre filas que aún no existen ni DELETE por rango en un camino caliente; la barrera es el índice único y se borra por clave primaria.

UNA MUTACIÓN APLICADA EN OTRO SITIO DA LA MISMA TRANQUILIDAD FALSA QUE UNA QUE NO SE APLICA. En el 694, la mutación de canFill salió verde: el texto sustituido aparece primero en select(), que ordena la lista, y el guion cambió la primera aparición. SPRINT_CONTEXT ya decía que hay que comprobar que una mutación se aplicó; faltaba decir dónde.

UN VERIFICADOR QUE SE CUELGA ES PEOR QUE UNO EN ROJO. La mutación de la comprobación de host del 694 no puso el caso en rojo: lo colgó, porque el popup rellenaba, se cerraba, y el caso esperaba el mensaje de un popup que ya no existía. Una espera que puede no terminar tiene que vigilar también que siga existiendo lo que espera.

UN DIAGNÓSTICO DEDUCIDO DEL TEXTO DE LA PANTALLA MIENTE CUANDO DOS FALLOS SE ESCRIBEN IGUAL. register() culpaba al límite de altas porque reconocía «vuelve a intentarlo», que es también el texto de un 500; quedaban 978 altas de 1000. Ahora le pregunta a la API cuántas quedan.

UNA PANTALLA NUEVA ENSEÑA DEUDA VIEJA. La lista de sesiones del 712 destapó en su primera mirada un comportamiento del 177, de agosto. Mirar lo que la pantalla enseña con datos de verdad es parte de verificarla.

EL CRITERIO DE UN ISSUE PUEDE DESCRIBIR ALGO QUE NO EXISTE. El 696 pedía que el tema siguiera funcionando «claro, oscuro y sistema», y la aplicación solo tiene oscuro, forzado. Se dijo en el PR en vez de fingir que se comprobó.

LO QUE VIVE FUERA DEL REPOSITORIO SE PIERDE. Las sondas del 665 y del 673 desaparecieron con la reorganización de ~/Workspace del 27 de septiembre, y el 694 y el 716 tuvieron que reconstruirlas desde lo que habían dejado escrito los PRs. La del 716 está entera en un comentario del 680.

Y UNA DE ENTORNO, QUE PASÓ UN DÍA ENTERO SIN VERSE: un shim de fnm de otro proyecto se puso delante en el PATH, y nvm use 24.19.0 decía «Now using» mientras node seguía siendo 24.14.0. Todo lo del 29 de septiembre por la mañana corrió con esa versión, y solo se notó al instalar, porque jsdom 30 exige al menos la 24.15.


LO QUE DECÍA STATUS.md

Al cerrar esta iteración, su texto de las tres secciones manuales de STATUS.md se movió aquí, como pide docs/GUIDE.md desde el 663, y salió de allí. Está copiado sin tocar, salvo el párrafo que abre el objetivo, los criterios evaluados y el estado de los riesgos, que se pusieron al día el día del cierre.

EL OBJETIVO QUE LLEVABA STATUS.md

**Iteración 19: cerrada el 29 de septiembre de 2026.** Objetivo cumplido: *nada se pierde sin querer y nada queda abierto sin saberlo.* `ADR-018` rige entero, y la cuenta se puede borrar.

Lo que sigue es la planificación con la que se abrió.

**Iteración 19: nada se pierde sin querer y nada queda abierto sin saberlo.** Planificada el 28 de septiembre de 2026 (#706).

Es **`ADR-018` entero en vigor**, más poder irse del todo. De aquel ADR rige el historial desde la 17 y la caducidad del token desde el #177; faltan las dos cosas que dan marcha atrás o cierran una puerta:

- **La papelera** (`ADR-018` §2.4): borrar una entrada la deja treinta días en el servidor, de donde se restaura con su mismo `id`, y una purga programada la vacía. Encima, un «Deshacer» inmediato. Hoy un borrado por error en la vault real solo se deshace restaurando la instancia entera.
- **Cerrar las demás sesiones sin rotar la maestra** (`ADR-018` §2.5), viendo cuáles hay. Desde la 18 hay tokens de la web y de la extensión, y la única palanca para cerrarlos es reenvolver las claves.
- **Borrar la cuenta**, que hoy no existe. Con `ADR-024` antes del código: qué se borra, qué conservan las copias y durante cuánto.

**Y además**, sin ser el objetivo:

- **Firefox, como medida acotada** (#716): si una extensión de Firefox obtiene el mismo PRF con Windows Hello real. La custodia, la firma y la implementación siguen en el [#680](https://github.com/ecamp0s/evault/issues/680), que sale de la 19 y queda bloqueado por la medida.
- **La deuda del cierre de la 18**: [#694](https://github.com/ecamp0s/evault/issues/694), [#695](https://github.com/ecamp0s/evault/issues/695) y [#696](https://github.com/ecamp0s/evault/issues/696). Y el [#705](https://github.com/ecamp0s/evault/issues/705), abierto el 27 de septiembre: `verify-extension` sale 4 de 5 en esta máquina porque su lector del portapapeles recibe una cadena vacía, sin que falle la extensión.
- **Los tres PRs de Dependabot abiertos**, #700, #701 y #702.

**Lo que se decidió dejar fuera:** el [#624](https://github.com/ecamp0s/evault/issues/624), reconciliar sin red, se queda en el backlog en `Low`, porque no hay un camino roto sino uno que no existe. Y **la limpieza de la vault real** —un modo de revisión desde la auditoría y comprobar contraseñas filtradas, que pide su propio ADR— se deja como candidata de la 20.

| Bloque | Issues |
| --- | --- |
| 0, planificar | #706 |
| 1, la deuda y el utillaje | #694, #695, #696, #705 |
| 2, la papelera | #707 → #708, #709, #710 |
| 3, las sesiones | #711 → #712 |
| 4, borrar la cuenta | #713 → #714 → #715, que además espera a #707 |
| 5, Firefox | #716 |
| 6, el cierre | #717 |

LOS CRITERIOS QUE LLEVABA STATUS.md

### Iteración 19, cerrada el 29 de septiembre de 2026

Escritos al abrirla, el 28 de septiembre de 2026. La evaluación uno a uno está en LOS CRITERIOS DE SALIDA, más arriba en este documento.

1. **Borrar una entrada la deja en la papelera**, de donde se restaura con el mismo `id` y el mismo blob, y «Deshacer» la devuelve sin pasar por ella. Verificado en navegador.
2. **La papelera se vacía sola**: `evault:purge-trash` purga lo que lleva más de 30 días, se pone al día tras varios días sin correr —kastor se apaga— y está en el cron de kastor, comprobado que corre.
3. **Una copia conserva la papelera y una restauración la devuelve**, comprobado y no supuesto, como pide `ADR-018` §7.
4. **Se cierran las demás sesiones sin rotar la maestra**, verificado con la extensión desbloqueada: su siguiente petición falla y el popup vuelve a pedir el passkey.
5. **`ADR-024` registrado antes de la primera línea que borra una cuenta**, y borrarla deja la base sin nada de ella salvo lo que el ADR diga, con tests de aislamiento cross-tenant.
6. **El PRF desde una extensión de Firefox, medido con Windows Hello real**, y el resultado escrito en el #680.
7. **#694, #695, #696 y #705 cerrados**, y los cuatro verificadores ejecutados el día del cierre, en verde.
8. **kastor desplegada** con la copia de antes fuera de la máquina y la huella de las entradas vivas idéntica antes y después.
9. **Cero PRs de Dependabot abiertos** al cerrar.

LOS RIESGOS QUE LLEVABA STATUS.md

| Riesgo | Estado | Detalle |
| --- | --- | --- |
| **La primera migración sobre la vault real desde el #585** | `Pendiente del despliegue` | `deleted_at` es la primera columna que se añade a `vault_items` desde que se creó, el 1 de agosto de 2026, y lo que se rompa ahí no es reproducible. Se despliega como dice `DEPLOYMENT.md` §7 —contar, copiar fuera y sacar la huella— y con `--force-recreate`, sin el cual las migraciones no se aplican. |
| **Una papelera que no se vacía es un borrado que no borra** | `Pendiente del cron de kastor` | Lo dice `ADR-018` §2.4, y aquí tiene un motivo concreto: kastor se apaga queriendo, y el cron de las 3 puede no correr en días. La purga se diseña para ponerse al día y se comprueba en kastor, no solo en los tests. |
| **Un secreto borrado sigue treinta días en el servidor** | `Mitigado en el #707` | La papelera es lo que hace deshacible un borrado, y también lo que hace que borrar una contraseña filtrada no la quite. De ahí que borrar definitivamente desde la papelera esté en el #707 aunque `ADR-018` no lo nombre. |
| **Borrar la cuenta no tiene vuelta, y las copias la conservan** | `Asumido en ADR-024 §5` | Siete días en la máquina y lo que dure la retención fuera. `ADR-024` lo dice, y la pantalla, antes de confirmar. |
| **Una pestaña abierta desde antes de un despliegue sigue con el código viejo** | `Abierto, pasa a la 20: es un paso de cada despliegue` | Un paso de cada despliegue. Con la papelera, una pestaña vieja que borra deja la entrada en la papelera igualmente, porque lo decide el servidor; lo que no verá es la pantalla nueva. La extensión tampoco se actualiza sola (`ADR-023` §5.3), y **esta iteración sí la cambia**: desde el #711 dice que es la extensión al pedir el token. La build de kastor hay que reconstruirla al desplegar; mientras no se haga funciona igual, pero sus sesiones salen en la lista como sin identificar. |
| **Un cierre de golpe del navegador deja un token vivo** | `Mitigado en el #712` | Sigue valiendo hasta las 12 horas. Desde el #712 se ve en la lista de sesiones y se cierra sin rotar la maestra. |
| **El rellenado no tenía verificador de navegador** | `Cerrado en el #694` | `verify-extension` rellena ahora en páginas que sirve él mismo: en su sitio, sin enviar, sin tocar tres trampas invisibles, y se niega en un marco, con la pestaña cambiada de host y en otro sitio. |
| **`verify-auto-lock` podía salir en rojo sin que el código falle** | `Cerrado en el #695` | Los casos 7, 8 y 9 vigilan el aviso en vez de mirarlo a los 14:45, y la espera sigue el reloj de pared, que en este WSL2 adelanta un 3,6 % sobre el monótono. 8 de 8 en verde, y con el aviso sin nombrar lo que se pierde, rojos exactamente el 7 y el 8. |
| **`verify-extension` no podía leer el portapapeles en esta máquina** | `Cerrado en el #705` | No era la máquina ni el snap: en Chromium 153 y 154 lo que escribe una pestaña que no está al frente se pierde, y el lector era esa pestaña. Ahora se trae al frente, y el caso sale en verde. |
| **La medida de Firefox depende del portátil** | `Cerrado en el #716: la respuesta es sí` | Solo Windows Hello real dice algo de Firefox; el autenticador virtual es de Chromium. Firefox 155 en Windows abrió desde una extensión el envoltorio que guardó la web. |
