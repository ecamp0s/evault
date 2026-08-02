# eVault — Arquitectura de claves de la vault

Fecha de decisión: 2026-08-02 (al planificar la Iteración 3, issue #79)
Fecha de registro: 2026-08-02
Estado: Aprobada
Depende de: ADR-001 (zero-knowledge), ADR-004 (multi-tenancy por vault), ADR-007 (token solo en memoria)

## 1) Contexto

`ADR-001` decidió el modelo zero-knowledge y dejó fijados sus lineamientos: PBKDF2
para derivar, AES-256-GCM para los items, dos valores independientes de los que
uno no pueda obtenerse del otro, y la clave de cifrado sin salir jamás del
dispositivo.

Lo que `ADR-001` **no** fija es cómo se estructuran esas claves entre sí, y esa
pregunta no es un detalle de implementación: condiciona el esquema de datos, el
contrato de registro, el coste de cambiar la contraseña maestra y la viabilidad de
las vaults compartidas del plan Team.

Es además la decisión menos reversible del proyecto. Revertirla no es refactorizar:
es recifrar datos que, por diseño, solo el usuario puede descifrar. No existe una
migración que el operador pueda ejecutar, porque el operador no tiene las claves.
Por eso se decide y se registra **antes** de escribir la primera línea de código
criptográfico, y por eso el issue que la implementa (#81) está bloqueado por este.

Las cinco preguntas abiertas al llegar aquí:

1. ¿La clave derivada de la contraseña maestra cifra los items directamente, o
   envuelve otra clave que es la que cifra?
2. ¿Qué salt usa la derivación?
3. ¿Cómo se deriva el hash de autenticación sin que comprometa la clave de cifrado?
4. ¿Dónde vive, en el modelo de datos, lo que haya que guardar?
5. ¿Qué función de derivación y qué parámetros, y qué pasa el día que se queden
   cortos?

## 2) Opciones evaluadas

### 2.1) Estructura de claves

#### Opción A (descartada): la clave derivada cifra los items

`PBKDF2(contraseña maestra)` produce directamente la clave con la que se cifra cada
item. Una sola clave, ninguna pieza intermedia.

Tradeoffs:

- Complejidad: la menor de las dos. Menos piezas es menos superficie donde
  equivocarse, y en criptografía eso pesa más que en cualquier otro sitio.
- Coste en el servidor: **ninguno**. No hay nada que guardar, así que ni migración
  ni cambio de contrato.
- **Cambiar la contraseña maestra obliga a descifrar y recifrar toda la vault.** Es
  una operación larga, que el cliente tiene que hacer entera, y que si se
  interrumpe a media escritura deja la vault en un estado mixto donde unos items
  están con la clave vieja y otros con la nueva. Recuperarse de eso exige recordar
  qué clave abría cada fila, que es precisamente lo que la operación estaba
  intentando dejar atrás.
- **Las vaults compartidas son imposibles sin rehacerlo.** Compartir un item exigiría
  que dos usuarios derivasen la misma clave, es decir, que compartieran contraseña
  maestra. El plan Team no cabe en este modelo, y llegar a él significaría recifrar
  todas las vaults existentes.

#### Opción B (elegida): clave de vault aleatoria, envuelta por la clave derivada

`PBKDF2(contraseña maestra)` produce una **clave maestra** que no cifra ningún item.
Su único trabajo es envolver —cifrar— una **clave de vault** de 256 bits generada
aleatoriamente al crear la vault. Esa clave de vault es la que cifra el contenido.
El resultado de la envoltura se guarda en el servidor, que lo trata como un blob
opaco más.

Tradeoffs:

- Complejidad: una pieza más y un paso más en el desbloqueo. Es el coste real de
  esta opción y no se disimula.
- Coste en el servidor: dos columnas y dos campos en el contrato. Acotado y aditivo.
- **Cambiar la contraseña maestra es reenvolver un blob.** Se deriva la clave
  maestra nueva, se vuelve a envolver la misma clave de vault, y se escribe una
  fila. Los items no se tocan, así que la operación es atómica en la práctica y no
  puede dejar la vault a medias.
- **Las vaults compartidas caben sin rediseñar.** La misma clave de vault se
  envuelve una vez por miembro, cada una con la clave maestra de su dueño. Todos
  descifran el mismo contenido sin compartir contraseña.
- Es el diseño de los productos de referencia de la categoría, Bitwarden entre
  ellos. Que sea el camino andado importa aquí más que en otros sitios: en
  criptografía aplicada, la originalidad es un defecto.

### 2.2) La función de derivación

`ADR-001` ya eligió PBKDF2, y este documento no puede contradecir un ADR cerrado.
Sí conviene dejar registrado que la elección se ha revisado al implementarla, y con
qué argumentos, porque es la parte del diseño con más probabilidad de envejecer.

La alternativa seria es **Argon2id**, y hay que ser honestos sobre por qué no se
adopta: OWASP lo recomienda por delante de PBKDF2, y con razón. Argon2id es
*memory-hard*, así que encarece el ataque con GPU y con hardware dedicado mucho más
que PBKDF2, que solo cuesta ciclos. Frente a un atacante con presupuesto, esa
diferencia es real y no es pequeña.

Lo que inclina la balanza en este proyecto concreto:

- `crypto.subtle` implementa PBKDF2 de forma **nativa**. Argon2id no existe en la
  Web Crypto API, así que exigiría un WASM de terceros.
- Ese WASM sería una dependencia de terceros ejecutando en el punto más crítico del
  producto, cargada en el mismo origen que tiene la clave de cifrado en memoria.
  Es exactamente el modelo de amenaza que `ADR-007` y el issue #77 tratan de
  reducir, y añadirla ahí contradiría el esfuerzo.
- PBKDF2 con 600.000 iteraciones es la recomendación **explícita** de OWASP para
  PBKDF2-HMAC-SHA256, no un mínimo tolerado. No es una elección débil; es una
  elección peor que la mejor disponible, con un motivo de ingeniería detrás.

Se mantiene PBKDF2, con trigger de reevaluación registrado en la sección 6.

### 2.3) El salt de la derivación

#### Opción A (descartada): salt aleatorio por usuario, servido antes del login

Lo que pide el manual: un salt aleatorio por usuario, guardado en el servidor. El
cliente no puede derivar nada hasta conocerlo, así que hace falta un endpoint
público que traduzca un correo a sus parámetros de derivación.

- Ventaja: el salt es único de verdad, entre instancias y para siempre. Y los
  parámetros KDF pasan a ser por usuario, así que **subirlos es posible sin
  coordinación**.
- **Coste: ese endpoint es un oráculo de enumeración de cuentas.** Dado un correo
  responde si existe, que es justo lo que el resto del diseño se esfuerza en no
  filtrar. `FOUNDATION.md` dedica una sección a que un recurso ajeno y uno
  inexistente sean indistinguibles; abrir aquí una puerta que responde «este correo
  tiene cuenta» iría en contra de todo eso. Se puede tapar devolviendo parámetros
  falsos y deterministas para los correos desconocidos, pero es una mitigación que
  hay que acertar y mantener.
- Coste secundario: una ida y vuelta más antes de cada login.

#### Opción B (elegida): el correo electrónico como salt

- Ventaja: **no hace falta ningún endpoint nuevo**. El cliente deriva con lo que ya
  tiene escrito en el formulario, y el contrato de `login` no se toca.
- El salt cumple su función principal, que es que dos usuarios con la misma
  contraseña no compartan clave, y que no exista una tabla precomputada
  reutilizable entre víctimas.
- **Coste real: el salt no es secreto ni impredecible.** Un atacante que apunte a
  una persona concreta puede precomputar contra su correo antes de robar nada. Lo
  que encarece ese ataque no es el salt, son las 600.000 iteraciones.
- **Coste real: los parámetros KDF quedan fijos en el cliente.** Sin endpoint que
  los sirva, no hay forma de que un usuario tenga unos y otro tenga otros. Subirlos
  más adelante exigirá construir la Opción A igualmente.
- Bitwarden también usa el correo como salt del KDF, pero conviene no citarlo como
  aval de la decisión completa: **Bitwarden sí expone un endpoint de prelogin** que
  sirve los parámetros de derivación de cada cuenta. Es justo la pieza que aquí se
  evita, y por eso allí subir las iteraciones es una operación rutinaria y aquí no
  lo será. La diferencia es deliberada y su precio está en la consecuencia 1.

## 3) Decisión final

Se adopta la **Opción B** en los dos apartados: clave de vault envuelta, y correo
electrónico como salt. Se confirma PBKDF2 con 600.000 iteraciones.

| Elemento | Definición |
|---|---|
| Clave maestra `MK` | `PBKDF2-HMAC-SHA256(contraseña, salt = correo normalizado, 600.000 iteraciones, 256 bits)` |
| Hash de autenticación `AH` | `PBKDF2-HMAC-SHA256(clave = MK, salt = contraseña, 1 iteración, 256 bits)`, en base64 |
| Clave de vault `VK` | 256 bits de `crypto.getRandomValues`, generada al crear la vault |
| Clave envuelta | `AES-256-GCM(clave = MK, iv = 96 bits aleatorios)` sobre `VK`, en base64 |
| Contenido de un item | `AES-256-GCM(clave = VK, iv = 96 bits aleatorios)` sobre el JSON UTF-8, `version = 2` |

**`MK` nunca sale del dispositivo. `VK` nunca sale del dispositivo sin envolver. La
contraseña maestra no sale nunca, en ninguna forma.**

### Por qué `AH` no compromete la clave de cifrado

Es la propiedad que `ADR-001` exige por escrito, así que conviene dejar dicho por
qué se cumple en vez de darlo por evidente.

`AH` es una pasada de HMAC-SHA256 sobre `MK`. Obtener `MK` a partir de `AH`
significa invertir HMAC-SHA256, que es el supuesto en el que descansa media
criptografía aplicada. El servidor conoce `AH` —y ni siquiera lo almacena: guarda su
hash, porque Laravel lo sigue tratando como una contraseña— y de ahí no llega a
`MK`, ni a `VK`, ni al contenido.

De esto se sigue una propiedad que conviene tener presente al razonar sobre
incidentes: quien capture `AH` puede **autenticarse** como el usuario, pero no puede
**descifrar** nada. Obtiene una sesión sobre una vault que no abre. Es la misma
separación que `ADR-007` describe entre tener sesión y tener la vault desbloqueada,
vista desde el lado del atacante.

### Por qué la clave envuelta vive en `vault_members`

Va en `vault_members` y no en `vaults` ni en `users`, y el motivo es que **la clave
envuelta no describe a un usuario ni a una vault, sino a la relación entre los dos**.
Es la respuesta a «cómo abre *esta persona* *esta vault*».

Ponerla en `vaults` daría una sola copia por vault, y habría que rehacerlo el día
que haya dos miembros. Ponerla en `users` daría una sola copia por persona, y no
admitiría más de una vault. `vault_members` ya es un modelo propio, `VaultMember`,
con clave primaria compuesta, así que la pieza donde ponerla ya existe.

Consecuencia práctica: cuando lleguen las vaults compartidas, invitar a alguien será
escribir una fila más con la misma `VK` envuelta con la `MK` del invitado. Nada de
lo que se escriba ahora habrá que deshacerlo. Esta decisión es **condición
necesaria** para la compartición, no suficiente: entregarle a otro la `VK` sin que
ninguno de los dos revele su contraseña maestra exige además criptografía
asimétrica, que `ADR-001` ya deja para más adelante.

### La normalización del correo es parte del contrato criptográfico

El correo es el salt, así que **cliente y servidor tienen que normalizarlo
exactamente igual, o el usuario no puede entrar**. El servidor ya aplica minúsculas
y recorte de espacios en `RegisterUser` y `LoginUser`; el cliente deriva antes de
enviar nada, así que tiene que aplicar la misma transformación y no una parecida.

Merece estar en un ADR y no en un comentario porque el fallo que provoca es de los
que no se ven: alguien se registra con `Ada@Example.com`, entra escribiendo
`ada@example.com`, y obtiene un `AH` distinto. El servidor responde «credenciales
incorrectas» y todo el mundo mira al login, que es el único sitio donde no está el
problema.

## 4) Lineamientos técnicos resultantes

- La contraseña maestra, `MK` y `VK` **no se persisten en ninguna forma**: ni
  `localStorage`, ni `sessionStorage`, ni cookies, ni IndexedDB, ni como `CryptoKey`
  no extraíble. Lo prohíbe `ADR-007` y aquí se extiende a las tres.
- Toda la aleatoriedad criptográfica viene de `crypto.getRandomValues`. `Math.random`
  no aparece en ningún camino que produzca claves, nonces o contraseñas.
- **Un IV nuevo por cada operación de cifrado, siempre.** Reutilizar un nonce con
  GCM rompe la confidencialidad y además revela el material de autenticación. Es el
  fallo clásico de esta primitiva y va con test propio.
- La etiqueta de autenticación de GCM viaja concatenada al texto cifrado, que es lo
  que hace `crypto.subtle`. **No lleva columna propia**, y añadirle una sería un
  error.
- Un fallo de descifrado se propaga como error. Nunca se devuelve contenido vacío o
  parcial, y nunca se escribe encima de datos que sí se podían leer.
- El servidor **no valida ni interpreta** la clave envuelta. Es un blob, igual que
  `ciphertext`.
- Los parámetros de la sección 3 viven como constantes en un solo módulo del
  cliente, no repartidos por el código.

## 5) Consecuencias asumidas

1. **Los parámetros KDF quedan fijos en el cliente.** Subirlos exigirá construir el
   endpoint de la Opción A de 2.3 y re-derivar la clave maestra de cada usuario en
   su siguiente login. Es trabajo real y con su propia migración; se acepta a
   cambio de no abrir hoy un oráculo de enumeración de cuentas.
2. **El salt es predecible.** Contra un objetivo concreto, la única defensa es el
   coste de las iteraciones y la calidad de la contraseña maestra. Refuerza la
   necesidad de comunicar bien qué contraseña maestra elegir, que es trabajo de
   interfaz y no de criptografía.
3. **PBKDF2 no es memory-hard.** Se está eligiendo, con los ojos abiertos, algo peor
   que Argon2id frente a un atacante con GPU, a cambio de no cargar un WASM de
   terceros en el origen que custodia la clave.
4. **Desbloquear cuesta un tiempo perceptible**, en torno a las décimas de segundo,
   y eso es lo que se está comprando. La interfaz tiene que enseñarlo en vez de
   parecer congelada.
5. **Cambiar la contraseña maestra sigue sin existir**, aunque esta decisión lo
   abarate mucho. Es funcionalidad propia y no hace falta para cumplir `ADR-001`.
6. **Sigue sin haber recuperación.** Esta decisión no la introduce ni la acerca: si
   se pierde la contraseña maestra, `VK` no se puede desenvolver y el contenido es
   irrecuperable. `ADR-001` ya lo asumía; conviene repetirlo porque la existencia de
   una clave guardada en el servidor invita a pensar lo contrario.
7. **Self-hosting**: los parámetros KDF son un valor de compilación del cliente, así
   que un operador que quiera otros tendrá que reconstruirlo. Es coherente con
   `ADR-005`, donde lo configurable por entorno son las URLs, no la criptografía.

## 6) Triggers de reevaluación

Reevaluar si se cumple uno o más:

1. **Argon2id llega a la Web Crypto API** con soporte suficiente en los navegadores
   objetivo. Desaparece el único argumento por el que no se adoptó.
2. Las 600.000 iteraciones dejan de ser la recomendación vigente de OWASP, o el
   tiempo de derivación en hardware corriente cae de forma que deje de costar lo que
   se pretendía que costara.
3. Se implementa el cambio de contraseña maestra, la clave de recuperación o las
   vaults compartidas: las tres tocan esta arquitectura y son la ocasión natural de
   comprobar que sigue sirviendo.
4. Aparece un cliente que no puede derivar con comodidad, por ejemplo una extensión
   de navegador con presupuesto de CPU más ajustado.

## 7) Impacto en APIs y contratos

Aditivo y acotado. Enumerado campo a campo porque `ADR-001` pide estabilidad del
contrato y conviene poder comprobar la afirmación:

| Endpoint | Cambio |
|---|---|
| `POST /api/auth/register` | **Gana dos campos de entrada**: la clave de vault envuelta y su IV. La respuesta no cambia |
| `POST /api/auth/login` | **Ninguno.** `AH` viaja en el campo `password`, que ya existe y ya es un string |
| `GET /api/auth/me` | **Ninguno** |
| `POST /api/auth/logout` | **Ninguno** |
| `GET /api/vaults` | **Gana dos campos de salida** por vault: la clave envuelta del usuario que pregunta, y su IV |
| `/api/vaults/{vault}/items` | **Ninguno.** `ciphertext`, `iv` y `version` ya estaban en su forma definitiva |

`vault_items` **no cambia**, y el test que enumera sus columnas y falla al añadir
una sigue pasando sin tocarlo. Lo que cambia dentro de esa tabla es el significado
de `version`: la 1 era codificación reversible y la 2 es cifrado de verdad.

El campo `password` de registro y login cambia de significado —deja de ser una
contraseña y pasa a ser un hash de autenticación— pero no de forma. Esa era
exactamente la razón por la que `ADR-001` exigió mantener el contrato estable desde
la Iteración 1, y aquí se cobra.
