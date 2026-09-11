ITERACIÓN 4 — Historial y lecciones aprendidas

Archivo de la Iteración 4, cerrada el 5 de agosto de 2026. Recoge la intención de cada issue y lo que se aprendió al cerrarlo.

RECTIFICACIÓN, 5 de agosto de 2026, issue 153. El criterio de salida siete de esta iteración se dio por cumplido y no lo estaba. Está corregido abajo, en su sitio y sin borrar lo que decía, junto con las dos afirmaciones del documento que dependían de él. La lección que salió de ahí está al final, entre las de método, y es la más cara de la iteración después de la del texto partido por saltos de línea.

Está archivado, no muerto. Es la iteración en la que el producto dejó de dar miedo: hasta aquí eVault cifraba bien pero no dejaba sacar nada, no se podía cambiar la contraseña maestra y perderla significaba perderlo todo. Casi todo lo de abajo toca el material que abre la vault, así que si algo se comporta de forma rara al rotar contraseñas, al recuperar acceso o al exportar, merece la pena buscar aquí antes de investigar desde cero.

El objetivo era que se pudiera sacar lo que hay dentro, entrar si se pierde la contraseña, y rotarla sin recifrar nada. Se cumplió.

Nota de formato: prosa plana sin Markdown, por la convención del proyecto. Salvo la última sección, LO QUE DECÍA STATUS.md, que conserva el Markdown con que se escribió allí.


QUÉ SE HIZO

Diecinueve issues: los dieciocho planificados en el 114, del 110 al 130, más el 133, que salió por el camino. Se cerraron todos. Por el camino se abrió además el 149, con deuda nueva.

El estado del backlog no se lee aquí, se lee en docs/planning/STATUS.md, que se genera desde GitHub.

Bloque cero, el repositorio público. El issue 110 puso descripción y topics, activó el escaneo de secretos con push protection, y creó el ruleset de master, con lo que cerró el 21. El 133 salió al revisar lo que ahora lee cualquiera: el proyecto nombraba explícitamente otro proyecto personal del mismo desarrollador, no público, que a un lector externo no le dice nada.

Bloque uno, la migración de identificadores a inglés, issues 115 a 119, uno por capa: lib/vault, lib, components, pages y la API. Cerró el 97, que era la deuda más antigua viva y venía de la Iteración 3. Lo cerró de forma incompleta, y eso no se supo hasta la rectificación del issue 153: ver el criterio siete.

Bloque dos, las decisiones antes del código. ADR-010 en el issue 120 para la clave de recuperación, ADR-011 en el 121 para el formato de export e import. Ninguno de los dos se escribió después de implementar, que es la única forma de que un ADR sirva para algo.

Bloque tres, sacar los datos. El export cifrado en el issue 122 y el import en el 123, con los dos formatos que decidió ADR-011.

Bloque cuatro, rotar la contraseña maestra. El servidor en el issue 124 y la pantalla en el 125.

Bloque cinco, la clave de recuperación. El envoltorio y el endpoint en el 126, generarla y entregarla en el 127, y usarla para recuperar el acceso en el 128.

Bloque seis, la copia de seguridad de la instancia, issue 129, con los comandos evault:backup y evault:restore.

El cierre es este documento, issue 130.


CRITERIOS DE SALIDA, Y CÓMO SE VERIFICÓ CADA UNO

Eran nueve. Se cumplieron ocho, y el noveno se creyó cumplido sin estarlo. La frase que había aquí decía que ninguno se dio por bueno leyendo el código, y era cierta de ocho: el séptimo se dio por bueno leyendo el diff, que es exactamente la excepción que la hacía falsa.

Uno, exportar la vault, vaciarla, importar y recuperar los mismos items. Se verificó el ciclo entero y no cada mitad por su lado, que es donde se esconden los formatos que solo se entienden a sí mismos.

Dos, el fichero de export cifrado no contiene ninguna de las cadenas escritas. Mismo método que el issue 59 en la iteración anterior: guardar un item con cadenas reconocibles y buscarlas en el fichero generado.

