# eVault — Contexto para Claude Code

## Al iniciar sesión
Leer siempre docs/planning/SPRINT_CONTEXT.md antes de hacer nada. Contiene el
estado del entorno y el punto exacto donde se quedó el trabajo.
Después, docs/planning/STATUS.md para saber qué issue toca y qué la bloquea.

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
| `docs/planning/SPRINT_CONTEXT.md` | Bridge entre sesiones: entorno, lecciones, punto de trabajo |
| `docs/planning/STATUS.md` | Backlog, prioridades y dependencias. **Generado, no editar a mano** |
| `docs/architecture/decisions/` | Los seis ADR, inmutables una vez cerrados |

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

Excepción temporal y deliberada: la autenticación de la Iteración 1 es
convencional, la contraseña viaja al servidor y Laravel la hashea. Se sustituye
en la Iteración 3. El contrato de la API debe mantenerse estable.

## Workflow Git
- Rama por issue: <tipo>/<número>-descripcion
- Merge solo con squash PR, un commit por issue
- El cuerpo del PR incluye "Closes #N"
- gh pr create / gh pr merge
- Al cerrar un issue: actualizar SPRINT_CONTEXT.md. STATUS.md lo regenera el CI
  tras el merge, no hace falta ejecutar nada a mano

## Gobernanza del backlog
GitHub es la única fuente de verdad del estado. STATUS.md se genera desde ahí.
- Estado: campo `Status` del Project (`Todo` / `In Progress` / `Done`)
- Prioridad: campo `Priority` del Project (`High` / `Medium` / `Low`), no labels
- Sprint, tipo y área: labels (`s1`, `feat`/`chore`, `api`/`web`)
- Dependencias: relaciones nativas `blocked by` / `blocking` de GitHub, no prosa
- Los números de issue y de PR comparten secuencia: el siguiente issue no es el
  anterior más uno

## Patrones clave (igual que eBudget)
- Servicios con método handle() recibiendo IDs explícitos
- Double guard: validación en UI Y en capa de aplicación
- Tests de aislamiento cross-tenant en todos los servicios críticos
- SQLite in-memory para tests, nunca tocar MySQL de desarrollo
- Contexto de tenant explícito en cada llamada, nunca en sesión: la API es
  stateless. Diferencia deliberada respecto a eBudget, ver ADR-004
