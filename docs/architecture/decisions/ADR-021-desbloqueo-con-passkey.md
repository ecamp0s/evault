# eVault — Desbloquear la vault con un passkey

Fecha de decisión: 2026-09-10 (al planificar la Iteración 16)
Fecha de registro: 2026-09-10
Estado: Aprobada
Depende de: ADR-001 (zero-knowledge), ADR-007 (token de sesión en memoria), ADR-008 (arquitectura de claves), ADR-010 (clave de recuperación), ADR-014 (cambio de correo electrónico), ADR-019 (la vault sin red)

## 1) Contexto

Desbloquear la vault cuesta hoy escribir la contraseña maestra entera, y **la
contraseña maestra de un gestor de contraseñas es larga a propósito**. En el escritorio
eso se paga una vez al día; en el móvil se paga cada vez, porque `ADR-007` decidió que
el token vive solo en memoria y `ADR-019` no cambió esa parte: **recargar la aplicación
instalada es un bloqueo**, y una PWA en iOS se recarga sola con más frecuencia de la que
nadie querría.

El resultado medible es el de la Iteración 14: la vault se instala en el móvil y se lee
sin red, y aun así consultarla arranca tecleando. Y el resultado no medible es peor, y
es el que motiva este documento: **una contraseña maestra que se teclea cuarenta veces
al día en una pantalla táctil acaba siendo una contraseña maestra más corta.** El coste
de la fricción no lo paga la comodidad, lo paga la entropía.

WebAuthn tiene desde hace dos años la pieza que faltaba, y no es la autenticación: es la
extensión **PRF**. Un autenticador con PRF, tras verificar al usuario —Face ID, Touch ID,
Windows Hello—, devuelve **32 bytes deterministas** para un par credencial-*salt* dado.
Los mismos bytes cada vez, imposibles de obtener sin el autenticador y sin la
verificación biométrica, y que nunca salen de él.

Eso no es un mecanismo de inicio de sesión. **Es una función de derivación de claves con
verificación biométrica delante**, y es exactamente la forma del secreto que `ADR-008`
sabe usar: algo de alta entropía que **envuelve** la clave de vault.

### Lo que ya estaba preparado sin que fuera a propósito

`ADR-008` decidió que la contraseña maestra no cifra los items: deriva una clave maestra
cuyo único trabajo es **envolver** una clave de vault aleatoria, y es esa la que cifra.
`ADR-010` explotó esa estructura para la clave de recuperación —un segundo envoltorio de
la misma `VK`, sin duplicar nada— y dejó escrito que era «literalmente el mismo
movimiento que `ADR-008` previó para las vaults compartidas».

Este documento hace ese movimiento por **tercera** vez. No hay nada que inventar en la
capa criptográfica: hay que elegir de qué secreto se deriva la envoltura, y responder
las mismas seis preguntas que `ADR-010` respondió en su día.

### Lo que se midió antes de escribir esto

- **PRF funciona en Safari 18+ con passkeys de iCloud Keychain**, que es el caso de uso
  real: el iPhone donde hoy se teclea la maestra. **iOS no pasa datos de extensión a
  autenticadores externos**, de modo que una llave física conectada al iPhone no sirve.
  Eso acota el alcance y se acepta: quien tiene esa llave sigue teniendo la maestra.
- **El autenticador virtual de CDP acepta `hasPrf` y `hasHmacSecret`**, así que el ciclo
  completo se puede verificar en un Chromium de verdad desde `scripts/browser/cdp.mjs`,
  que ya habla el protocolo crudo sin dependencias. El iPhone sigue siendo manual, como
  el móvil de `verify-auto-lock`.
- **`HKDF` está en `crypto.subtle` de forma nativa**, comprobado por `ADR-010` §2.2 y en
  uso desde entonces en `deriveRecoveryKeys`. Este ADR no añade ninguna primitiva nueva.
