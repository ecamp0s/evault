ITERACIÓN 21 — Historial y lecciones aprendidas

Archivo de la Iteración 21, cerrada el 10 de octubre de 2026. Recoge la intención de cada issue y lo que se aprendió al cerrarlo.

Está archivado, no muerto. Es la iteración que salió de usar la aplicación en vez de leer el backlog: tenía tres issues abiertos al planificarla, y el resto se encontró recorriendo la web y la extensión con una cuenta de prueba. La web se bloquea a mano y se busca con el teclado, una cuenta nueva ve sus primeros pasos y cada fila se distingue por su inicial. La extensión rellena por fin el login en dos pasos en sitios reales, genera contraseñas, se abre con un atajo, y en Firefox desbloquea en una ventana pequeña y vuelve al popup sola. Y actualizar la de Firefox pasó de pasar un fichero y quitar la anterior a abrir un enlace de kastor.

El objetivo se cumplió: la vault se usa a diario con menos fricción, y el 773 se cerró en shein.com y en gravatar.com de verdad. Lo único que queda sin comprobar es el enlace de kastor en el portátil de la mujer de quien tiene la vault, que estaba de viaje; se aprobó con el Firefox de quien tiene la vault, por decisión suya.

Nota de formato: prosa plana sin Markdown, por la convención del proyecto. Salvo la última sección, LO QUE DECÍA STATUS.md, que conserva el Markdown con que se escribió allí.


QUÉ SE HIZO

Once issues cerrados con el label s21, más este. Catorce PRs mergeados, del 795 al 809, y el 786 del cierre de la 20. No hubo ninguno de Dependabot.

Bloque 0, planificar: el 787.
Bloque 1, la web: el 788, bloquear a mano; el 789, / para buscar; el 790, los primeros pasos; y el 791, Exportar e Importar en un menú y una inicial por host.
Bloque 2, la extensión: el 773, el login en dos pasos en sitios reales; el 792, un generador en el popup; el 793, un atajo para abrirlo; el 769, la ventana de desbloqueo de Firefox; y el 796, instalarla desde un enlace de kastor.
Bloque 3, el cierre: el 794, este documento.

Y el que no estaba en ningún bloque: el 798, la instancia y la carpeta de Chrome en un fichero fuera del repositorio, que pidió quien tiene la vault cuando se le volvió a preguntar algo que no tenía por qué saber.

LA API NO CAMBIÓ. KASTOR SE DESPLEGÓ UNA VEZ, el 10 de octubre, adelantado al cierre para poder medir el 796, porque servir la extensión es una ruta de Caddy y un volumen de compose. Lo desplegado, 1095b77, es lo que tiene master en api, web, docker y los compose: desde ahí solo cambiaron la extensión y la documentación.


LOS CRITERIOS DE SALIDA

Diez, escritos al abrir el 9 de octubre de 2026.

El 1, la web se bloquea a mano: CUMPLIDO (788, PR 801). «Bloquear» en el menú de usuario y Ctrl+Mayús+L, por lockVault, que es también el camino del bloqueo por inactividad: no hay un segundo estado. Que el atajo no choca con el navegador lo comprobó quien tiene la vault en Chrome y en Firefox de Windows, porque un evento simulado no pasa por los atajos del propio navegador. Y verify-auto-lock 8 de 8 sobre el cambio, porque el bloqueo por inactividad pasó a usar la misma función.

El 2, / busca y Escape vacía: CUMPLIDO (789, PR 802). Por el carácter y no por la tecla, porque en un teclado español es Mayús+7, comprobado así en Windows. No salta escribiendo en un campo ni con un diálogo abierto; cada protección tiene su test, comprobado con su mutación.

El 3, la cuenta sin clave de recuperación o sin passkey lo ve: CUMPLIDO (790, PR 803). La tarjeta se deriva de la cuenta y no se guarda nada en el servidor; solo se recuerda que se ocultó, por cuenta y en ese navegador. Al probarla salió que la sesión no se enteraba de la clave recién generada, porque has_recovery_key solo llega al entrar, y se arregló con markRecoveryKey.

