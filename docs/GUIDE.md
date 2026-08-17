# Guía de Documentación — eVault

Actualizado: 2026-08-03

Esta guía define qué contiene cada documento de `docs/`, cuál es la fuente de
verdad de cada tipo de información, y qué se actualiza a mano y qué se genera.
Es la primera cosa que leer antes de crear o modificar cualquier documento.

---

## Principio: una sola fuente de verdad por tipo de información

Cada dato vive en un único sitio. Si aparece en dos, uno de los dos es una copia
y las copias se desincronizan.

| Información | Fuente de verdad | Se lee en |
|---|---|---|
| Estado, prioridad y dependencias del backlog | GitHub (Issues + Project) | `planning/STATUS.md`, **generado** |
| Deuda técnica pendiente | GitHub, issues con label `deuda` | `planning/STATUS.md` y el resumen de `SPRINT_CONTEXT.md` |
| Decisiones de arquitectura cerradas | `architecture/decisions/` | los propios ADR, inmutables |
| Modelo de dominio y contrato del blob | el esquema de la base de datos | `architecture/FOUNDATION.md` |
| Punto de trabajo y contexto de sesión | `planning/SPRINT_CONTEXT.md` | ese mismo archivo |
| Entorno local, stack y versiones | `development/SETUP.md` | ese mismo archivo |
| Cómo se despliega en un servidor | `operations/DEPLOYMENT.md` | ese mismo archivo |
| Qué se hizo y qué se aprendió en una iteración | `planning/archive/ITERACION_N.md` | ese mismo archivo |
| Convenciones de código y workflow | `CLAUDE.md` en la raíz | ese mismo archivo |

Consecuencia práctica: **`STATUS.md` no se edita a mano.** Se regenera con
`scripts/status.sh`, que lee GitHub. Si el contenido generado no refleja la
realidad, lo que hay que corregir es GitHub, no el archivo.

Además se regenera solo: el workflow `.github/workflows/status.yml` lo actualiza
en cada push a `master`, una vez al día y a demanda. Eso existe porque el estado
de un issue solo pasa a `Done` después de mergear su PR, así que el `STATUS.md`
que viaja dentro de un PR nunca puede reflejar el cierre del issue que ese mismo
PR cierra. Ejecutarlo en local sigue siendo útil para verlo antes de tiempo, pero
no es obligatorio.

El generador localiza el tablero por **vinculación al repositorio**, no por su
nombre: el título es editable en la interfaz y renombrarlo rompía la generación
sin que pareciera un cambio técnico. Si algún día hay más de un Project vinculado,
desambiguar con `EVAULT_PROJECT_NUMBER`.

### Conflictos en `STATUS.md`

Desde el issue #62 estas reglas no dependen de que alguien se acuerde: las
comprueba `./scripts/check-docs.py`, y el workflow `repositorio` lo ejecuta en
cada PR. Comprueba lo que se puede comprobar —marcadores de conflicto, los seis
marcadores de sección manual, bytes NUL y referencias a documentos que no
existen—, y **no** opina sobre lo que dicen los documentos, que es criterio
humano.


Son estructurales y van a repetirse: el bot regenera el archivo en `master` cada
vez que se mergea algo, así que cualquier rama viva que lo toque acabará en
conflicto. Además GitHub **no ejecuta los workflows de un PR en conflicto**,
porque no puede construir el merge commit, de modo que el síntoma no es un aviso
de conflicto sino un PR sin ningún check, que es más difícil de interpretar.

La resolución es siempre la misma, y conviene no improvisarla:

```bash
git merge origin/master
git checkout --ours docs/planning/STATUS.md   # conserva tus secciones manuales
./scripts/status.sh                            # rehace las generadas desde GitHub
git add docs/planning/STATUS.md
```

Quedarse con la versión propia es correcto porque las secciones generadas se
reconstruyen enteras a partir de GitHub; lo único irrecuperable son las secciones
manuales, y esas son las que se conservan.