Tres, cambiar la contraseña maestra, salir, entrar con la nueva y ver intactos los items de antes. Verificado en el navegador con el ciclo completo: cambiar, RECARGAR para que la vault se bloquee de verdad, desbloquear con la nueva y encontrar las tres entradas descifrándose. En la base de datos, después, los items sin un solo updated_at movido.

Cuatro, un cambio de contraseña interrumpido a medias no deja a nadie fuera. Es el criterio que se verificó rompiendo el código a propósito, no leyendo la transacción: el test fuerza una excepción entre las dos escrituras y comprueba que el envoltorio se revirtió y que la contraseña sigue siendo la vieja. Está en api/tests/Unit/Auth/RotateMasterPasswordTest.php, señalado en el propio fichero como el test que importa.

Cinco, perder la contraseña maestra y recuperar el acceso con la clave de recuperación, terminando con una contraseña nueva utilizable. Verificado en el navegador de principio a fin, incluida la parte que no es opcional: recuperar no termina hasta fijar una contraseña maestra nueva.

Seis, un backup restaurado en una instancia limpia sirve una vault que abre con la contraseña de siempre. Verificado contra una base de datos vaciada, que es la única forma de saber si un backup es una copia de seguridad o solo un fichero.

Siete, ningún identificador en español en web/src ni en api/app, con los campos del contrato y las claves de configuración intactos. NO SE CUMPLIÓ, y se dio por cumplido. Rectificado el 5 de agosto de 2026 en el issue 153.

Lo que había de verdad al cerrar la iteración, y sigue habiendo mientras esto se escribe: veinticuatro identificadores en español en el código de producción de web/src, repartidos en doce ficheros; uno en api/app, configurarLimitesDeAutenticacion, en AppServiceProvider; y alrededor de treinta ficheros de test. No eran restos escondidos: cuatro son hooks exportados y usados desde otros cuatro ficheros, useCrearItem, useActualizarItem, useBorrarItem y useVaultPersonal. Parte se escribió DESPUÉS de dar la migración por terminada, porque export.ts entró en el issue 146 con el bloque uno ya cerrado.

La segunda mitad del criterio sí se cumplió, y conviene no perderla en la rectificación: los campos del contrato, el store de localStorage y las claves de configuración quedaron intactos. El riesgo que se vigiló era ese, y se vigiló bien. Lo que falló fue dar por completo un recorrido que no lo era.

Lo que queda vivo está en los issues 160, el código de producción, y 161, los tests.

Ocho, master protegido por ruleset y el bot regenerando STATUS.md sin romperse. Verificado en los dos sentidos y no leyendo la configuración: con la regla de pull request activa el workflow murió con GH013 y el push fue rechazado; sin ella, la regeneración volvió a pasar.

Nueve, Pest, Vitest, Larastan en nivel max y CI en verde: 230 tests en la API y 367 en la web, sin baseline.


LO QUE YA NO ES VERDAD, Y CONVIENE SABER QUE CAMBIÓ

Olvidar la contraseña maestra ya no es necesariamente perderlo todo. Era el único agujero duro del modelo y ADR-001 dejó prometida su mitigación desde la Iteración 1. La clave de recuperación la cumple sin tocar el principio: es un segundo secreto, generado en el cliente, que envuelve la MISMA clave de vault, así que el servidor sigue sin guardar nada que pueda abrir.

Con ella entra también un riesgo nuevo, y conviene decirlo en vez de celebrar solo la mitad: es la primera vez que el proyecto amplía a propósito su superficie de ataque. Hasta aquí solo la contraseña maestra abría la vault; ahora hay dos caminos completos, y el segundo no tiene segundo factor.

Rotar la contraseña maestra NO invalida la clave de recuperación, y esto es lo que más se malinterpreta de toda la iteración. La clave de vault no cambia al rotar —de eso trata ADR-008—, así que el envoltorio de recuperación sigue abriendo. Quien cambie la contraseña sospechando un robo y crea que con eso ha cortado todos los accesos, se equivoca. Por eso la pantalla del issue 125 lo dice en un aviso destacado y hay un test que falla si ese aviso desaparece.

