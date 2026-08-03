# eVault — Contexto para Claude Code

## Al iniciar sesión
Leer siempre docs/planning/SPRINT_CONTEXT.md antes de hacer nada. Es corto: dice
dónde se quedó el trabajo y qué deuda hay reconocida.
Después, docs/planning/STATUS.md para saber qué issue toca y qué la bloquea.
El entorno local está en docs/development/SETUP.md, y solo hace falta abrirlo si
hay que levantar el proyecto o algo falla al arrancarlo.

## Estructura del monorepo
- `api/` → Laravel 13 API REST + Filament admin (PHP 8.4)
- `web/` → React 19 + TypeScript 6 + Vite SPA
- `scripts/` → utilidades del repositorio
- `docs/` → documentación; su índice y sus reglas están en docs/README.md y docs/GUIDE.md

## Documentación

| Documento | Qué es |
|---|---|
| `docs/README.md` | Índice y orden de lectura |
| `docs/GUIDE.md` | Reglas de la documentación: qué va en cada sitio, qué es generado y qué inmutable |
| `docs/planning/SPRINT_CONTEXT.md` | Bridge entre sesiones: punto de trabajo y deuda conocida. Corto a propósito |
| `docs/planning/STATUS.md` | Backlog, prioridades y dependencias. **Generado, no editar a mano** |
| `docs/planning/archive/` | Historial y lecciones de las iteraciones cerradas |
| `docs/development/SETUP.md` | Entorno local, stack y versiones verificadas |
| `docs/architecture/decisions/` | Los nueve ADR, inmutables una vez cerrados |

Antes de crear o modificar cualquier documento, leer docs/GUIDE.md.

## Comandos frecuentes

### API (desde api/)
php artisan serve              # no usar en prod, usar Caddy
php artisan migrate:fresh --seed
php artisan test               # Pest
composer analyse               # Larastan, nivel max

### Web (desde web/)
npm run dev                    # Vite dev server en puerto 5173
npm run build                  # build producción
npm run lint                   # ESLint
npm run test                   # Vitest en modo watch
npm run test:run               # Vitest una pasada, lo que usa el CI

### Repositorio (desde la raíz)
./scripts/status.sh            # regenera docs/planning/STATUS.md desde GitHub

## URLs locales
- API:   http://api.evault.claude
- Web:   http://app.evault.claude    (Caddy hace proxy a localhost:5173)
- Admin: http://admin.evault.claude  (futuro panel Filament)

Son http y no https, y el dominio es `.claude`, no `.test`. Caddy escucha en el
puerto 8080 con matchers por host, porque Windows tiene un portproxy del 80 al
8080. Ese portproxy también sirve a ebudget.test, que no debe romperse.

## Principio fundamental
Zero-knowledge: el cifrado ocurre en el cliente (web/). El servidor (api/) solo
almacena blobs cifrados. Nunca pasar secretos descifrados al servidor.
Ver docs/architecture/decisions/ADR-001-zero-knowledge.md.

Desde la Iteración 3 no hay ninguna excepción: la contraseña maestra no sale del
dispositivo, lo que viaja al servidor es un hash de autenticación derivado, y los
items se cifran con AES-256-GCM antes de salir. Cómo se estructuran las claves
está en ADR-008.

## Workflow Git
- Rama por issue: <tipo>/<número>-descripcion
- Merge solo con squash PR, un commit por issue
- El cuerpo del PR incluye "Closes #N"
- gh pr create / gh pr merge

### Hook pre-push
`scripts/hooks/pre-push` rechaza el push directo a master, el force push y el
borrado de la rama. Se activa una vez por clon:

    git config core.hooksPath scripts/hooks

No es protección de rama: vive en el clon y se salta con `--no-verify`. GitHub no
permite rulesets en repos privados de cuentas Free, ver el issue #21. Cubre el
despiste de pushear estando en master, no a un actor malintencionado. El merge de
un PR lo hace GitHub en el servidor, así que `gh pr merge` no se ve afectado.
- Al cerrar un issue: actualizar SPRINT_CONTEXT.md. STATUS.md lo regenera el CI
- Si el issue deja deuda a propósito, abrir issue con label `deuda` en ese mismo
  PR: deuda sin issue no existe. Ver docs/GUIDE.md
  tras el merge, no hace falta ejecutar nada a mano

## Gobernanza del backlog
GitHub es la única fuente de verdad del estado. STATUS.md se genera desde ahí.
- Estado: campo `Status` del Project (`Todo` / `In Progress` / `Done`)
- Prioridad: campo `Priority` del Project (`High` / `Medium` / `Low`), no labels
- Sprint, tipo y área: labels (`s1`, `feat`/`chore`, `api`/`web`)
- Dependencias: relaciones nativas `blocked by` / `blocking` de GitHub, no prosa
- Los números de issue y de PR comparten secuencia: el siguiente issue no es el
  anterior más uno

## Idioma del código

**Los identificadores en inglés; la prosa, en español.** Dicho de otro modo: lo que
ejecuta la máquina va en inglés, lo que lee una persona va en español.

En inglés: nombres de fichero, funciones, variables, constantes, parámetros, tipos,
interfaces, clases, componentes y hooks.

En español: los comentarios del código, los nombres de los tests (`it` y `describe`),
los textos que ve el usuario, y los títulos de issues, ramas, commits y PR.

**Excepción, y es deliberada: el `README.md` de la raíz va en inglés.** No es un
descuido que haya que corregir. El criterio no es el idioma sino la audiencia: el
README es la puerta de entrada de un repositorio público y lo lee cualquiera,
mientras que la documentación de trabajo —`SPRINT_CONTEXT`, `STATUS`, `SETUP`,
`GUIDE`, los ADR— la usamos nosotros y traducirla solo multiplicaría el
mantenimiento. No se duplica documentación en dos idiomas: dos versiones completas
divergen siempre, y la que se queda atrás miente con autoridad. El propio README
avisa al final de que lo que enlaza está en español.

Rige para todo lo que se escriba a partir del 2 de agosto de 2026. Lo anterior está
mayormente en español en el frontend y en inglés en la API; migrarlo es el issue #97
y hasta entonces conviven los dos, así que al tocar un fichero antiguo **no se
renombra de paso**: eso convertiría cualquier cambio en un diff inrevisable.

## Patrones clave (igual que eBudget)
- Servicios con método handle() recibiendo IDs explícitos
- Double guard: validación en UI Y en capa de aplicación
- Tests de aislamiento cross-tenant en todos los servicios críticos
- SQLite in-memory para tests, nunca tocar MySQL de desarrollo
- Contexto de tenant explícito en cada llamada, nunca en sesión: la API es
  stateless. Diferencia deliberada respecto a eBudget, ver ADR-004