El 4, la barra en una fila a 390 px y la inicial sin red: CUMPLIDO (791, PR 804). Medido con emulación de móvil. La inicial sale del nombre y el color del host, sin pedir nada a la red, porque un favicon le diría a un tercero qué cuentas hay en la vault. verify-large-vault completo, 11 de 11. El criterio pedía contraste «en los dos temas», y no hay dos: el tema es solo oscuro desde el 696. El contraste se midió en el navegador sobre el fondo real, entre 9,2:1 y 11,9:1.

El 5, el login en dos pasos se rellena en sitios reales: CUMPLIDO (773, PR 797). La causa era el banner de cookies, que al cerrarse deja el foco en body. El arreglo rellena el primer campo que se nombra del usuario, solo si está a la vista y nunca en un pie ni en un boletín. Su caso en verify-extension nació en rojo, con el mismo mensaje que se veía en Gravatar. Comprobado a mano en Chrome y en Firefox, en gravatar.com —cuyo login vive en wordpress.com— y en shein.com, con cuentas ficticias, y cerrado tras esa comprobación y no con el merge.

El 6, el popup genera y copia: CUMPLIDO (792, PR 805). Solo con la vault abierta, porque la limpieza del portapapeles vive en la custodia. Comprobado en los dos navegadores reales.

El 7, el atajo abre el popup y rellena: CUMPLIDO (793, PR 806), con Alt+Mayús+G. Abrirlo con el atajo SÍ concede activeTab, al contrario que openPopup(). Salieron dos problemas de Firefox, los dos medidos antes de arreglar: Alt+Mayús+E abría el menú «Editar», y el popup se cerraba porque crecía mientras cargaba la lista.

El 8, el 769 medido: CUMPLIDO (769, PR 809). Dos sondas con Windows Hello real: una ventana pequeña sobrevive a Windows Hello, y el popup se reabre si lo pide la página de fondo cuando la ventana original recupera el foco, no si lo pide la ventana de desbloqueo. ADR-025 sección 2.2 no se tocó: la ventana era su opción B, y el ADR la llama un detalle de la pantalla.

El 9, la extensión de Firefox se actualiza desde un enlace de kastor: CUMPLIDO EN PARTE (796, PR 807). Se instala encima de la anterior, medido con la 0.1.5, y el enlace sirve el .xpi con el tipo que hace que Firefox lo ofrezca, comprobado en el Firefox de quien tiene la vault. Falta el portátil de su mujer, que sigue con la 0.1.3 y estaba de viaje; quien tiene la vault lo dio por aprobado así, y si algo falla será un issue nuevo. release:firefox se estrenó con la 0.1.10.

El 10, las extensiones reconstruidas y kastor desplegada: CUMPLIDO. kastor con 1095b77, con la copia 98 antes —944 filas: 2 usuarios, 2 vaults, 935 entradas y 3 passkeys— y la huella antes y después idéntica: 935 entradas, 224.533 bytes hasheados —189.004 de ciphertext, más 935×37, más 934— y la misma SHA-256, 7450010e…e885bf. Laravel 13.35.0, sin migraciones pendientes. Las dos extensiones en la 0.1.12, el mismo árbol que e7e1b75: la de Chrome en su carpeta, la de Firefox publicada en kastor e instalada en el Firefox de quien tiene la vault.


LAS MEDICIONES, TOMADAS AL CERRAR

Tests: 1.335 en la web (86 ficheros), 380 en la API, 194 en la extensión y 161 del utillaje. Son 2.070, contra los 1.972 al abrir.
Cobertura: 95,65 por ciento global y 98,86 en lib/vault, con las funciones de lib/vault al 100.
Los cinco verificadores sobre e7e1b75, el master del cierre: verify-auto-lock 8 de 8 en 18,3 minutos, verify-large-vault con sus once límites, verify-passkey 4 de 4, verify-extension 9 de 9 y verify-extension-firefox 5 de 5.
ADR: veinticinco, ninguno nuevo.
Issues abiertos al cerrar, sin contar este: uno, el 624, reconciliar sin red, sin iteración. Issues con el label deuda: cero. Alertas de Dependabot: cero. PRs abiertos: cero.
Las versiones de la extensión: de la 0.1.4 a la 0.1.12 en dos días. Cuatro fueron de medida —la 0.1.6 y la 0.1.8 con el atajo y el tamaño, la 0.1.10 y la 0.1.11 con las sondas del 769— y cada una costó una firma de Mozilla y un desbloqueo con passkey.
Los documentos que se leen al empezar: CLAUDE.md 26,6 KB con techo de 28; SPRINT_CONTEXT.md se pasó de su techo de 41 dos veces durante la iteración, y se recortó las dos.