Los identificadores del código están en dos idiomas bastante menos que antes, pero siguen estándolo. Esta línea decía que ya no, y era la afirmación que el criterio siete sostenía. La deuda del issue 97 venía de la Iteración 3, era la más antigua viva, y se cerró antes de tiempo: lo que quedaba se recogió en los issues 160 y 161.

El repositorio ya no nombra otro proyecto personal. La tensión con la inmutabilidad de los ADR se resolvió con un criterio que conviene recordar: lo inmutable es la DECISIÓN, no su redacción. Quitar un nombre propio que no aporta nada a un lector externo no cambia ninguna decisión, así que se editaron también los ADR y el archivo histórico.


LECCIONES DE MÉTODO, Y SON LAS QUE MÁS VALEN

Declarar un criterio cumplido no lo cumple. Añadida el 5 de agosto de 2026 con la rectificación del issue 153, y es la lección que esta iteración no supo que estaba aprendiendo. El criterio siete afirmaba que no quedaban identificadores en español; una búsqueda de treinta segundos encontraba veinticinco en producción. Los otros ocho criterios se verificaron abriendo el navegador, vaciando la base de datos o rompiendo el código a propósito, y aguantaron. Este se verificó leyendo el diff de los issues que lo implementaban, que es leer la intención en vez del resultado, y no aguantó ni un día.

Lo que hace el caso instructivo no es el fallo sino su forma. Un test que no detecta nada al menos pasa por delante de alguien; una afirmación en un criterio de salida no la vuelve a mirar nadie, porque el documento donde vive es justamente el que certifica que ya está comprobado. Por eso el daño escaló solo: pasó de un checkbox a STATUS.md, de ahí al archivo de la iteración, y de ahí a un repositorio público, ganando autoridad en cada salto sin que nadie añadiera una sola comprobación.

La regla que sale, y que vale para cualquier criterio futuro: si un criterio se puede comprobar con un comando, el criterio ES ese comando y se deja escrito en el repositorio. «Ningún identificador en español» no es un criterio, es una intención. Un grep que devuelve cero y falla el CI cuando no lo devuelve, sí. Va al issue 62.

El texto de la interfaz se rompe CRUZANDO SALTOS DE LÍNEA, y ninguna auditoría línea a línea lo ve. Es la lección cara de esta iteración. Al cerrar el 119 aparecieron tres frases rotas en master —«antes de logOut de él», «Al close o recargar», «Tus data siguen aquí»— que llevaban ahí desde el 116 y el 118. Habían pasado por revisión, por la suite entera y por dos auditorías propias. Las encontró abrir el navegador. La comprobación que sirve compara todo el texto visible antes y después con las expresiones regulares en modo DOTALL, y no lee el diff.

Un renombrado global es más peligroso que el código que renombra. El primer intento del 115 tradujo también textos de interfaz —«Tienes cambios sin guardar» se convirtió en «sin save»— y los literales de los regex de los tests. Se descartó entero con git reset --hard y se rehízo acotado, protegiendo comentarios, cadenas, texto JSX y sus fragmentos partidos por interpolaciones.

Hay cosas que parecen identificadores y son datos. Renombrarlas rompe algo que ningún compilador vigila: los campos del blob, que se serializan y se cifran tal cual y por tanto son lo que hay escrito dentro de cada item ya guardado; el nombre del store de localStorage y su clave persistida; y la clave que los guards escriben en el state de react-router, que no está tipada. Están enumeradas en CLAUDE.md con su porqué.

El nombre en inglés puede colisionar con la librería que ya está en el fichero. registrar tradujo a register, que es lo que devuelve useForm de react-hook-form; y pintar tradujo a render, que es lo de Testing Library. Ninguna de las dos colisiones la habría detectado un diccionario.

npx tsc --noEmit no comprueba nada en este repositorio. El tsconfig.json de web tiene files vacío y project references, así que devuelve cero sin mirar un solo fichero. La comprobación real de tipos es npm run build. Se descubrió confiando en un cero que no significaba nada.

