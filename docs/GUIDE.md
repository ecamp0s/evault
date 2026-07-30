# Guía de Documentación — eVault

Actualizado: 2026-07-30

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
| Decisiones de arquitectura cerradas | `architecture/decisions/` | los propios ADR, inmutables |
| Estado del entorno y contexto de sesión | `planning/SPRINT_CONTEXT.md` | ese mismo archivo |
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

Ese workflow necesita un PAT con scope `read:project` en el secret
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
│   └── decisions/                    ← ADR, inmutables una vez cerrados
│       ├── ADR-001-zero-knowledge.md
│       ├── ADR-002-react-vault-filament-admin.md
│       ├── ADR-003-monorepo-api-y-spa.md
│       ├── ADR-004-multi-tenancy-sin-spatie-teams.md
│       ├── ADR-005-arquitectura-self-hosteable.md
│       └── ADR-006-typescript-6.md
│
└── planning/
    ├── STATUS.md                     ← GENERADO por scripts/status.sh, no editar a mano
    └── SPRINT_CONTEXT.md             ← bridge entre sesiones, prosa plana
```

Documentos que **todavía no existen a propósito**, porque no hay nada real que
describir en ellos. Se crearán cuando el proyecto lo justifique, y no antes:

- `architecture/FOUNDATION.md` — modelo de dominio y convenciones. Cuando exista
  dominio propio más allá del skeleton de Laravel.
- `architecture/ACCESS_AND_TENANCY.md` — multi-tenancy y permisos en detalle.
  Cuando se implemente el modelo de vaults y organizaciones.
- `development/SETUP.md` — entorno local. Hoy vive en `SPRINT_CONTEXT.md`; se
  extraerá cuando ese documento crezca demasiado.
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

---

## Qué actualizar y cuándo

| Evento | Qué hacer |
|---|---|
| Se cierra un issue | Actualizar `SPRINT_CONTEXT.md`. `STATUS.md` lo regenera el CI tras el merge |
| Cambia el estado o la prioridad de un issue | Cambiarlo en GitHub; `STATUS.md` se pone al día solo |
| Se toma una decisión técnica de larga vida | Nuevo ADR en `architecture/decisions/` |
| Una decisión anterior deja de valer | Nuevo ADR que la supersede, más la línea de estado en el viejo |
| Cambia el entorno local | `planning/SPRINT_CONTEXT.md` |
| Cambia el workflow o las convenciones de código | `CLAUDE.md` de la raíz |
| Se cierra una iteración | Secciones manuales de `STATUS.md` y resumen en `SPRINT_CONTEXT.md` |

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
- Idioma: español, incluidos los ADR.
- `SPRINT_CONTEXT.md` se escribe en prosa plana sin Markdown, por convención
  propia: es un documento dirigido a ser leído de corrido al abrir sesión.