- **Desde Chrome 122 y Firefox 150 una extensión puede llamar a WebAuthn indicando un
  `rpId` que esté en sus `host_permissions`**. No decide nada aquí, y se anota porque
  decide el alcance del ADR que viene: la extensión prevista podría re-derivar la clave
  con un toque biométrico en vez de custodiarla, que es justo lo que Manifest V3 le
  impide hacer.

## 2) Opciones evaluadas

### 2.1) Qué envuelve el passkey

#### Opción A (elegida): un tercer envoltorio de la misma clave de vault

El PRF deriva una clave que envuelve `VK`, exactamente igual que la clave maestra y que
la clave de recuperación.

- **No duplica ningún secreto.** La vault sigue teniendo una sola clave; lo que hay son
  tres formas de llegar a ella.
- **Rotar la contraseña maestra no lo toca**, porque `VK` no cambia. Es la misma
  propiedad que `ADR-010` §3 documentó para la clave de recuperación, con el mismo filo
  incómodo, y se hereda entera.
- **Revocar es borrar una fila.** No hay que recifrar nada, ni tocar los items, ni
  invalidar sesiones.

#### Opción B (descartada): que el passkey guarde la contraseña maestra

Cifrar la contraseña maestra con el PRF y, al desbloquear, descifrarla y seguir el
camino normal.

Descartada por dos cosas. **Guarda un secreto que hoy no se guarda en ninguna parte**:
`ADR-008` y `KEYS.md` afirman que la contraseña maestra «está en tu cabeza y no se
guarda en ningún sitio», y esa frase dejaría de ser cierta el día que se implementara.
Y **no ahorra el trabajo**: seguiría habiendo que pagar los 600.000 PBKDF2 en cada
desbloqueo, cuando el envoltorio directo de `VK` es una operación instantánea.

#### Opción C (descartada): que el passkey sustituya a la contraseña maestra

Que activar el passkey retire la maestra.

Descartada sin mucho debate, y conviene decir por qué se llegó a plantear: es lo que
haría un producto que optimizara la comodidad. Aquí no vale porque **un passkey se
pierde con el dispositivo y con la cuenta que lo sincroniza**, y quedarse sin maestra
convierte perder el teléfono en perder la vault. La maestra es el camino principal y el
passkey es un atajo revocable, igual que la clave de recuperación.

### 2.2) De qué se deriva la envoltura, y de qué el hash de autenticación

Mismo problema que `ADR-010` §2.2, misma respuesta y por el mismo motivo: el secreto
tiene que hacer **dos cosas distintas** —abrir un envoltorio y demostrarle al servidor
quién eres—, y si las dos salieran del mismo material sin separación, lo que se manda al
servidor comprometería lo que abre la vault.

**Se elige HKDF-SHA256 con dos etiquetas de dominio**, exactamente como con la clave de
recuperación. No se estira con PBKDF2, por el mismo argumento que allí: el PRF son 32
bytes producidos por un autenticador, no una contraseña humana. No hay diccionario que
probar y las iteraciones no comprarían nada.

### 2.3) Cuál es el *salt* del HKDF, y por qué no puede ser otra cosa

Esta es la pregunta que parecía de estilo y resultó estar decidida por una restricción
dura.

La opción atractiva era un *salt* aleatorio guardado junto al envoltorio, porque
**evitaría que cambiar el correo invalide el passkey**, que es la asimetría más
malinterpretada del proyecto (`KEYS.md`, `ADR-014`). Añadir un modo de fallo conocido
teniendo la alternativa delante pide justificarse.

No se puede, y el motivo es de orden de operaciones: **el hash de autenticación se
deriva ANTES de tener token**, porque es lo que se cambia por él. Un *salt* que viva en
el servidor habría que pedirlo, y solo hay dos formas de pedirlo:

- **Indexado por correo, en un endpoint público.** Eso es un oráculo de enumeración de
  cuentas: preguntar por un correo y recibir un *salt* o un 404 dice quién tiene cuenta.
  Todo el proyecto está construido para que eso no exista —`ADR-010` §4 lo escribe como
  lineamiento y sus tests comparan las dos respuestas entre sí.