El middleware ability de Sanctum NO sirve para restringir. Es el hallazgo de seguridad de la iteración, encontrado en el 128 y anotado aquí porque es fácil de repetir: un token de sesión normal lleva la capacidad *, y * satisface cualquier comprobación de ability. Con abilities:recovery:complete, CUALQUIER sesión válida habría podido fijar una contraseña maestra nueva sin conocer la actual, que es exactamente el ataque que ese endpoint tenía que impedir. Lo cubre EnsureRecoveryToken, que compara la lista exacta de capacidades, y un test que comprueba que una sesión normal no entra.

Comprobar la propia suposición antes de escribirla en un ADR. Al implementar el carácter de comprobación del 127 di por hecho que no detectaría dos caracteres intercambiados. El test demostró que SÍ los detecta, porque la suma va sobre los bytes y cada carácter aporta cinco bits repartidos entre ellos. Si no llego a comprobarlo, habría quedado escrita una limitación falsa en la documentación de un mecanismo de seguridad.

Un test que depende del azar falla un día de cada treinta y dos. El test que alteraba un carácter de la clave de recuperación lo elegía a ojo, y una de cada treinta y dos veces lo cambiaba por sí mismo. Ahora la alteración se busca comprobando que de verdad altera algo.

Verificar en un navegador automatizado tiene un límite, y hay que decirlo en vez de disimularlo. La descarga del fichero de export no se pudo comprobar en disco; lo que se verificó fue el contenido real generado, interceptando URL.createObjectURL. Es menos que abrir el fichero, y quedó dicho así.

Comparar por identidad y no por texto cuando el texto es del usuario. El marcador de item ilegible se compara por identidad a propósito: comparando el texto, un item que alguien hubiera llamado «No se puede leer esta entrada» quedaría fuera de su propia copia de seguridad sin que nadie se enterara.

Y una de infraestructura que cuesta una tarde si no se sabe: GitHub no admite dar bypass a GitHub Actions en un repositorio personal, solo en organizaciones. Por eso el ruleset de master no exige pull request: la regla mata el push con el que el workflow status regenera STATUS.md, comprobado activándola.


DEUDA QUE DEJA

El issue 149, los tokens de sesión se acumulan y no caducan nunca. Salió al verificar el 125: recargar bloquea la vault y desbloquear hace por debajo un login completo, así que cada recarga deja un token vivo que nadie revoca. No rompe nada hoy con un solo usuario, pero la tabla crece sin techo y un token robado vale para siempre.

Siguen abiertos de antes el 45, el bundle en un solo chunk, y el 62, las comprobaciones de documentación en los PR.

La deuda del portapapeles que la tabla de riesgos arrastraba SIN issue dejó de existir sin que nadie la tocara, y merece la pena entender por qué: la interfaz solo promete el vaciado cuando puede cumplirlo, y lo decide en tiempo de ejecución mirando isSecureContext, no el entorno. Al mover el entorno local a .localhost en el issue 112 pasó a haber contexto seguro, y la promesa volvió sola. Es lo que se gana no cableando una condición de entorno en el código.


LO QUE DECÍA STATUS.md

Hasta el 11 de septiembre de 2026, STATUS.md conservaba el objetivo, los criterios de salida y los riesgos de todas las iteraciones cerradas, y llegó a 288 KB: ya no cabía en una lectura. El 663 los sacó de allí por la regla de una sola fuente de docs/GUIDE.md, y lo que decía de esta iteración está aquí copiado sin tocar, salvo los enlaces relativos, ajustados a esta carpeta.

EL OBJETIVO QUE LLEVABA STATUS.md

**Iteración 4: cerrada el 5 de agosto de 2026.** Objetivo cumplido: *eVault deja de ser una vault en la que da miedo meter contraseñas reales: se puede sacar lo que hay dentro, entrar si se pierde la contraseña, y rotarla sin recifrar nada.*

Diecinueve issues cerrados, los dieciocho planificados más #133, que salió al revisar lo que ahora lee cualquiera. Se cerraron con ellos dos deudas: #21, `master` sin protección, y #97, los identificadores en dos idiomas — pero **#97 se cerró antes de tiempo**, como descubrió #153 al día siguiente: quedaban 25 identificadores en español en producción. Ver el criterio de salida 7. Deja tres deudas, entonces: #149, #160 y #161.

