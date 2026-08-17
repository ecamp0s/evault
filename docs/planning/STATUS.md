# eVault — Estado del Backlog

> **Documento generado. No editar a mano.**
> Se regenera con `scripts/status.sh` leyendo GitHub, que es la única fuente
> de verdad del estado. Si algo aquí no refleja la realidad, corregirlo en
> GitHub y volver a generar. Las secciones delimitadas como manuales sí se
> editan a mano y el generador las preserva. Ver `docs/GUIDE.md`.

Generado: 2026-08-17
Fuente: [ecamp0s/evault](https://github.com/ecamp0s/evault/issues) y Project «eVault»
Issues: 121 en total, 117 cerrados, 4 abiertos

---

## 1) Objetivo de la iteración

<!-- manual:objetivo -->
**Iteración 7: en curso desde el 17 de agosto de 2026.** Objetivo: *eVault deja de ser un proyecto que funciona y pasa a ser la vault donde están mis contraseñas de verdad.*

Es el propósito número uno de `ADR-009` §1 y llevaba esperando desde la Iteración 4. Lo que lo hizo esperar ya no existe: la guía de despliegue está verificada desde la Iteración 5, y al planificar esta el backlog estaba **vacío por primera vez** — 100 issues de 100 cerrados, cero deuda con issue, CI en verde y cero alertas de Dependabot. Es la primera iteración desde la 3 que elige su objetivo en vez de heredarlo.

**Diecinueve issues en cinco bloques.** Bloque 0, las decisiones antes del código: #214, `ADR-013` en #215 y `ADR-014` en #216. Bloque 1, la fiabilidad que falta antes de meter contraseñas reales: #217, #218, #219 y #220. Bloque 2, el cambio de correo: #221 y #222. Bloque 3, la instancia: #223, #224, #225 y #226. Bloque 4, el punto de no retorno y el cierre: #227 y #228. Fuera de bloque, lo que salió al planificar: #229 y #232 como deuda, y #230 ya cerrado.

**La decisión de secuenciación, que es la apuesta de esta iteración.** El bloque 1 va **antes** del despliegue y la migración de contraseñas reales va **última**, con seis bloqueantes declarados. No se le confían contraseñas reales a una vault cuya rotación no está verificada, y una vez migradas un fallo cuesta datos que no están en ningún otro sitio. **Es la primera iteración en la que eso es cierto**: hasta ahora todo era reproducible. El umbral de cobertura (#219) va además después de los dos issues de tests, por la lección de #62 — un check que nace en rojo se acaba ignorando entero.

**Lo que apareció al planificar, y que no estaba en ningún documento.** Cinco hallazgos, los cinco del mismo patrón y todos con issue:

1. **Los dos módulos que tocan el material que abre la vault tienen cero cobertura.** `masterPassword.ts` a 0 de 40 líneas y `recovery.ts` a 0 de 107, porque los tests de sus pantallas los sustituyen con `vi.spyOn`. No se veía en el total, que está al 89,2 %. Y **#202 había afirmado por escrito que `masterPassword.ts` estaba cubierto**, usándolo como argumento para dejar la auditoría fuera de su alcance — mientras pedía en su propio texto «si se quiere esa auditoría, es otro issue y empieza midiendo» (#217, #218).
2. **La clave de la vault no vence nunca** mientras la pestaña siga abierta. Los tokens caducan a las 12 horas desde #149; la clave que descifra, no (#220).
3. **El generador de `STATUS.md` solo leía 100 issues y decía que el documento estaba al día.** El repositorio tenía exactamente 100, así que funcionaba por casualidad. Cerrado en #230, y con los primeros tests que `status.py` ha tenido nunca.
4. **Dos PR de Dependabot llevaban días abiertos y nada los reportaba**, porque `STATUS.md` solo lee issues (#232).
5. **`ADR-012` §2.4 afirma que «queda issue abierto» para verificar el hosting compartido, y ese issue no existe.** Nunca se creó (#229).

Los cinco son **afirmaciones escritas en documentos que les daban autoridad y que nadie volvió a comprobar**, que es la lección que este proyecto arrastra desde el criterio 7 de la Iteración 4. La vuelta nueva que aporta esta planificación: dos de las cinco estaban **en un ADR y en un issue cerrado**, es decir en los dos sitios que el proyecto trata como definitivos.

**Lo que se dejó fuera a propósito.** El acceso a la vault desde fuera de la red local (#229): puede acabar resolviéndose con una instancia en hosting compartido en vez de con un túnel, y esa decisión no es de esta iteración. Queda con la distinción entre Tailscale, Cloudflare Tunnel, VPN propia y hosting compartido ya razonada por quién termina el TLS y quién ve el JavaScript servido — que es la parte que `ADR-012` §2.3 mete en un solo saco y que solo es cierta de una de las cuatro. Fuera también el borrado de cuenta, que en una instancia de un usuario con acceso a la base de datos no aporta nada, y el TOTP nativo, que es funcionalidad nueva y `ADR-009` §4 la pone en último lugar.

**Iteración 6: cerrada el 16 de agosto de 2026.** Objetivo cumplido: *lo que el repositorio afirma sobre sí mismo se puede comprobar ejecutando un comando.*

Catorce issues cerrados, tres de ellos abiertos por el camino: #195, la séptima capa del renombrado que ningún inventario había visto; #197, el hueco de gramática del comprobador; y #202, que `ExportDialog` no tiene ninguna cobertura.

**Lo que cambió de fondo:** las afirmaciones del repositorio sobre sí mismo dejaron de ser prosa. Había tres cifras del inventario de identificadores en español y ninguna coincidía —101, 103 y 105—; al medir con el analizador real de cada lenguaje eran **240 en producción y 256 en los tests**, y al cerrar son **cero y cero** en las seis áreas. Y no se cerró afirmándolo: se cierra con `./scripts/check-identifiers.py --all`, que cualquiera puede ejecutar.

**La lección que la abrió, y que es la tercera vuelta del mismo fallo.** La Iteración 4 dio por cumplido un criterio sin ejecutarlo. La 5 lo rectificó y decidió que un criterio comprobable con un comando **es** ese comando. Al planificar la 6 apareció que ese comando no existía: `ITERACION_5.md` afirmaba que «existe y funciona» y no estaba en ninguna parte. **Escribir la mitigación no es aplicarla.**

**Lo que se construyó para que no haya una cuarta vuelta:** `check-identifiers.py` con sus extractores por AST, `check-docs.py` con las comprobaciones de documentación, `dump-ui-text.mjs` para comparar el texto visible antes y después de un renombrado, 52 tests del propio utillaje, y el workflow `repositorio` que ejecuta todo en cada PR — con dos jobs que corren **siempre y sin filtro de paths**, porque el problema nunca fue que faltaran checks sino que su ausencia no significaba nada.

Y el bundle, que llevaba tres iteraciones fuera: las rutas se cargan de forma diferida y la pantalla de registro aparece en **4.295 ms en vez de 8.820** con Slow 3G y caché fría.

Su historial y sus lecciones están en `docs/planning/archive/ITERACION_6.md`. La que más se repite, y ya con nombre propio: **un punto ciego no se ve desde dentro de la herramienta que lo tiene** — al extractor le faltaban los accessors, y `check-docs.py` no se veía a sí mismo hasta que llegó a CI.

**Iteración 5: cerrada el 7 de agosto de 2026.** Objetivo cumplido: *eVault se levanta desde un clon con un comando, se despliega con una guía verificada, y quien lo abra ve una vault con contenido en menos de un minuto.*

Once issues cerrados: ocho de los planificados más tres que salieron por el camino y que son buena parte del valor de la iteración —#184, un byte NUL que hacía invisible un fichero para `grep`; #186, dos tests que dependían del orden de resolución; y #153, la rectificación con la que empezó todo.

**Lo que cambió de fondo:** eVault dejó de ser un proyecto que solo corría en la máquina de su autor. Ahora se levanta con un comando, se despliega con una guía verificada ejecutándola, y tiene portada. `ADR-005` decía desde el primer commit que el proyecto era self-hosteable, y era cierto en el código, pero no había forma documentada de hacerlo — la mayor distancia que había entre lo que el repositorio prometía y lo que entregaba.

**Lo que no se hizo**, y se dice porque esta iteración empezó rectificando un criterio mal dado por cumplido: el renombrado de los 103 identificadores en español. Pasa a la Iteración 6 partido en seis capas, con el inventario ya medido y verificado por dos vías independientes.

Su historial y sus lecciones están en `docs/planning/archive/ITERACION_5.md`. La que más se repite, cinco veces en once issues: **el camino que nadie recorre es el que está roto.** Y la más cara de aprender: **cuando dos medidas discrepan, la primera hipótesis no puede ser que la rara es la propia** — se dio por buena a `grep` frente a un extractor propio, y `grep` era el que mentía.

No fue funcionalidad nueva y fue deliberado. `ADR-009` §4 pone «despliegue reproducible» en la primera categoría de prioridad, por delante de la legibilidad y de la funcionalidad, y al empezar la iteración **no existía**: ni `Dockerfile`, ni Compose, ni guía, mientras `ADR-005` decidía desde el primer commit que el proyecto fuera self-hosteable y el README lo afirmaba. Era la mayor distancia entre lo que el proyecto prometía y lo que entregaba.

**El hallazgo que decidió la forma del bloque de datos de ejemplo:** el servidor no puede sembrar una demo. No es una limitación de implementación, es el zero-knowledge funcionando — un seeder no puede crear items con contenido porque el cifrado ocurre en el cliente con una clave derivada de una contraseña que el servidor nunca ve. `DatabaseSeeder` lo confirma sin decirlo: crea un usuario con su vault y cero items, porque no le es posible crear ninguno. Así que la siembra es un fichero `.evault` pre-generado con contraseña publicada, importado desde la interfaz, reutilizando el formato de `ADR-011` y el import de #123. La consecuencia útil es que la propia siembra demuestra el modelo en vez de explicarlo.

Siete bloques planificados. Bloque 0, rectificar el criterio de salida 7 de la Iteración 4: #153. Bloque 1, la decisión antes del código: `ADR-012` en #154. Bloque 2, levantar con un comando: #155 y #156. Bloque 3, algo que enseñar: #157 y #158. Bloque 4, desplegar de verdad: #159. Bloque 5, la deuda: #149 y #62. Bloque 6, la deuda que destapó #153: #160. Cierre: #162.

Se completaron los bloques 0 a 4 y la mitad del 5. El 6 no llegó a empezar.

**La secuenciación salió bien**, y fue la misma apuesta que en la 4: #153 fue primero y solo, porque era lo único que estaba mintiendo en un repositorio público y costaba una tarde de documentación, no de código. Empezar por ahí puso además el listón del resto de la iteración.

**#45 quedó fuera otra vez**, con el mismo criterio de `ADR-009` §4 que la dejó fuera de la 4: sin instancia pública expuesta, un bundle grande es pulido y no fiabilidad. Su medición sí está al día: 689 kB, no 663.

**Iteración 4: cerrada el 5 de agosto de 2026.** Objetivo cumplido: *eVault deja de ser una vault en la que da miedo meter contraseñas reales: se puede sacar lo que hay dentro, entrar si se pierde la contraseña, y rotarla sin recifrar nada.*

Diecinueve issues cerrados, los dieciocho planificados más #133, que salió al revisar lo que ahora lee cualquiera. Se cerraron con ellos dos deudas: #21, `master` sin protección, y #97, los identificadores en dos idiomas — pero **#97 se cerró antes de tiempo**, como descubrió #153 al día siguiente: quedaban 25 identificadores en español en producción. Ver el criterio de salida 7. Deja tres deudas, entonces: #149, #160 y #161.

**Lo que cambió de fondo:** olvidar la contraseña maestra ya no es necesariamente perderlo todo. Era el único agujero duro del modelo y `ADR-001` §5.1 dejó prometida su mitigación desde la Iteración 1. La clave de recuperación la cumple sin tocar el principio, porque envuelve la misma clave de vault y el servidor sigue sin guardar nada que pueda abrir. A cambio, el proyecto amplía por primera vez a propósito su superficie de ataque: ahora hay dos caminos completos a la vault y el segundo no tiene segundo factor.

Su historial y sus lecciones están en `docs/planning/archive/ITERACION_4.md`. Las dos que más caras salieron: **el middleware `ability` de Sanctum no sirve para restringir**, porque un token normal lleva la capacidad `*` y `*` satisface cualquier comprobación; y **el texto de la interfaz se rompe cruzando saltos de línea**, así que una auditoría línea a línea no lo ve — tres frases rotas estuvieron en `master` dos issues seguidos y las encontró abrir el navegador.

No fue un objetivo inventado para llenar un sprint. `ADR-001` §6 planificó el proyecto por fases durante la Iteración 1, y su fase 4 dice «clave de recuperación, rotación de contraseña maestra y criptografía asimétrica para vaults compartidas». Esta iteración fue esa fase, menos la parte asimétrica que `ADR-009` sacó del alcance al dejar el proyecto de ser un SaaS. El orden lo fijó el criterio de `ADR-009` §4: primero lo que hace el producto fiable para quien lo usa de verdad, después lo que lo hace legible, y solo después funcionalidad nueva.

Siete bloques, planificados en #114. Bloque 0, el repositorio público: #110, que cierra #21. Bloque 1, la migración de identificadores a inglés: #115 a #119, que cierran #97. Bloque 2, las decisiones antes del código: `ADR-010` en #120 y `ADR-011` en #121. Bloque 3, sacar los datos: #122 y #123. Bloque 4, rotar la contraseña maestra: #124 y #125. Bloque 5, la clave de recuperación: #126, #127 y #128. Bloque 6, backup y restauración: #129. Cierre: #130.

**La decisión de secuenciación que no se ve en el grafo, y que salió bien:** la migración de idiomas fue antes que el código nuevo. Los bloques 3, 4 y 5 tocan `lib/vault/`, `lib/`, `pages/vault/` y `pages/auth/`, que eran exactamente las capas en español; migrar después habría sido renombrar código recién escrito y resolver conflictos entre PR grandes.

**Iteración 3: cerrada el 3 de agosto de 2026.** Objetivo cumplido: *el servidor deja de poder leer nada del usuario, y la vault se bloquea y se desbloquea con la contraseña maestra.*

Es la iteración que cumple `ADR-001`. Las dos anteriores construyeron el producto sobre dos excepciones deliberadas al principio fundamental —autenticación convencional en la Iteración 1, contenido sin cifrar en la Iteración 2—, tomadas para fijar y validar el contrato antes de introducir criptografía. Esta las retiró las dos.

**La advertencia que encabezaba este documento durante dos iteraciones ya no aplica.** El contenido está cifrado con AES-256-GCM y la condición de no desplegar con datos reales queda levantada. La apuesta salió bien y conviene decirlo: al llegar el cifrado real no hubo que tocar ni `vault_items` ni ninguna ruta. `register` ganó dos campos de entrada, `GET /api/vaults` dos de salida, y eso fue todo.

Doce issues, ocho nuevos y cuatro arrastrados. La columna vertebral fue una cadena que va de la decisión al código y del código a la interfaz: `ADR-008` fijó la arquitectura de claves (#80), el módulo criptográfico y sus tests fueron el suelo (#81), el servidor aprendió a guardar la clave de vault envuelta (#82), y encima fueron registro (#83), login (#84), cifrado real (#59) y bloqueo de la vault (#73). Fuera de esa cadena: la CSP (#77), el trigger del workflow `status` (#63), el generador de contraseñas (#85) y la búsqueda de items (#86).

Su historial y sus lecciones están en `docs/planning/archive/ITERACION_3.md`. Lo que más se repite ahí: **ver pasar un test no demuestra que sirva.** Se comprobó dos veces rompiendo el código a propósito, y en el generador de contraseñas dos de cuatro mutaciones no se detectaban.

**Iteración 2: cerrada el 2 de agosto de 2026.** Ver `docs/planning/archive/ITERACION_2.md`.

**Iteración 1: cerrada el 30 de julio de 2026.** Ver `docs/planning/archive/ITERACION_1.md`.
<!-- /manual:objetivo -->

## 2) Qué se puede tomar ahora

Issues abiertos sin ningún bloqueante abierto, ordenados por prioridad. El primero de la lista es lo siguiente a tomar.

1. [#227](https://github.com/ecamp0s/evault/issues/227) chore(ops): migrar las contraseñas reales a la instancia personal (High)
1. [#251](https://github.com/ecamp0s/evault/issues/251) docs: decidir si el idioma del código compensa el comprobador que necesita (Medium)
1. [#229](https://github.com/ecamp0s/evault/issues/229) chore(ops): acceso a la vault desde fuera de la red local (Low)

## 3) Backlog completo

| Issue | Título | Labels | Estado | Prioridad | Bloqueada por | Bloquea a |
| --- | --- | --- | --- | --- | --- | --- |
| [#1](https://github.com/ecamp0s/evault/issues/1) | chore(api): stack de calidad — Pest, Larastan y CI | `s1` `chore` `api` | Done | — | — | — |
| [#2](https://github.com/ecamp0s/evault/issues/2) | chore(api): Sanctum y CORS para consumo desde SPA | `s1` `chore` `api` | Done | High | — | #3 |
| [#3](https://github.com/ecamp0s/evault/issues/3) | feat(api): endpoints de registro, login y sesión | `s1` `feat` `api` | Done | Medium | #2 | #5 |
| [#4](https://github.com/ecamp0s/evault/issues/4) | chore(web): shadcn/ui y sistema de diseño base | `s1` `chore` `web` | Done | — | — | #5 |
| [#5](https://github.com/ecamp0s/evault/issues/5) | feat(web): pantallas de login y registro | `s1` `feat` `web` | Done | Medium | #3, #4 | #6 |
| [#6](https://github.com/ecamp0s/evault/issues/6) | feat(web): shell autenticado y rutas protegidas | `s1` `feat` `web` | Done | Low | #5, #35, #38 | — |
| [#9](https://github.com/ecamp0s/evault/issues/9) | docs: fundación documental — índice, ADRs y STATUS.md generado | `s1` `chore` `documentation` | Done | High | — | — |
| [#11](https://github.com/ecamp0s/evault/issues/11) | ci: regenerar STATUS.md automáticamente al mergear en master | `s1` `chore` `documentation` | Done | — | — | — |
| [#15](https://github.com/ecamp0s/evault/issues/15) | fix(ci): localizar el Project por vinculación al repo, no por su nombre | `s1` `chore` `documentation` | Done | — | — | — |
| [#17](https://github.com/ecamp0s/evault/issues/17) | ci(web): lint y build del frontend en cada PR | `s1` `chore` `web` | Done | High | — | #20 |
| [#18](https://github.com/ecamp0s/evault/issues/18) | chore(repo): plantillas de issue en .github/ISSUE_TEMPLATE | `s1` `chore` `documentation` | Done | Low | — | — |
| [#19](https://github.com/ecamp0s/evault/issues/19) | chore(repo): Dependabot para composer, npm y GitHub Actions | `s1` `chore` | Done | Low | — | — |
| [#20](https://github.com/ecamp0s/evault/issues/20) | ci: mover el filtrado de paths del trigger a los jobs | `s1` `chore` | Done | Medium | #17 | #21 |
| [#21](https://github.com/ecamp0s/evault/issues/21) | chore(repo): proteger master con un ruleset | `s1` `chore` | Done | Medium | #20, #110 | — |
| [#25](https://github.com/ecamp0s/evault/issues/25) | chore(api): rate limiting en los endpoints de autenticación | `s1` `chore` `api` | Done | Medium | — | — |
| [#35](https://github.com/ecamp0s/evault/issues/35) | chore(web): evaluar la migración a React Router 8 | `s1` `chore` `web` | Done | High | — | #6 |
| [#38](https://github.com/ecamp0s/evault/issues/38) | chore(web): suite de tests de frontend con Vitest y Testing Library | `s1` `chore` `web` | Done | High | — | #6 |
| [#43](https://github.com/ecamp0s/evault/issues/43) | chore(web): decidir dónde vive el token de sesión antes de la Iteración 3 | `s2` `chore` `web` `deuda` | Done | High | — | #59 |
| [#44](https://github.com/ecamp0s/evault/issues/44) | chore(web): que /styleguide no viaje al build de producción | `s2` `chore` `web` `deuda` | Done | Low | — | — |
| [#45](https://github.com/ecamp0s/evault/issues/45) | chore(web): reducir el bundle, que va en un solo chunk | `chore` `web` `deuda` `s6` | Done | Low | #160 | #190 |
| [#46](https://github.com/ecamp0s/evault/issues/46) | feat(web): shell usable en móvil | `s2` `feat` `web` `deuda` | Done | Medium | — | — |
| [#47](https://github.com/ecamp0s/evault/issues/47) | docs: cerrar formalmente la Iteración 1 en STATUS.md | `s1` `chore` `documentation` | Done | Medium | — | — |
| [#48](https://github.com/ecamp0s/evault/issues/48) | docs: partir SPRINT_CONTEXT y fijar las reglas de gestión de deuda | `s1` `chore` `documentation` | Done | Medium | — | — |
| [#50](https://github.com/ecamp0s/evault/issues/50) | feat(api): modelo de dominio de vaults y pertenencia | `s2` `feat` `api` | Done | High | — | #51, #53 |
| [#51](https://github.com/ecamp0s/evault/issues/51) | feat(api): modelo de vault items con payload opaco | `s2` `feat` `api` | Done | High | #50 | #52 |
| [#52](https://github.com/ecamp0s/evault/issues/52) | feat(api): CRUD de vault items con contexto de vault explícito | `s2` `feat` `api` | Done | High | #51 | #54, #55 |
| [#53](https://github.com/ecamp0s/evault/issues/53) | feat(api): listado de los vaults del usuario | `s2` `feat` `api` | Done | Medium | #50 | #54 |
| [#54](https://github.com/ecamp0s/evault/issues/54) | chore(web): capa de datos de la vault con TanStack Query | `s2` `chore` `web` | Done | Medium | #52, #53 | #55, #59 |
| [#55](https://github.com/ecamp0s/evault/issues/55) | feat(web): lista de items de la vault | `s2` `feat` `web` | Done | High | #52, #54 | #56, #57, #58 |
| [#56](https://github.com/ecamp0s/evault/issues/56) | feat(web): crear y editar un item de la vault | `s2` `feat` `web` | Done | High | #55 | — |
| [#57](https://github.com/ecamp0s/evault/issues/57) | feat(web): borrar un item con confirmación | `s2` `feat` `web` | Done | Medium | #55 | — |
| [#58](https://github.com/ecamp0s/evault/issues/58) | feat(web): mostrar, ocultar y copiar la contraseña | `s2` `feat` `web` | Done | Medium | #55 | — |
| [#59](https://github.com/ecamp0s/evault/issues/59) | chore(web): sustituir la codificación temporal del payload por cifrado real | `s3` `chore` `web` `deuda` | Done | High | #43, #54, #81, #84 | #73, #86 |
| [#60](https://github.com/ecamp0s/evault/issues/60) | docs: planificar la Iteración 2 | `s2` `chore` `documentation` | Done | — | — | — |
| [#62](https://github.com/ecamp0s/evault/issues/62) | ci: comprobaciones de documentación en los PR | `s2` `chore` `documentation` `deuda` `s6` | Done | Medium | #161 | #190 |
| [#63](https://github.com/ecamp0s/evault/issues/63) | fix(ci): el workflow status escribe en master fuera de los disparadores declarados | `s2` `s3` `chore` `documentation` | Done | High | — | — |
| [#73](https://github.com/ecamp0s/evault/issues/73) | chore(web): dejar de persistir el token de sesión (ADR-007) | `s3` `chore` `web` `deuda` | Done | High | #59, #84 | — |
| [#77](https://github.com/ecamp0s/evault/issues/77) | chore(web): definir y servir una Content-Security-Policy | `s3` `chore` `web` | Done | Medium | — | — |
| [#79](https://github.com/ecamp0s/evault/issues/79) | docs: planificar la Iteración 3 | `s3` `chore` `documentation` | Done | High | — | #80 |
| [#80](https://github.com/ecamp0s/evault/issues/80) | docs: ADR-008 — arquitectura de claves de la vault | `s3` `chore` `documentation` | Done | High | #79 | #81, #82 |
| [#81](https://github.com/ecamp0s/evault/issues/81) | feat(web): módulo criptográfico con PBKDF2 y AES-256-GCM | `s3` `feat` `web` | Done | High | #80 | #59, #83, #84 |
| [#82](https://github.com/ecamp0s/evault/issues/82) | feat(api): almacenar la clave de vault envuelta | `s3` `feat` `api` | Done | High | #80 | #83, #84 |
| [#83](https://github.com/ecamp0s/evault/issues/83) | feat(web): registro con derivación en cliente | `s3` `feat` `web` | Done | High | #81, #82 | #84 |
| [#84](https://github.com/ecamp0s/evault/issues/84) | feat(web): login con hash de autenticación derivado | `s3` `feat` `web` | Done | High | #81, #82, #83 | #59, #73 |
| [#85](https://github.com/ecamp0s/evault/issues/85) | feat(web): generador de contraseñas | `s3` `feat` `web` | Done | Medium | — | — |
| [#86](https://github.com/ecamp0s/evault/issues/86) | feat(web): búsqueda de items en la vault | `s3` `feat` `web` | Done | Medium | #59 | — |
| [#91](https://github.com/ecamp0s/evault/issues/91) | chore(dev): el entorno local no puede ejecutar crypto.subtle | `s3` `chore` `deuda` | Done | Medium | — | — |
| [#97](https://github.com/ecamp0s/evault/issues/97) | chore(repo): migrar los identificadores del código a inglés | `chore` `deuda` | Done | Medium | #119 | — |
| [#101](https://github.com/ecamp0s/evault/issues/101) | docs: cerrar la Iteración 3 | `s3` `chore` `documentation` | Done | High | — | — |
| [#103](https://github.com/ecamp0s/evault/issues/103) | docs: README en inglés, licencia MIT y arranque verificable en un clon | `chore` `documentation` | Done | — | — | — |
| [#105](https://github.com/ecamp0s/evault/issues/105) | docs: ADR-009 — eVault deja de ser un SaaS | `chore` `documentation` | Done | — | — | — |
| [#107](https://github.com/ecamp0s/evault/issues/107) | chore(web): que el primer arranque de un clon no tenga sorpresas | `chore` `web` | Done | — | — | — |
| [#109](https://github.com/ecamp0s/evault/issues/109) | chore(repo): actualizar las referencias al nombre antiguo del repositorio | `chore` `documentation` | Done | — | — | — |
| [#110](https://github.com/ecamp0s/evault/issues/110) | chore(repo): configurar el repositorio ahora que es público | `s4` `chore` | Done | Medium | — | #21, #130 |
| [#112](https://github.com/ecamp0s/evault/issues/112) | chore(dev): mover el entorno local a evault.localhost y cerrar el problema de crypto.subtle | `chore` `api` `web` | Done | — | — | — |
| [#114](https://github.com/ecamp0s/evault/issues/114) | docs: planificar la Iteración 4 | `s4` `chore` `documentation` | Done | High | — | #120, #121 |
| [#115](https://github.com/ecamp0s/evault/issues/115) | chore(web): migrar lib/vault a inglés | `s4` `chore` `web` `deuda` | Done | Medium | — | #116 |
| [#116](https://github.com/ecamp0s/evault/issues/116) | chore(web): migrar lib a inglés | `s4` `chore` `web` `deuda` | Done | Medium | #115 | #117 |
| [#117](https://github.com/ecamp0s/evault/issues/117) | chore(web): migrar components a inglés | `s4` `chore` `web` `deuda` | Done | Medium | #116 | #118 |
| [#118](https://github.com/ecamp0s/evault/issues/118) | chore(web): migrar pages a inglés | `s4` `chore` `web` `deuda` | Done | Medium | #117 | #119, #122, #125, #127 |
| [#119](https://github.com/ecamp0s/evault/issues/119) | chore(api): migrar a inglés los identificadores que quedan | `s4` `chore` `api` `deuda` | Done | Medium | #118 | #97, #130 |
| [#120](https://github.com/ecamp0s/evault/issues/120) | docs: ADR-010 — clave de recuperación | `s4` `chore` `documentation` | Done | High | #114 | #126 |
| [#121](https://github.com/ecamp0s/evault/issues/121) | docs: ADR-011 — formato de export e import | `s4` `chore` `documentation` | Done | High | #114 | #122 |
| [#122](https://github.com/ecamp0s/evault/issues/122) | feat(web): export cifrado de la vault | `s4` `feat` `web` | Done | High | #118, #121 | #123 |
| [#123](https://github.com/ecamp0s/evault/issues/123) | feat(web): import desde el formato propio y desde CSV | `s4` `feat` `web` | Done | Medium | #122 | #130 |
| [#124](https://github.com/ecamp0s/evault/issues/124) | feat(api): rotar el hash de autenticación y la clave envuelta | `s4` `feat` `api` | Done | High | — | #125 |
| [#125](https://github.com/ecamp0s/evault/issues/125) | feat(web): cambiar la contraseña maestra | `s4` `feat` `web` | Done | High | #118, #124 | #128 |
| [#126](https://github.com/ecamp0s/evault/issues/126) | feat(api): envoltorio de recuperación y endpoint para usarlo | `s4` `feat` `api` | Done | High | #120 | #127 |
| [#127](https://github.com/ecamp0s/evault/issues/127) | feat(web): generar y entregar la clave de recuperación | `s4` `feat` `web` | Done | High | #118, #126 | #128 |
| [#128](https://github.com/ecamp0s/evault/issues/128) | feat(web): recuperar el acceso con la clave de recuperación | `s4` `feat` `web` | Done | High | #125, #127 | #130 |
| [#129](https://github.com/ecamp0s/evault/issues/129) | feat(api): backup y restauración de la instancia | `s4` `feat` `api` | Done | High | — | #130 |
| [#130](https://github.com/ecamp0s/evault/issues/130) | docs: cerrar la Iteración 4 | `s4` `chore` `documentation` | Done | High | #110, #119, #123, #128, #129 | — |
| [#133](https://github.com/ecamp0s/evault/issues/133) | docs: dejar de nombrar un proyecto personal anterior | `s4` `chore` `documentation` | Done | Medium | — | — |
| [#149](https://github.com/ecamp0s/evault/issues/149) | chore(api): los tokens de sesión se acumulan y no caducan nunca | `chore` `api` `deuda` `s5` | Done | Medium | — | — |
| [#153](https://github.com/ecamp0s/evault/issues/153) | docs: corregir el criterio de salida 7 de la Iteración 4 | `chore` `documentation` `s5` | Done | High | — | #160 |
| [#154](https://github.com/ecamp0s/evault/issues/154) | docs: ADR-012 — estrategia de despliegue | `chore` `documentation` `s5` | Done | High | — | #155, #159 |
| [#155](https://github.com/ecamp0s/evault/issues/155) | chore(repo): docker compose up levanta el proyecto desde un clon limpio | `chore` `s5` | Done | High | #154 | #157, #162 |
| [#156](https://github.com/ecamp0s/evault/issues/156) | chore(web): mover shadcn a devDependencies | `chore` `web` `s5` | Done | Medium | — | — |
| [#157](https://github.com/ecamp0s/evault/issues/157) | feat(repo): fichero .evault de ejemplo para ver la vault con contenido | `feat` `s5` | Done | High | #155 | #158, #162 |
| [#158](https://github.com/ecamp0s/evault/issues/158) | docs: screenshot de la vault en el README | `chore` `documentation` `s5` | Done | Medium | #157 | #162 |
| [#159](https://github.com/ecamp0s/evault/issues/159) | docs: guía de despliegue self-hosted, verificada ejecutándola | `chore` `documentation` `s5` | Done | High | #154 | #162 |
| [#160](https://github.com/ecamp0s/evault/issues/160) | chore(web): los identificadores en español que quedan en producción | `chore` `web` `deuda` `s6` | Done | Medium | #153, #178, #179, #180, #181, #182, #183, #195 | #45, #161, #162, #190 |
| [#161](https://github.com/ecamp0s/evault/issues/161) | chore(web): identificadores en español en los tests | `chore` `web` `deuda` `s6` | Done | Medium | #160 | #62, #190 |
| [#162](https://github.com/ecamp0s/evault/issues/162) | docs: cerrar la Iteración 5 | `chore` `documentation` `s5` | Done | High | #155, #157, #158, #159, #160 | — |
| [#165](https://github.com/ecamp0s/evault/issues/165) | chore(repo): borrar la rama al mergear, como convención escrita | `chore` `documentation` `s5` | Done | — | — | — |
| [#178](https://github.com/ecamp0s/evault/issues/178) | chore(web): migrar lib/vault a inglés (2ª pasada) | `chore` `web` `deuda` `s6` | Done | Medium | #189 | #160, #179 |
| [#179](https://github.com/ecamp0s/evault/issues/179) | chore(web): migrar el resto de lib a inglés (2ª pasada) | `chore` `web` `deuda` `s6` | Done | Medium | #178 | #160, #180 |
| [#180](https://github.com/ecamp0s/evault/issues/180) | chore(web): migrar components y la configuración de build a inglés | `chore` `web` `deuda` `s6` | Done | Medium | #179 | #160, #181 |
| [#181](https://github.com/ecamp0s/evault/issues/181) | chore(web): migrar pages/vault a inglés (2ª pasada) | `chore` `web` `deuda` `s6` | Done | Medium | #180 | #160, #182 |
| [#182](https://github.com/ecamp0s/evault/issues/182) | chore(web): migrar pages/auth a inglés (2ª pasada) | `chore` `web` `deuda` `s6` | Done | Medium | #181 | #160, #183 |
| [#183](https://github.com/ecamp0s/evault/issues/183) | chore(api): migrar a inglés los identificadores que quedan en app | `chore` `api` `deuda` `s6` | Done | Medium | #182 | #160, #195 |
| [#184](https://github.com/ecamp0s/evault/issues/184) | fix(web): un byte NUL en import.ts lo hace invisible para grep | `bug` `web` `s5` | Done | — | — | — |
| [#186](https://github.com/ecamp0s/evault/issues/186) | fix(web): dos tests dependen del orden de resolución y fallan en CI | `bug` `web` `s5` | Done | — | — | — |
| [#189](https://github.com/ecamp0s/evault/issues/189) | chore(repo): comprobador de identificadores en español, ejecutable y en el repositorio | `chore` `deuda` `s6` | Done | High | #193 | #178 |
| [#190](https://github.com/ecamp0s/evault/issues/190) | docs: cerrar la Iteración 6 | `chore` `documentation` `s6` | Done | High | #45, #62, #160, #161 | — |
| [#191](https://github.com/ecamp0s/evault/issues/191) | docs: planificar la Iteración 6 | `chore` `documentation` `s6` | Done | High | — | #193 |
| [#193](https://github.com/ecamp0s/evault/issues/193) | chore(repo): saldar las siete alertas de Dependabot abiertas en master | `chore` `deuda` `s6` | Done | High | #191 | #189 |
| [#195](https://github.com/ecamp0s/evault/issues/195) | chore(repo): migrar a inglés los identificadores de scripts/ y de los workflows | `chore` `deuda` `s6` | Done | Medium | #183 | #160 |
| [#197](https://github.com/ecamp0s/evault/issues/197) | chore(repo): el comprobador no ve los identificadores en orden español | `chore` `deuda` `s6` | Done | Medium | — | — |
| [#202](https://github.com/ecamp0s/evault/issues/202) | test(web): ExportDialog no tiene ninguna cobertura, y ahí vive la confirmación del export en claro | `chore` `web` `deuda` | Done | Medium | — | — |
| [#214](https://github.com/ecamp0s/evault/issues/214) | docs: planificar la Iteración 7 | `chore` `documentation` `s7` | Done | High | — | #215, #216 |
| [#215](https://github.com/ecamp0s/evault/issues/215) | docs: ADR-013 — emplazamiento y operación de la instancia personal | `chore` `documentation` `s7` | Done | High | #214 | #223, #224, #225 |
| [#216](https://github.com/ecamp0s/evault/issues/216) | docs: ADR-014 — cambio de correo electrónico | `chore` `documentation` `s7` | Done | High | #214 | #221 |
| [#217](https://github.com/ecamp0s/evault/issues/217) | test(web): masterPassword.ts no tiene ninguna cobertura, y ahí vive la garantía de que un cambio a medias no deja a nadie fuera | `chore` `web` `deuda` `s7` | Done | High | — | #219, #227 |
| [#218](https://github.com/ecamp0s/evault/issues/218) | test(web): recovery.ts no tiene ninguna cobertura, y es el segundo camino completo a la vault | `chore` `web` `deuda` `s7` | Done | High | — | #219, #227 |
| [#219](https://github.com/ecamp0s/evault/issues/219) | chore(web): umbral de cobertura que falle el CI en lib/vault | `chore` `web` `s7` | Done | Medium | #217, #218 | — |
| [#220](https://github.com/ecamp0s/evault/issues/220) | feat(web): la vault se bloquea sola por inactividad | `feat` `web` `s7` | Done | High | — | #227 |
| [#221](https://github.com/ecamp0s/evault/issues/221) | feat(api): cambiar el correo electrónico rotando el hash y los envoltorios | `feat` `api` `s7` | Done | Medium | #216 | #222 |
| [#222](https://github.com/ecamp0s/evault/issues/222) | feat(web): cambiar el correo electrónico con re-derivación en cliente | `feat` `web` `s7` | Done | Medium | #221 | #227 |
| [#223](https://github.com/ecamp0s/evault/issues/223) | chore(ops): limpiar los restos del despliegue de prueba de kastor | `chore` `s7` | Done | Medium | #215 | #224 |
| [#224](https://github.com/ecamp0s/evault/issues/224) | chore(ops): desplegar la instancia personal | `chore` `s7` | Done | High | #215, #223 | #225 |
| [#225](https://github.com/ecamp0s/evault/issues/225) | chore(ops): el backup corre solo y se guarda fuera de la máquina | `chore` `s7` | Done | High | #215, #224, #240 | #226, #227 |
| [#226](https://github.com/ecamp0s/evault/issues/226) | chore(ops): actualizar la instancia con datos reales dentro | `chore` `s7` | Done | High | #225 | #227 |
| [#227](https://github.com/ecamp0s/evault/issues/227) | chore(ops): migrar las contraseñas reales a la instancia personal | `chore` `s7` | Todo | High | #217, #218, #220, #222, #225, #226 | #228 |
| [#228](https://github.com/ecamp0s/evault/issues/228) | docs: cerrar la Iteración 7 | `chore` `documentation` `s7` | Todo | High | #227, #230 | — |
| [#229](https://github.com/ecamp0s/evault/issues/229) | chore(ops): acceso a la vault desde fuera de la red local | `chore` `deuda` | Todo | Low | — | — |
| [#230](https://github.com/ecamp0s/evault/issues/230) | fix(repo): el generador de STATUS.md solo lee 100 issues y no avisa de que trunca | `bug` `deuda` `s7` | Done | High | — | #228 |
| [#232](https://github.com/ecamp0s/evault/issues/232) | chore(repo): dos PR de Dependabot llevan días abiertos y STATUS.md no los ve | `chore` `deuda` `s7` | Done | Medium | — | — |
| [#240](https://github.com/ecamp0s/evault/issues/240) | fix(api): la retención de copias ordena por nombre y un reloj que salta atrás le hace borrar la más reciente | `bug` `api` `s7` | Done | High | — | #225 |
| [#246](https://github.com/ecamp0s/evault/issues/246) | docs: un mapa de los cuatro secretos, con diagrama | `chore` `documentation` `s7` | Done | High | — | — |
| [#251](https://github.com/ecamp0s/evault/issues/251) | docs: decidir si el idioma del código compensa el comprobador que necesita | `chore` `documentation` | Todo | Medium | — | — |

## 4) Grafo de dependencias

```mermaid
graph LR
  I2["#2<br/>Done"]
  I3["#3<br/>Done"]
  I4["#4<br/>Done"]
  I5["#5<br/>Done"]
  I6["#6<br/>Done"]
  I17["#17<br/>Done"]
  I20["#20<br/>Done"]
  I21["#21<br/>Done"]
  I35["#35<br/>Done"]
  I38["#38<br/>Done"]
  I43["#43<br/>Done"]
  I45["#45<br/>Done"]
  I50["#50<br/>Done"]
  I51["#51<br/>Done"]
  I52["#52<br/>Done"]
  I53["#53<br/>Done"]
  I54["#54<br/>Done"]
  I55["#55<br/>Done"]
  I56["#56<br/>Done"]
  I57["#57<br/>Done"]
  I58["#58<br/>Done"]
  I59["#59<br/>Done"]
  I62["#62<br/>Done"]
  I73["#73<br/>Done"]
  I79["#79<br/>Done"]
  I80["#80<br/>Done"]
  I81["#81<br/>Done"]
  I82["#82<br/>Done"]
  I83["#83<br/>Done"]
  I84["#84<br/>Done"]
  I86["#86<br/>Done"]
  I97["#97<br/>Done"]
  I110["#110<br/>Done"]
  I114["#114<br/>Done"]
  I115["#115<br/>Done"]
  I116["#116<br/>Done"]
  I117["#117<br/>Done"]
  I118["#118<br/>Done"]
  I119["#119<br/>Done"]
  I120["#120<br/>Done"]
  I121["#121<br/>Done"]
  I122["#122<br/>Done"]
  I123["#123<br/>Done"]
  I124["#124<br/>Done"]
  I125["#125<br/>Done"]
  I126["#126<br/>Done"]
  I127["#127<br/>Done"]
  I128["#128<br/>Done"]
  I129["#129<br/>Done"]
  I130["#130<br/>Done"]
  I153["#153<br/>Done"]
  I154["#154<br/>Done"]
  I155["#155<br/>Done"]
  I157["#157<br/>Done"]
  I158["#158<br/>Done"]
  I159["#159<br/>Done"]
  I160["#160<br/>Done"]
  I161["#161<br/>Done"]
  I162["#162<br/>Done"]
  I178["#178<br/>Done"]
  I179["#179<br/>Done"]
  I180["#180<br/>Done"]
  I181["#181<br/>Done"]
  I182["#182<br/>Done"]
  I183["#183<br/>Done"]
  I189["#189<br/>Done"]
  I190["#190<br/>Done"]
  I191["#191<br/>Done"]
  I193["#193<br/>Done"]
  I195["#195<br/>Done"]
  I214["#214<br/>Done"]
  I215["#215<br/>Done"]
  I216["#216<br/>Done"]
  I217["#217<br/>Done"]
  I218["#218<br/>Done"]
  I219["#219<br/>Done"]
  I220["#220<br/>Done"]
  I221["#221<br/>Done"]
  I222["#222<br/>Done"]
  I223["#223<br/>Done"]
  I224["#224<br/>Done"]
  I225["#225<br/>Done"]
  I226["#226<br/>Done"]
  I227["#227<br/>Todo"]
  I228["#228<br/>Todo"]
  I230["#230<br/>Done"]
  I240["#240<br/>Done"]
  I2 --> I3
  I3 --> I5
  I4 --> I5
  I5 --> I6
  I17 --> I20
  I20 --> I21
  I35 --> I6
  I38 --> I6
  I43 --> I59
  I45 --> I190
  I50 --> I51
  I50 --> I53
  I51 --> I52
  I52 --> I54
  I52 --> I55
  I53 --> I54
  I54 --> I55
  I54 --> I59
  I55 --> I56
  I55 --> I57
  I55 --> I58
  I59 --> I73
  I59 --> I86
  I62 --> I190
  I79 --> I80
  I80 --> I81
  I80 --> I82
  I81 --> I59
  I81 --> I83
  I81 --> I84
  I82 --> I83
  I82 --> I84
  I83 --> I84
  I84 --> I59
  I84 --> I73
  I110 --> I21
  I110 --> I130
  I114 --> I120
  I114 --> I121
  I115 --> I116
  I116 --> I117
  I117 --> I118
  I118 --> I119
  I118 --> I122
  I118 --> I125
  I118 --> I127
  I119 --> I97
  I119 --> I130
  I120 --> I126
  I121 --> I122
  I122 --> I123
  I123 --> I130
  I124 --> I125
  I125 --> I128
  I126 --> I127
  I127 --> I128
  I128 --> I130
  I129 --> I130
  I153 --> I160
  I154 --> I155
  I154 --> I159
  I155 --> I157
  I155 --> I162
  I157 --> I158
  I157 --> I162
  I158 --> I162
  I159 --> I162
  I160 --> I45
  I160 --> I161
  I160 --> I162
  I160 --> I190
  I161 --> I62
  I161 --> I190
  I178 --> I160
  I178 --> I179
  I179 --> I160
  I179 --> I180
  I180 --> I160
  I180 --> I181
  I181 --> I160
  I181 --> I182
  I182 --> I160
  I182 --> I183
  I183 --> I160
  I183 --> I195
  I189 --> I178
  I191 --> I193
  I193 --> I189
  I195 --> I160
  I214 --> I215
  I214 --> I216
  I215 --> I223
  I215 --> I224
  I215 --> I225
  I216 --> I221
  I217 --> I219
  I217 --> I227
  I218 --> I219
  I218 --> I227
  I220 --> I227
  I221 --> I222
  I222 --> I227
  I223 --> I224
  I224 --> I225
  I225 --> I226
  I225 --> I227
  I226 --> I227
  I227 --> I228
  I230 --> I228
  I240 --> I225
  classDef hecho fill:#1a7f37,stroke:#1a7f37,color:#fff;
  class I2,I3,I4,I5,I6,I17,I20,I21,I35,I38,I43,I45,I50,I51,I52,I53,I54,I55,I56,I57,I58,I59,I62,I73,I79,I80,I81,I82,I83,I84,I86,I97,I110,I114,I115,I116,I117,I118,I119,I120,I121,I122,I123,I124,I125,I126,I127,I128,I129,I130,I153,I154,I155,I157,I158,I159,I160,I161,I162,I178,I179,I180,I181,I182,I183,I189,I190,I191,I193,I195,I214,I215,I216,I217,I218,I219,I220,I221,I222,I223,I224,I225,I226,I230,I240 hecho;
```

La flecha va del bloqueante al bloqueado. En verde, lo ya cerrado.

## 5) Criterios de salida de la iteración

<!-- manual:salida -->
### Iteración 7, en curso

Ocho criterios. La regla que sale de las tres iteraciones anteriores y que aquí se aplica desde el principio: **si un criterio se puede comprobar con un comando, el criterio es ese comando** — y el comando vive en el repositorio. Los que no se pueden comprobar así se evalúan **ejecutándolos**, nunca leyendo código ni diffs.

Dos de ellos tienen una forma que este proyecto no había usado antes: el 2 y el 3 no describen un estado deseable sino **una comprobación que tiene que fallar cuando el código se rompe**. Es la respuesta directa a que cinco hallazgos de la planificación fueran afirmaciones que nadie podía comprobar.

1. 🔶 **La instancia personal sirve la vault por HTTPS y guarda contraseñas reales.** La primera mitad **cumplida el 17 de agosto** y verificada como pedía el criterio: **desde otro dispositivo de la red y en un navegador real**, no desde la máquina que sirve — la excepción de `.localhost` vale donde corre el navegador, así que probarlo en kastor habría sido un falso verde. Registro completado, item creado, recarga bloqueando la vault y descifrado al desbloquear. Y la comprobación que de verdad demuestra el modelo, hecha contra la base de datos real: la cadena guardada **no aparece** en `vault_items` —`coincidencias: 0`— y lo que hay son 172 bytes de `ciphertext` con `version 2` (#224). **Falta la segunda mitad:** las contraseñas de verdad todavía no están dentro, y eso es #227.
2. ⬜ **`npx vitest run --coverage` no deja ningún módulo de `lib/vault/` a cero, y el CI falla si vuelve a pasar.** El umbral es por fichero y no global, porque un umbral global es exactamente el instrumento que no vio ninguno de los tres casos —`ExportDialog`, `masterPassword.ts` y `recovery.ts` (#217, #218, #219).
3. ⬜ **Mover el `api.put` delante del reenvolvido en `masterPassword.ts` rompe un test.** Verificado **aplicando la mutación**, no leyendo el test, y comprobando antes que la mutación se aplicó de verdad: una mutación que no se aplica se parece mucho a una que no se detecta (#217).
4. ⬜ **La vault se bloquea sola tras el plazo decidido**, verificado en navegador con el reloj corriendo y **con la pestaña en segundo plano**, que es el caso que los temporizadores falsos no reproducen porque el navegador los estrangula (#220).
5. ⬜ **Cambiar el correo, salir, entrar con el nuevo y ver los items intactos** — con los `vault_items` sin un solo `updated_at` movido. Y la comprobación que distingue esto de una rotación de contraseña: **la clave de recuperación vieja ya no abre y la nueva sí**, porque el correo es el salt del HKDF que deriva sus claves (#221, #222).
6. ✅ **Un backup producido por el cron —no hecho a mano para la ocasión— y guardado fuera de kastor, restaurado en una instancia limpia.** Lo que se verifica es la cadena entera, y la parte que nunca ha corrido es justo la automática. Con el aprendizaje de #159 delante: una copia que su dueño no puede recuperar es un cero tranquilizador con otra forma. **Cumplido el 17 de agosto, y la cadena entera recorrida**: el cron disparó solo y produjo `evault-000007`, cifrada con X25519 y subida al destino remoto, comprobando que ahí no hay nada legible. Después se descargó y se descifró **en otra máquina, con la clave privada que el servidor no tiene**, y salió un JSON válido cuyo `created_at` —19:38:01— coincide con el nombre del fichero: es la copia del cron y no una hecha a mano. Lo que no se repitió aquí es el `evault:restore`, que ya se verificó en #129 contra una base de datos vaciada y tiene sus tests. Y una condición que no estaba escrita y ahora sí: **la clave privada no puede vivir en el mismo proveedor que las copias**, o ese proveedor tiene el candado y la llave (#225).
7. ✅ **Actualizar la instancia con datos dentro sin perder nada**, con la vuelta atrás **ejecutada de verdad** y no descrita. Verificado el ciclo entero el 17 de agosto sobre la instancia real: copia previa, migración sobre `vault_items` —una tabla con filas—, actualización, `rollback` y regreso, comparando **huellas SHA-256** de `vault_items` y `vault_members` y no solo el número de filas: idénticas antes y después.

   Y el criterio se ganó su razón de ser, porque encontró que **la guía documentaba un procedimiento que no aplica las migraciones**: `up -d --build` no recrea el contenedor cuando la imagen no cambia, y como el código va por volumen, un `git pull` con migraciones nuevas no la cambia. La migración se quedó `Pending` con los contenedores tres horas arriba, **sin ningún error**: código nuevo y esquema viejo. Corregido con `--force-recreate` y con la alternativa de lanzar `migrate` a propósito (#226).
8. ⬜ **Pest, Vitest, Larastan en nivel `max`, los tres comprobadores del repositorio en cero y CI en verde.** Punto de partida: 379 tests en la web, 238 en la API y 73 del utillaje.

Y la guarda que la Iteración 6 aprendió a poner en toda comparación, que aquí aplica a los criterios 2, 5 y 7: **exigir haber medido algo.** Dos volcados vacíos dan un `diff` idéntico, y un criterio evaluado contra la nada sale cumplido.

### Iteración 6, cerrada

Nueve criterios. **Los nueve cumplidos**, y ninguno dado por bueno leyendo código: cada uno se evaluó ejecutándolo el día del cierre.

1. ✅ **Cero alertas de Dependabot abiertas en `master`**, comprobado en el panel. Al evaluarlo había **una** abierta —`nanoid`, publicada ese mismo día y posterior a #193—, y se arregló en el PR de cierre en vez de declarar el criterio cumplido con una alerta viva. Conviene saber que este criterio mide un estado del mundo y no del repositorio: es un blanco móvil (#193).
2. ✅ **El comprobador está en el repositorio y se ejecuta con un comando.** Verificado ejecutándolo, y con el test que planta un identificador en un fichero con un byte NUL y comprueba que lo ve (#189).
3. ✅ **Cero identificadores en español en el código de producción.** 0 de 909 en `web`, 0 de 364 en `api`, 0 de 211 en `scripts`, 0 de 12 en los workflows (#160, #178–#183, #195).
4. ✅ **Cero en los ficheros de test.** 0 de 422 en `web`, 0 de 177 en `api`. Los textos de `it` y `describe` siguen en español, y las 2.060 cadenas de los ficheros de test son idénticas a las de antes (#161).
5. ✅ **El texto visible de la interfaz es idéntico al de antes del renombrado.** Volcadas con el AST las **1.709 cadenas** del código de producción en el commit anterior a #178 y en el posterior a #183: idénticas, **cero quitadas y cero modificadas**. Las 14 que hay de más al cerrar son todas de #45.
6. ✅ **El job de documentación detecta cada caso roto a propósito.** Las seis comprobaciones verificadas con seis mutaciones, las seis detectadas (#62).
7. ✅ **La referencia rota de `vite.config.ts` está corregida.** Apuntaba a un documento de arquitectura que **nunca existió** —no hay ni un commit que lo añadiera—; ahora apunta a `src/lib/csp.ts` (#62).
8. ✅ **El chunk inicial baja de forma medible.** De **689,7 kB** en un solo chunk a **338 kB** de arranque; la ruta del login descarga 485,4 kB y la de la vault 657,5. Verificado en navegador con Slow 3G y caché fría contra el build anterior: la pantalla de registro aparece a los **4.295 ms** en vez de a los **8.820**, y el contenedor nunca estuvo vacío en 462 muestras (#45).
9. ✅ **Pest, Vitest, Larastan en nivel `max` y CI en verde.** 371 tests en la web —los 368 de antes del renombrado más 3 del fallback de rutas—, 238 en la API y 52 del utillaje, sin baseline.

Deuda que deja, con issue: **#197**, que el comprobador no ve los identificadores en orden español; y **#202**, que `ExportDialog` no tiene ninguna cobertura y ahí vive la confirmación del export en claro.

### Iteración 5, cerrada

Siete criterios. **Seis cumplidos y uno no**, el quinto. Ninguno se dio por bueno leyendo código o diffs, que era la lección heredada del criterio 7 de la iteración anterior — y por eso mismo el que no se cumplió se declara sin cumplir.

1. ✅ **Un clon limpio levanta con `docker compose up` y permite registrarse.** Verificado clonando **desde GitHub en un directorio nuevo y vacío del servidor**, no desde el directorio de trabajo, donde ya existen `.env`, `vendor/` y `node_modules/`. Un Compose que solo funciona sobre un árbol ya inicializado no es reproducible: es el directorio del autor con un `compose.yaml` encima (#155).
2. ✅ **El fichero de ejemplo se importa y los items aparecen descifrados.** Verificado en navegador y **desde una cuenta distinta de la que lo generó**, con otro correo y otra contraseña maestra, que es la prueba de que el fichero no está atado a quien lo creó (#157).
3. ✅ **El screenshot del README es de la aplicación real**, con los datos del fichero de ejemplo — de modo que cualquiera puede reproducir la misma pantalla. Un screenshot irreproducible envejece sin que se note (#158).
4. ✅ **La guía de despliegue se verificó ejecutándola** entera en un servidor: alias mDNS, certificados de la CA interna, registro en navegador real, y destrucción y recreación de los contenedores comprobando que los datos **y el certificado** sobreviven (#159).
5. ❌ **Cero identificadores en español en el código de producción.** **No cumplido: siguen habiendo 103.** El inventario está medido y verificado por dos vías independientes, y el renombrado pasa a la Iteración 6 partido en seis capas (#160, #178–#183). Lo que sí quedó hecho es medirlo bien, que resultó ser el trabajo difícil.
6. ✅ **Los tokens de sesión caducan** a las 12 horas y los vencidos se barren al entrar, sin necesidad de cron. Verificado **rompiendo el código a propósito** con tres mutaciones, las tres detectadas (#149).
7. ✅ **Pest, Vitest, Larastan en nivel `max` y CI en verde.** 238 tests en la API y 368 en la web, sin baseline.

Deuda que deja, con issue: el renombrado (#160 y sus seis capas) y #62, las comprobaciones de documentación en los PR. Van juntas: #160 deja escrito el comando y #62 lo mete en el CI.

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

### Iteración 3, cerrada

Los ocho criterios de la Iteración 3, todos cumplidos. Ninguno se dio por bueno leyendo el código: todos se comprobaron abriendo el navegador o inspeccionando la base de datos.

1. ✅ **Inspeccionando la base de datos no se puede leer ningún dato de usuario.** Guardada una credencial desde el navegador, la fila en MySQL sale con `version 2` y un `ciphertext` opaco; ninguna de las cinco cadenas escritas aparece, y descodificar el base64 ya no produce nada legible (#59).
2. ✅ **La contraseña maestra no aparece en ninguna petición.** Verificado en la pestaña de red: el cuerpo del alta y el del login llevan un hash en base64 donde antes iba la contraseña (#83, #84).
3. ✅ **El token no está en `localStorage`, `sessionStorage`, cookies ni IndexedDB.** Lo único que queda guardado es el nombre y el correo de quien entró, que no son secretos y son lo que permite el bloqueo (#73).
4. ✅ **Recargar bloquea la vault, presentado como bloqueo y no como expulsión.** Pantalla propia que no pide el correo, saluda con él y explica por qué ha pasado (#73, `ADR-007`).
5. ✅ **Un fallo de descifrado se comunica y nunca escribe encima de los datos buenos.** El cifrado ocurre antes de mandar la petición, así que un fallo deja intacto el item anterior (#81, #59).
6. ✅ **`vault_items` no cambió** y `version` distingue el esquema nuevo. El test que enumera sus columnas sigue pasando sin tocarlo (#59, #82).
7. ✅ **La aplicación sirve una CSP** y la consola no reporta violaciones, verificado con el build de producción y no solo con el de desarrollo. `npm run dev` sigue con HMR (#77).
8. ✅ **Pest, Vitest, Larastan y CI en verde.** 276 tests en la web y 169 en la API; `composer analyse` en nivel `max` sin baseline.

Extra no previsto en los criterios: `ADR-008`, el generador de contraseñas y la búsqueda de items.

Los criterios de las iteraciones anteriores están en `docs/planning/archive/`.
<!-- /manual:salida -->

## 6) Riesgos

<!-- manual:riesgos -->
| Riesgo | Estado | Detalle |
| --- | --- | --- |
| **Un fallo cuesta datos que no están en ningún otro sitio** | `Abierto, es el riesgo mayor de la Iteración 7` | Es nuevo y cambia de categoría todo lo demás: hasta ahora cualquier fallo era reproducible —bases de datos de prueba, ficheros de ejemplo, despliegues que se podían tirar y rehacer— y a partir de #227 la instancia guarda contraseñas reales que no existen en otra parte. El servidor además **no puede reparar nada**, porque no puede leer nada. Mitigación en tres partes, todas de secuenciación y no de código: el bloque 1 entero va antes del despliegue, #227 va última con seis bloqueantes declarados, y el origen del que se migra **no se borra hasta haber verificado la copia** — con la secuencia escrita en el issue: importar, verificar, backup, usar la vault unos días, y solo entonces retirar el origen |
| **Una afirmación escrita en un documento que le da autoridad** | `Materializado cinco veces al planificar la Iteración 7` | Es la misma clase de fallo que el criterio 7 de la Iteración 4, pero medida de golpe y con dos apariciones nuevas que obligan a subirla de categoría. Las cinco: **#202 afirmó que `masterPassword.ts` estaba cubierto** y lo usó para dejar la auditoría fuera de alcance, cuando está a cero (#217); el generador de `STATUS.md` decía «ya estaba al día» omitiendo 17 issues (#230); **`ADR-012` §2.4 promete un issue de hosting compartido que nunca se creó** (#229); dos PR de Dependabot llevaban días abiertos sin que nada los reportara (#232); y la mitad cliente de la mitigación de rotación estaba declarada `Mitigado` sin un solo test (#217). **Lo nuevo, y es lo que la hace peor de lo que se creía: dos de las cinco viven en un ADR y en un issue cerrado**, es decir en los dos sitios que este proyecto trata como definitivos y no vuelve a mirar. Un ADR es inmutable por diseño, así que una afirmación falsa dentro de uno no se corrige: se hereda. Mitigación disponible solo para las comprobables: convertirlas en comando. Para las que viven en prosa de un ADR no hay comando, y eso queda dicho |
| **La mitad cliente de una mitigación sin un solo test** | `Materializado y con issue` | `STATUS.md` declaraba `Mitigado` el riesgo de la rotación y la recuperación describiendo dos mitades. La del servidor está verificada rompiéndola a propósito en `RotateMasterPasswordTest`. **La del cliente —«el reenvolvido entero antes de enviar la primera petición»— la afirmaba un comentario en `masterPassword.ts` y no la comprobaba nada**: hoy se puede mover el `api.put` delante del `Promise.all` y el CI sigue verde en 379 tests. Es el peor sitio del proyecto para no tener cobertura, porque el modo de fallo es dejar al usuario fuera de una vault que nadie puede reparar. Va a #217 y #218, con las mutaciones concretas, y el criterio de salida 3 lo mide |
| **Un módulo a cero es invisible cuando el total está bien** | `Materializado tres veces, con mitigación planificada` | `ExportDialog` a cero de 39 sentencias hasta #202, `masterPassword.ts` a cero de 40 y `recovery.ts` a cero de 107 — con la web al 89,2 %. Las tres veces se encontró **leyendo una tabla de cobertura a mano y por casualidad mientras se hacía otra cosa**, que no es un método. Y el caso de `recovery.ts` enseña la forma exacta que tiene de esconderse: `Recover.tsx` marca **100 % de sentencias** encima de un módulo al 0 %, porque el test sustituye la función con `vi.spyOn`. Mitigación en #219: umbral **por fichero y no global**, porque el global es justo el instrumento que no vio ninguno de los tres |
| **La clave que descifra no vence nunca** | `Abierto, con issue` | Los tokens de sesión caducan a las 12 horas desde #149, pero `keyInMemory.ts` solo se vacía al recargar o llamando a `forget()`, y el único `setTimeout` del frontend es el del portapapeles. Se endureció la mitad barata —un token robado da una sesión, no el contenido— y quedó sin endurecer la que guarda los secretos. Es lo que el comentario del propio fichero dice que un gestor de contraseñas no puede permitir, aplicado al caso que no cubre: no hace falta guardar la clave en disco para que alguien con el dispositivo entre, basta con no soltarla. Va a #220, y trae un modo de fallo silencioso propio: **un `setTimeout` no mide el tiempo en una pestaña en segundo plano** porque el navegador lo estrangula, así que hay que comparar marcas de tiempo o el bloqueo llega cuando ya no protege |
| **La instancia vive en una máquina que no está siempre encendida** | `Aceptado, con la decisión escrita` | kastor se apaga a veces, a propósito y avisado. Lo inmediato es que no se puede acceder, y eso es aceptado. Lo que hay que registrar es el resto: **el cron de backup no corre** —con el matiz que lo suaviza, que sin uso tampoco hay datos nuevos, así que lo que importa es el desfase entre el último backup y el último cambio y no el tiempo apagada—; **arranca desactualizada**, semanas sin parches en la máquina que guarda las contraseñas, de donde sale una regla de orden: tras un apagado largo se actualiza antes de usarla; y el alias mDNS **queda publicado apuntando a nada**, que es inocuo pero confunde el diagnóstico porque el nombre resuelve y parece un fallo de la aplicación. Lo que **no** es problema, y merece quedar escrito para que nadie lo investigue dos veces: los certificados de `tls internal`, que Caddy renueva al arrancar. Y el riesgo de fondo, que no es técnico: **si no se puede llegar a la vault cuando se necesita, no se usa; y si no se usa, se sigue con el gestor anterior y hay dos fuentes de verdad divergiendo.** El peligro de una instancia intermitente no es perder datos, es que la vault quede a medio poblar. **Decidido en `ADR-013`: la intermitencia se asume y no se combate**, porque los apagados son deliberados y no averías; lo que el ADR aporta es que las consecuencias queden escritas en vez de supuestas, incluida la que no es obvia —que lo que importa no es el tiempo apagada sino el desfase entre la última copia y el último cambio |
| **Un backup en el mismo disco que los datos** | `Decidido en ADR-013, pendiente de implementar` | No es una copia de seguridad: si los volúmenes de Docker y el fichero del cron están los dos en kastor, un fallo de ese disco se lleva las dos cosas a la vez, encendida o apagada. Salió de preguntar qué problemas trae que la máquina esté apagada, y es el hallazgo más importante de la planificación. `ADR-011` §5 ya apuntaba ahí al decir que el backup del servidor y el export cifrado son **complementarios y no redundantes**: uno protege del borrado accidental, el otro de la pérdida de la máquina, y solo existía el primero. A favor juega el modelo: `BackupCommand` escribe cuatro tablas en un JSON propio, **sin el `.env` ni la `APP_KEY`**, y los datos de usuario ya salen cifrados, así que la copia se puede sacar de la máquina sin ceremonia — «un dividendo directo del zero-knowledge que casi nunca se cobra», dice el propio comando. Lo que sí lleva son los hashes de autenticación y las claves envueltas, que no descifran nada pero no conviene repartir, de modo que `ADR-013` decidió cifrarlo antes de que salga. **Y lo decidió con cifrado asimétrico**, que es lo que compra la propiedad que importa: la clave pública vive en la máquina y la privada no, así que **la máquina que produce la copia no puede leerla** — quien comprometa el servidor no obtiene los backups anteriores. La contrapartida asumida es simétrica a la de `ADR-001` con la contraseña maestra: perder la clave privada convierte las copias en basura, y por eso se custodia donde la clave de recuperación y se comprueba en la primera restauración. Implementación en #225 |
| **Cambiar el correo invalida la clave de recuperación** | `Decidido en ADR-014, pendiente de implementar` | Y es la **inversa exacta** de lo que la interfaz ya afirma en otro sitio, así que se va a malinterpretar: rotar la contraseña maestra NO invalida la clave de recuperación —la clave de vault no cambia—, pero cambiar el correo SÍ, porque `deriveRecoveryKeys` usa el correo normalizado como salt del HKDF (`crypto.ts:352`) y de ahí salen tanto el `wrapKey` como el `authHash`. El modo de fallo es el peor posible en un gestor: **dejar al usuario con una clave de recuperación que ya no sirve y que él cree que sirve**, y eso no se descubre hasta el día que hace falta. `ADR-014` eligió **no dejar terminar la operación sin entregar una clave nueva**, que es el patrón que #128 ya validó: exigir la clave vieja habría empujado a guardarla en el mismo dispositivo, y avisar sin bloquear deja sin red a quien cierre el aviso. A quien no tenía clave no se le inventa una obligación, porque `recovery_wrapped_key` es nullable a propósito y el servidor lo distingue. Y hay un modo de fallo silencioso aparte: si el servidor normaliza el correo distinto que el cliente, la clave maestra derivada no coincidirá y la vault no abrirá **sin dar ningún error en el momento del cambio** (#221) |
| **Una lista de permitidos admite una palabra del idioma que prohíbe** | `Materializado dos veces y vivo` | Es el modo de fallo propio de `english.txt`, y no es que se le escape una palabra: es que **se admita una española**. Pasó dos veces en la Iteración 6, las dos por añadir en bloque la salida del comando sin leerla. Primero `pie`, que entró pensando en *pie chart* y en el código es pie de página, y que por eso dejó pasar un prop en cinco ficheros. Después cinco de golpe —`esta`, `llega`, `nunca`, `raiz`, `ya`— que venían de identificadores recién escritos en un test. **El test que protege la lista no las detectó**, porque comprueba tildes y eñes y las cinco son ASCII puro. La mitigación es procedimental y está escrita en la cabecera del propio fichero: una palabra entra cuando su uso **actual** en el código es inglés. No hay comando para esto |
| **El comprobador no ve la gramática** | `Mitigado en parte, y el resto es irreducible` | Mide vocabulario. `useVaultPersonal` son tres palabras inglesas en orden español y pasa. Costó **un hallazgo por capa** en el renombrado: `useVaultPersonal`, dos `aItem` distintos —uno en un fichero que el check reportaba limpio—, la propiedad `a` de `NavItem` y la de `link`, y el prop `pie`. Los cinco los encontró **leer** la lista de identificadores, no ejecutar el comando. #197 automatizó la parte que se podía —las palabras funcionales españolas pegadas a otra, como `aItem` o `deVault`— y dejó escrito que el resto seguiría necesitando ojos. Sigue siendo cierto: `useVaultPersonal` pasa |
| **Un punto ciego no se ve desde dentro de la herramienta que lo tiene** | `Materializado dos veces y cerrado` | Al extractor de TypeScript le faltaban `GetAccessor` y `SetAccessor`, así que tres getters en español de `lib/api.ts` llevaban meses pasando; apareció **leyendo** el fichero para renombrar otra cosa, y obligó a rectificar el recuento publicado en #189. Y `check-docs.py` usaba `git ls-files`, que solo ve el índice, de modo que **un fichero recién escrito era invisible para su propio comprobador**: en local decía «todo en orden» y en CI encontró cuatro problemas. Los dos corregidos y con test; lo que queda es la clase de fallo, que solo se cierra midiendo con dos herramientas distintas |
| **Una comparación que no compara nada da un resultado tranquilizador** | `Materializado y cerrado` | Al evaluar el criterio 5 del cierre, la herramienta de volcado falló al resolver TypeScript y produjo **dos ficheros vacíos**; `diff` dijo que eran idénticos y el criterio pareció cumplido. Es el cero tranquilizador de #184 otra vez, y esta vez dentro de la evaluación del criterio que existe para evitarlo. Cualquier comparación necesita una guarda que exija haber medido algo: aquí, que los dos volcados tengan más de mil cadenas |
| **`ExportDialog` no tiene ninguna cobertura** | `Cerrado, y la clase de fallo sigue arriba` | Resuelto en #202: hoy está al 97,4 % de sentencias, medido. Lo que **no** se cerró es la clase de fallo, que tiene fila propia más arriba —«un módulo a cero es invisible cuando el total está bien»— y que volvió a materializarse dos veces en la planificación de la Iteración 7, porque #202 dio por cubiertos indirectamente unos módulos que estaban a cero. Detalle original: cero de 39 sentencias, cero de 22 ramas, cero de 11 funciones, medido. Ningún test lo importa. Lo que está sin cubrir no es pintado: es la confirmación del export en claro que `ADR-011` exige que no se pueda dar por inercia, y un export en claro sin esa puerta deja la vault entera legible en la carpeta de descargas. Va a #202, con la mutación concreta que los tests tienen que detectar |
| **El comprobador se escribe a la medida de lo que ya pasa** | `Mitigado, y vuelve a aplicar en la Iteración 7` | La mitigación de #189 se aplicó entera y funcionó. Vuelve a aplicar en #219, donde el umbral de cobertura **se fija midiendo lo que hay** y no eligiendo un número: eso es literalmente escribirlo a la medida de lo que ya pasa, y se acepta a conciencia porque lo que ese issue cierra no es «poca cobertura» sino «cero invisible». Detalle original: era el riesgo mayor de la Iteración 6, y ya se materializó una vez: el inventario de #160 se quedó corto **tres veces seguidas** —ámbito `web/src` y `api/app`, `vite.config.ts` fuera de `src/`, y ninguna búsqueda que viera el destructuring— y lo inventarió quien tenía que cumplir el criterio. Dicho como lo dejó escrito el propio #160: **cuando el método de medida lo elige quien va a cumplir el criterio, el criterio se mide a sí mismo.** Mitigación en #189, en tres partes: el comando se escribe y se commitea **antes** de renombrar nada, publica su recuento de partida sobre `master`, y trae sus propios tests con identificadores plantados a propósito —en español y en inglés, y uno dentro de un fichero con un byte NUL— verificados rompiendo el comprobador y no viéndolos pasar |
| **Un check que nace en rojo se acaba ignorando entero** | `Mitigado dos veces por la misma vía` | Funcionó en la Iteración 6 y se repite en la 7: #219 va declarado como bloqueado por #217 y #218, de modo que el umbral de cobertura entra en verde y desde ese momento cualquier rojo significa algo. Detalle original: Si el check de identificadores de #62 aterriza con cien pendientes, el CI queda rojo en todos los PR y el equipo aprende a mirar hacia otro lado — que es justo lo que el propio #62 dice de su vía de escape. Mitigación: **#62 va después de #160 y #161**, declarado como dependencia nativa, para que el check entre en verde y desde ese momento cualquier rojo signifique algo. El coste aceptado es que el CI tarda cuatro bloques en protegernos |
| **La carga diferida introduce estados que antes no existían** | `Cerrado` | No se materializó, y el motivo es instructivo: en la carga en frío React suspende antes de confirmar el primer render, así que queda a la vista el marcador que `index.html` trae dentro de `root`; y al navegar, react-router usa una transición y React conserva la pantalla anterior. **El `RouteFallback` no llegó a verse ni una vez en el navegador**, y se queda igualmente con sus tres tests, porque una red que no se despliega casi nunca es la que falla el día que hace falta. Detalle original: #45 parte las rutas con `React.lazy`, y eso crea huecos de carga donde antes no había ninguno. El modo de fallo es una pantalla en blanco al navegar, que en build de desarrollo no se ve porque el chunk está caliente. Mitigación: el criterio de salida 8 exige comprobarlo **en navegador y no solo en build**, y #45 va el último para que si la iteración se alarga sea lo que se cae |
| **Una herramienta de auditoría omite ficheros en silencio** | `Materializado y cerrado, con secuela abierta` | Descubierto en la Iteración 5 y es el hallazgo que más lejos llega. `web/src/lib/vault/import.ts` contenía un byte NUL literal —usado como separador en `findDuplicates`, y la intención era correcta—, así que `file` lo clasificaba como `data` y **`grep` lo omitía sin dar error, sin avisar y sin contarlo**. Ninguna auditoría del repositorio había visto ese fichero desde que se creó el 4 de agosto, lo que explica que sobreviviera a la migración de #115 y a la evaluación del criterio 7. Corregido en #184. **Lo que queda abierto es la clase de fallo, no el caso**: un comprobador que omite en silencio devuelve un cero tranquilizador, y es peor que no tenerlo. Va a #62, que tendrá que usar `-a` y comprobar que ningún fichero de texto lleve bytes NUL |
| **Un test que espera a una cosa y afirma otra** | `Materializado y cerrado` | Dos tests esperaban al `post` y comprobaban el cierre del diálogo sin esperarlo, cuando ese cierre ocurre un tick más tarde en el callback de la mutación. Ocho pasadas en verde en local y fallo a la primera en CI, **ensuciando además un PR que no tenía nada que ver**. Corregido en #186, y verificado rompiendo los componentes: sin la llamada al cierre, los dos fallan |
| **Un criterio de salida se da por cumplido sin comprobarlo** | `Materializado, y con mitigación en curso` | Ya pasó: el criterio 7 de la Iteración 4 afirmaba que no quedaban identificadores en español y quedaban 25 en producción, detectado en #153 al día siguiente de cerrar la iteración. Lo que lo hace peligroso es que **el daño escala solo**: de un checkbox a `STATUS.md`, de ahí al archivo de la iteración y de ahí a un repositorio público, ganando autoridad en cada salto sin que nadie añada una comprobación. Un test que no detecta nada al menos pasa por delante de alguien; una afirmación en un criterio de salida no la vuelve a mirar nadie, porque el documento donde vive es el que certifica que ya está comprobado. Mitigación: **si un criterio se puede comprobar con un comando, el criterio es ese comando y se deja escrito en el repositorio** — va en #62, junto con las comprobaciones de documentación en los PR. **Tercera aparición, al planificar la Iteración 6, y esta vez en la propia mitigación**: `ITERACION_5.md` afirma que el comando de comprobación «existe y funciona» y que «queda en el repositorio», y no está en ninguna parte. Escribir la mitigación no es aplicarla. Va a #189, que la construye y la commitea antes de renombrar nada |
| **Un despliegue que solo funciona en la máquina del autor** | `Cerrado` | Se verificó clonando desde GitHub en un directorio vacío de un servidor real, y la guía se escribió ejecutándola. Lo que destapó hacerlo así fue justo lo que no se ve leyendo: el origen de CORS mal compuesto, el clon que su dueño no podía borrar y los nombres mDNS multietiqueta que no resuelven. Antes decía: | Es el modo de fallo natural de #155 y #159, y no se detecta desde el directorio de trabajo, donde ya está todo inicializado. Mitigación: el criterio 1 exige clon limpio en un directorio vacío, y el 4 exige ejecutar la guía en un servidor en vez de escribirla de memoria — que sería repetir el error del criterio 7 en un documento que alguien va a seguir paso a paso |
| **La contraseña del fichero de ejemplo usada como contraseña real** | `Mitigado` | Un `.evault` de ejemplo obliga a publicar la contraseña que lo abre. Mitigación en #157: que sea obviamente de demostración a simple vista, y que el aviso esté donde se lee y no en una nota al pie |
| **Desplegar por `http` en un dominio real** | `Mitigado` | El aviso está escrito en `DEPLOYMENT.md` antes que ningún comando, y `ADR-012` lo recoge como requisito de arranque y no de endurecimiento. Además el despliegue verificado usa `tls internal`, así que el camino documentado ya es HTTPS. Detalle original: | Fuera de `localhost` no existe `crypto.subtle` en contexto inseguro, así que una instancia servida por `http` en un dominio propio no es una instalación degradada: es una donde no se puede ni registrar un usuario. Quien lo descubra después habrá desplegado dos veces. Mitigación: va antes que ningún comando en la guía de #159, y es requisito explícito de `ADR-012` en #154 |
| **La rotación y la recuperación tocan el material que abre la vault** | `Mitigado` | Era el riesgo mayor de la Iteración 4. Un cambio de contraseña a medias —contraseña actualizada y envoltorio no, o al revés— deja al usuario fuera de sus datos para siempre, y el servidor no puede repararlo porque no puede leer nada. Mitigado en los dos extremos: transacción en el servidor con **un test que fuerza el fallo entre las dos escrituras**, y en el cliente el reenvolvido entero antes de enviar la primera petición, de modo que una contraseña actual equivocada falla sin haber mandado nada (#124, #125) |
| **La clave de recuperación es un segundo camino completo a la vault** | `Aceptado, con la decisión escrita` | Es la primera vez que el proyecto amplía a propósito su superficie de ataque: hasta ahora solo la contraseña maestra abría la vault. Quien tenga la clave de recuperación entra sin ella y sin segundo factor. Se asume a cambio de cerrar la promesa de `ADR-001` §5.1, y se argumentó en `ADR-010` (#120). Implementado en #126, #127 y #128. El corolario que más se malinterpreta: **rotar la contraseña maestra no lo cierra**, porque la clave de vault no cambia; quien sospeche un robo de la clave de recuperación tiene que regenerarla aparte, y la interfaz lo dice con un test que falla si el aviso desaparece |
| Un endpoint de recuperación convertido en oráculo de enumeración | `Mitigado` | Reintroduciría justo lo que `ADR-008` evitó al descartar un endpoint de prelogin. La respuesta ante un correo inexistente y ante una clave incorrecta debe ser indistinguible, con test que compara las dos, y limitador propio más estricto que el de login. Resuelto en #126, donde apareció además el agujero real de ese endpoint y que no era este: el middleware `ability` de Sanctum **no restringe**, porque un token de sesión normal lleva la capacidad `*`. Lo cubre `EnsureRecoveryToken`, que compara la lista exacta de capacidades |
| Un export en claro es la vault entera legible en la carpeta de descargas | `Mitigado` | Existe igualmente porque sin él el usuario queda atrapado en eVault. Mitigación: el formato por defecto es el cifrado, y el export en claro exige una confirmación que no se puede dar por inercia (#122, `ADR-011`) |
| Un backup que nadie ha restaurado nunca | `Cerrado` | Un backup sin restauración probada es un fichero, no una copia de seguridad. Por eso el comando de restauración entró en el mismo issue que el de backup, y el criterio de salida exigió el ciclo completo contra una base de datos vaciada. Verificado así en #129 |
| Un import interrumpido deja la vault a medias | `Mitigado` | Y el usuario sin saber qué items llegaron, justo cuando cree que ya puede borrar el origen. El comportamiento ante la interrupción se decidió y se probó en #123, en vez de dejarlo al azar de la red. Ayuda que `ADR-011` fijara que el import **añade y nunca sustituye**: lo peor que puede dejar una interrupción son items de menos, nunca items perdidos |
| La migración de idiomas y el código nuevo compiten por los mismos ficheros | `Cerrado` | Los bloques 3, 4 y 5 tocan las capas que están en español. Mitigación: secuenciación declarada como dependencia nativa, #118 bloqueando a #122, #125 y #127. Funcionó, y no hubo un solo conflicto entre bloques |
| El contenido de los vault items no está cifrado | `Cerrado` | Resuelto en #59. El servidor almacena AES-256-GCM y no puede leer nada, comprobado en MySQL. **La condición de no desplegar con datos reales queda levantada** |
| El token en `localStorage` es accesible a un XSS | `Cerrado` | Resuelto en #73. Vive solo en memoria y muere al recargar, igual que la clave de cifrado. `ADR-007` cumplido |
| Sin CSP en ninguna parte | `Cerrado` | Resuelto en #77. La SPA la lleva en su build y la API la sirve Laravel con `default-src 'none'` |
| Cifrado en cliente con fallo silencioso: pérdida de datos irreversible | `Mitigado` | Sigue siendo el riesgo mayor del producto y no desaparece nunca. Mitigación: el módulo criptográfico se escribió con sus tests antes que ninguna pantalla, y **los tests se verificaron rompiendo el módulo**, no viéndolos pasar. Ver `ADR-001` |
| Una contraseña maestra olvidada es pérdida definitiva | `Mitigado` | No es un fallo: `ADR-001` descarta la recuperación por parte del servidor. El aviso inequívoco que exigía ya existe en el registro, antes de crear la vault, con tests que fallan si desaparece (#83). **La mitigación que `ADR-001` §5.1 dejó prometida —una clave de recuperación generada en el cliente— está construida**: `ADR-010` en #120, y #126, #127 y #128. Sigue sin ser recuperación por parte del servidor, y por eso no contradice nada: perder la contraseña **y** la clave de recuperación sigue siendo pérdida definitiva, por diseño |
| Los parámetros KDF quedan fijos en el cliente | `Aceptado, con trigger` | Consecuencia de usar el correo como salt para no exponer un endpoint de prelogin, que sería un oráculo de enumeración de cuentas. Subir las iteraciones exigirá construirlo igualmente y re-derivar. Argumentado en `ADR-008` |
| `crypto.subtle` no existe en el entorno local | `Cerrado` | Resuelto en #112. El entorno se movió a `app.evault.localhost`: la especificación de contextos seguros considera de confianza todo host acabado en `.localhost`, así que hay criptografía por `http` y sin certificado. Verificado registrando y guardando un item desde el navegador. `.test` no habría servido. Cierra #91 |
| Identificadores del código en dos idiomas | `Reabierto` | **Estuvo marcado `Cerrado` y no lo estaba**, porque se cerró contra #97 y #97 se cerró antes de tiempo: quedaban más de cien identificadores en español, no cero. Se corrige aquí al planificar la Iteración 6, donde se salda de verdad con #189, las seis capas #178–#183 y #161. Lo que sigue siendo cierto del texto original: el riesgo estaba donde se esperaba —en lo que no es un símbolo y por tanto el compilador no vigila: los campos del contrato, el store `evault.sesion` y las claves de `config/throttling.php`— y esa parte se respetó entera. Lo que sí se rompió fue el **texto de la interfaz cruzando saltos de línea**, que ninguna auditoría línea a línea detectó y que estuvo roto en `master` dos issues seguidos. Ver `ITERACION_4.md` |
| Query sin `vault_id` filtrando datos entre tenants | `Mitigado` | El acotado vive en un único sitio, `VaultItemLocator`, y hay tests de aislamiento obligatorios por `ADR-004`. La clave envuelta añadió su propio test de aislamiento (#82) |
| Un 403 convirtiendo la API en oráculo de enumeración | `Mitigado` | Todo lo inaccesible responde 404. Los tests comparan la respuesta de un recurso ajeno con la de uno inexistente, en vez de comprobar cada una por su lado |
| El vaciado del portapapeles no ocurre sin https | `Aceptado, con premisa caducada` | `execCommand` exige un gesto del usuario, así que en contexto no seguro no puede vaciar, y la interfaz dejó de prometerlo en vez de fingirlo. **En el entorno local ya no aplica**: desde #112 hay contexto seguro y `navigator.clipboard` existe. Sigue aplicando a quien despliegue por `http` en su red sin certificado. Que la interfaz volviera a prometer el vaciado donde sí puede cumplirlo **no hizo falta hacerlo**: se decide en tiempo de ejecución mirando `isSecureContext`, no el entorno, así que la promesa volvió sola al haber contexto seguro. Era la única deuda reconocida sin issue, y deja de serlo por no existir |
| La validación de un item es solo de cliente | `Aceptado` | Excepción real al double guard, no descuido: el servidor no puede validar lo que no puede leer. Lo que no se valide en `schema.ts` no lo valida nadie |
| Un cambio de contrato obligue a reescribir los clientes | `Cerrado` | El riesgo se abrió en la Iteración 1 y se cierra aquí: el contrato aguantó dos iteraciones y el cifrado real, y lo único que cambió fue aditivo |
| Nivel `max` de Larastan insostenible al aparecer código de dominio | `Mitigado` | Aguantó dos iteraciones con dominio real y sin baseline |
| El bundle crece sin control | `Mitigado` | Resuelto en #45, y quedó fuera de las Iteraciones 4 y 5 con motivo las dos veces. Las rutas se cargan de forma diferida: el arranque baja de **689,7 kB en un solo chunk** a **338 kB**, y lo que descarga quien abre el login pasa a 485,4 kB. Lo que de verdad se nota, medido en navegador con Slow 3G y caché fría: la pantalla de registro aparece a los **4.295 ms** en vez de a los **8.820**. La ruta de la vault apenas mejora —657,5 kB— y no es un descuido: `AppLayout` necesita `@base-ui/react` para el menú de usuario, comprobado siguiendo el grafo de imports. Lo que sigue sin haber es un techo que falle el CI, y su propio issue lo dejó fuera a propósito: primero medir |
| `master` sin protección | `Cerrado, parcialmente` | Resuelto en #110, que cierra #21. Hay un ruleset activo en el servidor: **no se puede borrar `master` ni reescribir su historia**, sin bypass para nadie. Es justo el agujero del hook `pre-push`, que vive en el clon y se salta con `--no-verify`. **No exige pull request, y no por descuido**: GitHub no admite dar bypass a GitHub Actions en un repositorio personal, así que la regla mata el push con que el workflow `status` regenera este documento. Comprobado activándola: `GH013: Repository rule violations found`. Se eligió conservar la automatización, y el push directo a `master` lo sigue cubriendo el hook |
| El repositorio es público con el escaneo de secretos desactivado | `Cerrado` | Resuelto en #110. `secret_scanning` y `secret_scanning_push_protection` activados el 3 de agosto de 2026, más descripción y ocho topics. La *push protection* es la que más vale: bloquea un push con un token dentro antes de que salga de la máquina. Revisados además los 72 issues y sus comentarios, ahora públicos, sin encontrar rutas locales, correos, credenciales ni IPs privadas |
<!-- /manual:riesgos -->