- **Guardado en el dispositivo.** Mata el caso que da sentido a guardar el envoltorio en
  el servidor: desbloquear desde un segundo dispositivo donde el passkey ya está
  sincronizado pero nunca se dio de alta.

Queda una sola cosa que está en el dispositivo antes de autenticarse, que no hay que
pedirle a nadie y que ya es el *salt* de todo lo demás: **el correo normalizado**. Se
elige por eso y no por simetría, y la simetría es una consecuencia agradable, no el
argumento.

**Se asume por tanto que cambiar el correo invalida el passkey**, con la misma forma que
invalida la clave de recuperación, y `ADR-014` gana un paso: dar de baja los passkeys y
decirlo donde se cambia.

### 2.4) Cómo se autentica quien desbloquea con passkey

El problema es el de `ADR-010` §2.3 otra vez: el hash de autenticación de `ADR-008` se
deriva de la contraseña maestra, que aquí no se teclea.

#### Opción A (elegida): un endpoint propio que recibe un hash, y ninguna verificación WebAuthn en el servidor

`POST /api/auth/passkey` recibe correo y `PAH`, y devuelve un token de sesión y los
envoltorios. **El servidor no verifica ninguna firma, no genera ningún *challenge* y no
sabe que esto es WebAuthn**: para él es un segundo hash de autenticación, del mismo
orden que el de recuperación.

Esto es lo que más hay que mirar de frente del documento, porque suena a atajo. No lo
es, y el argumento es el mismo que `unlock.ts` ya escribe para el desbloqueo sin red:

> Por `ADR-008` el hash de autenticación solo compra un token, y un token solo trae
> *ciphertext*. El servidor nunca fue lo que se interponía entre una contraseña
> equivocada y el contenido — el envoltorio sí.

Verificar la *assertion* en el servidor no añadiría nada que `PAH` no dé ya. **El PRF
solo se produce tras la verificación de usuario en el autenticador**, así que poseerlo
*es* la prueba de que la persona estuvo delante, exactamente como poseer `RK` es la
prueba en `ADR-010`. Y quien consiguiera un token sin el PRF se llevaría bytes opacos:
sin `PWK` no se abre el envoltorio, y `PWK` no está en el servidor.

Lo que se ahorra a cambio es grande y encaja con `ADR-005`: **ninguna librería WebAuthn
en el servidor**. Nada de CBOR, COSE, cadenas de atestación ni almacenamiento de claves
públicas en una API que hoy solo guarda blobs y hashes. `ADR-008` ya había puesto como
criterio no cargar criptografía de terceros en el origen que custodia la clave; esto
extiende el mismo criterio al lado del servidor, donde además cada dependencia es una
cosa más que quien se autoaloja tiene que mantener.

#### Opción B (descartada): WebAuthn completo, con *challenge* y verificación de firma

El servidor emite un *challenge*, la credencial lo firma y el servidor verifica contra
la clave pública que guardó al registrarla.

Es el diseño de manual, y estaría justificado si WebAuthn fuera aquí el mecanismo de
autenticación. **No lo es**: es el mecanismo de derivación. Con la Opción A, la
verificación biométrica sigue existiendo y sigue siendo obligatoria —lo impone
`userVerification: 'required'`—; lo que no existe es una segunda comprobación en el
servidor de algo que el servidor no necesita saber.

Descartada, pero con una condición escrita en §6: **si algún día el token pasa a abrir
algo que no sea *ciphertext* opaco, este argumento se cae y hay que rehacerlo**.

#### Opción C (descartada): reutilizar `POST /api/auth/login`

Aceptar en el mismo endpoint un hash de contraseña o uno de passkey. Descartada por lo
mismo que la descartó `ADR-010`: convierte el endpoint más sensible del producto en uno
con dos modos, y un fallo de encaminamiento entre ellos sería un fallo de
autenticación.

### 2.5) Cuántos passkeys por cuenta

#### Opción A (elegida): varios, con tabla propia

