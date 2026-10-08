ITERACIÓN 20 — Historial y lecciones aprendidas

Archivo de la Iteración 20, cerrada el 8 de octubre de 2026. Recoge la intención de cada issue y lo que se aprendió al cerrarlo.

Está archivado, no muerto. Es la iteración en la que la vault se abrió desde Firefox con la misma extensión que en Chrome, y no con una copia: se midió antes de decidir, se decidió en ADR-025 antes de construir, y lo propio de cada navegador quedó detrás de una interfaz con un test que lo vigila. Es también la iteración en la que eVault volvió a tener DOS CUENTAS REALES —la de la mujer de quien tiene la vault, creada desde ese Firefox, con 265 entradas al cerrar— y en la que el icono de eVault dejó de ser el logotipo de Vite, que lo había sido desde el primer commit sin que nadie lo decidiera.

El objetivo se cumplió: la vault se abre desde Firefox. Lo que no se cumplió entero fue un añadido que no estaba en el plan, el login en dos pasos: rellena el usuario en la página que sirve el verificador y no en la de shein.com, y queda en el 773.

Nota de formato: prosa plana sin Markdown, por la convención del proyecto. Salvo la última sección, LO QUE DECÍA STATUS.md, que conserva el Markdown con que se escribió allí.


QUÉ SE HIZO

Quince issues cerrados con el label s20, más el 680, que venía de la 18. Quince PRs mergeados antes de este cierre, contando los tres de Dependabot del primer día. El 748, el 749 y el 750 se cerraron sin PR, porque eran medidas y su resultado está en sus comentarios, con las sondas enteras.

Bloque 0, planificar: el 747.
Bloque 1, medir: el 748, dónde vive la clave sin documento offscreen; el 749, la firma unlisted de Mozilla y la instalación; el 750, si un verificador puede conducir la extensión en Firefox.
Bloque 2, decidir: el 751, ADR-025.
Bloque 3, construir: el 752, lo propio de Chrome detrás de interfaces; el 680, la extensión de Firefox; el 759, su verificador, que el ADR añadió a la iteración; y el 753, que la lista de sesiones diga el navegador.
Bloque 4, en el Firefox de verdad: el 754, con Windows Hello real, en el portátil de quien la usa.
Bloque 5, el cierre: el 755, este documento.

Y los que no estaban en ningún bloque: el 757, dos alertas de Dependabot de brace-expansion; el 763, el Vite de desarrollo que se quedaba sin memoria con la cobertura; el 767, el icono; el 768, el login en dos pasos, que se reabrió una vez y deja el 773; y el 774, el aviso de la CSP por Zod, que salió durante este cierre.

LA API CAMBIÓ POCO: un valor más en la lista cerrada de clientes de sesión, extension-firefox, sin migración. Y KASTOR SE DESPLEGÓ DOS VECES: el 6 de octubre, adelantado al 754, porque la API de la 19 habría rechazado con 422 la sesión de la extensión de Firefox; y en este cierre, con el icono nuevo de la PWA.


LOS CRITERIOS DE SALIDA

Ocho, escritos al abrir el 5 de octubre de 2026.

El 1, la custodia medida en Firefox: CUMPLIDO (748). Con Firefox 156 en Windows y Windows Hello real, el custody/document.ts y el background.ts de Chrome, cargados juntos y sin cambios en una página de fondo persistente de Manifest V2, guardaron la clave no extraíble, se la devolvieron al popup por BroadcastChannel y descifraron. El token se volvió a usar ocho minutos y medio después, con Windows bloqueado en medio, y el bloqueo por inactividad lo revocó a los quince minutos exactos. El portapapeles se vació con el popup cerrado, y rellenar funcionó con activeTab. Y salieron tres diferencias que el ADR tuvo que decidir: el popup se cierra al aparecer Windows Hello, Firefox no informa nunca de locked, y window.close() no hace nada en una página de fondo.