**Lo que cambió de fondo:** olvidar la contraseña maestra ya no es necesariamente perderlo todo. Era el único agujero duro del modelo y `ADR-001` §5.1 dejó prometida su mitigación desde la Iteración 1. La clave de recuperación la cumple sin tocar el principio, porque envuelve la misma clave de vault y el servidor sigue sin guardar nada que pueda abrir. A cambio, el proyecto amplía por primera vez a propósito su superficie de ataque: ahora hay dos caminos completos a la vault y el segundo no tiene segundo factor.

Su historial y sus lecciones están en `docs/planning/archive/ITERACION_4.md`. Las dos que más caras salieron: **el middleware `ability` de Sanctum no sirve para restringir**, porque un token normal lleva la capacidad `*` y `*` satisface cualquier comprobación; y **el texto de la interfaz se rompe cruzando saltos de línea**, así que una auditoría línea a línea no lo ve — tres frases rotas estuvieron en `master` dos issues seguidos y las encontró abrir el navegador.

No fue un objetivo inventado para llenar un sprint. `ADR-001` §6 planificó el proyecto por fases durante la Iteración 1, y su fase 4 dice «clave de recuperación, rotación de contraseña maestra y criptografía asimétrica para vaults compartidas». Esta iteración fue esa fase, menos la parte asimétrica que `ADR-009` sacó del alcance al dejar el proyecto de ser un SaaS. El orden lo fijó el criterio de `ADR-009` §4: primero lo que hace el producto fiable para quien lo usa de verdad, después lo que lo hace legible, y solo después funcionalidad nueva.

Siete bloques, planificados en #114. Bloque 0, el repositorio público: #110, que cierra #21. Bloque 1, la migración de identificadores a inglés: #115 a #119, que cierran #97. Bloque 2, las decisiones antes del código: `ADR-010` en #120 y `ADR-011` en #121. Bloque 3, sacar los datos: #122 y #123. Bloque 4, rotar la contraseña maestra: #124 y #125. Bloque 5, la clave de recuperación: #126, #127 y #128. Bloque 6, backup y restauración: #129. Cierre: #130.

**La decisión de secuenciación que no se ve en el grafo, y que salió bien:** la migración de idiomas fue antes que el código nuevo. Los bloques 3, 4 y 5 tocan `lib/vault/`, `lib/`, `pages/vault/` y `pages/auth/`, que eran exactamente las capas en español; migrar después habría sido renombrar código recién escrito y resolver conflictos entre PR grandes.

LOS CRITERIOS QUE LLEVABA STATUS.md

### Iteración 4, cerrada

Nueve criterios. **Ocho cumplidos y uno mal dado por cumplido**, el séptimo, rectificado el 5 de agosto de 2026 en #153.

Los ocho que aguantaron se comprobaron abriendo el navegador, inspeccionando la base de datos o rompiendo el código a propósito. El que no aguantó se comprobó leyendo el diff, y la diferencia entre las dos cosas es toda la lección.

