# eVault — Cambio de correo electrónico

Fecha de decisión: 2026-08-17
Fecha de registro: 2026-08-17
Estado: Aprobada
Depende de: ADR-008 (arquitectura de claves), ADR-010 (clave de recuperación), ADR-001 (zero-knowledge)

## 1) Contexto

Cambiar el correo electrónico lleva dos iteraciones señalado en `SPRINT_CONTEXT.md`
como pendiente, siempre con la misma nota al lado: «no es pequeño porque el correo es
el salt de la derivación». Este ADR decide cómo se hace **antes** de escribir una
línea de código, porque la operación toca el material que abre la vault y un fallo
deja al usuario fuera de sus datos para siempre.

### Por qué no es un `UPDATE` de una columna

Por `ADR-008`, el correo **no es un dato de perfil: es material criptográfico.**
Aparece como salt en dos derivaciones independientes:

1. **La clave maestra.** PBKDF2 con 600.000 iteraciones sobre el par contraseña y
   correo produce la clave que envuelve la clave de vault, y de ella se deriva el hash
   de autenticación que viaja al servidor.
2. **Las claves de recuperación.** `deriveRecoveryKeys` usa el correo normalizado como
   salt de un HKDF del que salen el `wrapKey` que envuelve la clave de vault y el
   `authHash` con el que el servidor reconoce la clave de recuperación (`ADR-010`).

Cambiar el correo cambia las cuatro cosas. Lo que **no** cambia es la clave de vault,
y ahí se vuelve a cobrar el dividendo de `ADR-008`: los items no se tocan, así que la
operación cuesta lo mismo con tres entradas que con tres mil.

### La asimetría que este ADR existe para registrar

Es la **inversa exacta** de una regla que la interfaz ya afirma en otro sitio, y por
eso se va a malinterpretar:

- **Rotar la contraseña maestra NO invalida la clave de recuperación**, porque la clave
  de vault no cambia y su envoltorio de recuperación no se toca. Está escrito en
  `ADR-010`, en `SPRINT_CONTEXT.md` y en la propia interfaz, con un test que falla si el
  aviso desaparece. Es además lo que más se malinterpreta del modelo, según el registro
  de riesgos.
- **Cambiar el correo SÍ la invalida**, porque el correo es salt de la derivación de
  recuperación. El envoltorio que hay guardado deja de poder abrirse con la clave que
  el usuario tiene en un papel.

Y de ahí sale la restricción operativa que decide todo lo demás: **para rehacer el
envoltorio de recuperación hace falta la clave de recuperación en claro**, que por
diseño de `ADR-010` está fuera del dispositivo.

## 2) Opciones evaluadas

### 2.1) Qué se hace con la clave de recuperación

#### Opción A (elegida): la operación no termina sin una clave de recuperación nueva

El cambio de correo invalida el envoltorio viejo y **encadena la generación de una
clave nueva como parte de la misma operación**, sin permitir salir a medias.

Tradeoffs:

- **No exige tener el papel viejo a mano**, que es lo que la hace viable para una
  operación rutinaria. Cambiar un correo electrónico no es una emergencia y no debería
  requerir abrir una caja fuerte.
- **No deja ninguna ventana sin red de seguridad**, que es el defecto de la Opción C.
- Es un patrón que el proyecto ya validó y no una invención: #128 decidió que
  «recuperar no termina hasta fijar una contraseña nueva», por la misma razón —dejar
  una operación de credenciales a medias es dejar la cuenta colgando de un papel.
- **A quien no tenía clave de recuperación no se le inventa una obligación nueva.** El
  servidor puede distinguirlo porque `recovery_wrapped_key` es nullable a propósito, y
  su migración lo dejó escrito: «un miembro sin `recovery_wrapped_key` es alguien que
  eligió no tener segunda llave». Ese estado es legítimo y permanente por `ADR-010`, así
  que para esos usuarios el flujo termina donde termina hoy.
