# eVault — Contexto para Claude Code

## Al iniciar sesión
Leer siempre docs/planning/SPRINT_CONTEXT.md antes de hacer nada. Contiene el estado del entorno, las decisiones cerradas y el punto exacto donde se quedó el trabajo.

## Estructura del monorepo
- `api/` → Laravel 12 API REST + Filament admin (PHP 8.4)
- `web/` → React 19 + TypeScript + Vite SPA
- `docs/planning/SPRINT_CONTEXT.md` → leer siempre al inicio de sesión
- `docs/planning/STATUS.md` → estado actual del backlog
- `docs/architecture/decisions/` → ADRs inmutables

## Comandos frecuentes

### API (desde api/)
php artisan serve              # no usar en prod, usar Caddy
php artisan migrate:fresh --seed
php artisan test               # Pest
composer analyse               # Larastan

### Web (desde web/)
npm run dev                    # Vite dev server en puerto 5173
npm run build                  # build producción
npm run lint                   # ESLint

## URLs locales
- API:   https://evault.test/api
- Web:   https://evault.test  (proxied a localhost:5173)
- Admin: https://evault.test/admin

## Principio fundamental
Zero-knowledge: el cifrado ocurre en el cliente (web/). El servidor
(api/) solo almacena blobs cifrados. Nunca pasar secretos descifrados
al servidor.

## Workflow Git
- Rama por issue: <tipo>/<número>-descripcion
- Merge solo con squash PR
- gh pr create / gh pr merge

## Patrones clave (igual que eBudget)
- Servicios con método handle() recibiendo IDs explícitos
- Double guard: validación en UI Y en capa de aplicación
- Tests de aislamiento cross-tenant en todos los servicios críticos
- SQLite in-memory para tests, nunca tocar MySQL de desarrollo