El 2, la firma medida: CUMPLIDO (749). La firma unlisted tardó tres minutos. El .xpi trae la build byte a byte, más META-INF, salvo manifest.json, que Mozilla reescribe escapando los caracteres no ASCII y que es idéntico como JSON. Se queda instalado tras reiniciar Firefox, y el servicio de actualizaciones de Mozilla no ofrece versiones unlisted, ni siquiera con una más nueva firmada: comprobado contra uBlock Origin, que sí las recibe. Mozilla pone dos condiciones: un nombre sin «Firefox» ni «Mozilla», y data_collection_permissions.

El 3, ADR-025 aprobado: CUMPLIDO (751, PR 760). Con las tres medidas citadas, y lo que se aparta de ADR-023 dicho punto por punto en su sección 7. Tres decisiones las tomó quien tiene la vault: el bloqueo del sistema se asume, hay verificador para Firefox, y el identificador es evault@ecamp0s.github.io.

El 4, una sola extensión: CUMPLIDO (752). Las dos builds salen de extension/src, lo de cada navegador vive en src/platform/<navegador>/, y platformBoundary.test.ts falla si chrome.* o browser.* aparecen fuera de ahí. Lee el árbol sintáctico de TypeScript y no el texto, así que no salta con un comentario ni con un tipo, y sí con globalThis.chrome o window['browser']. Comprobado con dos mutaciones aplicadas. Cada bundle lleva solo su plataforma: el de Chrome sin un browser., el de Firefox sin un chrome..

El 5, la de Chrome sigue igual y la de Firefox tiene su verificador: CUMPLIDO. Sobre el master del cierre, c44e253, verify-extension 9 de 9 —un caso más que al abrir, el del 768— y verify-extension-firefox 5 de 5. El de Firefox nació en rojo: sobre el árbol anterior al 753 falla el caso de las sesiones, y sobre el anterior al 680 ni construye.

El 6, la sesión de Firefox se lista como de Firefox: CUMPLIDO (753). Un valor nuevo, extension-firefox; extension sigue siendo Chrome, porque era la única cuando el 711 la nombró, y renombrarla habría dejado sin identificar todas las sesiones existentes. Comprobado en la API con un test que nace en rojo, en la base con la build real, y en la web del portátil de Windows.

El 7, la vault se abre desde el Firefox de Windows de quien la usa: CUMPLIDO el 8 de octubre de 2026 (754). Con la 0.1.0 firmada contra kastor, y una cuenta nueva con su passkey dado de alta desde ese mismo Firefox por el nombre de la tailnet. Windows Hello salta solo en la pestaña de desbloqueo, sin un segundo clic, y la pestaña se cierra sola. Copiar, rellenar en un login de una página, negarse en otro sitio, la lista de sesiones y reiniciar Firefox: todo bien. Y bloquear Windows no la bloquea, que es lo que decide ADR-025 sección 2.3.

El 8, kastor desplegada y las dos extensiones reconstruidas: CUMPLIDO el 8 de octubre de 2026, en dos despliegues seguidos. El primero con 20bff59, con la copia 93 antes —943 filas: 2 usuarios, 2 vaults, 934 entradas y 3 passkeys—; el segundo, media hora después, con c44e253, el arreglo de Zod del 774, con la copia 94 antes. En los dos, la huella antes y después: 934 entradas, 224.339 bytes hasheados —188.848 de ciphertext, más 934×37, más 933— y la misma SHA-256, cdf060fa…04e9a42. Laravel 13.33.0, sin migraciones pendientes, los dos nombres responden, y la SPA lleva el favicon nuevo y Zod sin JIT. La extensión de Chrome, en la 0.1.3 en su carpeta de Windows; la de Firefox, firmada como 0.1.3.


LAS MEDICIONES, TOMADAS AL CERRAR

