# eVault — La extensión en Firefox

Fecha de decisión: 2026-10-05 (Iteración 20, #751, con las medidas del #748, el #749 y el #750 delante)
Fecha de registro: 2026-10-05
Estado: Aprobada
Depende de: ADR-001 (zero-knowledge), ADR-007 (token de sesión en memoria), ADR-015 (acceso desde fuera de la red local), ADR-021 (desbloqueo con passkey), ADR-023 (la extensión de navegador)

## 1) Contexto

`ADR-023` decidió la extensión **solo para Chrome**, y dejó Firefox como su disparador 3
con tres cosas por resolver (§5.4): si una extensión de Firefox obtiene el PRF del
passkey, dónde se custodia la clave sin documentos *offscreen*, y cómo se instala si
Mozilla exige firmarla. Quien la va a usar tiene **Firefox en Windows**, con Windows
Hello.

**Este documento no se escribió antes de medir**, y no es una formalidad: una frase sin
medir ya estuvo a punto de descartar Firefox una vez. `passkey.ts` y `ADR-021` §5.6
afirmaban que Firefox de escritorio no tiene PRF, y era falso (`ADR-023` §5.4).

### Lo que se midió antes de escribir esto

- **El PRF, desde una extensión de Firefox** (#716, Firefox 155 en Windows con Windows
  Hello real). El passkey que da de alta la web lo encuentra la extensión con el `rpId`
  de sus permisos, da el mismo PRF y abre el envoltorio que guardó la web. Se ejecutó el
  `unlock()` de la extensión de Chrome, sin copiarlo.
- **La custodia** (#748, Firefox 156 en Windows con Windows Hello real). Una página de
  fondo **persistente de Manifest V2** cargó el `custody/document.ts` y el
  `background.ts` reales a la vez, sin cambiarlos:
  - la `CryptoKey` **no extraíble** cruzó `BroadcastChannel` en los dos sentidos y
    descifró 2 de 2 entradas;
  - el token que guardaba se usó otra vez ocho minutos y medio después, con Windows
    bloqueado entre medias;
  - el bloqueo por inactividad olvidó la clave y revocó el token a los quince minutos
    exactos;
  - el portapapeles se escribió desde el popup y se vació a los treinta segundos con el
    popup cerrado;
  - rellenar funcionó en un sitio fuera de los permisos de host, solo con `activeTab`.

  Y salieron tres diferencias con Chrome: **el popup se cierra cuando aparece Windows
  Hello**, y el desbloqueo muere con él; **Firefox no informa nunca del estado `locked`**,
  ni por evento ni por consulta; y **el `window.close()` al bloquear no hace nada** en una
  página de fondo.
- **La firma** (#749). La firma *unlisted* de Mozilla tarda unos tres minutos:
  - el `.xpi` firmado trae los ficheros de la build **byte a byte**, más un `META-INF/`
    con la firma;
  - el `manifest.json` lo **reescribe Mozilla al firmar**, idéntico como JSON: solo
    escapa los caracteres no ASCII;
  - se queda instalado en el Firefox normal de Windows tras reiniciar;
  - **el servicio de actualizaciones de Mozilla no ofrece versiones *unlisted***, ni con
    una más nueva firmada por la misma cuenta.

  Pone dos condiciones al manifiesto: el nombre no puede llevar «Firefox» ni «Mozilla»,
  y hay que declarar `data_collection_permissions`.
- **El verificador** (#750, Firefox 157 sin cabeza y geckodriver). Un guion sin ninguna
  biblioteca hace el ciclo entero en unos cinco segundos: la web registra la cuenta y da
  de alta el passkey en el autenticador virtual con los helpers de `verify-passkey` sin
  cambiar una línea, y la extensión lo usa para desbloquear, guardar la clave en el fondo
  y descifrar. Con tres condiciones: la preferencia
  `security.webauth.webauthn_enable_softtoken`, que la extensión abra su propia página
  porque WebDriver no deja navegar a `moz-extension://`, y geckodriver con
  `--allow-system-access`. **El passkey de la pestaña de la web funciona desde otra
  pestaña**, que en Chromium pierde el PRF (#665).

## 2) Opciones evaluadas

### 2.1) Dónde vive la clave

#### Opción A (elegida): una página de fondo persistente de Manifest V2

**Es la custodia de Chrome sin cambiar una línea**, medida así en el #748. Firefox sigue
admitiendo Manifest V2 con `"persistent": true`, y esa página no se descarga: hace a la
vez lo que en Chrome hacen el documento *offscreen* —guardar la clave y limpiar el
portapapeles— y el service worker. `ADR-007` se traslada entero, igual que en Chrome:
solo memoria, clave no extraíble, y el token con la misma vida que la clave.

#### Opción B (descartada): Manifest V3 con su página de eventos

El fondo de Manifest V3 en Firefox es una página de eventos que se descarga cuando no
hace nada, y **una clave guardada en ella moriría con ella**. Es el mismo problema que el
service worker de Chrome, y Firefox no tiene documentos *offscreen* que lo resuelvan.
Además, el #716 ya encontró que en V3 Firefox no concede los permisos de host al
instalar. No se midió más, porque la opción A funciona y esta no tiene dónde guardar la
clave.

#### Opción C (descartada): `storage.session` o IndexedDB

Por los mismos motivos que en Chrome (`ADR-023` §2.2, opciones C y D): la primera solo
guarda JSON y obligaría a sacar la clave en bruto; la segunda la escribe en disco.

### 2.2) Dónde se desbloquea

#### Opción A (elegida): en una pestaña de la extensión

**El popup de Firefox se cierra cuando aparece Windows Hello**, y la petición de WebAuthn
muere con él: la primera vez del #748 no llegó al servidor ni una petición. Desde una
pestaña de la extensión, el mismo `unlock()` funcionó todas las veces. Así que, en
Firefox, el botón «Desbloquear» del popup abre una pestaña de la extensión, el
desbloqueo ocurre allí y la pestaña entrega la clave al fondo. **Todo lo demás —buscar,
copiar, rellenar, bloquear— sigue en el popup**, que pide la clave al fondo sin sacar
ningún diálogo.

#### Opción B (descartada por ahora): una ventana emergente de la extensión

Una ventana pequeña con `windows.create` sería más parecida al popup, pero **no está
medida**: no se sabe si sobrevive a Windows Hello. Si se mide y funciona, cambiar la
pestaña por la ventana es un detalle de la pantalla y no de esta decisión.

### 2.3) El bloqueo del sistema

#### Opción A (elegida): en Firefox no existe, y se asume

**Firefox no informa nunca de que el sistema está bloqueado.** Con Windows bloqueado de
13:41 a 13:45, el evento solo dio `idle` y la consulta cada cinco segundos siguió en
`idle`: bloquear se ve exactamente igual que dejar de tocar el teclado. En Firefox, la
extensión se bloquea **por inactividad a los quince minutos, a mano, y al cerrar el
navegador**, que se lleva la página de fondo y la clave con ella.

#### Opción B (descartada): tratar `idle` como bloqueo

Bloquearía la extensión tras un minuto sin tocar el teclado ni el ratón, aunque nadie
haya bloqueado Windows. **Serían dos relojes para una sola regla**, que es lo que
`systemLock.ts` ya rechaza en Chrome: la inactividad la mide el límite de quince minutos,
el mismo que la web. Y pediría Windows Hello mucho más a menudo que la web, sin que el
riesgo lo justifique: un equipo bloqueado no deja tocar el navegador a nadie.

### 2.4) Cómo se instala

Es el criterio 1 de `ADR-015`, el que no admite mitigación: **quien controla el código
que se ejecuta controla el cifrado en el cliente**. `ADR-023` §2.6 da como ventaja de la
extensión que no la sirve nadie.

#### Opción A (elegida): firmada por Mozilla como *unlisted*, con la cuenta de quien tiene la vault

Lo medido en el #749 contesta las tres preguntas que importan para ese criterio:

- **Mozilla ve el código y lo firma, pero no lo cambia**: los ficheros llegan byte a
  byte, y el manifiesto, idéntico como JSON.
- **Mozilla no lo sirve**: el `.xpi` firmado se descarga a la máquina que lo pidió y lo
  instala a mano quien tiene la vault.
- **Nadie lo actualiza**: el servicio de actualizaciones de Mozilla no ofrece versiones
  *unlisted*, y el manifiesto no lleva `update_url`.

**Lo que la firma sí añade es una cuenta que custodiar.** Quien tenga sus claves de la API
puede firmar cualquier código con el identificador de la extensión. Lo que no puede es
hacerlo llegar a un Firefox sin que alguien lo instale a mano, igual que quien pudiera
escribir en el repositorio no puede cambiar la extensión de Chrome sin que alguien la
reconstruya.

#### Opción B (descartada): cargarla como temporal

Desde `about:debugging`, sin firmar. **Desaparece cada vez que se cierra Firefox**, que
es una extensión que no se puede usar.

#### Opción C (descartada): Firefox Developer Edition o ESR con la comprobación de firma apagada

Obligaría a quien la usa a **cambiar de navegador**, y apagaría esa protección **para
todas las extensiones** de ese navegador y no solo para esta. Es cambiar una protección
general por una comodidad particular.

#### Opción D (descartada): publicarla en addons.mozilla.org

Publicada, **Mozilla la sirve y la actualiza**: cualquier versión nueva firmada llegaría
sola a los navegadores que la tienen. Es exactamente lo que el criterio 1 de `ADR-015`
no admite, y además publicaría una extensión que solo sirve para una instancia.

### 2.5) Qué ve Mozilla

**El código**, que ya es público en el repositorio. **Y el manifiesto con los nombres de
la instancia**, porque se fijan al construir (`ADR-023` §2.5) y van en los permisos de
host.

**Esos nombres no son secretos**: el de la tailnet ya está en Certificate Transparency
(`ADR-015` §2.4). Lo nuevo es que **Mozilla puede asociarlos a una extensión llamada
eVault**, que dice que esa máquina guarda contraseñas, y a la cuenta de quien la firma.
Se asume: firmar sin los nombres obligaría a pedir los hosts en tiempo de ejecución, que
`ADR-023` §2.5 ya descartó por el permiso alarmante que exige y porque no está medido que
WebAuthn acepte un host concedido así.

### 2.6) El identificador

**`evault@ecamp0s.github.io`**, con forma de correo, bajo un dominio que es de quien
tiene la vault. Queda atado a su cuenta de Mozilla desde el primer envío y no se puede
cambiar sin que la extensión pase a ser otra, así que no lo decide un PR.

### 2.7) Cómo se verifica

#### Opción A (elegida): un verificador para Firefox, además de las pruebas a mano

Con **Firefox del repositorio APT de Mozilla y geckodriver** como dependencias de
desarrollo, igual que hoy lo es Chromium. El #750 midió que cubriría con naturalidad lo
mismo que `verify-extension` en Chrome: el passkey de la web abre la vault, uno revocado
deja de abrirla, la custodia y el bloqueo por inactividad, cerrar las demás sesiones
desde la web, y buscar, copiar y bloquear sobre `popup.html` en una pestaña, que es
también como lo hace el de Chrome. Rellenar, con el permiso de host que ya usa la build
de verificación de Chrome (#673), queda por medir al construirlo.

Con tres condiciones medidas, que van en el guion y no en la extensión:

- la preferencia `security.webauth.webauthn_enable_softtoken`, sin la cual no funciona
  ningún alta;
- **la build de verificación abre su propia página al instalarse**, porque WebDriver de
  Firefox no deja navegar a `moz-extension://`; la build que se firma no lleva eso;
- geckodriver con `--allow-system-access`, que da acceso privilegiado a ese Firefox, y
  solo es aceptable porque es uno desechable que solo conduce el guion.

**Lo que no cubre** se prueba a mano con Windows Hello real, como en Chrome: el popup de
verdad, el desbloqueo con un autenticador de verdad y la instalación firmada.

#### Opción B (descartada): solo a mano

Sin dependencias nuevas, pero **cada cambio futuro de la extensión exigiría repetir a
mano en Firefox** lo que en Chrome repite un comando. Lo que no se comprueba con un
comando acaba sin comprobarse.

### 2.8) Una sola extensión

**Las dos builds salen del mismo `extension/src`.** Lo propio de cada navegador vive
detrás de una interfaz, como ya vive la custodia, y el navegador de destino se elige al
construir. Sin decir nada, la build sigue siendo la de Chrome, para que la de kastor no
cambie sin querer.

## 3) Decisión final

| Elemento | En Chrome (`ADR-023`) | En Firefox |
|---|---|---|
| Manifiesto | V3 | **V2**, con fondo persistente |
| Dónde vive la clave | Documento *offscreen* | **Página de fondo persistente**, el mismo código |
| Dónde se desbloquea | En el popup | **En una pestaña de la extensión**; lo demás, en el popup |
| Cómo se desbloquea | Solo con el passkey de la web | Igual |
| La contraseña maestra | No entra | Igual |
| Bloqueo por inactividad | 15 minutos, el límite de la web | Igual |
| Bloqueo del sistema | Con `idle` en estado `locked` | **No existe.** Se asume |
| Al bloquear | Revoca el token y cierra el documento | **Revoca el token**; la página de fondo no se cierra |
| Portapapeles | Se limpia a los 30 segundos desde el documento | Igual, desde la página de fondo |
| Rellenar | Solo con un gesto, `activeTab` y `scripting` | Igual |
| Escribir en la vault | Nunca | Igual |
| Instalación | Construida y cargada sin empaquetar | **Construida y firmada *unlisted*** con la cuenta de quien tiene la vault |
| Actualización | A mano | A mano: **Mozilla no ofrece versiones *unlisted*** |
| Identificador | — | **`evault@ecamp0s.github.io`** |
| Verificación | `verify-extension` y prueba a mano | **Un verificador para Firefox** y prueba a mano |
| La API | Sin cambios | Sin cambios, salvo que la lista de sesiones diga el navegador (#753) |

## 4) Lineamientos técnicos resultantes

- **El manifiesto de Firefox lo genera `manifest.ts`, como el de Chrome**, con test:
  - `manifest_version: 2` y `background` con `"persistent": true`;
  - `browser_specific_settings.gecko.id` `evault@ecamp0s.github.io`,
    `data_collection_permissions` `{ "required": ["none"] }` y la versión mínima de
    Firefox que se midió, la 156;
  - el nombre **eVault**, sin «Firefox» ni «Mozilla»;
  - **los permisos, y ninguno más**: `activeTab`, `clipboardWrite`, `scripting`,
    `storage` y los orígenes de la instancia. **Ni `offscreen` ni `idle`**, porque en
    Firefox no hacen nada: uno no existe y el otro no ve el bloqueo del sistema;
  - **sin `update_url`**, que es lo que mantiene la actualización a mano.
- **La custodia de Firefox es la de Chrome alojada en otro sitio.** El mismo `Keeper`, el
  mismo protocolo por `BroadcastChannel` y el mismo `Sweeper`. Lo único que no se trae es
  cerrar el documento al bloquear, que en una página de fondo no aplica.
- **El desbloqueo de Firefox abre una pestaña de la extensión** y la cierra al terminar.
  La pestaña hace lo mismo que hoy hace el popup en Chrome: `unlock()` y entregar la clave
  al fondo.
- **Un test falla si una API propia de un navegador aparece fuera de su módulo**, en el
  estilo de `oneImplementation.test.ts` (#752). Y que Firefox devuelva promesas en el
  espacio de nombres `chrome.*` en Manifest V2 **se comprueba, no se supone**: el #748
  rellenó, pero no anotó por cuál de las dos vías.
- **Cada firma lleva una versión nueva.** Mozilla no firma dos veces la misma versión.
- **Las credenciales de la API de Mozilla viven fuera del repositorio**, en
  `~/.config/evault/amo.env` con permisos 600, y solo se cargan en el entorno del comando
  que firma.
- **Antes de instalar un `.xpi` firmado, se compara con su build**: el manifiesto
  interpretado como JSON y el resto byte a byte, que es como el #749 comprobó que Mozilla
  no cambia nada.
- **El verificador de Firefox (#759) vive junto a `verify-extension`**, con su propia build de
  verificación como la de Chrome (`extension/dist-verify`), y Firefox y geckodriver van a
  `SETUP.md` como dependencias de desarrollo.

## 5) Consecuencias asumidas

1. **La extensión de Firefox depende de Manifest V2.** Mozilla ha dicho que lo mantiene,
   sin fecha de retirada. Si la pone, esta decisión hay que rehacerla, y está en §6.
2. **Bloquear Windows no bloquea la extensión de Firefox.** La clave sigue en memoria
   hasta los quince minutos sin usarla, hasta bloquearla a mano o hasta cerrar Firefox.
   Es la ventana que ya tiene una pestaña de la web desbloqueada, que tampoco se bloquea
   con el sistema.
3. **Desbloquear en Firefox abre una pestaña.** Es un paso más que en Chrome, una vez por
   sesión.
4. **Mozilla ve el código, la instancia y la cuenta** (§2.5). El código ya es público; lo
   nuevo es que Mozilla puede saber que esa máquina guarda contraseñas.
5. **Hay una cuenta de Mozilla que custodiar.** Sus claves firman lo que sea con el
   identificador de la extensión, aunque no pueden instalarlo en ningún sitio.
6. **Un cliente más tira del límite de desbloqueos con passkey**, cinco por hora y cuenta
   entre todos (`ADR-023` §5.5).
7. **El verificador de Firefox necesita un Firefox y un geckodriver instalados**, que es
   el tipo de dependencia que el #281 evitó en los demás verificadores, y arranca ese
   Firefox con acceso privilegiado.

## 6) Triggers de reevaluación

Reevaluar si se cumple uno o más:

1. **Mozilla anuncia la retirada de Manifest V2 o del fondo persistente.** La custodia se
   quedaría sin sitio, y habría que medir otra vez como en el #748.
2. **Firefox empieza a informar del estado `locked`.** Entonces el bloqueo del sistema se
   trae de Chrome sin más decisión.
3. **El popup de Firefox sobrevive a Windows Hello.** El desbloqueo volvería al popup, y
   la pestaña sobraría.
4. **Mozilla cambia algo más que la serialización del manifiesto al firmar**, o empieza a
   ofrecer actualizaciones de versiones *unlisted*. Las dos cosas tocan el criterio 1 de
   `ADR-015`, que es lo que hace aceptable la opción A de §2.4.
5. **Mozilla pide el código fuente para firmar.** La build actual no está minificada y no
   lo pidió; si cambia, hay que decidir qué se sube.
6. **Se quiere la extensión en otro navegador**: Edge, que es Chromium y probablemente
   sea la de Chrome, o Safari, que es otra decisión entera.

## 7) Impacto en APIs y contratos

| Contrato | Cambio |
|---|---|
| La API | **Sin cambios** para la extensión. La lista de sesiones aprende a decir desde qué navegador se abrió una sesión de la extensión (#753), sin user agent ni IP |
| `extension/` | **Dos destinos de compilación desde el mismo código**, con lo propio de cada navegador detrás de una interfaz |
| `PRF_SALT`, etiquetas del HKDF, `userVerification` | **Sin cambios.** El contrato de `ADR-021` §6.3 es el mismo en los tres clientes, porque sale del mismo código |
| Blob, `version` del esquema y del `.evault` | **Sin cambios** |

### Lo que este documento cambia de `ADR-023`, que no se toca

`ADR-023` es inmutable. Lo que se aparta de él **vale solo para Firefox**; en Chrome sigue
rigiendo entero:

- **§3, «Navegador: Chrome»**: ahora también Firefox, con las diferencias de §3 de este
  documento.
- **§2.2 y su opción A, el documento *offscreen***: en Firefox, la página de fondo
  persistente (§2.1).
- **§4, «Bloquear… al detectar el bloqueo del sistema con `chrome.idle`»**: en Firefox no
  existe (§2.3).
- **§4, la lista de permisos**: en Firefox, sin `offscreen` ni `idle`.
- **§2.6, «la extensión no la sirve nadie»**: en Firefox sigue sin servirla nadie, pero
  la firma Mozilla (§2.4).
- **§5.4 y su disparador 3**: contestados por este documento.

### El estado de los demás

- **`ADR-007`**: no se toca. Su regla se traslada a la página de fondo igual que se
  trasladó al documento *offscreen*.
- **`ADR-015`**: su criterio 1 se mantiene con la firma *unlisted* (§2.4), y se escribe
  aquí lo que Mozilla ve (§2.5).
- **`ADR-021`**: no se toca. El #716 y el #750 demuestran que el mismo passkey sirve
  también desde Firefox.
- **`ADR-001`**: no se toca. El servidor sigue sin poder leer nada, y Mozilla tampoco: ve
  el código, no la vault.
