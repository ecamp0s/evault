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
- `extension/` → la extensión de Chrome (ADR-023) y de Firefox (ADR-025), del mismo código:
  lo de cada navegador vive en `src/platform/`. Compila `web/src/lib/vault` y no lo copia
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
| `docs/architecture/decisions/` | Los veinticinco ADR, inmutables una vez cerrados |

Antes de crear o modificar cualquier documento, leer docs/GUIDE.md.

## Comandos frecuentes

### Entorno de desarrollo (desde la raíz, #703)
docker compose -f compose.dev.yaml up -d      # SPA con Vite en http://localhost:5173, API detrás
docker compose -f compose.dev.yaml logs -f api web
docker compose -f compose.dev.yaml exec -u www-data api php artisan migrate:fresh --seed
docker compose -f compose.dev.yaml restart api   # solo tras tocar api/.env
docker compose -f compose.dev.yaml down          # -v borra también la base, que es de prueba

Los tests y el análisis **se ejecutan en la máquina**, no en el contenedor: la API usa
SQLite en memoria y la web jsdom, así que no necesitan el entorno levantado.

### API (desde api/)
php artisan test               # Pest
composer analyse               # Larastan, nivel max
./vendor/bin/pint --test       # formato; no arregla, solo dice qué está fuera
./vendor/bin/pint              # lo arregla

### Web (desde web/)
npm run dev                    # Vite dev server en puerto 5173
npm run build                  # build producción; su `tsc -b` es lo que comprueba tipos
npx tsc -b                     # solo los tipos. `tsc --noEmit` NO comprueba nada aquí:
                               # el tsconfig raíz tiene `files: []` y solo referencias
npm run lint                   # ESLint
npm run test                   # Vitest en modo watch
npm run test:run               # Vitest una pasada, sin cobertura
npm run test:coverage          # con cobertura y umbral de lib/vault, lo que usa el CI

### Extensión (desde extension/)
npm run release:chrome         # la de kastor, construida y dejada en la carpeta que carga Chrome
npm run release:firefox        # la de kastor para Firefox, firmada y publicada en /extension/ de kastor
npm run sign:firefox           # la de kastor para Firefox, solo firmada por Mozilla (unlisted) y comparada
npm run build                  # tsc -b y vite build a extension/dist, para la instancia de desarrollo
EVAULT_EXTENSION_BROWSER=firefox npx vite build   # la de Firefox, a extension/dist-firefox
npm run lint                   # ESLint, con la regla que prohíbe crypto.subtle aquí
npm run test:run               # Vitest una pasada

