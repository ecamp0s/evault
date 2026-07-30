# eVault — Índice de Documentación

Actualizado: 2026-07-30

eVault es un gestor de contraseñas y secretos con modelo zero-knowledge: toda la
criptografía ocurre en el cliente y el servidor solo almacena blobs cifrados que
no puede leer. Producto SaaS con planes Free y Team, y self-hosting para
Enterprise. Clientes previstos: SPA web, app nativa iOS/Android y extensión de
Firefox; ahora mismo solo se construye la web.

---

## Orientación rápida

| Quiero saber... | Leer... |
|---|---|
| En qué estamos trabajando y qué es lo siguiente | `planning/STATUS.md` |
| Dónde se quedó la sesión anterior y cómo está el entorno | `planning/SPRINT_CONTEXT.md` |
| Por qué el proyecto está construido así | `architecture/decisions/` |
| Cómo se escribe y mantiene esta documentación | `GUIDE.md` |
| Comandos frecuentes, URLs locales y workflow git | `CLAUDE.md` en la raíz |

---

## Estructura

```
docs/
├── GUIDE.md                          ← reglas de esta documentación
├── README.md                         ← este archivo
│
├── architecture/decisions/           ← ADR, inmutables
│   ├── ADR-001-zero-knowledge.md
│   ├── ADR-002-react-vault-filament-admin.md
│   ├── ADR-003-monorepo-api-y-spa.md
│   ├── ADR-004-multi-tenancy-sin-spatie-teams.md
│   ├── ADR-005-arquitectura-self-hosteable.md
│   └── ADR-006-typescript-6.md
│
└── planning/
    ├── STATUS.md                     ← generado desde GitHub, no editar a mano
    └── SPRINT_CONTEXT.md             ← bridge entre sesiones
```

---

## Los seis ADR, en orden de lectura

Están numerados de la decisión más fundacional a la más superficial. Leídos en
orden explican el proyecto de dentro hacia fuera: cada uno se apoya en el anterior.

| ADR | Decisión | En una línea |
|---|---|---|
| [001](architecture/decisions/ADR-001-zero-knowledge.md) | Zero-knowledge | La contraseña maestra no sale del cliente; PBKDF2 deriva clave de cifrado y hash de autenticación por separado |
| [002](architecture/decisions/ADR-002-react-vault-filament-admin.md) | React para la vault, Filament solo para admin | Filament es SSR y haría pasar los secretos por PHP, lo que rompería el ADR-001 |
| [003](architecture/decisions/ADR-003-monorepo-api-y-spa.md) | Monorepo | API y panel admin en un Laravel; la SPA como proyecto separado en el mismo repositorio |
| [004](architecture/decisions/ADR-004-multi-tenancy-sin-spatie-teams.md) | Multi-tenancy por vault | Sin `teams` de Spatie; contexto activo explícito en cada llamada porque la API es stateless |
| [005](architecture/decisions/ADR-005-arquitectura-self-hosteable.md) | Self-hosteable desde el principio | Nada hardcodeado: orígenes, URLs y credenciales por variables de entorno |
| [006](architecture/decisions/ADR-006-typescript-6.md) | TypeScript 6, no 7 | typescript-eslint no soporta TS 7; subir rompe el linting |

---

## Orden de lectura recomendado (onboarding)

1. Este archivo, para el mapa general.
2. `architecture/decisions/ADR-001-zero-knowledge.md` — sin esto, ninguna otra
   decisión del proyecto tiene sentido.
3. Los ADR 002 a 006, en orden.
4. `planning/SPRINT_CONTEXT.md` — estado del entorno y punto exacto del trabajo.
5. `planning/STATUS.md` — backlog, prioridades y dependencias.
6. `GUIDE.md` — antes de escribir o modificar cualquier documento.

---

## Advertencia sobre la Iteración 1

La autenticación de la Iteración 1 es **deliberadamente convencional**: la
contraseña viaja al servidor y Laravel la hashea. Eso **no es zero-knowledge** y
se sustituye en la Iteración 3. Se hace así a propósito para validar el stack
completo antes de introducir criptografía en el cliente.

El contrato de la API —rutas, forma de request y response, y gestión de tokens—
debe mantenerse estable para que ese cambio posterior sea mínimo. Ver
`ADR-001-zero-knowledge.md`, sección de plan por fases.