- **Uno solo se queda corto en la iteración siguiente, no en un futuro difuso.** Un
  passkey de iCloud Keychain cubre iPhone, iPad y Mac, y no cubre Chrome ni Firefox en
  Windows, que es donde se ha pedido la extensión. Con una sola credencial, activarla en
  el portátil apagaría el móvil.
- **Es el mismo movimiento de `ADR-008` una vez más**: la misma clave envuelta una vez
  por cada quien tenga que abrirla.
- **Revocar uno no toca a los demás**, que es lo que hace utilizable «he perdido el
  portátil» sin convertirlo en «vuelve a configurarlo todo».

#### Opción B (descartada): uno solo, con columnas en `vault_members` y `users`

Es el molde exacto de `ADR-010` y por eso se evaluó en serio: cero invención, y el rigor
proporcionado que `ADR-018` pide para una instancia personal.

Descartada porque el límite **no se descubre leyendo, se descubre perdiendo el acceso
del móvil al activarlo en el portátil**, y porque migrar de columnas a tabla después
significa tocar el desbloqueo cuando ya funciona. El coste de hacerlo bien ahora es una
migración; el de hacerlo después es una migración más una reescritura.

### 2.6) Dónde vive el envoltorio: en el servidor o en el dispositivo

#### Opción A (elegida): en el servidor, junto a los demás envoltorios

- **Un passkey sincronizado abre desde cualquier dispositivo donde ya esté**, sin darlo
  de alta otra vez. Es lo que convierte esto en una funcionalidad y no en una
  preferencia por navegador.
- **El servidor no aprende nada**: un envoltorio es un blob, igual que `wrapped_key` y
  que `recovery_wrapped_key`. Lo único que gana es saber cuántos passkeys tiene una
  cuenta, que es metadato del mismo orden que saber que tiene clave de recuperación.

#### Opción B (descartada): en `IndexedDB`, como el caché de `ADR-019`

Más conservador —perder la cuenta de iCloud no daría acceso a nada— y descartado porque
convierte el passkey en una preferencia por navegador, que es exactamente el error que
`ADR-019` cometió al llamar «dispositivo» a un contenedor de almacenamiento y que el
#546 está abierto para corregir. Repetirlo a sabiendas, en el mecanismo que abre la
vault, sería peor que haberlo hecho sin saberlo.

**Pero el envoltorio sí se copia al caché del dispositivo cuando el caché está
activado**, y eso no es la Opción B: es que desbloquear sin red necesita el envoltorio
aquí, igual que ya necesita el ordinario.

## 3) Decisión final

Se adoptan las opciones **A de 2.1**, HKDF con dos etiquetas de **2.2**, el correo
normalizado como *salt* de **2.3**, **A de 2.4**, **A de 2.5** y **A de 2.6**.

| Elemento | Definición |
|---|---|
| Qué abre el passkey | La misma `VK`, por un tercer envoltorio |
| Material de partida | Salida de la extensión PRF de WebAuthn, 32 bytes |
| *Salt* del PRF | Constante de dominio, `"evault-passkey-prf-v1"`, pública y fija |
| Clave de envoltura `PWK` | `HKDF-SHA256(clave = PRF, salt = correo normalizado, info = "evault-passkey-wrap-v1", 256 bits)` |
| Hash de autenticación `PAH` | `HKDF-SHA256(clave = PRF, salt = correo normalizado, info = "evault-passkey-auth-v1", 256 bits)`, en base64 |
| Envoltorio | `AES-256-GCM(clave = PWK, iv = 96 bits aleatorios)` sobre `VK`, en base64 |
| Verificación de usuario | `userVerification: 'required'`, **siempre y sin excepción** |
| Credencial descubrible | `residentKey: 'required'`, para poder desbloquear en un dispositivo donde nunca se dio de alta |
| Cuántos por cuenta | **Varios**, cada uno con su etiqueta y su envoltorio |
| Convive con la maestra | **Sí, y la maestra es el camino principal.** El passkey nunca la sustituye |
| Verificación WebAuthn en el servidor | **Ninguna.** El servidor recibe un hash, como en `ADR-010` |
| `version` del esquema criptográfico | **Sigue valiendo 2.** No cambia |
| `version` del formato `.evault` | **Sigue valiendo 1.** No cambia |
| Rotar la contraseña maestra | **No lo invalida.** `VK` no cambia |
| Cambiar el correo | **Sí lo invalida**, y `ADR-014` gana el paso de darlos de baja |