Tests: 1.281 en la web (82 ficheros), 380 en la API, 150 en la extensión y 161 del utillaje. Son 1.972, contra los 1.927 al abrir.
Cobertura: 95,52 por ciento global y 98,86 en lib/vault, con las funciones de lib/vault al 100: la misma que al abrir.
Los cinco verificadores, dos veces: sobre 20bff59 y otra vez sobre c44e253, cuando el arreglo de Zod cambió el arranque de la web. Las dos veces, verify-auto-lock 8 de 8 en 18,4 minutos, verify-large-vault con sus once límites, verify-passkey 4 de 4, verify-extension 9 de 9 y verify-extension-firefox 5 de 5. Ni un rojo en diez ejecuciones.
ADR: veinticinco, uno nuevo, el 025.
Issues abiertos al cerrar, sin contar este: tres, ninguno con iteración. El 773, shein.com; el 769, la ventana de desbloqueo de Firefox; y el 624, reconciliar sin red. Issues con el label deuda: cero. Alertas de Dependabot: cero. PRs de Dependabot: tres, el 776, el 777 y el 778 —dependencias menores de la API, la extensión y la web—, abiertos a las 23:45 del 8 de octubre, en mitad de este cierre y con el CI en verde. No se mergearon dentro de él porque cambiaban otra vez el master verificado y desplegado, y uno es de Composer, que pide desplegar.
Los documentos que se leen al empezar: CLAUDE.md 25,9 KB con techo de 28; SPRINT_CONTEXT.md llegó a 40,3 KB con techo de 41, y este cierre lo recorta.


LO QUE APARECIÓ POR EL CAMINO Y NO ESTABA EN EL PLAN

EL ICONO DE eVault ERA EL LOGOTIPO DE VITE (767). Llegó con la plantilla en el primer commit, el 22 de marzo de 2026, y desde el 450 build-icons.mjs sacaba de él la pestaña, la PWA del iPhone y la de Windows. Salió al ir a ponerles icono a las extensiones, que lo habrían heredado. Ahora es un escudo blanco con cerradura sobre azul: quien tiene la vault eligió entre tres dibujos y ocho variantes de color, renderizados a 16, 32 y 48 px sobre barra clara y oscura.

EL LOGIN EN DOS PASOS (768), que salió en el 754: en el primer paso no hay campo de contraseña, y el relleno se negaba entero. La primera regla —un campo que se declare de usuario, o type="email"— salió en verde en el verificador y no reconoció el campo de shein.com. Al medir la página: el campo del login no declara nada y tiene el foco, y el type="email" es el del boletín del pie. Con esa regla, en una página así, el popup decía «Usuario rellenado» y lo había escrito en el boletín. La segunda —el campo con el foco, o uno con autocomplete username o email, y nunca un buscador— salió en verde en el verificador con una página idéntica a la de shein.com, y en el Firefox de verdad siguió sin encontrar el campo. Se dejó para la siguiente iteración, en el 773, con cuatro cosas por medir antes de tocar nada.

EL FIREFOX DE APT SE CAMBIÓ SOLO POR EL SNAP. El 8 de octubre a las 22:05, unattended-upgrade cambió el Firefox de Mozilla por el paquete de transición de Ubuntu, 1:1snap1: su epoch es para apt más nuevo que cualquier versión de Mozilla, y la prioridad 1000 de las instrucciones de Mozilla no lo impidió. verify-extension-firefox dejó de arrancar, porque un snap no lee el perfil que geckodriver crea en /tmp. SETUP.md lleva ahora el fichero que bloquea el firefox de Ubuntu con prioridad -1.

EL VITE DE DESARROLLO SE QUEDÓ SIN MEMORIA (763). npm run test:coverage escribe cientos de HTML en web/coverage, y el Vite del contenedor recargaba por cada uno: 93 recargas en una pasada, la carga media a 28, el kernel mató el contenedor por OOM y la suite web dio 28 fallos por tiempo que no eran de nada. Ahora Vite no vigila coverage/: cero recargas.

EL CI NO ARRANCABA AL ABRIR UN PR. En el 760, el 762 y el 764, gh run list seguía en cero un minuto después de crear el PR, con GitHub diciendo que Actions funcionaba. Cerrar y reabrir el PR lo dispara. Queda en la memoria del agente, no en el repositorio, porque es del servicio y no del proyecto.

