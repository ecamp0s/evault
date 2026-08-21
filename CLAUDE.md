# eVault — Contexto para Claude Code

## Al iniciar sesión
Leer siempre docs/planning/SPRINT_CONTEXT.md antes de hacer nada. Es corto: dice
dónde se quedó el trabajo y qué deuda hay reconocida.
Después, docs/planning/STATUS.md para saber qué issue toca y qué la bloquea.
El entorno local está en docs/development/SETUP.md, y solo hace falta abrirlo si
hay que levantar el proyecto o algo falla al arrancarlo.

## Estructura del monorepo
- `api/` → Laravel 13 API REST (PHP 8.4)
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
| `docs/architecture/decisions/` | Los dieciséis ADR, inmutables una vez cerrados |

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
npm run test:run               # Vitest una pasada, sin cobertura
npm run test:coverage          # con cobertura y umbral de lib/vault, lo que usa el CI

### Repositorio (desde la raíz)
./scripts/status.sh            # regenera docs/planning/STATUS.md desde GitHub
./scripts/check-docs.py        # bytes NUL, conflictos, marcadores de STATUS y enlaces rotos
./scripts/check-comment-language.py --all      # prosa española en el árbol; es lo que corre el CI
./scripts/check-comment-language.py            # solo en lo que AÑADES, contra origin/master
./scripts/check-comment-language.py --measure  # su tasa de falsos positivos, medida
./scripts/check-comment-language.py --census   # que nadie borre comentario en vez de traducirlo
python3 -m unittest discover -s scripts/tests   # tests del propio utillaje
node scripts/ui-text.mjs                       # texto visible, para comparar antes/después de un renombrado
node scripts/verify-auto-lock.mjs              # bloqueo por inactividad en navegador real, ~19 min
node scripts/verify-auto-lock.mjs --smoke      # solo que sabe conducir la app, ~20 s

El de verify-auto-lock **tarda diecinueve minutos de reloj de verdad y eso no es un
defecto: es el issue**. Falsear el tiempo reproduciría lo que los tests de #220 ya
cubren. Necesita la SPA en un contexto seguro y la API detrás:

    # desde api/
    php artisan serve --port=8000
    # desde web/
    DEV_API_PROXY=http://127.0.0.1:8000 npm run dev

Y `localhost:5173` y no `app.evault.localhost`, porque el proxy de `/api` del servidor
de desarrollo resuelve por `127.0.0.1` y `.localhost` no lo resuelve `getaddrinfo`.

## URLs locales
- Web:   http://app.evault.localhost      (Caddy hace proxy a localhost:5173)
- API:   http://app.evault.localhost/api  (mismo origen, ver ADR-016)

**No hay panel de administración, y no es que falte: ADR-009 §4 lo sacó del
alcance** junto con lo demás que solo existía por el modelo SaaS. Filament no está
en `api/composer.json` ni hay directorio que lo espere. ADR-002 sigue vigente y no
lo contradice: decidió que **si** hubiera panel sería Filament y no React, y eso
sigue siendo verdad — lo que ADR-009 retiró fue el sujeto de la frase.

Hubo un `admin.evault.localhost` en el Caddy de desarrollo esperando ese panel, y no
servía nada de administración: apuntaba a la raíz del mismo proyecto Laravel que la
API. Se retiró con esta corrección, en el issue #324.

**La API ya no tiene host propio.** `api.evault.localhost` se retiró en el issue
#296: desde ADR-016 vive en `/api` del mismo origen que la SPA. Eso hace que un
`dist/` construido una vez sirva desde cualquier hostname —que es lo que Tailscale
obligaba, porque da un solo nombre DNS por máquina— y que CORS desaparezca.

**Eso es la decisión, y el Caddy de tu máquina puede no haberla seguido**, porque no
está en el repositorio. Se comprueba en un comando, con Vite APAGADO:

    curl -o /dev/null -w '%{http_code}\n' http://app.evault.localhost/api/health

`200` significa que Caddy enruta `/api` a PHP-FPM, que es lo que ADR-016 pide. `502`
significa que lo está mandando entero al 5173 y que ese bloque sigue sin actualizar;
con Vite levantado y `DEV_API_PROXY` puesto funcionaría igual, y por eso el fallo no
se nota trabajando.

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

**El código en inglés; la documentación, en español.** La frontera pasa entre
ficheros y no por dentro de cada uno, que es lo que cambió el 17 de agosto de 2026.

En inglés, **todo lo que hay dentro de un fichero de código**: nombres de fichero,
funciones, variables, constantes, parámetros, tipos, interfaces, clases, componentes,
hooks, **los comentarios** y **los nombres de los tests** (`it` y `describe`).

En español: la documentación de `docs/`, los textos que ve el usuario, y los títulos
de issues, ramas, commits y PR.