1. ✅ **Exportar la vault, vaciar la base de datos, importar y recuperar los mismos items.** Verificado el ciclo entero y no cada mitad por su lado, que es donde se esconden los formatos que solo se entienden a sí mismos (#122, #123).
2. ✅ **El fichero de export cifrado no contiene ninguna de las cadenas escritas.** Mismo método que #59: guardar un item con cadenas reconocibles y buscarlas en el fichero generado (#122).
3. ✅ **Cambiar la contraseña maestra, salir, entrar con la nueva y ver intactos los items de antes.** Verificado en navegador con el ciclo completo: cambiar, **recargar** para que la vault se bloquee de verdad, desbloquear con la nueva y ver las tres entradas descifrándose. En la base de datos, después, los items sin un solo `updated_at` movido (#124, #125).
4. ✅ **Un cambio de contraseña interrumpido a medias no deja a nadie fuera.** Es el criterio que se verificó **rompiendo el código a propósito** y no leyendo la transacción: el test fuerza una excepción entre las dos escrituras y comprueba que el envoltorio se revirtió y que la contraseña sigue siendo la vieja. En `api/tests/Unit/Auth/RotateMasterPasswordTest.php` (#124).
5. ✅ **Perder la contraseña maestra y recuperar el acceso con la clave de recuperación.** Verificado en navegador de principio a fin, incluida la parte que no es opcional: recuperar no termina hasta fijar una contraseña nueva (#126, #127, #128).
6. ✅ **Un backup restaurado en una instancia limpia sirve una vault que abre con la contraseña de siempre.** Verificado contra una base de datos vaciada, que es la única forma de saber si un backup es una copia de seguridad o solo un fichero (#129).
7. ❌ **Ningún identificador en español en `web/src` ni en `api/app`** (#115–#119). **Se marcó cumplido y no lo estaba.** Rectificado el 5 de agosto de 2026 en #153.

   Quedaban **24 identificadores en español en el código de producción de `web/src`**, en doce ficheros, y **uno en `api/app`** — `configurarLimitesDeAutenticacion`, en `AppServiceProvider.php:63` —, más unos treinta ficheros de test. No eran restos marginales: cuatro son hooks exportados y usados desde otros cuatro ficheros (`useCrearItem`, `useActualizarItem`, `useBorrarItem`, `useVaultPersonal`). Parte se escribió **después** de dar la migración por terminada: `export.ts` entró en #146 con el bloque ya cerrado.

   Lo que sí se cumplió, y no se pierde en la rectificación: los campos del contrato, el store de `localStorage` y las claves de configuración quedaron intactos. El riesgo que se vigiló se vigiló bien; lo que falló fue dar por completo un recorrido que no lo era.

   **Por qué no se detectó**, que es lo que importa: los otros ocho criterios se verificaron abriendo el navegador, vaciando la base de datos o rompiendo el código a propósito. Este se verificó leyendo el diff de los issues que lo implementaban — leer la intención en vez del resultado. Ver la lección en `ITERACION_4.md`.

   Lo que queda vivo: #160 (producción, en la Iteración 5) y #161 (tests, sin fecha). **#97 se cerró antes de tiempo.**
8. ✅ **`master` protegido por ruleset, y el bot regenerando `STATUS.md` sin romperse** (#110, #21). Verificado en los dos sentidos y no leyendo la configuración: con la regla de pull request activa, el workflow falló con `GH013` y el push fue rechazado; sin ella, la regeneración volvió a pasar y el commit llegó a `master`. La protección conseguida es que nadie pueda borrar la rama ni reescribir su historia; el porqué de que no exija pull request está en la tabla de riesgos.
9. ✅ **Pest, Vitest, Larastan en nivel `max` y CI en verde.** 230 tests en la API y 367 en la web, sin baseline.

Deuda que dejó, con issue: #149, los tokens de sesión se acumulan y no caducan nunca.

LOS RIESGOS QUE LLEVABA STATUS.md

Los riesgos eran un registro acumulado y sus filas no decían de qué iteración eran, así que cada una vino al archivo de la iteración más reciente que cita. Su estado es el que tenía el día que se retiró de STATUS.md, y NO se ha vuelto a comprobar: varias decían «Abierto» de algo ya cerrado. Un riesgo que siga vivo se reescribe en la tabla de la iteración en curso con su estado de hoy, no se copia de aquí.

| Riesgo | Estado | Detalle |
| --- | --- | --- |
| **La rotación y la recuperación tocan el material que abre la vault** | `Mitigado` | Era el riesgo mayor de la Iteración 4. Un cambio de contraseña a medias —contraseña actualizada y envoltorio no, o al revés— deja al usuario fuera de sus datos para siempre, y el servidor no puede repararlo porque no puede leer nada. Mitigado en los dos extremos: transacción en el servidor con **un test que fuerza el fallo entre las dos escrituras**, y en el cliente el reenvolvido entero antes de enviar la primera petición, de modo que una contraseña actual equivocada falla sin haber mandado nada (#124, #125) |
| **La clave de recuperación es un segundo camino completo a la vault** | `Aceptado, con la decisión escrita` | Es la primera vez que el proyecto amplía a propósito su superficie de ataque: hasta ahora solo la contraseña maestra abría la vault. Quien tenga la clave de recuperación entra sin ella y sin segundo factor. Se asume a cambio de cerrar la promesa de `ADR-001` §5.1, y se argumentó en `ADR-010` (#120). Implementado en #126, #127 y #128. El corolario que más se malinterpreta: **rotar la contraseña maestra no lo cierra**, porque la clave de vault no cambia; quien sospeche un robo de la clave de recuperación tiene que regenerarla aparte, y la interfaz lo dice con un test que falla si el aviso desaparece |
| Un endpoint de recuperación convertido en oráculo de enumeración | `Mitigado` | Reintroduciría justo lo que `ADR-008` evitó al descartar un endpoint de prelogin. La respuesta ante un correo inexistente y ante una clave incorrecta debe ser indistinguible, con test que compara las dos, y limitador propio más estricto que el de login. Resuelto en #126, donde apareció además el agujero real de ese endpoint y que no era este: el middleware `ability` de Sanctum **no restringe**, porque un token de sesión normal lleva la capacidad `*`. Lo cubre `EnsureRecoveryToken`, que compara la lista exacta de capacidades |
| Un export en claro es la vault entera legible en la carpeta de descargas | `Mitigado` | Existe igualmente porque sin él el usuario queda atrapado en eVault. Mitigación: el formato por defecto es el cifrado, y el export en claro exige una confirmación que no se puede dar por inercia (#122, `ADR-011`) |
| Un backup que nadie ha restaurado nunca | `Cerrado` | Un backup sin restauración probada es un fichero, no una copia de seguridad. Por eso el comando de restauración entró en el mismo issue que el de backup, y el criterio de salida exigió el ciclo completo contra una base de datos vaciada. Verificado así en #129 |
| Un import interrumpido deja la vault a medias | `Mitigado` | Y el usuario sin saber qué items llegaron, justo cuando cree que ya puede borrar el origen. El comportamiento ante la interrupción se decidió y se probó en #123, en vez de dejarlo al azar de la red. Ayuda que `ADR-011` fijara que el import **añade y nunca sustituye**: lo peor que puede dejar una interrupción son items de menos, nunca items perdidos |
| La migración de idiomas y el código nuevo compiten por los mismos ficheros | `Cerrado` | Los bloques 3, 4 y 5 tocan las capas que están en español. Mitigación: secuenciación declarada como dependencia nativa, #118 bloqueando a #122, #125 y #127. Funcionó, y no hubo un solo conflicto entre bloques |
| Una contraseña maestra olvidada es pérdida definitiva | `Mitigado` | No es un fallo: `ADR-001` descarta la recuperación por parte del servidor. El aviso inequívoco que exigía ya existe en el registro, antes de crear la vault, con tests que fallan si desaparece (#83). **La mitigación que `ADR-001` §5.1 dejó prometida —una clave de recuperación generada en el cliente— está construida**: `ADR-010` en #120, y #126, #127 y #128. Sigue sin ser recuperación por parte del servidor, y por eso no contradice nada: perder la contraseña **y** la clave de recuperación sigue siendo pérdida definitiva, por diseño |
| `master` sin protección | `Cerrado, parcialmente` | Resuelto en #110, que cierra #21. Hay un ruleset activo en el servidor: **no se puede borrar `master` ni reescribir su historia**, sin bypass para nadie. Es justo el agujero del hook `pre-push`, que vive en el clon y se salta con `--no-verify`. **No exige pull request, y no por descuido**: GitHub no admite dar bypass a GitHub Actions en un repositorio personal, así que la regla mata el push con que el workflow `status` regenera este documento. Comprobado activándola: `GH013: Repository rule violations found`. Se eligió conservar la automatización, y el push directo a `master` lo sigue cubriendo el hook |
| El repositorio es público con el escaneo de secretos desactivado | `Cerrado` | Resuelto en #110. `secret_scanning` y `secret_scanning_push_protection` activados el 3 de agosto de 2026, más descripción y ocho topics. La *push protection* es la que más vale: bloquea un push con un token dentro antes de que salga de la máquina. Revisados además los 72 issues y sus comentarios, ahora públicos, sin encontrar rutas locales, correos, credenciales ni IPs privadas |