**El PRF no se persiste nunca**, ni él ni `PWK` ni `PAH`: viven lo que dura la operación
que los produjo. Es el mismo lineamiento que `ADR-010` §4 impuso sobre `RK`, con el
mismo test detrás.

### El flujo completo, de principio a fin

**Dar de alta.** Con la vault desbloqueada —es decir, con `VK` en memoria—: se crea la
credencial con `prf: { eval: ... }`, se obtiene el PRF, se derivan `PWK` y `PAH`, se
envuelve `VK` con `PWK`, y se mandan al servidor el `credential_id`, la etiqueta, el
envoltorio y `PAH`.

**Desbloquear.** En `/unlock`, con el correo que el dispositivo recuerda: se pide la
*assertion* con verificación de usuario, sale el PRF, se derivan `PWK` y `PAH`, se manda
`PAH` con el correo, vuelven el token y el envoltorio, y `PWK` lo abre. `VK` a memoria.

**Desbloquear sin red.** Lo mismo **sin el paso del servidor**: el envoltorio ya está en
el caché de este dispositivo y `PAH` no hace falta, porque no hay token que pedir.
`unlockVaultFromCache` ya demuestra que eso es correcto y no una relajación.

**Revocar.** Se borra la fila. La credencial puede seguir existiendo en el llavero del
usuario y deja de abrir nada, porque su envoltorio ya no está.

### Dónde vive cada cosa

| Dato | Dónde | Nulable |
|---|---|---|
| `credential_id`, etiqueta, `PAH` | Tabla `passkeys` | No |
| Envoltorio y su IV | Tabla `passkeys`, junto a `vault_id` | No |
| El PRF, `PWK`, `PAH` en el cliente | En ninguna parte. Viven lo que dura la operación | — |

**El envoltorio va en `passkeys` y no en `vault_members`**, que es donde `ADR-010` puso
el suyo, y la diferencia tiene motivo: allí hay exactamente uno por miembro y aquí hay
uno por credencial, que es una cardinalidad que `vault_members` no puede expresar sin
una columna por passkey.

**Hoy eso significa una fila por credencial, porque hay exactamente una vault.** Cuando
lleguen las compartidas habrá una fila por credencial y vault, con `PAH` repetido, y esa
es la señal de que la tabla hay que partir en dos —identidad de la credencial por un
lado, envoltorios por otro—. Se escribe aquí para que ese día se reconozca como lo que
es y no como un descubrimiento. Está en §6.

## 4) Lineamientos técnicos resultantes

- **`userVerification: 'required'` no es configurable y no tiene modo degradado.** Es lo
  único que sostiene el argumento de 2.4: sin verificación de usuario, poseer el PRF deja
  de probar que la persona estuvo delante y el endpoint pasa a aceptar un hash que
  cualquier página del dispositivo podría haber obtenido. Va con test.
- **Un test que falle si `PWK` y `PAH` se derivan sin separación de dominio.** De la
  misma familia que el de la semilla TOTP en el export y el del aviso de la clave de
  recuperación: la promesa se cubre con un test que se rompe cuando deja de ser cierta.
  Y se escribe comparando los dos valores entre sí, no contra una constante grabada.
- **El endpoint de desbloqueo no puede distinguir un correo inexistente de un hash
  incorrecto.** Ni en el cuerpo, ni en el estado, ni en el tiempo: se verifica siempre
  contra un hash, también cuando el usuario no existe. Los tests comparan las dos
  respuestas entre sí, que es el patrón que el proyecto ya usa contra la enumeración.