- Coste: el flujo tiene dos pantallas en vez de una, y la segunda entrega un secreto que
  el usuario tiene que guardar en ese momento.

#### Opción B (descartada): exigir la clave de recuperación actual

Pedir la clave vieja y rehacer su envoltorio dentro de la misma transacción.

Tradeoffs:

- Deja todo consistente al terminar, sin generar ningún secreto nuevo, y es la única que
  conserva la clave que el usuario ya tiene guardada.
- **Fricción desproporcionada:** obliga a ir a buscar un papel para cambiar un correo
  electrónico. Y la fricción no es solo molestia: una operación que exige un secreto
  guardado fuera se posterga, y mientras se posterga el correo sigue siendo el viejo.
- Peor aún, **empuja a una práctica que `ADR-010` quiere evitar**: si la clave de
  recuperación hace falta para operaciones rutinarias, acabará guardada en el mismo
  dispositivo, y entonces deja de ser una segunda llave independiente.

#### Opción C (descartada): invalidarla y avisar

Completar el cambio, dejar el envoltorio viejo inservible y advertirlo en la interfaz
con un enlace para generar una clave nueva.

Tradeoffs:

- La más simple de implementar, y no bloquea nada.
- **Deja al usuario sin red de seguridad sin que se entere**, que es el peor modo de
  fallo posible en un gestor de contraseñas: no se manifiesta al ocurrir sino el día que
  hace falta, y ese día ya no hay nada que hacer.
- Un aviso que se puede cerrar es un aviso que se cierra. `ADR-011` ya aplicó este mismo
  criterio al export en claro al exigir «una confirmación que no se puede dar por
  inercia», y aquí lo que está en juego es mayor.

### 2.2) Cómo se ordenan las escrituras

Cuatro cosas cambian a la vez: el correo, el hash de autenticación, los envoltorios de
la clave de vault y el envoltorio de recuperación.

#### Opción A (elegida): todo criptográfico en el cliente antes de la primera petición, y una transacción en el servidor

Tradeoffs:

- Es el orden que ya salvó al cifrado de items en #59 y a la rotación de contraseña en
  #125: **derivar y reenvolver primero, pedir después.** Si la contraseña actual no es
  la correcta, el reenvolvido lanza en el cliente y **no se ha enviado ninguna
  petición**, así que no hay nada que deshacer.
- Y tiene un efecto que conviene nombrar porque no es evidente: **eso vale como
  comprobación de la contraseña actual, y es una comprobación más fuerte que la del
  servidor.** El servidor valida identidad —que el hash coincide—; abrir el envoltorio
  valida capacidad de descifrar. Lo segundo es lo que importa.
- En el servidor, una única transacción sobre las cuatro escrituras, con el patrón de
  `RotateMasterPassword`: hay un test que fuerza una excepción entre dos escrituras y
  comprueba que se revirtió todo.

#### Opción B (descartada): escrituras independientes con reintento

Tradeoffs:

- Más simple de implementar y de razonar por partes.
- **Los estados intermedios son irreparables desde el servidor**, que no tiene ninguna
  de las claves. `RotateMasterPassword` ya lo dejó escrito para su caso: con el correo
  cambiado y el envoltorio viejo, la clave maestra nueva no abre nada y la vault queda
  cerrada con los datos dentro. Un reintento no arregla eso, porque para reintentar hace
  falta material que solo estaba en el cliente durante la operación.

### 2.3) La normalización del correo, y un problema que ya existe

El correo viaja en el cuerpo de la petición **y es el salt**. Si cliente y servidor lo
normalizan distinto, la clave maestra que derive el cliente al entrar la próxima vez no
será la misma, y **la vault no abrirá sin que nada haya dado error en el momento del
cambio**. Es el modo de fallo silencioso de esta operación.