LO QUE APARECIÓ POR EL CAMINO Y NO ESTABA EN EL PLAN

LA INSTANCIA NO ESTABA ESCRITA EN NINGÚN SITIO (798). Al probar el 773, se le preguntó a quien tiene la vault por EVAULT_EXTENSION_ORIGINS, que no sabía qué era y que las otras veces se había sacado del manifiesto de la última build; y se construyó en extension/dist, que no es la carpeta que carga su Chrome. Su respuesta fue que eso tenía que estar escrito en el proyecto y no en la memoria de nadie. Ahora vive en ~/.config/evault/extension.env, fuera del repositorio, lo leen release:chrome y release:firefox, y DEPLOYMENT.md sección 9 dice qué lleva y cómo rehacerlo.

ABRIR chrome://extensions CARGA LA VERSIÓN NUEVA. Lo observó quien tiene la vault con la 0.1.5: no hizo falta pulsar «Recargar». No es algo que Chrome documente, así que DEPLOYMENT.md lo dice como observado, con «Recargar» de reserva.

EL LÍMITE DE DESBLOQUEOS CON PASSKEY SE AGOTÓ PROBANDO. Cinco por hora y cuenta (ADR-023 sección 5.5), y cada actualización de la extensión pierde la llave y pide otro. Una tarde con cuatro versiones lo agotó, y la extensión de Firefox respondió «Demasiados intentos en poco tiempo» sin que hubiera nada roto. Se esperó la hora.

UN VERIFICADOR RECONOCÍA LA REVISIÓN POR SU FORMA (790). verify-large-vault daba por abierta la revisión en cuanto veía un main section h2, y la tarjeta de primeros pasos es exactamente eso, así que midió la vault como si fuera la revisión y su límite se negó a pasar con «auditó 0 contraseñas». Esperar a la URL tampoco bastó, porque el router deja la pantalla anterior pintada mientras carga la siguiente. Ahora espera al titular de la revisión, que es lo que mide después.

LA SUITE WEB VOLVIÓ A FALLAR POR CARGA, una vez: 3, luego 20, luego 1 fallos por tiempo en ficheros que no se tocaban, con la carga de la máquina entre 13 y 22. Esperar a que la carga bajara de 3 antes de ejecutarla lo resolvió las demás veces.


LAS LECCIONES

MEDIR ANTES DE ARREGLAR DESCARTÓ DOS HIPÓTESIS. En el 793, el popup de Firefox que se cerraba: la primera fue que soltar Alt llevaba el foco a la barra de menús, y la segunda que la página recuperaba el foco. Las dos eran plausibles y las dos se descartaron con una prueba de un minuto que hizo quien tiene la vault —el orden de las teclas, Ctrl en vez de Alt, el icono en vez del atajo, example.com— antes de escribir una línea. La tercera, el tamaño, se confirmó con una build de diagnóstico. Si se hubiera arreglado la primera, el atajo habría cambiado de tecla y el popup se habría seguido cerrando.

UN ERROR DEL NAVEGADOR DICE EXACTAMENTE QUÉ PROBAR. La primera sonda del 769 falló con «Cannot show popup for an inactive window, only for the currently focused window», y esa frase descartaba la explicación obvia —que hace falta un gesto— y señalaba el orden. La segunda sonda, en el orden que pedía el mensaje, funcionó. Por eso la sonda guardaba el error entero para que el popup lo enseñara, en vez de un sí o un no.

UN DATO QUE SOLO VIVE EN LA MEMORIA DE UNA SESIÓN NO EXISTE. Los orígenes de la instancia y la carpeta de Chrome se habían resuelto bien varias veces, cada una deduciéndolos de nuevo, y la vez que no se dedujeron se le preguntaron a quien no tenía por qué saberlos. La regla de ADR-023 sección 2.5 —los nombres no van en el repositorio— no impedía escribir dónde están.

UNA PRUEBA QUE RECONOCE UNA PANTALLA POR SU FORMA SE ROMPE CON LA SIGUIENTE PANTALLA DE ESA FORMA. Lo del 790 con verify-large-vault, que esperaba cualquier section con h2. Una espera tiene que buscar lo que solo tiene la pantalla que espera.