WEB-EXT COMO DEPENDENCIA TRAÍA TRES AVISOS ALTOS, de su parte de Android (adbkit y node-forge), sin más arreglo que bajar a una versión de hace años. En un repositorio público habrían sido tres alertas permanentes por código que la firma no usa, así que el script de firma lo ejecuta con npx a una versión exacta y le pasa las claves solo en el entorno.

EL AVISO DE LA CSP POR ZOD (774), visto por quien tiene la vault en el panel «Problemas» de Chrome durante este cierre: «Content Security Policy of your site blocks the use of eval». No era de esta iteración, sino de Zod 4, que al empezar prueba new Function("") dentro de un try/catch para compilar sus validaciones; la CSP lo bloquea, Zod sigue sin el atajo, y el navegador anota la violación igualmente. Con z.config({ jitless: true }), importado lo primero en main.tsx, no lo intenta: con la CSP de producción en vite preview, una violación al cargar el login antes y cero después, validando igual. No salió al primer grep porque el bundle lo escribe con comillas invertidas.

LA SEGUNDA CUENTA REAL VOLVIÓ. La mujer de quien tiene la vault se registró en kastor desde su Firefox el 8 de octubre, dio de alta su passkey por el nombre de la tailnet y, al cerrar, tiene 265 entradas. Era la condición que SPRINT_CONTEXT ponía a las vaults compartidas: que volviera a haber dos cuentas.


LAS LECCIONES

MEDIR ANTES DE DECIDIR CAMBIÓ LA DECISIÓN TRES VECES. Que el popup de Firefox se cierra al aparecer Windows Hello, que Firefox nunca informa de locked y que window.close() no hace nada en una página de fondo: ninguna de las tres estaba en ADR-023 sección 5.4 ni en el 680, y las tres están en ADR-025 porque el 748 las midió con Windows Hello real antes de escribirlo. Y una cuarta, del 750: que en Firefox el passkey de la pestaña de la web funciona desde otra, lo contrario que en Chromium.

UN VERIFICADOR VERDE PRUEBA LA PÁGINA QUE IMAGINAMOS, NO LA DE VERDAD. El caso del login en dos pasos nació en rojo y salió en verde dos veces, y las dos el sitio real dijo otra cosa. La primera vez porque la página del verificador se escribió como un login debería ser y no como shein.com es; la segunda, con una página copiada de la de verdad, por algo que el Chromium automatizado no reproduce. Lo que sirve es medir la página real con la función real, y el 773 empieza por ahí.

UNA REGLA QUE PROTEGE SE PRUEBA CONTRA LO QUE DEBE RECHAZAR EN UNA PÁGINA DE VERDAD. type="email" parecía la señal más segura de un campo de usuario, y en shein.com es exactamente lo que lleva el boletín del pie. Se vio midiendo los campos de la página, no leyendo la regla.

UN MERGE CON «CLOSES» CIERRA LO QUE TODAVÍA NO SE HA COMPROBADO. El 768 se cerró al mergear su primer PR, antes de probarlo en un sitio real, y hubo que reabrirlo. Cuando el último criterio de un issue es una comprobación a mano, el PR lo dice y el issue no se da por bueno hasta hacerla.

LO QUE SE INSTALA FUERA DEL REPOSITORIO CAMBIA SOLO. El Firefox de APT funcionó el 5 de octubre y el 8 ya no era el mismo, sin que nadie lo tocara. Un verificador que depende de un navegador del sistema necesita, además de instrucciones, que esas instrucciones aguanten a las actualizaciones automáticas.

UNA PLANTILLA DEJA DECISIONES QUE NADIE TOMÓ. El icono de Vite estuvo siete meses en la pestaña, en la PWA y en el iPhone, y build-icons.mjs —escrito con cuidado, con sus comprobaciones— lo procesaba sin preguntar qué era. Revisar lo que trae una plantilla es parte de empezar un proyecto.