Hoy están alineados: el cliente hace `email.trim().toLowerCase()` y el servidor
`mb_strtolower(trim($email))`, y el comentario de `normalizeEmail` ya lo declara «parte
del contrato criptográfico y no una cortesía de la interfaz». Incluye además un detalle
que merece no perderse: es `toLowerCase` y **no** `toLocaleLowerCase`, porque la
variante con locale convierte la I mayúscula en `ı` bajo configuración turca y el mismo
correo derivaría distinto según el idioma del dispositivo.

**Lo que este ADR encuentra por el camino: esa regla está copiada en cinco sitios del
servidor** —`RegisterUser`, `LoginUser`, `RecoverAccess` y dos veces en `AttemptKey`— y
el endpoint nuevo sería el sexto. Cinco copias de una regla que forma parte del
contrato criptográfico, y ninguna comprobación de que sigan siendo iguales.

#### Opción A (elegida): extraer la normalización a un solo sitio antes de añadir el sexto uso

Tradeoffs:

- Es refactor que este ADR no venía a pedir, y se acepta por su modo de fallo: una copia
  que divergiera **no rompería ningún test existente** y se manifestaría como una vault
  que no abre.
- Con un solo sitio, la equivalencia con el cliente se puede fijar con un test.
- Coste: toca cuatro clases que hoy funcionan.

#### Opción B (descartada): añadir la sexta copia y dejarlo dicho

- Barato hoy y más caro cada vez.
- Y es exactamente la clase de deuda que este proyecto ya sabe que no se paga sola:
  quedaría en prosa, y las afirmaciones en prosa que nadie comprueba son el fallo
  recurrente del repositorio.

### 2.4) El correo destino ya registrado

La columna `email` de `users` es `unique`, así que el caso existe.

#### Opción A (elegida): indistinguible de una contraseña incorrecta

Tradeoffs:

- **No convierte el endpoint en un oráculo de enumeración de cuentas**, que es el mismo
  cuidado que `ADR-008` tuvo al descartar el endpoint de prelogin y que #126 tuvo en el
  de recuperación. El test que sirve **compara las dos respuestas** en vez de comprobar
  cada una por su lado.
- Peor mensaje de error para el usuario legítimo, que no sabrá si se equivocó de
  contraseña o si el correo está tomado.
- En una instancia personal de un solo usuario el riesgo es teórico. Se decide así de
  todas formas, porque el código es público y se lee como referencia, y porque una
  instancia con más de un usuario no debería depender de que nadie revise esta decisión.

## 3) Decisión final

Se cambia el correo con **re-derivación completa en el cliente antes de enviar nada**,
una **transacción única** en el servidor sobre las cuatro escrituras, y la operación
**no termina hasta entregar una clave de recuperación nueva** a quien tuviera una.

La normalización del correo se **extrae a un solo sitio** antes de añadir el sexto uso,
y la respuesta ante un correo ya registrado es **indistinguible** de la de una
contraseña incorrecta.

Motivo de conjunto: es la combinación que no deja ningún estado intermedio irreparable
ni ninguna ventana sin red de seguridad, y que no paga esas dos garantías con fricción
en el uso normal.

## 4) Lineamientos técnicos resultantes

- **Todo el material criptográfico se deriva y reenvuelve en el cliente antes de la
  primera petición.** Una contraseña actual incorrecta falla sin haber enviado nada.
- **Las cuatro escrituras van en una transacción**, con un test que fuerza el fallo
  entre dos de ellas — no leyendo la transacción.
- **El endpoint exige el hash de autenticación actual**, como `PUT /auth/master-password`:
  un token robado no puede servir para dejar fuera al dueño. Y la contraseña maestra hace
  falta igualmente por fuerza, porque sin ella no se puede abrir el envoltorio para
  reenvolverlo.
- **Limitador propio** en `config/throttling.php`, porque el endpoint recibe un hash de
  autenticación y sin límite sería un sitio donde probar contraseñas. **Las claves de ese
  fichero no se traducen**: son configuración, no símbolos.
