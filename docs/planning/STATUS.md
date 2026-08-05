# eVault — Estado del Backlog

> **Documento generado. No editar a mano.**
> Se regenera con `scripts/status.sh` leyendo GitHub, que es la única fuente
> de verdad del estado. Si algo aquí no refleja la realidad, corregirlo en
> GitHub y volver a generar. Las secciones delimitadas como manuales sí se
> editan a mano y el generador las preserva. Ver `docs/GUIDE.md`.

Generado: 2026-08-05
Fuente: [ecamp0s/evault](https://github.com/ecamp0s/evault/issues) y Project «eVault»
Issues: 85 en total, 73 cerrados, 12 abiertos

---

## 1) Objetivo de la iteración

<!-- manual:objetivo -->
**Iteración 5: planificada el 5 de agosto de 2026.** Objetivo: *eVault se levanta desde un clon con un comando, se despliega con una guía verificada, y quien lo abra ve una vault con contenido en menos de un minuto.*

No es funcionalidad nueva y es deliberado. `ADR-009` §4 pone «despliegue reproducible» en la primera categoría de prioridad, por delante de la legibilidad y de la funcionalidad, y hoy **no existe**: no hay `Dockerfile`, ni Compose, ni guía de despliegue, mientras `ADR-005` decidió que el proyecto fuera self-hosteable desde el primer commit y el README afirma que lo es. Es la mayor distancia actual entre lo que el proyecto promete y lo que entrega.

**El hallazgo que decidió la forma del bloque de datos de ejemplo:** el servidor no puede sembrar una demo. No es una limitación de implementación, es el zero-knowledge funcionando — un seeder no puede crear items con contenido porque el cifrado ocurre en el cliente con una clave derivada de una contraseña que el servidor nunca ve. `DatabaseSeeder` lo confirma sin decirlo: crea un usuario con su vault y cero items, porque no le es posible crear ninguno. Así que la siembra es un fichero `.evault` pre-generado con contraseña publicada, importado desde la interfaz, reutilizando el formato de `ADR-011` y el import de #123. La consecuencia útil es que la propia siembra demuestra el modelo en vez de explicarlo.

Siete bloques. Bloque 0, rectificar el criterio de salida 7 de la Iteración 4: #153. Bloque 1, la decisión antes del código: `ADR-012` en #154. Bloque 2, levantar con un comando: #155 y #156. Bloque 3, algo que enseñar: #157 y #158. Bloque 4, desplegar de verdad: #159. Bloque 5, la deuda: #149 y #62. Bloque 6, la deuda que destapó #153: #160, con #161 abierto y fuera de la iteración. Cierre: #162.

**#45 queda fuera otra vez**, con el mismo criterio de `ADR-009` §4 que la dejó fuera de la 4: sin instancia pública expuesta, un bundle grande es pulido y no fiabilidad. Su medición sí está actualizada: 689 kB, no 663.

**La secuenciación que importa**, aprendida en la 4: #153 va primero y solo. Es lo único que hoy está mintiendo en un repositorio público, y su coste es una tarde de documentación, no de código.

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

1. [#154](https://github.com/ecamp0s/evault/issues/154) docs: ADR-012 — estrategia de despliegue (High)
1. [#62](https://github.com/ecamp0s/evault/issues/62) ci: comprobaciones de documentación en los PR (Medium)
1. [#149](https://github.com/ecamp0s/evault/issues/149) chore(api): los tokens de sesión se acumulan y no caducan nunca (Medium)
1. [#156](https://github.com/ecamp0s/evault/issues/156) chore(web): mover shadcn a devDependencies (Medium)
1. [#160](https://github.com/ecamp0s/evault/issues/160) chore(web): los identificadores en español que quedan en producción (Medium)
1. [#45](https://github.com/ecamp0s/evault/issues/45) chore(web): reducir el bundle, que va en un solo chunk (Low)
1. [#161](https://github.com/ecamp0s/evault/issues/161) chore(web): identificadores en español en los tests (Low)

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
| [#45](https://github.com/ecamp0s/evault/issues/45) | chore(web): reducir el bundle, que va en un solo chunk | `chore` `web` `deuda` | Todo | Low | — | — |
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
| [#62](https://github.com/ecamp0s/evault/issues/62) | ci: comprobaciones de documentación en los PR | `s2` `chore` `documentation` `deuda` `s5` | Todo | Medium | — | — |
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
| [#149](https://github.com/ecamp0s/evault/issues/149) | chore(api): los tokens de sesión se acumulan y no caducan nunca | `chore` `api` `deuda` `s5` | Todo | Medium | — | — |
| [#153](https://github.com/ecamp0s/evault/issues/153) | docs: corregir el criterio de salida 7 de la Iteración 4 | `chore` `documentation` `s5` | Done | High | — | #160 |
| [#154](https://github.com/ecamp0s/evault/issues/154) | docs: ADR-012 — estrategia de despliegue | `chore` `documentation` `s5` | Todo | High | — | #155, #159 |
| [#155](https://github.com/ecamp0s/evault/issues/155) | chore(repo): docker compose up levanta el proyecto desde un clon limpio | `chore` `s5` | Todo | High | #154 | #157, #162 |
| [#156](https://github.com/ecamp0s/evault/issues/156) | chore(web): mover shadcn a devDependencies | `chore` `web` `s5` | Todo | Medium | — | — |
| [#157](https://github.com/ecamp0s/evault/issues/157) | feat(repo): fichero .evault de ejemplo para ver la vault con contenido | `feat` `s5` | Todo | High | #155 | #158, #162 |
| [#158](https://github.com/ecamp0s/evault/issues/158) | docs: screenshot de la vault en el README | `chore` `documentation` `s5` | Todo | Medium | #157 | #162 |
| [#159](https://github.com/ecamp0s/evault/issues/159) | docs: guía de despliegue self-hosted, verificada ejecutándola | `chore` `documentation` `s5` | Todo | High | #154 | #162 |
| [#160](https://github.com/ecamp0s/evault/issues/160) | chore(web): los identificadores en español que quedan en producción | `chore` `web` `deuda` `s5` | Todo | Medium | #153 | #162 |
| [#161](https://github.com/ecamp0s/evault/issues/161) | chore(web): identificadores en español en los tests | `chore` `web` `deuda` | Todo | Low | — | — |
| [#162](https://github.com/ecamp0s/evault/issues/162) | docs: cerrar la Iteración 5 | `chore` `documentation` `s5` | Todo | High | #155, #157, #158, #159, #160 | — |
| [#165](https://github.com/ecamp0s/evault/issues/165) | chore(repo): borrar la rama al mergear, como convención escrita | `chore` `documentation` `s5` | Done | — | — | — |

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
  I154["#154<br/>Todo"]
  I155["#155<br/>Todo"]
  I157["#157<br/>Todo"]
  I158["#158<br/>Todo"]
  I159["#159<br/>Todo"]
  I160["#160<br/>Todo"]
  I162["#162<br/>Todo"]
  I2 --> I3
  I3 --> I5
  I4 --> I5
  I5 --> I6
  I17 --> I20
  I20 --> I21
  I35 --> I6
  I38 --> I6
  I43 --> I59
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
  I160 --> I162
  classDef hecho fill:#1a7f37,stroke:#1a7f37,color:#fff;
  class I2,I3,I4,I5,I6,I17,I20,I21,I35,I38,I43,I50,I51,I52,I53,I54,I55,I56,I57,I58,I59,I73,I79,I80,I81,I82,I83,I84,I86,I97,I110,I114,I115,I116,I117,I118,I119,I120,I121,I122,I123,I124,I125,I126,I127,I128,I129,I130,I153 hecho;
```

La flecha va del bloqueante al bloqueado. En verde, lo ya cerrado.

## 5) Criterios de salida de la iteración

<!-- manual:salida -->
### Iteración 5, en curso

Siete criterios. Ninguno se dará por bueno leyendo código o diffs — es literalmente la lección que deja el criterio 7 de la iteración anterior.

1. ⬜ **Un clon limpio levanta con `docker compose up` y permite registrarse.** Verificado clonando en un directorio nuevo y vacío, **no** desde el directorio de trabajo, donde ya existen `.env`, `vendor/`, `node_modules/` y una base de datos. Un Compose que solo funciona sobre un árbol ya inicializado no es reproducible (#155).
2. ⬜ **El fichero de ejemplo se importa y los items aparecen descifrados**, verificado en navegador y el ciclo entero, no cada mitad por su lado (#157).
3. ⬜ **El screenshot del README es de la aplicación real** corriendo con esos datos (#158).
4. ⬜ **La guía de despliegue se verificó ejecutándola** en un servidor, no leyéndola. Termina con un item guardado y releído tras reiniciar el servicio (#159).
5. ⬜ **Cero identificadores en español en el código de producción, comprobado por un comando que queda en el repositorio** y que corre en CI. Es el criterio 7 otra vez, esta vez con verificación en vez de con intención (#160, #62).
6. ⬜ **Los tokens de sesión caducan** y existe forma de limpiar los vencidos (#149).
7. ⬜ **Pest, Vitest, Larastan en nivel `max` y CI en verde**, sin baseline.

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
| **Un criterio de salida se da por cumplido sin comprobarlo** | `Materializado, y con mitigación en curso` | Ya pasó: el criterio 7 de la Iteración 4 afirmaba que no quedaban identificadores en español y quedaban 25 en producción, detectado en #153 al día siguiente de cerrar la iteración. Lo que lo hace peligroso es que **el daño escala solo**: de un checkbox a `STATUS.md`, de ahí al archivo de la iteración y de ahí a un repositorio público, ganando autoridad en cada salto sin que nadie añada una comprobación. Un test que no detecta nada al menos pasa por delante de alguien; una afirmación en un criterio de salida no la vuelve a mirar nadie, porque el documento donde vive es el que certifica que ya está comprobado. Mitigación: **si un criterio se puede comprobar con un comando, el criterio es ese comando y se deja escrito en el repositorio** — va en #62, junto con las comprobaciones de documentación en los PR |
| **Un despliegue que solo funciona en la máquina del autor** | `Abierto, con criterio de salida que lo cubre` | Es el modo de fallo natural de #155 y #159, y no se detecta desde el directorio de trabajo, donde ya está todo inicializado. Mitigación: el criterio 1 exige clon limpio en un directorio vacío, y el 4 exige ejecutar la guía en un servidor en vez de escribirla de memoria — que sería repetir el error del criterio 7 en un documento que alguien va a seguir paso a paso |
| **La contraseña del fichero de ejemplo usada como contraseña real** | `Abierto` | Un `.evault` de ejemplo obliga a publicar la contraseña que lo abre. Mitigación en #157: que sea obviamente de demostración a simple vista, y que el aviso esté donde se lee y no en una nota al pie |
| **Desplegar por `http` en un dominio real** | `Abierto, con aviso planificado` | Fuera de `localhost` no existe `crypto.subtle` en contexto inseguro, así que una instancia servida por `http` en un dominio propio no es una instalación degradada: es una donde no se puede ni registrar un usuario. Quien lo descubra después habrá desplegado dos veces. Mitigación: va antes que ningún comando en la guía de #159, y es requisito explícito de `ADR-012` en #154 |
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
| Identificadores del código en dos idiomas | `Cerrado` | Resuelto en #115 a #119, que cierran #97. El riesgo estaba donde se esperaba —en lo que no es un símbolo y por tanto el compilador no vigila: los campos del contrato, el store `evault.sesion` y las claves de `config/throttling.php`— y esa parte se respetó entera. Lo que sí se rompió fue el **texto de la interfaz cruzando saltos de línea**, que ninguna auditoría línea a línea detectó y que estuvo roto en `master` dos issues seguidos. Ver `ITERACION_4.md` |
| Query sin `vault_id` filtrando datos entre tenants | `Mitigado` | El acotado vive en un único sitio, `VaultItemLocator`, y hay tests de aislamiento obligatorios por `ADR-004`. La clave envuelta añadió su propio test de aislamiento (#82) |
| Un 403 convirtiendo la API en oráculo de enumeración | `Mitigado` | Todo lo inaccesible responde 404. Los tests comparan la respuesta de un recurso ajeno con la de uno inexistente, en vez de comprobar cada una por su lado |
| El vaciado del portapapeles no ocurre sin https | `Aceptado, con premisa caducada` | `execCommand` exige un gesto del usuario, así que en contexto no seguro no puede vaciar, y la interfaz dejó de prometerlo en vez de fingirlo. **En el entorno local ya no aplica**: desde #112 hay contexto seguro y `navigator.clipboard` existe. Sigue aplicando a quien despliegue por `http` en su red sin certificado. Que la interfaz volviera a prometer el vaciado donde sí puede cumplirlo **no hizo falta hacerlo**: se decide en tiempo de ejecución mirando `isSecureContext`, no el entorno, así que la promesa volvió sola al haber contexto seguro. Era la única deuda reconocida sin issue, y deja de serlo por no existir |
| La validación de un item es solo de cliente | `Aceptado` | Excepción real al double guard, no descuido: el servidor no puede validar lo que no puede leer. Lo que no se valide en `schema.ts` no lo valida nadie |
| Un cambio de contrato obligue a reescribir los clientes | `Cerrado` | El riesgo se abrió en la Iteración 1 y se cierra aquí: el contrato aguantó dos iteraciones y el cifrado real, y lo único que cambió fue aditivo |
| Nivel `max` de Larastan insostenible al aparecer código de dominio | `Mitigado` | Aguantó dos iteraciones con dominio real y sin baseline |
| El bundle crece sin control | `Open` | 663 kB en un solo chunk, medidos el 3 de agosto de 2026. `WebCrypto` es nativo, así que la criptografía apenas lo movió. Tiene issue, #45, y **se quedó fuera de la Iteración 4 a propósito**: por el criterio de `ADR-009` §4 esto es pulido y no fiabilidad, y un bundle grande no impide usar el producto |
| `master` sin protección | `Cerrado, parcialmente` | Resuelto en #110, que cierra #21. Hay un ruleset activo en el servidor: **no se puede borrar `master` ni reescribir su historia**, sin bypass para nadie. Es justo el agujero del hook `pre-push`, que vive en el clon y se salta con `--no-verify`. **No exige pull request, y no por descuido**: GitHub no admite dar bypass a GitHub Actions en un repositorio personal, así que la regla mata el push con que el workflow `status` regenera este documento. Comprobado activándola: `GH013: Repository rule violations found`. Se eligió conservar la automatización, y el push directo a `master` lo sigue cubriendo el hook |
| El repositorio es público con el escaneo de secretos desactivado | `Cerrado` | Resuelto en #110. `secret_scanning` y `secret_scanning_push_protection` activados el 3 de agosto de 2026, más descripción y ocho topics. La *push protection* es la que más vale: bloquea un push con un token dentro antes de que salga de la máquina. Revisados además los 72 issues y sus comentarios, ahora públicos, sin encontrar rutas locales, correos, credenciales ni IPs privadas |
<!-- /manual:riesgos -->