Ese workflow necesita un PAT con scopes `repo` y `read:project` en el secret
`STATUS_TOKEN`, porque el `GITHUB_TOKEN` por defecto de Actions no puede leer
Projects v2. Si falta, el job falla de forma visible en vez de commitear un
`STATUS.md` sin prioridades: ese es el comportamiento buscado, porque un
documento silenciosamente peor es más dañino que un fallo ruidoso.

---

## Estructura

```
docs/
├── GUIDE.md                          ← este archivo: reglas de la documentación
├── README.md                         ← índice y orden de lectura
│
├── architecture/
│   ├── FOUNDATION.md                 ← modelo de dominio y contrato del blob
│   └── decisions/                    ← ADR, inmutables una vez cerrados
│       ├── ADR-001-zero-knowledge.md
│       ├── ADR-002-react-vault-filament-admin.md
│       ├── ADR-003-monorepo-api-y-spa.md
│       ├── ADR-004-multi-tenancy-sin-spatie-teams.md
│       ├── ADR-005-arquitectura-self-hosteable.md
│       ├── ADR-006-typescript-6.md
│       ├── ADR-007-token-de-sesion-en-memoria.md
│       ├── ADR-008-arquitectura-de-claves.md
│       ├── ADR-009-proyecto-personal-y-publico.md
│       ├── ADR-010-clave-de-recuperacion.md
│       ├── ADR-011-formato-de-export-e-import.md
│       ├── ADR-012-estrategia-de-despliegue.md
│       ├── ADR-013-operacion-de-la-instancia-personal.md
│       └── ADR-014-cambio-de-correo-electronico.md
│
├── development/
│   └── SETUP.md                      ← entorno local, stack y versiones
│
├── operations/
│   └── DEPLOYMENT.md                 ← desplegar en un servidor propio
│
└── planning/
    ├── STATUS.md                     ← GENERADO por scripts/status.sh, no editar a mano
    ├── SPRINT_CONTEXT.md             ← bridge entre sesiones, prosa plana
    └── archive/
        ├── ITERACION_1.md            ← historial y lecciones de cada iteración cerrada
        ├── ITERACION_2.md
        └── ITERACION_3.md
```

**`SPRINT_CONTEXT.md` tiene que caber en una pantalla larga**, en torno a cien
líneas. Es lo que se lee entero al abrir sesión, y un documento que no se lee
entero deja de servir. Durante la Iteración 1 llegó a 450 líneas porque acumulaba
el entorno, el historial de cada issue cerrado y el punto de trabajo, tres cosas
con vidas distintas. Se partió al cerrarla.

La regla que evita que vuelva a pasar: cuando algo deje de cambiar, se mueve. El
entorno a `development/SETUP.md`. El historial de una iteración terminada a
`planning/archive/ITERACION_N.md`. En `SPRINT_CONTEXT.md` solo queda lo que
cambia cada sesión.

`architecture/FOUNDATION.md` describe el modelo de dominio: las tablas, qué
significa cada una y, sobre todo, qué puede leer el servidor y qué no. Se creó al
implementar `vault_items`, cuando se cumplió su condición de existir: que hubiera
dominio propio más allá del skeleton de Laravel. Ahí vive el contrato del blob,
que es el compromiso más difícil de cambiar de todo el proyecto.

Documentos que **todavía no existen a propósito**, porque no hay nada real que
describir en ellos:

- `architecture/ACCESS_AND_TENANCY.md` — multi-tenancy y permisos en detalle.
  Cuando existan las organizaciones y una matriz de permisos de verdad; lo que hay
  hoy, un rol único, cabe en `FOUNDATION.md`.
- `operations/` — runbooks y checklist de QA. Cuando haya operación que documentar.

---

## Qué es un ADR y cómo se escribe

Un **Architecture Decision Record** captura una decisión técnica de larga vida:
el contexto en que se tomó, las opciones que se evaluaron con sus tradeoffs, la
decisión final y sus consecuencias.