PREGUNTAR DÓNDE ESTÁ LA BUILD ANTES DE ESCRIBIRLA. La primera reconstrucción de la extensión de Chrome fue a C:\Users\ecamp\evault-extension-kastor, una build vieja que Chrome no cargaba, porque fue la primera que apareció al buscar. La que se carga la dice chrome://extensions, en «Cargado desde», y bastaba con mirarla.

Y UNA DE HERRAMIENTA: AL ESCRIBIR UN FICHERO, UN \u00f3 SE CONVIRTIÓ EN UNA «ó» DE VERDAD. Un comentario de código acabó diciendo que «extensión» vuelve de Mozilla como «extensión», y el mismo error llegó a un comentario del 749 en GitHub. Lo cazó el comprobador de idioma, por la tilde, y no una lectura: un comprobador que vigila una cosa encontró otra.


LO QUE DECÍA STATUS.md

Al cerrar esta iteración, su texto de las tres secciones manuales de STATUS.md se movió aquí, como pide docs/GUIDE.md desde el 663, y salió de allí. Está copiado sin tocar, salvo el párrafo que abre el objetivo y el estado de los riesgos, que se pusieron al día el día del cierre.

EL OBJETIVO QUE LLEVABA STATUS.md

**Iteración 20: cerrada el 8 de octubre de 2026.** Objetivo cumplido: *la vault se abre desde Firefox*, con la misma extensión que en Chrome. Lo que no se cumplió entero fue el login en dos pasos, un añadido que no estaba en el plan, y sigue en el #773.

Lo que sigue es la planificación con la que se abrió.