- **El `credential_id` no viaja al desbloquear.** El servidor busca por correo y `PAH`.
  Mandarlo diría qué credenciales tiene una cuenta a quien solo sabe el correo, y no
  compra nada: el `PAH` ya identifica la fila.
- **Limitador propio**, con su test del 429. Perfil distinto del login y de la
  recuperación: un passkey se usa muchas veces al día y no se teclea, así que ni el
  límite del login ni el de recuperación sirven tal cual.
- **Alta y revocación son transaccionales.** Escribir el envoltorio sin `PAH`, o al
  revés, deja un passkey que no abre y eso no se descubre hasta el día en que hace
  falta. Es el modo de fallo silencioso de `ADR-010` §4 y se prueba igual: forzando el
  fallo entre las dos escrituras.
- **La detección de soporte se hace preguntando, no por *user agent*.** Un navegador sin
  PRF tiene que ver una pantalla que explica qué le falta, no un botón que no responde.
  Y el soporte se comprueba en la salida real de la extensión: `getClientExtensionResults()`
  puede decir que sí y no traer bytes, que es un caso documentado en las herramientas de
  Apple.
- **El envoltorio entra en el caché de `ADR-019` con los demás.** Si no, el passkey
  funciona con red y no sin ella, que es la peor combinación posible: el sitio donde más
  falta hace desbloquear rápido es el móvil, y el móvil es el que se queda sin red.
- **Se dice dónde se hace, no en una página de ayuda.** Que rotar la maestra no revoca
  los passkeys, y que cambiar el correo sí los revoca, se leen en la pantalla donde se
  rota y en la pantalla donde se cambia. Es la regla que `ADR-010` §5 impuso para la
  clave de recuperación y que `KEYS.md` recoge como asimetría.
- **`KEYS.md` pasa de cuatro secretos a cinco.** Es un documento de consulta y la primera
  tabla es lo que la gente lee; un secreto nuevo que no aparezca ahí es un secreto que
  nadie sabe que tiene.

## 5) Consecuencias asumidas

1. **Hay una tercera puerta a la vault, y es la primera que no es un secreto guardado
   sino un aparato que se lleva encima.** Quien tenga el iPhone y pueda pasar su Face ID
   abre la vault sin saber la contraseña maestra. Se acepta con dos condiciones que ya
   están en la decisión: la verificación de usuario es obligatoria, y revocar es
   inmediato y no requiere rotar nada.
2. **El servidor aprende cuántos passkeys tiene una cuenta y cómo se llaman.** Las
   etiquetas las escribe el usuario y son metadato en claro. Quien ponga «iPhone de
   trabajo» está diciéndoselo al servidor, y la pantalla no debe fingir lo contrario.
3. **Perder la cuenta que sincroniza los passkeys los pierde todos a la vez.** Un llavero
   de iCloud comprometido es tan grave como el dispositivo, y por eso la maestra sigue
   siendo el camino principal y la clave de recuperación sigue existiendo.
4. **Cambiar el correo invalida los passkeys.** Es el precio de 2.3 y no se disimula: el
   flujo de `ADR-014` tiene que darlos de baja y decirlo antes, no después.
5. **El servidor no verifica WebAuthn, y eso hay que poder defenderlo en voz alta.** Un
   revisor que lea el endpoint verá un hash donde esperaba una firma. El argumento está
   en 2.4 y depende de una premisa concreta —el token solo trae *ciphertext*—, que §6
   convierte en trigger.
6. **Una funcionalidad que no todos los navegadores tienen.** Firefox de escritorio y
   cualquier combinación sin autenticador con PRF verán una explicación en vez de un
   botón. Es aceptable porque la maestra sigue ahí, y es la primera vez que el proyecto
   entrega algo que depende del navegador.

## 6) Triggers de reevaluación

Reevaluar si se cumple uno o más:

