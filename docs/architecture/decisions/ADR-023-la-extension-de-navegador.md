# eVault — La extensión de navegador

Fecha de decisión: 2026-09-11 (Iteración 18, con las medidas del #665 delante)
Fecha de registro: 2026-09-11
Estado: Aprobada
Depende de: ADR-001 (zero-knowledge), ADR-007 (token de sesión en memoria), ADR-008 (arquitectura de claves), ADR-015 (acceso desde fuera de la red local), ADR-016 (un solo origen), ADR-018 (qué se conserva tras un borrado), ADR-019 (la vault sin red), ADR-021 (desbloqueo con passkey), ADR-022 (reconciliar al importar)
Relacionado: ADR-003, que reservó `extension/` en el monorepo desde el principio

## 1) Contexto

La extensión la pidió quien tiene la vault el 3 de septiembre de 2026, junto con las
tarjetas. Las tarjetas entraron en la Iteración 15 y la extensión no, y **no por
prioridad sino porque no podía empezar**: Manifest V3 mata el service worker de fondo a
los treinta segundos de inactividad, y `ADR-007` decidió que la clave de la vault vive
solo en memoria. Una extensión sin sitio en memoria que sobreviva al service worker
tenía dos salidas, y las dos eran malas: pedir la contraseña maestra cada vez que se
abre, o guardar la clave en algún sitio que `ADR-007` prohíbe.

`ADR-021` cambió la forma de la pregunta. Con un passkey, **la extensión no tiene por qué
custodiar la clave: puede re-derivarla con un toque biométrico**. Lo que faltaba era
saber si eso es verdad fuera de la página que dio de alta el passkey, y eso lo midió el
#665 antes de escribir una línea de este documento.

Para qué sirve, en concreto: la vault tiene **669 entradas**, y hoy usar una desde
Chrome en el portátil es ir a la pestaña de eVault, buscar, copiar y volver. La extensión
lo acerca al sitio donde se usa la contraseña. Y hay un segundo motivo que no es de
comodidad: **512 de esas 660 contraseñas tienen algo que corregir**, y corregirlas es
entrar en cada servicio y cambiarla. Todo lo que abarate ese viaje abarata ese trabajo.

### Cinco ADR dejaron un disparador para este día

La Iteración 17 enseñó que un ADR aprobado y diferido es invisible por partida doble.
Este documento empieza por los cinco que se escribieron esperándolo, y los contesta uno a
uno en §7:

| ADR | Qué dejó pendiente |
|---|---|
| `ADR-007` §6.1 | Un cliente que no desbloquea con comodidad obliga a revisar el token en memoria |
| `ADR-008` §6.4 | El presupuesto de CPU de 600.000 iteraciones de PBKDF2 dentro de una extensión |
| `ADR-016` §6 | CORS, retirado, si un cliente habla con la API desde otro origen |
| `ADR-018` §6.4 | Las 12 horas del token se eligieron contra un cliente que recarga |
| `ADR-021` §6.3 | El *salt* del PRF y el `rpId` pasan a ser contrato entre dos clientes |

### Lo que se midió antes de escribir esto

En el #665, con una cuenta desechable sobre la instancia de desarrollo, y en dos sitios:
**Windows Hello real** con Chrome 152 en Windows, y el autenticador virtual de CDP con
Chromium 152 en Linux. La sonda reutilizaba `derivePasskeyKeys`, `openVaultKey` y
`PRF_SALT` de `web/src/lib/vault` y solo cambiaba el `rpId`, así que la prueba era que se
abriera el envoltorio: AES-GCM valida su etiqueta o falla.

- **El passkey que da de alta la SPA abre la vault desde una extensión.** Con Windows
  Hello, desde `chrome-extension://…` y con `rpId` igual al nombre de la instancia: la
  credencial aparece, da 32 bytes de PRF, `POST /api/auth/passkey` responde 200 y **el
  envoltorio que guardó la SPA se abre**. Es el mismo PRF, así que no hace falta un
  passkey por cliente.
- **El popup sobrevive al diálogo de Windows Hello.** Era la duda más práctica: el popup
  de una extensión se cierra al perder el foco, y el diálogo es una ventana del sistema.
  No lo cierra, y el envoltorio se abre igual desde el popup.
- **El passkey está atado a su `rpId`.** Chrome deja a la extensión pedir cualquier
  nombre de sus `host_permissions`, pero con otro nombre Windows no ofrece la clave de
  Windows Hello.
- **No hace falta CORS.** Las peticiones salen con `Origin: chrome-extension://<id>` y la
  respuesta se lee desde el script sin ninguna cabecera `Access-Control-*`.
- **`chrome.storage.session` sobrevive a la muerte del service worker, muere al cerrar
  el navegador y un content script no lo lee.** Pero **no admite una `CryptoKey`**: solo
  valores serializables a JSON.
- **Un documento *offscreen* sí la admite, y sobrevive**, medido al escribir este
  documento con la misma sonda y en Chromium. Una `CryptoKey` no extraíble
  cruza `BroadcastChannel` —que usa clonado estructurado, al contrario que
  `chrome.runtime.sendMessage`, que serializa a JSON— y sigue siendo no extraíble. Tras
  **150 segundos sin tocar nada**, el service worker había muerto y el documento seguía
  vivo con su hora de creación intacta: devolvió la clave, `exportKey` no pudo sacarla y
  descifró lo que se cifró antes.
- **El autenticador virtual no puede trasladar un passkey entre contextos**: al copiar
  una credencial con CDP se pierde el secreto del PRF, también entre dos pestañas de la
  misma SPA. Eso acota lo que el verificador de navegador puede demostrar, y está en §5.

## 2) Opciones evaluadas

### 2.1) Cómo se desbloquea

#### Opción A (elegida): con el passkey que ya existe, re-derivado

La extensión pide la aserción con el `rpId` de la instancia y el `PRF_SALT` de `ADR-021`,
deriva `PWK` y `PAH` con el mismo HKDF, cambia `PAH` por un token y el envoltorio, y abre
el envoltorio. **Es exactamente el desbloqueo de la SPA**, con el `rpId` como único
parámetro distinto, y el #665 demuestra que funciona con el passkey que la persona ya dio
de alta desde la web.

#### Opción B (descartada): un passkey propio de la extensión

La tabla de varios passkeys de `ADR-021` §2.5 lo admitiría sin tocar nada. Descartada
porque **la medida la hace innecesaria**: el mismo passkey funciona, y uno propio
añadiría un alta desde la extensión, una segunda credencial en el llavero y una segunda
fila que revocar, a cambio de nada.

#### Opción C (descartada): también con la contraseña maestra

Teclear la maestra en el popup y pagar los 600.000 PBKDF2 en la extensión. Serviría el
día que el passkey falle. Descartada porque **añade un segundo sitio donde se teclea la
maestra**, que hoy se teclea en uno —la web, que es también donde se da de alta el
passkey—, y porque la extensión no es un sustituto de la web sino un atajo hacia lo que
ya está en ella. Sin passkey, la extensión dice cómo darlo de alta y no ofrece otra
puerta.

La consecuencia es que `ADR-021` sigue siendo cierto sin matices: **la maestra es el
camino principal**, y se recorre en la web.

### 2.2) Dónde vive la clave mientras la extensión está desbloqueada

Es la pregunta que tuvo la extensión parada dos iteraciones, y ya no es de principio
sino de mecanismo: `ADR-007` sigue valiendo entero —solo memoria, clave no extraíble, y
el token con la misma vida que la clave— y lo que hay que decidir es **qué memoria**.

#### Opción A (elegida): un documento *offscreen* de la extensión

Una página de la extensión sin ventana, que Manifest V3 permite abrir y que no muere con
el service worker. La clave, **no extraíble**, y el token viven en su memoria; el popup
la recibe por `BroadcastChannel` cuando la necesita, con el clonado estructurado que
conserva la no extraibilidad. **Un Windows Hello por sesión**, y la sesión termina por
inactividad, al bloquear el sistema, a mano o al cerrar el navegador.

Es `ADR-007` trasladado sin rebajarlo: la página que custodia la clave deja de ser la
pestaña de la web y pasa a ser un documento de la extensión, y todo lo demás se mantiene.
Y el mismo documento resuelve un problema que salió al planificar: **limpiar el
portapapeles cuando el popup ya se ha cerrado**, que es lo normal y no lo raro.

#### Opción B (descartada): re-derivar en cada uso

No retener nada: cada vez que se abre el popup, Windows Hello y un desbloqueo. Es la
opción más pura y **choca con un número concreto**: `POST /api/auth/passkey` admite
**cinco por hora y cuenta** (`config/throttling.php`), y a la sexta apertura en una hora
respondería 429. Habría que relajar un limitador cuyo segundo trabajo es impedir que el
tiempo de respuesta diga cuántos passkeys tiene una cuenta (`ADR-021` §4), para comprar
una pureza que la Opción A ya da.

#### Opción C (descartada): `chrome.storage.session`

Medido en el #665: sobrevive al service worker, muere con el navegador y no llega a los
content scripts, que es casi lo que hace falta. **Pero solo guarda JSON**, así que la
clave tendría que guardarse en bruto y extraíble, legible por cualquier script de la
extensión. Es exactamente lo que `crypto.ts` evita importándola como no extraíble, y la
razón por la que `rewrap` tiene la firma que tiene.

#### Opción D (descartada): IndexedDB con una `CryptoKey` no extraíble

Admite la clave sin sacarla, y la escribe en disco. `ADR-007` §1 ya lo descartó con esas
mismas palabras: con el dispositivo en la mano se abriría la vault sin saber nada.

### 2.3) El token

Vive con la clave, en el mismo documento, y **muere con ella**: es la regla de `ADR-007`
de que dos secretos con la misma vida se razonan mejor que dos con vidas distintas. Al
bloquearse, la extensión además **lo revoca** con `POST /api/auth/logout`, en el mejor
esfuerzo: si el navegador se cierra de golpe no llega a hacerlo, y ese token queda
huérfano como los de la web.

**Las 12 horas de `ADR-018` §2.5 aguantan la reevaluación**, que era lo que pedía su
disparador. Se eligieron diciendo que no le quitan comodidad a nadie porque el token de
la web muere antes, al recargar, y eso sigue siendo verdad aquí: el de la extensión muere
a los quince minutos de inactividad. La caducidad en el servidor sigue siendo el tope
para los huérfanos y **sigue diferida**; este documento no la adelanta.

### 2.4) Qué puede hacer con una contraseña

#### Opción A (elegida): copiar, y rellenar solo con un gesto

Buscar y copiar, como en la web. Y **rellenar usuario y contraseña en la pestaña activa
cuando la persona lo pide** desde el popup o con un atajo. Con cuatro límites que son la
decisión y no detalles:

- **Solo en el marco principal.** Nunca en un iframe, que es por donde entran los
  ataques conocidos contra el autocompletado de los gestores.
- **Solo si el host de la pestaña coincide con el de la entrada**, con la misma
  normalización que `ADR-022` usa para la identidad. Una entrada de `accounts.example.com`
  no se rellena en `example.com.attacker.net`.
- **Nunca al cargar la página.** Rellenar sin un gesto es lo que convierte un formulario
  invisible en una forma de llevarse la contraseña.
- **Sin inyectar ninguna interfaz en la página.** El gesto ocurre en el popup o en un
  atajo, fuera de ella, así que la página no puede superponer nada encima: es el ataque
  de *clickjacking* contra los desplegables de autocompletado, y aquí no tiene dónde
  apoyarse.

#### Opción B (descartada): solo copiar

La superficie mínima, y defendible. Descartada porque la extensión existe para acortar
el camino hasta el formulario, y con los cuatro límites de arriba rellenar con un gesto
no abre ninguna vía que copiar y pegar no abra ya.

#### Opción C (descartada): autocompletar al cargar la página

Es lo que hacen los gestores comerciales y lo que más veces ha fallado en ellos. No se
plantea.

### 2.5) El `rpId`, y cómo sabe la extensión a qué instancia hablar

**El `rpId` es el nombre de la instancia configurada**, que es la misma regla que la web
aplica desde el #578: `location.hostname` allí, el nombre de la instancia aquí. Un
passkey dado de alta entrando por un nombre abre entrando por ese nombre, en los dos
clientes igual.

**La instancia se fija al construir la extensión**, y sus orígenes entran en
`host_permissions`. Es lo contrario de lo que la web hizo en el #296 —un `dist/` que
sirve desde cualquier nombre—, y el motivo es que las dos cosas no se distribuyen igual:
el `dist/` de la web lo sirve la instancia a quien llegue, y la extensión la construye
quien la instala, para su instancia. Pedir el origen en tiempo de ejecución obligaría a
declarar como opcionales todos los hosts `https://*/*`, que es un permiso alarmante
aunque nunca se conceda, y **no está medido que WebAuthn acepte un host concedido así**.
Los nombres no entran en el repositorio: la instancia de este proyecto responde a un
nombre de tailnet que no debe nombrar el proyecto (`ADR-015`).

### 2.6) Quién sirve el JavaScript

Es el criterio 1 de `ADR-015`, el que no admite mitigación: **quien controla el
JavaScript servido controla el cifrado en el cliente**. La web lo sirve kastor en cada
carga, y el service worker de `ADR-019` lo cachea. **La extensión no lo sirve nadie**:
se instala desde una construcción local del repositorio y su código no cambia hasta que
alguien la vuelve a construir.

Es la primera vez que un cliente de eVault cumple ese criterio mejor que la web: un
kastor comprometido podría servir una web que se quede la contraseña, y **no puede
cambiar el código de la extensión**. El precio es el contrario —actualizarla es
reconstruirla a mano— y está en §5.

### 2.7) Sin red

**Sin red, la extensión no se desbloquea, y lo dice.** No tiene caché del dispositivo:
el de `ADR-019` es por contenedor de almacenamiento, la extensión sería un contenedor
más, y lo que cuesta hacerlo bien —el opt-in, su pantalla, su borrado— no lo pide nada
de esta iteración. La web sigue abriendo sin red desde el mismo navegador.

### 2.8) Cómo comparte código con la web

**`lib/vault` una sola vez.** La extensión importa la criptografía de la web y no la
copia: dos copias de `crypto.ts` divergen, y la que se queda atrás cifra mal con
autoridad. `crypto.subtle` sigue apareciendo en un solo fichero del repositorio. El único
cambio que esto pide en la web es que el `rpId` de `passkey.ts` sea un parámetro, con
`location.hostname` como valor por defecto.

## 3) Decisión final

Se adoptan **A de 2.1**, **A de 2.2**, el token de **2.3**, **A de 2.4**, la instancia
fijada al construir de **2.5**, y sin red ni caché de **2.7**.

| Elemento | Definición |
|---|---|
| Navegador | **Chrome**, Manifest V3. Firefox queda fuera de esta decisión (§5) |
| Cómo se desbloquea | **Solo con el passkey**, el mismo que da de alta la web, re-derivado con el mecanismo de `ADR-021` |
| La contraseña maestra | **No entra en la extensión.** Se teclea en la web |
| Dónde vive la clave | En la memoria de un **documento *offscreen***, como `CryptoKey` **no extraíble** |
| Cómo llega al popup | Por `BroadcastChannel`, **nunca** por `chrome.runtime.sendMessage` |
| El token | Con la clave, en el mismo documento, con la misma vida. **Se revoca al bloquear** |
| Cuándo se bloquea | 15 minutos de inactividad, al bloquear el sistema, a mano y al cerrar el navegador |
| Qué hace con una contraseña | Copiar, y **rellenar solo con un gesto**, en el marco principal y en el host de la entrada |
| Escribir en la vault | **Nunca.** Es de solo lectura |
| `rpId` | El nombre de la instancia configurada |
| La instancia | **Fijada al construir**, en `host_permissions`. Fuera del repositorio |
| CORS | **Ninguno.** La API no cambia |
| Sin red | No se desbloquea, y lo dice |
| Criptografía | La de `web/src/lib/vault`, importada y no copiada |
| Blob, `version` del esquema y del `.evault` | **Nada cambia** |

## 4) Lineamientos técnicos resultantes

- **La clave nunca se vuelve extraíble.** Cruza de un contexto a otro por
  `BroadcastChannel`, que la clona sin sacarla. Un test que falle si alguna vía la
  serializa, y `chrome.runtime.sendMessage` no la transporta nunca: serializa a JSON, y
  obligaría a sacarla en bruto.
- **`userVerification: 'required'` sale del código compartido**, igual que el
  `PRF_SALT` y las etiquetas del HKDF. Son contrato entre dos clientes (`ADR-021` §6.3),
  y un contrato con dos copias es dos sitios donde romperse en silencio.
- **Bloquear borra la clave y el token del documento, revoca el token y cierra el
  documento.** Lo mismo al superar la inactividad, que es la de la web
  (`INACTIVITY_LIMIT_MS`), y al detectar el bloqueo del sistema con `chrome.idle`.
- **El portapapeles se limpia desde el documento *offscreen*** a los treinta segundos,
  como en la web, y se comprueba con el popup ya cerrado, que es el caso normal.
- **Rellenar no usa content scripts.** No hay ninguno declarado: el código entra en la
  página con `chrome.scripting` y `activeTab` en el momento del gesto, y en ningún otro.
  Así nada de la extensión se ejecuta en una página que nadie ha pedido rellenar.
- **Permisos, y ninguno más:** `offscreen`, `storage` —solo para la configuración y el
  correo recordado, que no son secretos—, `activeTab`, `scripting`, `idle` y
  `clipboardWrite`, más los orígenes de la instancia. Ni `<all_urls>` ni hosts opcionales.
- **Nunca escribe en la vault.** Una extensión que se actualiza a mano puede ir por
  detrás de la web, y un cliente viejo que reescribe una entrada es el que borra los
  campos que no conoce (`FOUNDATION.md` §2). Siendo de solo lectura, el desfase de
  versiones no puede destruir nada.
- **Sin red, lo dice**, con la misma distinción de `ADR-019` entre silencio y respuesta:
  solo `isNetwork` es «no hay red»; un 401 o un 429 son respuestas.
- **El verificador de navegador cubre la mitad que puede cubrir.** Con el autenticador
  virtual, el passkey tiene que darse de alta en el mismo contexto donde se usa, porque
  copiarlo pierde el PRF (#665). **Que el passkey de la web abra desde la extensión lo
  demuestra un autenticador real**, y así lo pide el criterio de la iteración.

## 5) Consecuencias asumidas

1. **Un documento con la clave dentro vive mientras dure la sesión del navegador.** Es
   la ventana que ya tiene la pestaña de la web desbloqueada, con el mismo límite de
   inactividad, más el bloqueo del sistema. Lo que no cubre es lo que tampoco cubre la
   web: quien controle el proceso del navegador mientras está desbloqueada.
2. **El documento se abre declarando que es para el portapapeles**, que es verdad y no
   es todo. Si Chrome empezara a cerrar estos documentos antes de tiempo, la extensión se
   bloquearía: **falla hacia el lado seguro**, que es pedir otra vez el Windows Hello.
3. **Actualizarla es reconstruirla.** La web se actualiza sola al desplegar; la
   extensión no, y puede ir por detrás. Es el precio de 2.6, y la solo lectura es lo que
   impide que cueste datos.
4. **Solo Chrome.** Firefox no tiene documentos *offscreen*: su fondo en Manifest V3 es
   una página de eventos que también se descarga, así que llevarla ahí necesita su propia
   decisión de custodia. Y en el #665 Firefox quedó sin medir.
5. **El límite de cinco desbloqueos con passkey por hora y cuenta se comparte** entre la
   web y la extensión, y entre todos los dispositivos. Con quince minutos de inactividad,
   un uso salteado puede acercarse a él. Se asume sin tocarlo, y se vigila: está en §6.
6. **Cada desbloqueo crea un token.** Se revoca al bloquear, pero un cierre de golpe deja
   uno huérfano, como en la web, hasta que la caducidad de `ADR-018` §2.5 exista.

## 6) Triggers de reevaluación

Reevaluar si se cumple uno o más:

1. **Chrome cierra los documentos *offscreen* por inactividad o por su motivo
   declarado.** La custodia de 2.2 dejaría de funcionar, aunque fallaría bloqueando.
2. **Aparece un 429 del desbloqueo con passkey en uso real.** Es la consecuencia 5
   materializándose, y entonces sí toca mirar el limitador, con el motivo de `ADR-021` §4
   delante.
3. **Se quiere la extensión en Firefox.** Necesita su propia respuesta a 2.2.
4. **La extensión necesita escribir**: crear o editar entradas. Entonces el desfase de
   versiones pasa a poder destruir datos, y la actualización manual deja de ser
   aceptable tal cual.
5. **El token pasa a abrir algo que no sea *ciphertext*.** Se hereda de `ADR-021` §6.1:
   la extensión se apoya en el mismo argumento para no verificar WebAuthn en el servidor.
6. **Se quiere la extensión sin red.** Es un caché más en otro contenedor, con todo lo
   que `ADR-019` pidió al primero.

## 7) Impacto en APIs y contratos

**La API no cambia**: ni un endpoint, ni una columna, ni una migración. La extensión usa
`POST /api/auth/passkey`, `GET /api/vaults/{vault}/items` y `POST /api/auth/logout`, que
ya existen, y el servidor no distingue sus peticiones de las de la web salvo por la
cabecera `Origin`, con la que no hace nada.

En el cliente:

| Contrato | Cambio |
|---|---|
| `extension/` | **Paquete nuevo**, en el directorio que `ADR-003` reservó |
| `web/src/lib/vault/passkey.ts` | El `rpId` pasa a ser un parámetro, con `location.hostname` por defecto |
| `PRF_SALT`, etiquetas del HKDF, `userVerification` | **Contrato entre dos clientes.** Se comparten importando, no copiando |
| `ItemContent` y `version` | **Sin cambios** |

### Los cinco disparadores, contestados

- **`ADR-007` §6.1 — no queda superseded.** Su regla se traslada sin rebajarse: solo
  memoria, clave no extraíble, y el token con la misma vida que la clave. Lo único que
  cambia es qué memoria: la de un documento de la extensión en vez de la de la pestaña.
- **`ADR-008` §6.4 — no aplica.** La extensión no deriva con PBKDF2, porque no admite la
  contraseña maestra (2.1). Si algún día la admite, ese disparador vuelve a estar vivo.
- **`ADR-016` §6 — CORS sigue retirado.** Medido: la extensión lee las respuestas sin
  ninguna cabecera CORS, porque `host_permissions` la exime. La pregunta de «qué origen
  se permite» no llega a hacerse.
- **`ADR-018` §6.4 — las 12 horas aguantan.** El token de la extensión muere antes, a los
  quince minutos de inactividad, y la caducidad del servidor sigue siendo el tope para
  los huérfanos. Sigue diferida.
- **`ADR-021` §6.3 — el contrato queda escrito.** El `PRF_SALT`, las dos etiquetas del
  HKDF, `userVerification: 'required'` y la regla del `rpId` son los mismos en los dos
  clientes porque salen del mismo código.

### El estado de los demás

- **`ADR-003`**: `extension/` deja de estar reservado y pasa a existir.
- **`ADR-015`**: su criterio 1 se cumple mejor en la extensión que en la web (2.6).
- **`ADR-019`**: no se toca; la extensión no tiene caché (2.7).
- **`ADR-021`**: no queda superseded. La extensión es su mecanismo aplicado desde otro
  contexto, y el #665 demuestra que el mismo passkey sirve.
- **`ADR-001`**: no se toca. El servidor sigue sin poder leer nada, y ahora tampoco
  puede cambiar el código de uno de sus clientes.