**Un ADR cerrado es inmutable.** Es registro histórico, no documento vivo. Si una
decisión cambia, no se edita el ADR: se escribe uno nuevo que la supersede y se
marca el anterior como `Superseded por ADR-NNN` en su campo de estado — esa línea
de estado es la única modificación admisible sobre un ADR cerrado.

Nombre: `ADR-NNN-descripcion-corta.md`, con `NNN` de tres dígitos.

**Numeración por profundidad arquitectónica.** Los seis primeros ADR no están
ordenados por fecha, sino de la decisión más fundacional a la más superficial:
cada uno se apoya en los anteriores. Un lector que los recorra en orden entiende
el proyecto de dentro hacia fuera. Los ADR posteriores al 006 se numeran
secuencialmente según se cierren, porque a partir de ahí el orden cronológico y
el lógico ya no se pueden reconciliar.

**Dos fechas, no una.** `Fecha de decisión` es cuándo se decidió de verdad;
`Fecha de registro` es cuándo se escribió el documento. En los seis primeros ADR
no coinciden, porque las decisiones se tomaron durante la planificación inicial y
se registraron después. Fingir que se decidieron el día que se escribieron
falsearía el historial.

---

## Gobernanza del backlog en GitHub

- **Estado**: campo `Status` del Project, con tres columnas: `Todo`,
  `In Progress`, `Done`. No hay columna `Ready`: la condición de "listo para
  tomar" no se mantiene a mano, se deriva de que el issue no tenga bloqueantes
  abiertos.
- **Prioridad**: campo `Priority` del Project (`High`, `Medium`, `Low`), no
  labels. Significa urgencia relativa **entre los issues ya desbloqueados**, y
  sirve para desempatar cuando hay más de uno tomable. Un issue bloqueado con
  prioridad `High` no se trabaja antes que su bloqueante.
- **Sprint**: labels `s1`, `s2`, … No va en el título.
- **Tipo y área**: labels `feat`/`chore`/`documentation` y `api`/`web`.
- **Dependencias**: relaciones nativas `blocked by` / `blocking` de GitHub, no
  prosa. Se registran con la API REST:
  `gh api --method POST repos/OWNER/REPO/issues/N/dependencies/blocked_by -F issue_id=ID`,
  donde `ID` es el `id` interno del issue bloqueante, no su número. El flag debe
  ser `-F` y no `-f`, o la API rechaza el valor por no ser entero.
- **Títulos**: `<tipo>(<área>): <resultado principal>`.

Aviso sobre numeración de issues: GitHub comparte la secuencia entre issues y
pull requests, así que el número del siguiente issue no es el del anterior más
uno. La issue #9 vino después de la #6 porque los PR consumieron el 7 y el 8.

### Cómo se abre un issue

Desde la interfaz web, con una de las tres plantillas de `.github/ISSUE_TEMPLATE/`:
`feature.yml`, `bug.yml` y `tech_debt.yml`. Aplican solas el label de tipo (`feat`,
`bug`, `chore`) y no permiten abrir un issue en blanco. Ninguna pide sprint ni
prioridad, porque el sprint es un label y la prioridad es un campo del Project.

Las plantillas **no intervienen al crear issues con `gh issue create --body`**:
ese flag pisa cualquier plantilla, y `--template` solo sirve para prellenar texto
de partida. Al abrir un issue por CLI hay que reproducir la estructura a mano, que
es lo que se ha hecho hasta ahora. Los campos de las plantillas son la referencia
de qué secciones debe llevar.

Faltan el `sprint` como label y la prioridad en el Project en cualquiera de los dos
casos: eso no lo pone ni el formulario ni el CLI.

---

## Deuda técnica

**Deuda sin issue no existe.** Documentarla en prosa dentro de `SPRINT_CONTEXT.md`
la deja invisible: no aparece en el backlog, no se prioriza y no se hace. Al
cerrar la Iteración 1 había cinco elementos de deuda reales repartidos entre las
secciones de nueve issues, y ninguno estaba en el Project.