**Iteración 20: la vault se abre desde Firefox.** Planificada el 5 de octubre de 2026 (#747).

Es el [#680](https://github.com/ecamp0s/evault/issues/680) entero, con la misma extensión que en Chrome y no con una copia. Quien la va a usar tiene Firefox en Windows, que es justo lo que midió el #716: una extensión de Firefox 155 obtiene el mismo PRF con Windows Hello y abre el envoltorio que guardó la web.

**Se mide antes de decidir y se decide antes de construir**, como en la 18:

- **Tres medidas**: dónde vive la clave sin documento *offscreen*, que incluye el bloqueo del sistema, el portapapeles y el relleno (#748); la firma *unlisted* de Mozilla y la instalación (#749); y si un verificador puede conducir la extensión en Firefox (#750).
- **`ADR-025`** (#751), con las tres delante. Decide la custodia, la instalación con el criterio 1 de `ADR-015` delante, qué deja de valer de `ADR-023` en Firefox y cómo se verifica.
- **Construir sin copiar**: lo propio de Chrome detrás de interfaces (#752), la extensión de Firefox (#680), su verificador (#759), que añadió el ADR, y que la lista de sesiones diga desde qué navegador se abrió (#753), porque hoy diría «Extensión de Chrome».
- **Y en el Firefox de verdad**, con Windows Hello real (#754).

**Se firma con una cuenta de addons.mozilla.org**, que crea quien tiene la vault: Firefox normal solo instala extensiones firmadas por Mozilla.

**Lo que se decidió dejar fuera**, con el motivo en `SPRINT_CONTEXT.md`: **el despliegue automático**, que sigue siendo manual; **la limpieza de la vault real**; **la vía A del #725**; y el [#624](https://github.com/ecamp0s/evault/issues/624), que se queda en el backlog en `Low`.

| Bloque | Issues |
| --- | --- |
| 0, planificar | #747 |
| 1, medir | #748, #749, #750 |
| 2, decidir | #751 |
| 3, construir | #752 → #680 → #759, y #753 |
| 4, en el Firefox de verdad | #754 |
| 5, el cierre | #755 |

LOS CRITERIOS QUE LLEVABA STATUS.md

### Iteración 20, cerrada el 8 de octubre de 2026

Escritos al abrirla, el 5 de octubre de 2026. La evaluación uno a uno está en LOS CRITERIOS DE SALIDA, más arriba en este documento.

1. **La custodia medida en Firefox** (#748): una clave no extraíble que sobrevive sin tocar nada y llega intacta al popup, y el bloqueo del sistema, el portapapeles con el popup cerrado y el relleno con un gesto, cada uno con su resultado o su alternativa medida.
2. **La firma medida** (#749): el `.xpi` firmado es la build más la firma, se queda instalado al reiniciar Firefox y no se actualiza solo.
3. **`ADR-025` aprobado** (#751), con las tres medidas citadas y lo que se aparta de `ADR-023` dicho uno por uno.
4. **Una sola extensión**: las builds de Chrome y de Firefox salen del mismo `extension/src`, y un test falla si una API propia de un navegador aparece fuera de su módulo (#752).
5. **La de Chrome sigue igual**: `verify-extension` 8 de 8 sobre el master del cierre. **Y la de Firefox tiene su verificador** (#759), que `ADR-025` §2.7 añadió a la iteración, en verde sobre el mismo master.
6. **La sesión de Firefox se lista como de Firefox**, y las de Chrome que ya existen siguen saliendo bien (#753).
7. **La vault se abre desde el Firefox de Windows de quien la va a usar**, con Windows Hello real, contra kastor, y lo que el verificador no cubra se comprueba a mano caso por caso (#754).
8. **kastor desplegada**, con la copia de antes fuera de la máquina y la huella de las entradas idéntica antes y después, y las dos extensiones reconstruidas desde el master del cierre.

LOS RIESGOS QUE LLEVABA STATUS.md

| Riesgo | Estado | Detalle |
| --- | --- | --- |
| **Que Firefox no tenga dónde guardar la clave sin rebajar `ADR-007`** | `Cerrado en el #748: la custodia de Chrome, sin cambios, en una página de fondo persistente` | La salida probable es Manifest V2 con fondo persistente. Si una `CryptoKey` no extraíble no sobrevive ahí, quedan opciones que `ADR-023` §2.2 ya descartó para Chrome, y el ADR tendría que volver sobre ellas en vez de heredarlas. |
| **Que Firefox no avise del bloqueo del sistema** | `Cerrado en el #748 y ADR-025 §2.3: no avisa nunca, y se asume` | La extensión de Chrome solo bloquea con el estado `locked` de `idle`. Si Firefox no lo da, la extensión se queda abierta con Windows bloqueado hasta los quince minutos de inactividad, y eso lo tiene que decidir `ADR-025`, no descubrirse en el #754. |
| **Firmar es subir el código a Mozilla** | `Cerrado en el #749: firma lo construido, y no lo sirve ni lo actualiza` | `ADR-023` §2.6 da como ventaja de la extensión que no la sirve nadie. El #749 mide si lo firmado es exactamente lo construido y si Firefox la puede actualizar por su cuenta. |
| **Que Mozilla retire Manifest V2** | `Abierto, pasa a la 21: es el disparador 1 de ADR-025` | Mozilla ha dicho que lo mantiene. Si la custodia depende de él, `ADR-025` lo deja escrito como disparador. |
| **El límite de desbloqueos con passkey se comparte** | `Asumido en ADR-023 §5.5, pasa a la 21` | Cinco por hora y cuenta, entre la web, la extensión y todos los dispositivos. Firefox es un cliente más que tira del mismo límite. |
| **Una pestaña abierta desde antes de un despliegue sigue con el código viejo** | `Abierto, pasa a la 21: es un paso de cada despliegue` | El service worker nuevo toma el control, pero una página ya cargada ejecuta su código hasta que se recarga, y ninguna extensión se actualiza sola al desplegar (`ADR-023` §5.3). Que sean de solo lectura es lo que impide que eso cueste datos. |
| **La suite no ve lo que hace MySQL** | `Abierto, pasa a la 21: es una propiedad de la suite` | Los tests corren en SQLite, que no tiene bloqueos de hueco, y el #730 encontró tres sitios del alta que en MySQL morían con dos peticiones a la vez. Lo que se hace a la vez se prueba también contra el MySQL de desarrollo. |