**Los orígenes de kastor y la carpeta de Chrome están en `~/.config/evault/extension.env`**,
fuera del repositorio, y los leen `release:chrome` y `sign:firefox` (#798). **No se le
preguntan a quien tiene la vault**: qué lleva el fichero y cómo rehacerlo si se pierde está
en DEPLOYMENT.md §9.

**La instancia no está en el repositorio**: sin `EVAULT_EXTENSION_ORIGINS` la build
apunta a `http://localhost:5173`, la de desarrollo. Los nombres de kastor se pasan
al construir y no se escriben en ningún fichero versionado (ADR-023 §2.5). La build se
niega a construir con un origen `http` fuera de localhost, porque ahí la vault no se
podría abrir.

### Repositorio (desde la raíz)
./scripts/status.sh            # regenera docs/planning/STATUS.md desde GitHub
./scripts/check-docs.py        # bytes NUL, conflictos, marcadores de STATUS, enlaces rotos y el
                               # techo de tamaño de lo que se lee al empezar la sesión
./scripts/check-comment-language.py --all      # prosa española en el árbol; es lo que corre el CI
./scripts/check-comment-language.py            # solo en lo que AÑADES, contra origin/master
./scripts/check-comment-language.py --measure  # su tasa de falsos positivos, medida
./scripts/check-comment-language.py --census   # que nadie borre comentario en vez de traducirlo
python3 -m unittest discover -s scripts/tests   # tests del propio utillaje
node scripts/ui-text.mjs                       # texto visible, para comparar antes/después de un renombrado
node scripts/verify-auto-lock.mjs              # bloqueo por inactividad en navegador real, ~19 min; ocho casos
node scripts/verify-auto-lock.mjs --smoke      # solo que sabe conducir la app, ~20 s
node scripts/verify-large-vault.mjs            # qué cuesta una vault de 370 entradas, ~1 min; once límites
node scripts/verify-large-vault.mjs --entries 120   # lo mismo más rápido, mismos límites
node scripts/verify-large-vault.mjs --smoke    # solo que sabe conducir la app, ~20 s
node scripts/verify-passkey.mjs                # el ciclo del passkey en navegador real, ~25 s
node scripts/verify-passkey.mjs --smoke        # solo que sabe conducir la app, ~5 s
node scripts/verify-extension.mjs              # la extensión en un Chromium de verdad, ~2 min; nueve casos
node scripts/verify-extension.mjs --smoke      # solo que sabe conducir la extensión, ~20 s
node scripts/verify-extension-firefox.mjs      # la extensión en un Firefox de verdad, ~70 s; cinco casos
node scripts/verify-extension-firefox.mjs --smoke   # solo que sabe conducirla, ~10 s
node scripts/build-icons.mjs                    # regenera los iconos de la PWA desde favicon.svg

Los cinco verificadores **no los ejecuta el CI, y es deliberado**: conducen un navegador
de verdad, así que en cada PR serían intermitentes, y un check intermitente se acaba
ignorando entero —la lección de #62—. Se ejecutan a mano al tocar lo que vigilan.

El de verify-passkey es el más rápido de los cinco, unos 25 segundos, y **ejercita
WebAuthn de verdad**: usa el autenticador virtual de CDP con `hasPrf` (#566), así que lo
que responde es la implementación de Chromium y no un doble escrito en la suite. Cuatro
casos, todos sobre la web: que un passkey abre la vault tras recargar sin teclear la
maestra, que uno revocado deja de abrir, que la maestra sigue funcionando, y que sin
WebAuthn el botón no se pinta. Registra **una cuenta por caso**, cuatro en total. **Lo que
NO puede decir es que un iPhone se comporte igual** —un autenticador virtual es el modelo
de Chromium, no el de Apple—, y por eso el #568 termina en un teléfono de verdad. Hasta el
#674 era el único que llegaba a WebAuthn; ahora verify-extension hace lo mismo desde la
extensión.

El de verify-extension conduce **la extensión**, unos dos minutos, y **nació en rojo**
como los otros: sobre el árbol anterior al #671 sus cinco primeros casos fallan. Se construye su
propia extensión en `extension/dist-verify` apuntando a la instancia de desarrollo, porque
la instancia se fija al construir (ADR-023 §2.5) y una `dist/` hecha a mano apunta a otra.
Nueve casos: que el passkey **que da de alta la web** abre la vault desde el popup, que uno
revocado deja de abrirla, que la clave sobrevive a la muerte del service worker y no al
bloqueo —que además cierra el documento y revoca el token—, que copiar limpia el
portapapeles **con el popup ya cerrado** y que bloquear lo limpia sin esperar, que cerrar
el navegador se lleva la clave y deja el correo recordado, y —desde el #712— que **cerrar
las demás sesiones desde la web** bloquea el popup, que la web la lista como «Extensión de
Chrome» y que el popup no culpa a la red. Y desde el #694, **rellenar**: que rellena en su
sitio sin enviar el formulario ni tocar tres trampas invisibles, y que se niega con solo un
formulario invisible, dentro de un marco, si la pestaña cambió de host y en otro sitio. Y desde
el #768, **el primer paso de un login en dos pasos**, con la forma del de shein.com: rellena
solo el usuario, en el campo que tiene el foco y no en el `type="email"` del boletín del pie,
y no escribe nada en un buscador aunque tenga el foco. Desde el #773, también **sin el foco**,
que es lo que deja cerrar el banner de cookies: rellena el primer campo que se nombra del
usuario si está a la vista, y no escribe nada con la página bajada hasta otro más abajo. Sus
páginas las sirve el propio guion en `localhost:9480` y `otro.localhost:9480`, y su build
lleva ese segundo nombre, porque `openPopup()` no concede `activeTab` (#673).

**Lo que NO puede decir es que un autenticador de verdad se comporte igual**, y por eso el
#675 termina en el portátil con Windows Hello. Lo que sí desmiente es `ADR-023` §4: el ciclo
entero SÍ se puede verificar con el autenticador virtual, dando de alta el passkey en la web
y navegando **la misma pestaña** al popup; lo que pierde el PRF es copiar la credencial
entre pestañas, que es lo único que midió el #665.

**Su lector del portapapeles se trae al frente antes de cada lectura** (#705): en Chromium
153 y 154, lo que escribe una pestaña que no está al frente se pierde aunque `writeText`
diga que sí, y el caso de copiar salía en rojo sin tocar la extensión.

**Una trampa suya que conviene reconocer desde fuera**: si un Chromium sobrevive a una
ejecución interrumpida se queda con el puerto, y la siguiente lo conduce a él sin saberlo
—todo falla con `net::ERR_BLOCKED_BY_CLIENT` y parece que el navegador ya no admite
`--load-extension`—. Por eso se niega a arrancar con el puerto ocupado y dice cómo
encontrar el proceso. El resto de lo que se midió está en la cabecera del guion.

El de verify-extension-firefox conduce **la extensión de Firefox** (#759, `ADR-025` §2.7)
con Firefox y geckodriver, que SETUP.md dice cómo instalar, hablando WebDriver BiDi y
WebDriver clásico sin bibliotecas (`scripts/browser/bidi.mjs`). Cinco casos: el passkey de
la web abre la vault **por la pestaña de desbloqueo**, uno revocado no, la clave vive en la
página de fondo y se va con el bloqueo, copiar limpia el portapapeles con el popup cerrado,
y cerrar las demás sesiones la bloquea y la web la lista como «Extensión de Firefox». **Nació
en rojo**: sobre el árbol anterior al #753 falla el último, y sobre el anterior al #680 no
construye. **No cubre rellenar** —un guion no puede abrir el popup de Firefox, y el de
`popup.html` en una pestaña rellena su propia pestaña—, ni el bloqueo del sistema, que en
Firefox no existe, ni los quince minutos de inactividad: eso es el #754 y el #748. Su build
de verificación lleva dos cosas que la firmada no: una página que se abre al instalarse,
porque WebDriver no deja navegar a `moz-extension://`, y `clipboardRead`. **Y WebAuthn de
Firefox espera en silencio si su pestaña no está al frente**, así que el guion la trae antes
de cada paso.

El de verify-large-vault mide lo que la Iteración 11 arregla, y **nació en rojo a
propósito** (#348): sobre el código anterior a #349–#354 fallaban sus seis límites de
entonces, que hoy son **once** —el del retorno del foco llegó en #360, el de la pantalla
de revisión en #423, los de la reconciliación y la segunda tanda en #626, y el del ancho de
la reconciliación en #656—. Lo que decide son los recuentos —peticiones por import,
peticiones por borrado, si el DOM crece con las entradas, si el menú de usuario está dentro
de la ventana, cuánto multiplica la página la revisión, cuánto la reconciliación, cuántas
peticiones cuesta una tanda que completa entradas ya guardadas, y si el diálogo es más
ancho que su ventana— y **no los milisegundos**, que dependen de la máquina y solo se
informan. Registra dos cuentas por ejecución.

**Los cinco verificadores registran cuentas, y antes de arrancar el navegador preguntan
si caben** (#667). La API admite diez altas por hora y por IP (#25), y quedarse sin cupo a
mitad de una ejecución se leía como un fallo de lo que se estaba probando. Ahora cada uno
declara cuántas registra —ocho `verify-auto-lock`, nueve `verify-extension`, cinco
`verify-extension-firefox`, cuatro `verify-passkey`, dos `verify-large-vault`, una cualquiera de ellos con `--smoke`—, hace una petición de alta
vacía, lee `X-RateLimit-Remaining` y **se niega a empezar en unos 300 ms** si no le
alcanza, diciendo qué hacer. Y `register()` hace fallar una ejecución que registre una
cuenta más de las declaradas, que es lo que mantiene esas cifras verdaderas: hasta el
#667 este documento decía cinco donde eran cuatro, y la cabecera de `verify-auto-lock`
cinco donde eran ocho. En desarrollo el límite se sube, como explica SETUP.md.

**Su vault sembrada tiene dos de cada tres contraseñas malas a propósito**, y ese número
no es decorativo: es la proporción de la vault real, medida en #448 —246 marcadas de
369—. El límite de la revisión mide cuánto multiplica la página, y eso crece con lo que
está MAL en la vault y no con la vault; con contraseñas todas buenas la pantalla sale
vacía y el límite pasaría sin medir nada, que es por lo que se niega a pasar si no auditó
ninguna.

**Y su fichero de import trae duplicados a propósito, por el mismo motivo** (#626): la forma
que midió el #610 sobre las fuentes reales —el 59 % de las filas en grupos repetidos, con
sus tamaños a escala, siempre el grupo de nueve, y un 10 % de grupos con contraseñas que no
coinciden—. Una siembra sin duplicados deja la reconciliación vacía y el límite mediría
cero, así que se niega a pasar si no encontró ningún grupo; y la segunda tanda, que solapa
con la primera, se niega a pasar si no completó ninguna entrada guardada.

**Y su grupo de nueve lleva direcciones de 377 caracteres sin un espacio** (#656), la más
larga del export real de Chrome. El import de verdad del #628 encontró en su primer minuto
lo que las siembras cortas no podían: una sola dirección así ensanchaba la reconciliación
a 2.935 px en una ventana de 468 y lo cortaba todo por la derecha (#654). El límite se
niega a pasar si no llegó a pintarse una palabra de esa longitud, y nació en rojo quitando
el arreglo: 2.779 px de contenido en 497 visibles, y 497 en 497 con él.

El de verify-auto-lock **tarda diecinueve minutos de reloj de verdad y eso no es un
defecto: es el issue**. Falsear el tiempo reproduciría lo que los tests de #220 ya
cubren. Los cinco necesitan la SPA en un contexto seguro y la API detrás, que es
exactamente el entorno de desarrollo levantado: apuntan a `http://localhost:5173`.

## URLs locales
- Web:   http://localhost:5173       (Vite, en el contenedor `web` de compose.dev.yaml)
- API:   http://localhost:5173/api   (mismo origen, ver ADR-016; Vite la manda al contenedor `api`)
- MySQL: 127.0.0.1:3309              (usuario, contraseña y base `evault`, solo de prueba)

**No hay panel de administración, y no es que falte: ADR-009 §4 lo sacó del
alcance** junto con lo demás que solo existía por el modelo SaaS. Filament no está
en `api/composer.json` ni hay directorio que lo espere. ADR-002 sigue vigente y no
lo contradice: decidió que **si** hubiera panel sería Filament y no React — lo que
ADR-009 retiró fue el sujeto de la frase. El `admin.evault.localhost` que lo
esperaba en el Caddy de desarrollo se retiró en el #324.

**La API tampoco tiene host propio**: `api.evault.localhost` se retiró en el #296 y
desde ADR-016 vive en `/api` del mismo origen que la SPA. Eso hace que un `dist/`
construido una vez sirva desde cualquier hostname —que es lo que Tailscale obligaba,
porque da un solo nombre DNS por máquina— y que CORS desaparezca.

Son http y no https, y **eso no es un descuido: la especificación de contextos
seguros trata como de confianza `localhost` y cualquier host que termine en
`.localhost`**, así que ahí existen `crypto.subtle`, `navigator.clipboard` y WebAuthn
sin certificado. Con `.test` no existirían, que es de lo que se salió al cerrar el
issue #91. Hasta el #703 el desarrollo iba por `app.evault.localhost`, con un Caddy de
la máquina que no estaba en el repositorio y desapareció sin que nada lo dijera; por qué
se cambió está en SETUP.md. Un passkey está atado al nombre de host, así que los dados de
alta allí no se ofrecen aquí.

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

**El código en inglés; la documentación, en español.** La frontera pasa entre ficheros y
no por dentro de cada uno. Y el principio que resuelve lo que no es ninguna de las dos
cosas (#478): **en español solo lo que ve el usuario de la aplicación; todo lo demás, en
inglés** — nombres de workflow, claves persistidas en el navegador, cualquier cadena que
no sea ni código ni documentación.

En inglés, **todo lo que hay dentro de un fichero de código**: nombres de fichero,
funciones, variables, constantes, parámetros, tipos, interfaces, clases, componentes,
hooks, **los comentarios** y **los nombres de los tests** (`it` y `describe`). No hay nada
que decidir al editar uno: si encuentras prosa española pegada a código, es un descuido.

En español: la documentación de `docs/`, los textos que ve el usuario, y los títulos de
issues, ramas, commits y PR. Los títulos se quedan así **y no se reabre por inercia**:
cambiarlos partiría en dos la historia de más de doscientos issues sin arreglar nada.

**Dos excepciones vivas, las dos por audiencia y no por idioma:**

- **El `README.md` de la raíz va en inglés.** Es la puerta de entrada de un repositorio
  público y lo lee cualquiera; la documentación de trabajo la usamos nosotros, y
  mantenerla en dos idiomas garantiza que una de las dos versiones mienta con autoridad.
  El propio README avisa al final de que lo que enlaza está en español.
- **Las rutas de la SPA van en inglés** (#356): `/unlock`, `/recover`, `/email`,
  `/master-password`, `/recovery-key`, `/login` y `/register`. Una URL se ve, así que por
  la regla de arriba tocaría español; va en inglés porque no es una frase que se lea sino
  un identificador que se teclea, se enlaza y aparece en cualquier traza. **Los textos de
  la interfaz NO cambian con esto**: `/recovery-key` se sigue titulando «Clave de
  recuperación» y su fichero descargado, `evault-clave-de-recuperacion.txt`.

**Dos cosas que siguen siendo verdad, cada una con su salida escrita**, que es lo que a la
lista de excepciones anterior le faltaba: decía por qué no se podía renombrar y nunca cómo
se renombra. **Si alguna deja de ser cierta, se borra el mismo día** — una excepción que
sobrevive a su motivo no protege nada y sigue mandando, que es lo que costó el #542.

- **Los campos del blob.** Ya están todos en inglés desde el #543, pero la propiedad no ha
  cambiado: se serializan con `JSON.stringify` y se cifran tal cual, así que sus claves son
  lo que hay escrito dentro de cada item guardado, y **el servidor no puede convertirlas
  porque no puede leerlas** —`ADR-001` funcionando, no un temor—. **Las dos salidas:** una
  migración en el cliente, que es el único sitio donde la vault está descifrada, o una base
  vacía (#544). Lo que no vale es renombrar y ya: deja ilegible lo guardado sin que el
  compilador diga una palabra. Avisado en `web/src/lib/vault/types.ts` y en `FOUNDATION.md`
  §2.
- **Los nombres de fichero de `api/database/migrations/` ya aplicados.** Laravel guarda la
  cadena completa en la tabla `migrations`: renombrar una ejecutada le hace creer que hay
  una nueva sin aplicar y que la aplicada desapareció. En una base limpia no pasa nada; en
  una instancia desplegada, sí. Queda **una**,
  `2026_08_02_190000_descartar_vault_items_sin_cifrar.php`, y la salida es la misma
  (#160): las aplicadas no se renombran, las nuevas van en inglés.

**Lo que vigila la regla es un solo comando**, `check-comment-language.py`, y el CI lo
ejecuta en modo `--all` sobre el árbol entero: volver a ensuciarlo tiene que doler el mismo
día. **Y su censo vigila el error contrario** (#316): el comprobador marca prosa española,
de modo que un comentario **borrado** en vez de traducido se lleva su propio hallazgo y
deja el check en verde. `--census` cuenta líneas de comentario **por fichero** —no sobre el
total, que dejaría a una capa perder lo que otra gana— y falla cuando uno pierde más de lo
que encoge una traducción fiel; el margen está medido y no elegido a ojo. Si la pérdida es
deliberada, se justifica con una línea «Censo: <motivo>» en el cuerpo del PR.

**Al renombrar identificadores en el frontend**, proteger comentarios y cadenas no basta:
hacen falta también el texto JSX, sus fragmentos partidos por interpolaciones, y los regex
literales de los tests, que llevan textos de interfaz sin comillas. La comprobación que
sirve es comparar todo el texto visible antes y después con `scripts/ui-text.mjs`, no leer
el diff.

**De dónde viene todo esto, si hace falta:** la regla cambió el 17 de agosto de 2026 en el
#251 y su historia está en los archivos de las iteraciones que la produjeron — la 7 el
cambio de regla, la 10 la conversión de casi cuatro mil líneas y la jubilación del
andamiaje que la vigilaba, la 11 los comentarios JSX que el comprobador no veía, y la 15 la
lista de excepciones que fabricaba español nuevo.

## Patrones clave (heredados de un proyecto anterior)
- Servicios con método handle() recibiendo IDs explícitos
- Double guard: validación en UI Y en capa de aplicación
- Tests de aislamiento cross-tenant en todos los servicios críticos
- SQLite in-memory para tests, nunca tocar MySQL de desarrollo
- Contexto de tenant explícito en cada llamada, nunca en sesión: la API es
  stateless. Divergencia deliberada respecto a aquel proyecto, ver ADR-004
