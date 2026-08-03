# eVault — Clave de recuperación

Fecha de decisión: 2026-08-03 (al planificar la Iteración 4, issue #114)
Fecha de registro: 2026-08-03
Estado: Aprobada
Depende de: ADR-001 (zero-knowledge), ADR-008 (arquitectura de claves), ADR-007 (token solo en memoria)
Cumple: `ADR-001` §5.1, que dejó esta mitigación prometida sin decidir cómo

## 1) Contexto

`ADR-001` aceptó una consecuencia dura y la escribió sin adornos: si el usuario
pierde su contraseña maestra, sus datos son irrecuperables. No es un defecto del
producto, es lo que significa que el servidor no pueda leer nada. Pero en la misma
decisión quedó apuntada una mitigación:

> Sin recuperación de cuenta. Se mitigará con un mecanismo explícito de clave o
> código de recuperación **generado en el cliente**, no con un reset por email.

Han pasado tres iteraciones. El README lo anuncia en público como *planned*, y el
registro ya avisa de que no hay recuperación —con tests que fallan si el aviso
desaparece— pero no ofrece ninguna salida. Esta es la decisión que la ofrece.

**Es la primera vez que el proyecto amplía a propósito su superficie de ataque.**
Hasta hoy había exactamente un camino a la vault: la contraseña maestra. Este
documento abre un segundo, y eso hay que argumentarlo en vez de darlo por bueno
porque sea cómodo. Un mecanismo de recuperación mal diseñado no es una comodidad
con un fallo: es una puerta trasera con buena prensa.

`ADR-008` dejó el terreno preparado sin saberlo. Su decisión de que la clave
maestra no cifre los items, sino que **envuelva** una clave de vault aleatoria,
convierte la recuperación en un problema mucho más pequeño del que sería de otro
modo: no hay que recuperar la contraseña, basta con envolver la misma clave de
vault una segunda vez con otro secreto. Es literalmente el mismo movimiento que
aquel ADR previó para las vaults compartidas —«la misma clave se envuelve una vez
por miembro»—, aplicado a una sola persona con dos secretos.

Conviene leer con cuidado una frase de `ADR-008` que puede parecer que esto
contradice. Su consecuencia 6 dice que «sigue sin haber recuperación» y que «esta
decisión no la introduce ni la acerca». Era cierto y sigue siéndolo: describía el
alcance de aquel documento, no una prohibición. Quien introduce la recuperación es
este ADR, cumpliendo lo que `ADR-001` §5.1 había dejado apuntado desde la Iteración
1. Ningún ADR queda superseded, porque ninguna decisión anterior cambia: lo que había
era una promesa sin diseño, y lo que hay ahora es esa promesa diseñada.

Las seis preguntas abiertas al llegar aquí:

1. ¿Qué es la clave de recuperación y cuánta entropía tiene?
2. ¿Qué envuelve exactamente: la clave de vault, o la clave maestra?
3. ¿Cómo demuestra su identidad quien ha perdido la contraseña maestra, si el hash
   de autenticación se deriva justamente de ella?
4. ¿En qué estado queda el usuario después de recuperar?
5. ¿Se puede regenerar, y qué pasa con la anterior?
6. ¿Dónde vive lo que haya que guardar?

## 2) Opciones evaluadas

### 2.1) El mecanismo

#### Opción A (elegida): una clave aleatoria que envuelve la clave de vault

Se genera en el cliente un secreto aleatorio de alta entropía, la **clave de
recuperación**. Con ella se envuelve la misma clave de vault que ya envuelve la
clave maestra, y ese segundo envoltorio se guarda en el servidor como un blob más.
El usuario custodia la clave de recuperación fuera del dispositivo.

Tradeoffs:

- **Encaja en la arquitectura existente sin torcerla.** Es un envoltorio más de la
  misma `VK`, exactamente la pieza que `ADR-008` diseñó para poder repetirse.
- **No obliga a recifrar nada** al usarla, ni al generarla, ni al regenerarla.
- **El servidor sigue sin poder leer nada.** Custodia dos blobs opacos en vez de
  uno, y no tiene ninguna de las dos claves que los abren.
- Coste real: **el usuario pasa a custodiar dos secretos** en vez de uno, y el
  segundo no se memoriza, se guarda. La seguridad de su vault pasa a ser la del
  peor de los dos sitios donde estén.
- Coste real: **cualquiera que obtenga la clave de recuperación abre la vault**, sin
  contraseña maestra y sin segundo factor.

#### Opción B (descartada): reset por correo o escrow del operador

El mecanismo convencional: el servidor guarda algo que le permite devolver el acceso
tras verificar el correo.

- Ventaja: es lo que todo el mundo espera, y no exige que el usuario guarde nada.
- **Contradice `ADR-001` de forma directa y total.** Si el servidor puede devolver el
  acceso, el servidor puede tomarlo. Deja de ser zero-knowledge, y con ello el
  producto deja de ser lo que dice ser en su portada.
- `ADR-001` ya lo descartó por escrito al exigir que la mitigación fuera «generado en
  el cliente, no un reset por email». No se reevalúa aquí: se registra por qué sigue
  descartado.

#### Opción C (descartada): envolver la clave maestra en vez de la clave de vault

La clave de recuperación envuelve `MK`, y con `MK` recuperada se abre el envoltorio
normal para llegar a `VK`.

- Ventaja aparente: un solo tipo de envoltorio en el sistema.
- **Acopla la recuperación a la contraseña maestra**, que es de lo que trata de
  independizarse: cambiar la contraseña maestra cambia `MK`, así que obligaría a
  reenvolver también el blob de recuperación en cada rotación. Dos escrituras que
  deben ocurrir juntas, y un modo de fallo nuevo —rotación correcta y recuperación
  desactualizada— que solo se descubre el día que hace falta recuperar.
- **Recupera una credencial en lugar de una capacidad.** Lo que hace falta para leer
  la vault es `VK`; `MK` solo es el camino habitual hacia ella. Recuperar el camino
  en vez del destino es una indirección que no compra nada.

#### Opción D (descartada): reparto del secreto entre custodios

Shamir, o varias claves parciales repartidas entre personas de confianza.

- Ventaja: no hay un único punto de robo.
- Complejidad muy alta para el caso real, que es **una persona con una vault** y sin
  círculo de custodios. `ADR-009` fijó que la justificación de cualquier
  funcionalidad tiene que ser que la necesita el autor, que sin ella el repositorio
  no se entiende, o que cierra una promesa hecha. Esto no cumple ninguna.

### 2.2) Cómo se derivan la envoltura y la autenticación

Este apartado existe porque la clave de recuperación tiene que hacer **dos cosas
distintas**: abrir un envoltorio, y demostrarle al servidor quién eres. Si las dos
salieran del mismo material sin separación, lo que se manda al servidor comprometería
lo que abre la vault.

#### Opción A (descartada): usar la clave de recuperación tal cual, y enviarla hasheada

`RK` se importa directamente como clave AES-GCM, y al servidor se le manda
`SHA-256(RK)` para autenticar.

- Simple, y el hash no revela `RK` frente a un servidor honesto.
- **Pero `SHA-256` es barato de calcular.** El servidor almacena un hash de ese valor,
  y quien se lleve la base de datos puede atacar el hash con hardware dedicado.
  Contra 256 bits de entropía real eso no es viable hoy — pero el diseño quedaría
  dependiendo de esa aritmética en vez de estar separado por construcción.
- **No hay separación de dominio.** Un fallo futuro que filtre el valor de
  autenticación filtraría material relacionado con la clave de envoltura.

#### Opción B (elegida): HKDF con dos etiquetas de dominio

De `RK` se derivan **dos valores independientes** con HKDF-SHA256, cambiando la
etiqueta `info`: uno envuelve, el otro autentica.

- **HKDF es exactamente la primitiva para esto**: expandir un secreto de alta
  entropía en varias claves independientes. No es un uso creativo, es su propósito
  declarado.
- **Está en `crypto.subtle` de forma nativa**, así que no rompe la restricción de
  `ADR-008` de no cargar criptografía de terceros en el origen que custodia la clave.
  Comprobado antes de escribir esta decisión: las dos derivaciones son deterministas
  y distintas entre sí. La comprobación se hizo sobre la misma Web Crypto API, no en
  el navegador objetivo; eso queda como criterio de #127.
- **No se estira con PBKDF2, y es deliberado.** `RK` no es una contraseña humana: son
  256 bits aleatorios. No hay diccionario que probar, así que las 600.000 iteraciones
  no comprarían nada y solo añadirían espera. El coste computacional del KDF existe
  para compensar la falta de entropía, y aquí no falta.
- Diferencia de forma respecto a `ADR-008`, que deriva su hash de autenticación con
  PBKDF2 de una sola iteración. Aquello fue lo correcto allí, porque el material de
  partida ya venía de un PBKDF2 caro; aquí HKDF es la herramienta adecuada y usarla
  no contradice nada.

### 2.3) Cómo se autentica quien recupera

El problema real de este ADR: el hash de autenticación de `ADR-008` se deriva de la
contraseña maestra, que es justo lo que se ha perdido.

#### Opción A (elegida): un endpoint propio de recuperación

`POST /api/auth/recover` recibe correo y hash de autenticación de recuperación, y
devuelve los envoltorios de recuperación más un token de alcance limitado.

- **Mantiene el login intacto**, que es código con tests y con limitador propio.
- Permite un limitador **más estricto** que el de login, porque el perfil de uso es
  distinto: nadie recupera su cuenta cinco veces al día.
- Coste: una superficie pública más, con todo lo que eso obliga —enumeración,
  limitación, respuestas indistinguibles—. Es trabajo conocido y está en los
  lineamientos.

#### Opción B (descartada): reutilizar `POST /api/auth/login`

Aceptar en el mismo endpoint un hash de contraseña o uno de recuperación.

- Menos superficie nueva.
- **Convierte el endpoint más sensible del producto en uno con dos modos.** Un fallo
  de encaminamiento entre ambos sería un fallo de autenticación, que es la peor clase
  que se puede tener. Además hace que un solo limitador cuente dos cosas con perfiles
  de uso muy distintos.

### 2.4) Cómo se le entrega al usuario

Un secreto que no se puede memorizar y que hay que transcribir a mano tiene un modo
de fallo propio: copiarlo mal. Y copiarlo mal, si no se detecta, se descubre el día
que ya no hay remedio.

- **Hexadecimal**: 64 caracteres, alfabeto sin ambigüedad pero denso y sin estructura.
- **Lista de palabras tipo BIP-39**: 24 palabras, mucho más fácil de transcribir y de
  dictar. Exige embeber una lista de 2048 palabras y elegir idioma; el bundle ya es
  deuda reconocida en #45, y una lista por idioma la empeora.
- **Base32 con alfabeto sin caracteres ambiguos (elegida)**: 52 caracteres,
  presentados en grupos. Se descartan `I`, `L`, `O` y `U`, de modo que no existe la
  duda entre uno y ele, ni entre cero y o. Es la misma lección que llevó al generador
  de contraseñas de #85 a descartar caracteres ambiguos, aplicada a algo que sí se va
  a copiar en un papel.
- **Con un símbolo de comprobación al final**, que es lo que permite distinguir «esto
  está mal escrito» de «esto no abre tu vault». Son dos mensajes muy distintos: el
  primero invita a repasar, el segundo a rendirse. La Iteración 3 ya aprendió esa
  distinción con «credenciales incorrectas» frente a «no se puede abrir la vault».

## 3) Decisión final

Se adoptan las Opciones **A** de 2.1, **B** de 2.2, **A** de 2.3 y base32 sin
caracteres ambiguos con símbolo de comprobación en 2.4.

| Elemento | Definición |
|---|---|
| Clave de recuperación `RK` | 256 bits de `crypto.getRandomValues`, generados en el cliente |
| Presentación de `RK` | Base32 sin `I`, `L`, `O` ni `U`, 52 caracteres en grupos de 4, más un símbolo de comprobación |
| Clave de envoltura `RWK` | `HKDF-SHA256(clave = RK, salt = correo normalizado, info = "evault-recovery-wrap-v1", 256 bits)` |
| Hash de recuperación `RAH` | `HKDF-SHA256(clave = RK, salt = correo normalizado, info = "evault-recovery-auth-v1", 256 bits)`, en base64 |
| Envoltorio de recuperación | `AES-256-GCM(clave = RWK, iv = 96 bits aleatorios)` sobre `VK`, en base64 |

**`RK` no se persiste nunca en el dispositivo, ni se envía nunca al servidor.** Lo
que viaja es `RAH`, y de `RAH` no se llega a `RWK`: son dos expansiones
independientes del mismo secreto, separadas por la etiqueta de dominio.

La normalización del correo es la misma de `ADR-008` y por el mismo motivo: es parte
del contrato criptográfico, no una cortesía de la interfaz.

### El flujo completo, de principio a fin

**Generar.** Con la vault desbloqueada —es decir, con `VK` en memoria—: se genera
`RK`, se derivan `RWK` y `RAH`, se envuelve `VK` con `RWK`, y se envían al servidor
el envoltorio y `RAH`. `RK` se le enseña al usuario una vez y desaparece de la
memoria del cliente.

**Recuperar.** El usuario escribe correo y `RK`. El cliente deriva `RAH` y lo envía.
El servidor responde con los envoltorios de recuperación y un token de alcance
limitado. El cliente deriva `RWK`, abre el envoltorio y obtiene `VK`. **La vault ya
se puede leer, pero el flujo no ha terminado**: obliga a fijar una contraseña maestra
nueva, que es exactamente la operación de rotación —derivar `MK` nueva, reenvolver
`VK`, escribir— y reutiliza su mismo servicio de aplicación.

**Regenerar.** Con la vault desbloqueada, se repite «generar» y se sustituyen
envoltorio y `RAH` en la misma transacción. La `RK` anterior deja de servir en ese
momento.

### Por qué rotar la contraseña maestra no invalida la clave de recuperación

Porque `VK` no cambia al rotar, y el envoltorio de recuperación cuelga de `VK`, no de
`MK`. Es una consecuencia directa de la Opción C descartada en 2.1 y de la estructura
de `ADR-008`.

**Tiene un filo que hay que decir en voz alta**, porque va contra la intuición: quien
cambie su contraseña maestra sospechando que se la han robado **no expulsa** a quien
tenga su clave de recuperación. Para eso hay que regenerarla, que es otra acción. La
interfaz tiene que decirlo donde se cambia la contraseña, no en una página de ayuda.

### Dónde vive cada cosa

| Dato | Tabla | Nulable |
|---|---|---|
| Envoltorio de recuperación y su IV | `vault_members` | **Sí** |
| `RAH` | `users` | **Sí** |

El envoltorio va en `vault_members` por el mismo argumento de `ADR-008`: describe
cómo abre *esta persona* *esta vault*, así que acompaña al envoltorio normal. Con
varias vaults hay un envoltorio de recuperación por cada una, todos con la misma `RK`.

`RAH` va en `users` y no en `vault_members` porque autentica **a la persona**, no a
una relación con una vault concreta. Es el análogo exacto de `password`, que es donde
`ADR-008` puso el hash de autenticación normal, y se almacena igual: hasheado por el
servidor, que nunca guarda el valor recibido.

**Los tres son nulables, a diferencia de `wrapped_key`,** y eso no es relajación del
criterio: es que «usuario sin clave de recuperación» es un estado legítimo y
permanente. Quien la rechace se queda exactamente en el modelo anterior a este ADR,
que sigue siendo correcto.

## 4) Lineamientos técnicos resultantes

- **`RK` se genera en el cliente y no se persiste en ninguna parte**: ni en
  `localStorage`, ni en `sessionStorage`, ni en cookies, ni en IndexedDB, ni en un
  estado de React que sobreviva al paso siguiente. Vale para una operación y ahí
  acaba su vida. Va con test propio, del mismo estilo que los que vigilan el token.
- **El servidor no valida ni interpreta el envoltorio de recuperación.** Es un blob,
  igual que `ciphertext` y que `wrapped_key`.
- **El endpoint de recuperación no puede distinguir un correo inexistente de una
  clave incorrecta.** Ni en el cuerpo, ni en el código de estado, ni por el tiempo de
  respuesta: se verifica siempre contra un hash, también cuando el usuario no existe.
  Los tests comparan las dos respuestas entre sí, en vez de comprobar cada una por su
  lado, que es el patrón que el proyecto ya usa contra la enumeración.
- **Limitador propio y más estricto que el de login**, con su test del 429.
- **El token que devuelve la recuperación sirve solo para fijar la contraseña
  maestra.** No lee items, no lista vaults, no borra nada, y caduca pronto.
- **Generar y regenerar son transaccionales.** Escribir el envoltorio sin `RAH`, o al
  revés, deja una recuperación que no funciona, y eso no se descubre hasta el día en
  que hace falta. Es el mismo modo de fallo silencioso que la rotación de #124, y se
  prueba igual: forzando el fallo entre las dos escrituras.
- **El reenvolvido no se implementa dos veces.** Recuperar termina fijando una
  contraseña nueva, que es la operación de #124; comparten servicio de aplicación.
  Dos implementaciones del mismo reenvolvido son dos sitios donde perder la vault de
  alguien.
- La interfaz llama a las cosas por su nombre: quien tenga la clave de recuperación
  **abre la vault**. Nada de «guárdala en un lugar seguro», que no significa nada.

## 5) Consecuencias asumidas

1. **Hay dos caminos a la vault, y el producto es tan fuerte como el más débil.** Es
   la consecuencia central de esta decisión. Una contraseña maestra excelente no
   protege a quien deje su clave de recuperación en una nota sin cifrar. El
   contrapeso es de interfaz y de redacción, no de criptografía.
2. **El servidor guarda dos envoltorios de la misma `VK`.** No debilita AES-GCM: son
   dos cifrados con claves independientes. Sí significa que comprometer *cualquiera*
   de las dos claves entrega `VK`, que es justo lo que dice la consecuencia 1.
3. **Un usuario puede quedarse sin salida igualmente**, y hay que seguir diciéndolo:
   quien rechace la clave de recuperación, o la pierda junto con la contraseña
   maestra, no tiene ninguna otra vía. `ADR-001` sigue vigente sin excepciones.
4. **Aparece una superficie pública nueva.** Un endpoint sin autenticar que responde
   sobre la existencia de cuentas si se descuida. Los lineamientos lo acotan, pero la
   superficie existe y no existía ayer.
5. **El backup de #129 pasa a contener también el material de recuperación.** Quien
   robe una copia y además la clave de recuperación de alguien, abre su vault. Es
   exactamente la misma propiedad que ya tenía con `wrapped_key` y la contraseña
   maestra, extendida a un segundo secreto; conviene que la documentación del backup
   lo diga en lugar de sugerir que la copia es inofensiva.
6. **La entropía de `RK` no puede degradarse nunca.** No hay KDF caro detrás que
   compense una generación pobre. Si algún día se genera con una fuente que no sea
   `crypto.getRandomValues`, la recuperación pasa a ser el eslabón atacable del
   producto entero.
7. **Un usuario registrado antes de esta decisión no tiene clave de recuperación**, y
   nadie puede creársela por él: hace falta `VK`, que solo está en su dispositivo
   cuando desbloquea. La interfaz tendrá que ofrecérsela después de un desbloqueo, no
   en una migración.

## 6) Triggers de reevaluación

Reevaluar si se cumple uno o más:

1. **Aparece un segundo factor de verdad** en el producto. Cambia el cálculo: una
   clave de recuperación que solo es «algo que tienes» encaja distinto cuando ya
   existe otro factor.
2. **Llegan las vaults compartidas.** Habrá que decidir qué recupera la clave de un
   miembro cuando la vault es de varios, y si un envoltorio de recuperación por vault
   sigue siendo la forma correcta.
3. **Se observa que la clave se pierde o se transcribe mal en la práctica.** Sería el
   argumento para revisar 2.4 y volver sobre la lista de palabras, asumiendo su coste
   en bundle.
4. **Argon2id llega a la Web Crypto API.** No afecta a `RK`, que no necesita
   estiramiento, pero sí a la decisión hermana de `ADR-008`, y las dos conviene
   revisarlas juntas.

## 7) Impacto en APIs y contratos

Aditivo, como el de `ADR-008`, y enumerado campo a campo para que la afirmación se
pueda comprobar:

| Endpoint | Cambio |
|---|---|
| `POST /api/auth/register` | **Ninguno.** La clave de recuperación se genera después del alta, con la vault ya desbloqueada |
| `POST /api/auth/login` | **Ninguno** |
| `POST /api/auth/recover` | **Nuevo.** Público y limitado. Recibe correo y `RAH`; devuelve los envoltorios de recuperación y un token de alcance limitado |
| `POST /api/auth/recovery-key` | **Nuevo.** Autenticado. Registra o sustituye `RAH` y los envoltorios de recuperación, en una transacción |
| `GET /api/vaults` | **Ninguno.** El envoltorio de recuperación no se sirve aquí: solo lo entrega el endpoint de recuperación, y solo a quien ha demostrado tener `RK` |
| `/api/vaults/{vault}/items` | **Ninguno** |

Esquema: `vault_members` gana dos columnas nulables y `users` una. **`vault_items` no
cambia**, y el test que enumera sus columnas y falla al añadir una sigue pasando sin
tocarlo, igual que en la Iteración 3.

El formato criptográfico de los items **no cambia**, así que `version` sigue valiendo
2. Este ADR no toca cómo se cifra un item; solo añade una forma más de llegar a la
clave que los abre.