Tres reglas:

1. **Se abre el issue en el mismo PR que genera la deuda**, con label `deuda` y la
   plantilla `tech_debt.yml`. No al final de la iteración, cuando ya se ha
   olvidado el porqué. Cuesta dos minutos y es el momento en que mejor se sabe
   explicar qué se dejó a medias y por qué.
2. **Distinguir deuda de decisión cerrada.** Que el rate limiting cuente
   peticiones y no solo intentos fallidos no es deuda: se evaluó, se descartó con
   motivo y no hay intención de cambiarlo. Eso va documentado en el código y en un
   test, y no en el registro de deuda. Deuda es lo que **sí** se querría hacer y
   no se ha hecho. Mezclarlas llena el registro de ruido y hace que se deje de
   leer.
3. **Revisión al cerrar cada iteración**: repasar los issues con label `deuda` y
   decidir cuáles entran en la siguiente. Sin ese momento la lista solo crece.

La lista viva es GitHub filtrando por `label:deuda`. `SPRINT_CONTEXT.md` lleva un
resumen con punteros, nunca el detalle.

---

## Qué actualizar y cuándo

| Evento | Qué hacer |
|---|---|
| Se cierra un issue | Actualizar `SPRINT_CONTEXT.md`. `STATUS.md` lo regenera el CI tras el merge |
| Un issue deja deuda a propósito | Abrir issue con label `deuda` **en ese mismo PR** |
| Cambia el entorno local, el stack o una versión | `development/SETUP.md` |
| Cambia algo del despliegue: puertos, nombres, TLS o backups | `operations/DEPLOYMENT.md` |
| Cambia el estado o la prioridad de un issue | Cambiarlo en GitHub; `STATUS.md` se pone al día solo |
| Se toma una decisión técnica de larga vida | Nuevo ADR en `architecture/decisions/` |
| Una decisión anterior deja de valer | Nuevo ADR que la supersede, más la línea de estado en el viejo |
| Cambia el workflow o las convenciones de código | `CLAUDE.md` de la raíz |
| Se cierra una iteración | Secciones manuales de `STATUS.md`, mover el historial a `planning/archive/ITERACION_N.md`, revisar los `deuda` abiertos y dejar `SPRINT_CONTEXT.md` con el punto de partida de la siguiente |

---

## Reglas de edición

Permitido:

- Actualizar cualquier documento fuera de `decisions/` cuando el evento lo pide.
- Crear ADR nuevos.
- Marcar un ADR como superseded en su línea de estado.
- Editar las secciones manuales delimitadas de `STATUS.md`, que el generador
  preserva entre ejecuciones.

Prohibido:

- Editar el contenido de un ADR cerrado.
- Editar a mano las secciones generadas de `STATUS.md`: el cambio se pierde en la
  siguiente ejecución del script y entretanto miente.
- Duplicar en un documento información cuya fuente de verdad es otra.
- Crear documentos fuera de la estructura definida sin acordarlo antes.
- Reescribir un documento completo cuando basta actualizar una sección.

---

## Convenciones

- Nombres de archivo: `MAYUSCULAS_CON_GUION_BAJO.md`; los ADR, `ADR-NNN-kebab-case.md`.
- Fechas: `YYYY-MM-DD` en tablas y encabezados; en prosa, fecha larga en español.
- Idioma: español, incluidos los ADR. La única excepción del repositorio es el
  `README.md` de la raíz, que va en inglés por ser la puerta de entrada pública;
  está fuera de `docs/` y su motivo está en `ADR-009` y en `CLAUDE.md`. No se
  mantienen versiones duplicadas de un documento en dos idiomas.
- `SPRINT_CONTEXT.md` se escribe en prosa plana sin Markdown, por convención
  propia: es un documento dirigido a ser leído de corrido al abrir sesión.
