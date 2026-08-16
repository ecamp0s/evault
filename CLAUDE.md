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
| `docs/operations/DEPLOYMENT.md` | Desplegar en un servidor propio: nombres, TLS y copias |
| `docs/architecture/decisions/` | Los doce ADR, inmutables una vez cerrados |

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
./scripts/check-identifiers.py # identificadores en español; --all incluye tests
python3 -m unittest discover -s scripts/tests   # tests del propio utillaje
node scripts/identifiers/dump-ui-text.mjs      # texto visible, para comparar antes/después de un renombrado

## URLs locales
- API:   http://api.evault.localhost
- Web:   http://app.evault.localhost    (Caddy hace proxy a localhost:5173)
- Admin: http://admin.evault.localhost  (futuro panel Filament)

Son http y no https, y el dominio termina en `.localhost`, no en `.test`. **Eso
último no es un detalle estético: la especificación de contextos seguros trata
como de confianza cualquier host que termine en `.localhost`, así que ahí existen
`crypto.subtle` y `navigator.clipboard` sin necesidad de certificado.** Con `.test`
no existirían, y trabajar con criptografía obligaría a irse a `localhost:5173`,
que es de lo que se salió al cerrar el issue #91.

Caddy escucha en el puerto 8080 con matchers por host, porque Windows tiene un
portproxy del 80 al 8080. Ese portproxy da servicio además a otro proyecto que
convive en la misma máquina, así que no se toca a ciegas: un cambio ahí se
verifica comprobando que el otro sigue respondiendo.

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
- **La rama se borra al mergear**, no más tarde: `gh pr merge N --squash --delete-branch`

### Borrado de ramas
El repositorio tiene `delete_branch_on_merge` activo desde el 5 de agosto de 2026,
así que GitHub borra la rama remota él solo al mergear. Si una rama desaparece
después de un merge, es intencionado. La local la borra el `--delete-branch` de
arriba, y por eso se pone siempre.

Se activó porque se habían acumulado 17 ramas locales y 18 remotas de las cuatro
primeras iteraciones. No estorbaban, pero `git branch` había dejado de servir para
ver en qué se está trabajando, que es para lo que se mira.

**Si alguna vez hay que limpiar en lote, `git branch --merged master` no vale, y
falla de la peor manera: no detecta ni una sola rama.** Como aquí se mergea con
squash, el commit resultante tiene otro hash y git no encuentra el original en el
historial, así que `git branch -d` las rechaza todas. Resolverlo con `-D` es borrar
sin comprobar nada, que es justo lo que `-d` existe para impedir.

Lo que sí verifica de verdad son dos comprobaciones cruzadas:

    gh pr list --state merged --limit 200 --json headRefName --jq '.[].headRefName'

para quedarse solo con las ramas que tienen un PR mergeado, y después comprobar que
cada rama local coincide con su `origin/<rama>`, es decir que no lleva commits sin
subir. Solo con las dos cosas se puede usar `-D` sin riesgo.

### Hook pre-push
`scripts/hooks/pre-push` rechaza el push directo a master, el force push y el
borrado de la rama. Se activa una vez por clon:

    git config core.hooksPath scripts/hooks

Vive en el clon y se salta con `--no-verify`, así que cubre el despiste de pushear
estando en master, no a un actor malintencionado. El merge de un PR lo hace GitHub
en el servidor, así que `gh pr merge` no se ve afectado.

### Ruleset de master
Desde que el repositorio es público hay además un ruleset **en el servidor**, que
no depende de ningún clon y que nadie puede saltarse: **no se puede borrar `master`
ni reescribir su historia**. Cierra el issue #21 y cubre justo el agujero del hook,
que es lo irreversible.

Lo que el ruleset **no** hace es exigir que los cambios pasen por pull request, y
la razón es concreta: **GitHub no admite dar bypass a GitHub Actions en un
repositorio personal** —solo en organizaciones—, y el workflow `status` escribe
`STATUS.md` en `master` con el `GITHUB_TOKEN`. Con la regla activa, ese push muere
con `GH013: Repository rule violations found`, comprobado al configurarlo. De modo
que exigir PR y regenerar `STATUS.md` automáticamente son hoy incompatibles, y se
eligió conservar la automatización. El push directo a `master` lo sigue cubriendo
el hook de arriba.
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

Rige para todo lo que se escriba a partir del 2 de agosto de 2026. **La migración de
lo anterior terminó el 4 de agosto de 2026** con el issue #97, hecho por capas en los
issues #115 a #119.

**Lo que NO se traduce, y no es un olvido.** Hay cosas que parecen identificadores y
son datos, así que renombrarlas rompe algo que ningún compilador vigila:

- **Los campos del blob**: `nombre`, `usuario`, `password`, `url` y `notas`. Se
  serializan con `JSON.stringify` y se cifran tal cual, de modo que sus claves son lo
  que hay escrito dentro de cada item ya guardado. Avisado en `web/src/lib/vault/types.ts`.
- **El nombre del store de `localStorage`**, `evault.sesion`, y la clave persistida
  dentro. La segunda se adapta en el `merge` del store, no con `version`/`migrate`:
  zustand solo llama a `migrate` si lo guardado trae una `version` numérica, y no la
  trae. Ver `web/src/lib/session.ts`.
- **La clave que los guards escriben en el `state` de react-router.** No está tipada y
  se lee con un cast, así que renombrarla en un sitio y no en otro rompe en silencio la
  vuelta a la ruta de origen. Tiene test desde #117.
- **Los nombres de fichero de `api/database/migrations/`.** Laravel guarda la cadena
  completa como valor en la tabla `migrations`, y es lo que usa para saber qué está
  aplicado: renombrar una migración ya ejecutada le hace creer que hay una nueva sin
  aplicar y que la aplicada desapareció. En una base de datos limpia no pasa nada; en
  una instancia desplegada, sí. Decidido en #160: las aplicadas no se renombran nunca,
  las nuevas se escriben en inglés.
- **Las claves de `config/throttling.php`**, por lo mismo: son configuración, no símbolos.
- **Los `name:` de los workflows**, que no son excepción sino la regla: son el texto que
  una persona lee en la interfaz de Actions, así que van en español. Los **id** de job y
  de step sí son identificadores y van en inglés. Renombrar un id no toca ningún check,
  porque GitHub nombra el check por el `name:`.

**Esto no hay que recordarlo de memoria: lo comprueba `./scripts/check-identifiers.py`**,
y sus exclusiones viven en el código con el motivo escrito al lado. El comando existe
porque afirmar la regla no bastó tres veces seguidas (#153, #160, #189). Lo que **no**
puede comprobar es la gramática: `useVaultPersonal` son tres palabras inglesas en orden
español y pasa.

**Al renombrar identificadores en el frontend**, proteger comentarios y cadenas no
basta: hacen falta también el texto JSX, sus fragmentos partidos por interpolaciones, y
los regex literales de los tests, que llevan textos de interfaz sin comillas. Y la
comprobación que sirve es comparar todo el texto visible antes y después, no leer el
diff.

## Patrones clave (heredados de un proyecto anterior)
- Servicios con método handle() recibiendo IDs explícitos
- Double guard: validación en UI Y en capa de aplicación
- Tests de aislamiento cross-tenant en todos los servicios críticos
- SQLite in-memory para tests, nunca tocar MySQL de desarrollo
- Contexto de tenant explícito en cada llamada, nunca en sesión: la API es
  stateless. Divergencia deliberada respecto a aquel proyecto, ver ADR-004