- **Los demás tokens de sesión caen y sobrevive el actual**, igual que en
  `RotateMasterPassword` mediante `keepTokenId`. Cambiar el correo es un cambio de
  credenciales y merece el mismo tratamiento.
- **El correo guardado en el store de sesión se actualiza.** Es lo que la pantalla de
  bloqueo usa para saludar, y si queda el viejo el saludo miente.
- **La interfaz avisa de que la clave de recuperación vieja deja de servir**, con un test
  que falla si el aviso desaparece — igual que el aviso inverso de la rotación de
  contraseña. Son dos frases que dicen lo contrario y ninguna puede desaparecer en un
  refactor de textos.
- **Los `vault_items` no se tocan**, ni un `updated_at` movido, y hay test que lo
  comprueba. Es el dividendo de `ADR-008` y ya tiene precedente en #124.
- **La normalización del correo vive en un único sitio del servidor**, con un test que
  fija su equivalencia con `normalizeEmail` del cliente.

## 5) Consecuencias asumidas

1. **La clave de recuperación anterior queda inservible**, y no hay forma de evitarlo
   sin exigirla: el correo es su salt. Se mitiga entregando una nueva en la misma
   operación, no avisando.
2. **El flujo es más largo que el de cambiar la contraseña maestra**, y esa asimetría va
   a sorprender, porque cambiar un correo parece menos grave que cambiar una contraseña.
   Es al contrario en lo que respecta a la recuperación, y la interfaz tiene que decirlo.
3. **Un usuario sin clave de recuperación pasa por un flujo más corto que otro con
   ella**, así que hay dos caminos que mantener y probar. Se acepta porque la
   alternativa —obligar a generar una a quien la rechazó— contradice `ADR-010`.
4. **No hay verificación del correo nuevo por email.** El proyecto no envía correo, y en
   una instancia personal el correo es un identificador y un salt, no un canal. La
   consecuencia real es que un correo mal escrito cambia el salt a algo que el usuario no
   recuerda: **se mitiga en la interfaz pidiéndolo dos veces**, no con un email de
   confirmación.
5. **El endpoint es el tercer camino que toca el material que abre la vault**, después
   de la rotación y la recuperación. Cada uno amplía la superficie donde un fallo es
   irreparable, y por eso los tres comparten el mismo patrón en vez de tener cada uno
   el suyo.

## 6) Triggers de reevaluación

Se reevalúa si el proyecto **deja de usar el correo como salt**. Hoy es consecuencia de
no querer un endpoint de prelogin, que sería un oráculo de enumeración (`ADR-008`); si
esa decisión cambiara, cambiar el correo dejaría de tocar criptografía y este ADR
sobraría casi entero.

Se reevalúa la Opción A de §2.1 si aparece **más de un dispositivo con sesión
simultánea** de forma habitual, porque entonces la clave nueva se entrega en uno y los
demás quedan con información obsoleta.

Se reevalúa la §2.4 si la instancia deja de tener un solo usuario.

**No se reevalúa** por el hecho de que el flujo resulte incómodo. La incomodidad está
medida y aceptada en §5.2; lo que no es aceptable es la ventana sin red de seguridad de
la Opción C.

## 7) Impacto en APIs y contratos

**Sí lo hay, y es el primero desde `ADR-010`:** hace falta un endpoint nuevo para
cambiar el correo, que recibe el correo nuevo, el hash de autenticación actual, el
nuevo, los envoltorios reenvueltos de cada vault y —cuando el usuario tenga clave de
recuperación— el envoltorio de recuperación nuevo con su hash.

No cambia ninguna ruta existente, ningún campo del blob ni ningún formato
criptográfico. El esquema tampoco cambia: las columnas que se escriben son las que ya
existen desde `ADR-008` y `ADR-010`.

Es de esperar que rompa la racha de tres ADR seguidos con impacto cero, y por un motivo
que conviene registrar: los tres anteriores decidían **sobre el proyecto** —su alcance,
su despliegue, su operación— y este decide **sobre el producto**.
