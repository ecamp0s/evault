# eVault — Índice de Documentación

Actualizado: 2026-08-03

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
| Dónde se quedó la sesión anterior | `planning/SPRINT_CONTEXT.md` |
| Cómo levantar el proyecto en mi máquina | `development/SETUP.md` |
| Cómo desplegarlo en un servidor y usarlo de verdad | `operations/DEPLOYMENT.md` |
| Qué deuda técnica hay pendiente | GitHub, `label:deuda`; resumen en `planning/SPRINT_CONTEXT.md` |
| Qué se hizo y qué se aprendió en una iteración pasada | `planning/archive/` |
| Qué hay en la base de datos y qué puede leer el servidor | `architecture/FOUNDATION.md` |
| Qué llave abre qué, y qué pasa si pierdo una | `architecture/KEYS.md` |
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
├── architecture/
│   ├── FOUNDATION.md                 ← modelo de dominio y contrato del blob
│   ├── KEYS.md                       ← mapa de los secretos: qué abre qué
│   └── decisions/                    ← ADR, inmutables
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
│       ├── ADR-014-cambio-de-correo-electronico.md
│       └── ADR-015-acceso-desde-fuera-de-la-red-local.md
│
├── development/
│   └── SETUP.md                      ← entorno local, stack y versiones
│
├── operations/
│   └── DEPLOYMENT.md                 ← desplegar en un servidor propio
│
└── planning/
    ├── STATUS.md                     ← generado desde GitHub, no editar a mano
    ├── SPRINT_CONTEXT.md             ← bridge entre sesiones, corto a propósito
    └── archive/
        ├── ITERACION_1.md            ← historial y lecciones de cada iteración
        ├── ITERACION_2.md
        └── ITERACION_3.md