UN CRITERIO DE SALIDA PUEDE PARTIR DE UN HECHO FALSO, aunque lo escriba quien planifica. El 791 pedía contraste «en el tema claro y en el oscuro», y la aplicación no tiene tema claro desde el 696. Se descubrió midiendo el contraste. Es la misma lección de la 20: una afirmación se escribe sin comprobarla.

UN TEST PUEDE PASAR SIN LA GUARDA QUE VIGILA, y no siempre es un defecto. En el 790, el test de una lectura del almacenamiento que falla pasaba también sin la guarda, porque zustand ya captura ese error al hidratarse. Se quedó, diciéndolo en el PR, porque documenta lo que el issue pide; lo que no se hizo fue darlo por prueba de la guarda. La de escritura sí la vigila un test, que nació pasando también sin ella hasta que comprobó que no se informaba ningún error.

Y UNA DE HERRAMIENTA: UN ; DONDE IBA UN && DEJÓ PASAR DOS COMMITS. SPRINT_CONTEXT.md se pasó de su techo dos veces, y las dos el commit se hizo porque check-docs.py iba encadenado con ; y no con &&: el fallo solo se vio en el CI.


LO QUE DECÍA STATUS.md

Al cerrar esta iteración, su texto de las tres secciones manuales de STATUS.md se movió aquí, como pide docs/GUIDE.md desde el 663, y salió de allí. Está copiado sin tocar, salvo el estado de los riesgos, que se puso al día el día del cierre.

EL OBJETIVO QUE LLEVABA STATUS.md