1. **El token pasa a abrir algo que no sea *ciphertext* opaco.** Es la premisa de 2.4. Si
   una sesión llega a poder leer o deducir contenido, la ausencia de verificación
   WebAuthn en el servidor deja de estar justificada y hay que rehacer ese apartado, no
   heredarlo.
2. **Llegan las vaults compartidas.** Entonces `passkeys` tendrá `PAH` repetido por vault
   y hay que partirla en dos tablas, que es lo anunciado en §3.
3. **Aparece la extensión de navegador.** Si re-deriva la clave con este mismo mecanismo,
   el *salt* del PRF y el `rpId` pasan a ser contrato entre dos clientes y no detalle de
   uno.
4. **Apple abre el PRF a autenticadores externos en iOS**, o deja de soportarlo. Lo
   primero amplía el alcance; lo segundo obliga a decir qué pasa con los passkeys ya
   dados de alta.
5. **Alguien activa un passkey y no vuelve a usar la contraseña maestra en meses.** Es la
   señal de que la maestra se está olvidando de verdad, y entonces la pregunta no es
   sobre el passkey sino sobre si la recuperación está probada.

## 7) Impacto en APIs y contratos

**Hay impacto, y en los dos lados.**

En el cliente: `crypto.ts` gana las dos derivaciones y el envoltorio, sin primitivas
nuevas. **`ItemContent` no cambia**, y merece decirse: esto no toca el blob, así que no
hay ningún campo que nombrar, ninguna migración de contenido y ninguna versión que
subir. El caché de `ADR-019` gana un campo junto al `wrappedKey` que ya guarda.

En el servidor:

| Contrato | Cambio |
|---|---|
| `passkeys` | **Tabla nueva**: `user_id`, `vault_id`, `credential_id`, etiqueta, `auth_hash`, envoltorio e IV, fechas |
| `POST /api/auth/passkey` | **Nuevo y público**, con limitador propio. Devuelve token y envoltorios |
| Alta y revocación | **Nuevos**, autenticados, bajo el prefijo de la cuenta |
| `POST /api/auth/login` | **Sin cambios.** No aprende un segundo modo |
| `PUT /api/auth/master-password` | **Sin cambios funcionales.** Gana el aviso de que no revoca passkeys |
| `PUT /api/auth/email` | **Da de baja los passkeys**, en la misma transacción que reescribe lo demás |
| `GET /api/vaults/{vault}/items` | **Sin cambios** |
| `version` del blob y del `.evault` | **Ninguno de los dos sube** |

### La copia de seguridad

**Hay que mirarla y no darla por buena.** `BackupCommand` vuelca cada tabla con
`DB::table($table)->get()`, pero la lista de tablas es explícita: `BackupContents`
decide qué entra. Una tabla nueva **no entra sola**, y un passkey que no viaje en la
copia deja una restauración en la que la vault se abre con la maestra y no con la cara
—que es un fallo silencioso del tipo que este proyecto ya ha pagado—. Entra en la copia,
y se comprueba restaurando en vez de leyendo esta frase.

`personal_access_tokens` sigue fuera por lo que `BackupContents` ya escribe: una sesión
viva no es dato que restaurar.

### El estado de los ADR anteriores

- **`ADR-007` no queda superseded.** El token sigue sin persistirse y recargar sigue
  bloqueando la vault. Lo que cambia es lo que cuesta desbloquearla después.
- **`ADR-008` no queda superseded.** Este documento es su estructura aplicada por tercera
  vez, no una corrección.
- **`ADR-010` no queda superseded**, y el passkey no la sustituye: la clave de
  recuperación cubre «he olvidado la maestra» y el passkey cubre «no quiero teclearla
  cuarenta veces al día». Son problemas distintos y las dos siguen haciendo falta.
- **`ADR-014` no queda superseded, pero gana trabajo**: su flujo tiene que dar de baja
  los passkeys y avisarlo. Se hace en la iteración que implementa esto, no después.
- **`ADR-001` no se toca.** El envoltorio es un blob más y el servidor sigue sin poder
  leer nada.