```

---

## Los ADR, en orden de lectura

Los seis primeros están numerados de la decisión más fundacional a la más
superficial. Leídos en orden explican el proyecto de dentro hacia fuera: cada uno
se apoya en el anterior. A partir del 007 la numeración es cronológica, según se
van cerrando.

| ADR | Decisión | En una línea |
|---|---|---|
| [001](architecture/decisions/ADR-001-zero-knowledge.md) | Zero-knowledge | La contraseña maestra no sale del cliente; PBKDF2 deriva clave de cifrado y hash de autenticación por separado |
| [002](architecture/decisions/ADR-002-react-vault-filament-admin.md) | React para la vault, Filament solo para admin | Filament es SSR y haría pasar los secretos por PHP, lo que rompería el ADR-001. La parte del panel de administración quedó sin sujeto con el ADR-009 |
| [003](architecture/decisions/ADR-003-monorepo-api-y-spa.md) | Monorepo | API y panel admin en un Laravel; la SPA como proyecto separado en el mismo repositorio |
| [004](architecture/decisions/ADR-004-multi-tenancy-sin-spatie-teams.md) | Multi-tenancy por vault | Sin `teams` de Spatie; contexto activo explícito en cada llamada porque la API es stateless |
| [005](architecture/decisions/ADR-005-arquitectura-self-hosteable.md) | Self-hosteable desde el principio | Nada hardcodeado: orígenes, URLs y credenciales por variables de entorno |
| [006](architecture/decisions/ADR-006-typescript-6.md) | TypeScript 6, no 7 | typescript-eslint no soporta TS 7; subir rompe el linting |
| [007](architecture/decisions/ADR-007-token-de-sesion-en-memoria.md) | Token de sesión solo en memoria | Si la clave de cifrado muere al recargar, persistir el token mantiene viva una sesión que no puede enseñar nada |
| [008](architecture/decisions/ADR-008-arquitectura-de-claves.md) | Arquitectura de claves de la vault | La clave derivada no cifra items: envuelve una clave de vault aleatoria que sí lo hace. Cambiar la contraseña maestra reenvuelve un blob en vez de recifrar la vault |
| [009](architecture/decisions/ADR-009-proyecto-personal-y-publico.md) | Deja de ser un SaaS | Instancia personal self-hosted y repositorio público como muestra de trabajo. El cambio de modelo no obligó a tocar una línea de código, que es lo que compró el ADR-005 |
| [010](architecture/decisions/ADR-010-clave-de-recuperacion.md) | Clave de recuperación | Un secreto aleatorio que envuelve la misma clave de vault, para tener una salida al olvido de la contraseña maestra sin que el servidor pueda leer nada. Cumple la mitigación que el ADR-001 dejó prometida |
| [011](architecture/decisions/ADR-011-formato-de-export-e-import.md) | Formato de export e import | Dos formatos con propósitos distintos: uno cifrado y autodescriptivo para la copia de seguridad, y CSV en claro para poder irse a otro gestor. El import añade y nunca sustituye |
| [012](architecture/decisions/ADR-012-estrategia-de-despliegue.md) | Estrategia de despliegue | Docker Compose con Caddy, PHP-FPM y MySQL, en red local y sin exponer puertos. HTTPS no es endurecimiento sino requisito: sin él no existe `crypto.subtle` y la aplicación no arranca |
| [013](architecture/decisions/ADR-013-operacion-de-la-instancia-personal.md) | Emplazamiento y operación de la instancia personal | Vive en el servidor doméstico, con su intermitencia asumida y no combatida. Las copias salen de la máquina cifradas con una clave pública, así que **la máquina que produce la copia no puede leerla** |
| [014](architecture/decisions/ADR-014-cambio-de-correo-electronico.md) | Cambio de correo electrónico | El correo es el salt, así que cambiarlo re-deriva y reenvuelve. **Y sí invalida la clave de recuperación**, al contrario que rotar la contraseña: la operación no termina hasta entregar una nueva |
| [015](architecture/decisions/ADR-015-acceso-desde-fuera-de-la-red-local.md) | Acceso desde fuera de la red local | Tailscale, y el criterio que lo elige no es la comodidad sino **quién puede servir el JavaScript** — quien lo controla controla el cifrado en el cliente. Eso descarta las vías que terminan el TLS por ti |

---

## Orden de lectura recomendado (onboarding)

1. Este archivo, para el mapa general.
2. `architecture/decisions/ADR-001-zero-knowledge.md` — sin esto, ninguna otra
   decisión del proyecto tiene sentido.
3. Los ADR 002 a 008, en orden.
4. `architecture/FOUNDATION.md` — cómo se concretan esas decisiones en el modelo
   de datos, y el contrato del blob. Imprescindible antes de tocar la API.
5. `planning/SPRINT_CONTEXT.md` — punto exacto del trabajo. Es corto a propósito.
6. `planning/STATUS.md` — backlog, prioridades y dependencias.
7. `development/SETUP.md` — solo si vas a levantar el proyecto.
8. `GUIDE.md` — antes de escribir o modificar cualquier documento.

`planning/archive/` no hace falta para empezar. Se consulta cuando algo se
comporta de forma rara en una zona ya trabajada: allí está lo que costó
averiguar en su momento.

---

## El plan por fases de ADR-001, ya completado

`ADR-001` describía tres fases, y las tres están hechas. La Iteración 1 usó
autenticación convencional a propósito, para validar el stack antes de introducir
criptografía. La Iteración 2 fijó el contrato del blob con el contenido todavía sin
cifrar. **La Iteración 3 retiró las dos excepciones**: la contraseña maestra no sale
del cliente y los items se cifran con AES-256-GCM.

La apuesta era que mantener el contrato estable haría mínima la sustitución
posterior, y se puede dar por comprobada: al llegar el cifrado real, `register` ganó
dos campos de entrada, `GET /api/vaults` dos de salida, y no hubo que tocar ni la
tabla `vault_items` ni ninguna otra ruta.