**Iteración 21: la vault se usa a diario con menos fricción.** Planificada el 9 de octubre de 2026 (#787).

En la web y en las dos extensiones, con lo que salió de recorrer la aplicación al planificarla, y **con el único bug abierto, el [#773](https://github.com/ecamp0s/evault/issues/773), cerrado en sitios de verdad** y no solo en el verificador: gravatar.com primero, que es donde tiene cuenta quien tiene la vault, y shein.com después.

- **La web**: bloquear a mano, que hoy solo pasa por inactividad o recargando (#788); `/` para buscar (#789); unos primeros pasos que recuerden la clave de recuperación y el passkey, derivados del estado de la cuenta y no guardados (#790); y Exportar e Importar en un menú, con una inicial por host en lugar del mismo globo en todas las filas, **sin favicons**, porque pedirlos diría a un tercero qué hay en la vault (#791).
- **La extensión**: el login en dos pasos de gravatar.com y shein.com, que **empieza por medir** con la función real en la página real, y la primera medida apunta al banner de cookies, que le quita el foco al campo (#773); un generador en el popup que **solo copia**, así que sigue siendo de solo lectura (#792); un atajo para abrir el popup, **si concede `activeTab`**, que es lo primero que se mide (#793); la ventana de desbloqueo de Firefox (#769), medida en la misma sesión que el #773; y **actualizar la de Firefox con un enlace de kastor**, instalando encima de la anterior y **sin `update_url`**, así que `ADR-025` §2.4 no cambia (#796).

**Lo que se decidió dejar fuera**, con el motivo en `SPRINT_CONTEXT.md`: **la limpieza de la vault real** con HIBP, candidata de la 22; **las vaults compartidas**, porque nadie quiere compartir nada aunque ya haya dos cuentas; **la maestra de 12 caracteres**, propuesta y no elegida; y el [#624](https://github.com/ecamp0s/evault/issues/624), en `Low`.

| Bloque | Issues |
| --- | --- |
| 0, planificar | #787 |
| 1, la web | #788 → #789, #790, #791 |
| 2, la extensión | #773, #792, #793, #769, #796 |
| 3, el cierre | #794 |

LOS CRITERIOS QUE LLEVABA STATUS.md

### Iteración 21, cerrada el 10 de octubre de 2026

Escritos al abrirla, el 9 de octubre de 2026. La evaluación uno a uno está en LOS CRITERIOS DE SALIDA, más arriba en este documento.

1. **La web se bloquea a mano**, desde el menú y con un atajo que no choca con Chrome ni con Firefox, por el mismo camino que el bloqueo por inactividad (#788).
2. **`/` busca y `Escape` vacía el buscador**, sin dispararse escribiendo en un campo (#789).
3. **Una cuenta sin clave de recuperación o sin passkey lo ve al abrir la vault**, y la tarjeta desaparece sola cuando deja de ser verdad (#790).
4. **La barra de la vault cabe en una fila a 390 px**, y cada entrada se distingue por su inicial sin una sola petición de red; `verify-large-vault` en verde con sus once límites (#791).
5. **El login de gravatar.com se rellena en Chrome y en Firefox reales**, con las cuatro medidas del #773 en un comentario y su caso en `verify-extension` nacido en rojo; y shein.com, cuando esté disponible la cuenta que lo usa.
6. **El popup genera y copia una contraseña** que se limpia como las demás, en los dos navegadores (#792).
7. **El atajo abre el popup y rellena**, o la medida que diga por qué no (#793).
8. **El #769 medido** en el Firefox de Windows con Windows Hello real, y cambiado solo si alguna opción sirve.
9. **La extensión de Firefox se actualiza desde un enlace de kastor**, encima de la anterior, y la vault se abre después con Windows Hello (#796).
10. **Las dos extensiones reconstruidas e instaladas** desde el master del cierre, y kastor desplegada si alguna PR tocó la API.

LOS RIESGOS QUE LLEVABA STATUS.md

| Riesgo | Estado | Detalle |
| --- | --- | --- |
| **Un verificador en verde no es un sitio real** | `Abierto, pasa a la 22: es un método` | El relleno del login en dos pasos salió en verde en `verify-extension` dos veces y falló las dos en shein.com. Lo resolvió el #773 midiendo en las páginas reales: el banner de cookies le quitaba el foco al campo, y la página del verificador no tenía banner. Lo que toca páginas ajenas se sigue comprobando a mano en un sitio de verdad antes de cerrarlo. |
| **Que un atajo choque con uno del navegador** | `Cerrado: Ctrl+Mayús+L en la web (#788) y Alt+Mayús+G en la extensión (#793), comprobados en Chrome y Firefox de Windows` | Un atajo que el navegador se queda no llega a la página ni a la extensión, y falla en silencio. Se comprueba en Chrome y en Firefox sobre Windows, que es donde se usan. |
| **Que abrir el popup con el atajo no conceda `activeTab`** | `Cerrado en el #793: sí lo concede` | El #673 midió que `openPopup()` no lo concede. Sin él el popup no sabe en qué sitio está y no rellena, y entonces el atajo sirve para buscar y copiar, no para rellenar. |
| **Que instalar encima de la versión anterior no funcione** | `Cerrado en el #796: se instala encima` | El #749 midió que nada actualiza la extensión de Firefox sola, pero no que una versión nueva se instale encima. Si no se puede, el enlace de kastor ahorra pasar el fichero y no quitar la anterior. |
| **Mover Importar rompe un verificador** | `Cerrado en el #791: verify-large-vault abre el menú` | `verify-large-vault` busca un botón cuyo texto es exactamente «Importar». Se adapta en el mismo PR y se ejecuta entero. |
| **Que Mozilla retire Manifest V2** | `Abierto, pasa a la 22: es el disparador 1 de ADR-025` | La extensión de Firefox guarda la clave en una página de fondo persistente, que solo existe en V2 (`ADR-025` §2.1). Mozilla ha dicho que lo mantiene; si anuncia lo contrario, es el disparador 1 de ese ADR. |
| **Una pestaña abierta desde antes de un despliegue sigue con el código viejo** | `Abierto, pasa a la 22: es un paso de cada despliegue` | Y ninguna de las dos extensiones se actualiza sola, y en esta iteración cambian las dos: la de Chrome se reconstruye en su carpeta y la de Firefox se firma con una versión nueva. Que sean de solo lectura es lo que impide que eso cueste datos. |
| **El límite de desbloqueos con passkey se comparte** | `Asumido en ADR-023 §5.5, pasa a la 22` | Cinco por hora y cuenta, entre la web y las dos extensiones de todos los dispositivos. |
| **La suite no ve lo que hace MySQL** | `Abierto, pasa a la 22: es una propiedad de la suite` | Los tests corren en SQLite, que no tiene bloqueos de hueco (#730). Lo que se hace a la vez se prueba también contra el MySQL de desarrollo. |