**Por qué cambió, y es un cambio de coste y no de gusto.** La regla anterior ponía la
frontera dentro de cada fichero —identificadores en inglés, comentarios y tests en
español— y eso obligaba a vigilarla: **1.885 líneas** entre `check-identifiers.py`, su
lista de 713 palabras permitidas, sus dos extractores y sus tests, medidas al borrarlas. Esa lista admitió una
palabra española tres veces, y quien escribe arrastra el idioma de un comentario a la
variable de al lado sin darse cuenta —nueve veces en dos PR de la Iteración 7—. Con la
frontera entre ficheros no hay nada de eso que comprobar: la regla es evidente al abrir
el fichero. Ver #251.

**Y ese andamiaje ya no está**: el issue #323 lo retiró entero el 21 de agosto de 2026,
cuando la conversión dejó de darle trabajo. Lo que queda vigilando la regla es un solo
comando, `check-comment-language.py`, y desde entonces el CI lo ejecuta en modo `--all`
sobre el árbol completo.

**LA CONVERSIÓN TERMINÓ EL 21 DE AGOSTO DE 2026**, en el issue #290 y sus seis capas,
del #317 al #322: **3.836 líneas de comentario convertidas**, más 158 que se fueron con el
andamiaje que las contenía. Medido al cerrar sobre el árbol de la planificación son 3.994
líneas en 217 ficheros y 461 nombres de test; las cifras de entonces decían 3.993 en 216 y
442, y la diferencia es que el comprobador aprendió cosas por el camino.
Ya no conviven dos idiomas dentro de ningún fichero, así que **no hay nada que decidir
al editar uno**: si encuentras prosa española pegada a código, es un descuido y no una
zona pendiente.

> No se tradujo a máquina, y esa fue la apuesta: estos comentarios explican *por qué*
> las cosas son como son, y pasarlos por un traductor los habría degradado. El criterio
> de las seis capas fue reescribir el argumento en inglés.

> Y el issue **no existió hasta el 19 de agosto de 2026**, aunque este documento llevaba
> desde el 17 diciendo que existía. Es el mismo fallo que el proyecto arrastra desde la
> Iteración 4, esta vez en el fichero que se lee al empezar cada sesión.

**Lo que queda de aquello es un solo comprobador y en modo `--all`.** Ya no mira solo lo
que añades: mira el árbol entero, porque el árbol entero está en inglés y volver a
ensuciarlo tiene que doler el mismo día.

**Y el censo, que vigila el error contrario y por eso existe #316.** El comprobador de
arriba marca prosa española, de modo que un comentario **borrado** en vez de traducido
se lleva su propio hallazgo y deja el check en verde: la única red existente premiaba
el peor resultado posible. `--census` cuenta líneas de comentario **por fichero** y
falla cuando uno pierde más de lo que encoge una traducción fiel. El margen está
medido y no elegido a ojo —convertir `keyInMemory.ts` a mano quitó un 7,1 % y
`unlock.ts` un 0 %—, y va por fichero y no sobre el total porque un total permite que
una capa pierda comentario mientras otra lo gana. Si la pérdida es deliberada, se
justifica con una línea «Censo: <motivo>» en el cuerpo del PR.

**Por qué el comprobador existe, que es el #291:** el de identificadores miraba
identificadores, no comentarios ni nombres de test, así que **la mitad nueva de la regla
no tenía red** — en los dos primeros días de vigencia se colaron 14 líneas de comentario
en español sin que nada las señalara. Nació mirando **las líneas añadidas y no el árbol**,
porque con casi cuatro mil líneas esperando habría nacido en rojo y un check que nace en rojo se
acaba ignorando entero, que es la lección de #62. Pasó a `--all` en el #323, cuando ya no
quedaba nada que lo pusiera rojo.

**Excepción, y es deliberada: el `README.md` de la raíz va en inglés.** No es un
descuido que haya que corregir. El criterio no es el idioma sino la audiencia: el
README es la puerta de entrada de un repositorio público y lo lee cualquiera,
mientras que la documentación de trabajo —`SPRINT_CONTEXT`, `STATUS`, `SETUP`,
`GUIDE`, los ADR— la usamos nosotros y traducirla solo multiplicaría el
mantenimiento. No se duplica documentación en dos idiomas: dos versiones completas
divergen siempre, y la que se queda atrás miente con autoridad. El propio README
avisa al final de que lo que enlaza está en español.

La regla anterior —comentarios y tests en español— rigió del 2 al 17 de agosto de 2026. **La migración de
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

**Esto sí hay que recordarlo, y es lo que cambió al jubilar el andamiaje.** Hasta el
#323 lo comprobaba `check-identifiers.py`, con las seis excepciones de arriba escritas en
su código y el motivo al lado; retirado el comando, **la lista de arriba es la única
memoria que queda**, y por eso está aquí y no en un fichero de configuración. Lo que se
perdió con él es la detección automática de palabras funcionales españolas pegadas a otra
—`aItem`, `deVault`, `CAMPOS_DEL_FORMULARIO`—, y se asume: la regla ya no pasa por dentro
de cada fichero, así que ese arrastre no tiene de dónde venir. Lo que tampoco comprobaba
nunca era la gramática: `useVaultPersonal` son tres palabras inglesas en orden español y
pasaba igual.

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
