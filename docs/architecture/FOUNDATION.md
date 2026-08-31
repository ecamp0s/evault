# eVault — Modelo de dominio

Actualizado: 2026-08-03

Qué hay en la base de datos, qué significa cada cosa y, sobre todo, **qué puede
leer el servidor y qué no**. Es el documento que hay que tener claro antes de
añadir una columna, un endpoint o un campo a una respuesta.

Las decisiones que hay detrás no se argumentan aquí: viven en los ADR, y este
documento las da por tomadas. En particular `ADR-001` (zero-knowledge) y
`ADR-004` (multi-tenancy por vault).

---

## 1) Las cuatro tablas

```mermaid
erDiagram
    users ||--o| vaults : "personal_for_user_id"
    users ||--o{ vault_members : ""
    vaults ||--o{ vault_members : ""
    vaults ||--o{ vault_items : ""
```

| Tabla | Qué es | Clave |
|---|---|---|
| `users` | La cuenta | Entero autoincremental |
| `vaults` | El tenant: un contenedor de secretos | UUIDv7 |
| `vault_members` | Quién pertenece a qué vault, con qué rol, y cómo la abre | Compuesta: `(vault_id, user_id)` |
| `vault_items` | Las entradas, opacas para el servidor | UUIDv7 |

### Por qué conviven dos tipos de identificador

`users` es de la Iteración 1 y usa entero autoincremental. Todo lo que cuelga de
un vault usa UUIDv7, y el motivo es de modelo de amenaza y no de estilo: un
entero secuencial en `vault_items` revelaría el número total de entradas del
sistema y su orden de creación, que es la misma clase de metadato que el resto
del diseño se esfuerza en no filtrar. Además estos identificadores viajan en la
URL, así que acaban en los logs del proxy.

El sello de tiempo que un UUIDv7 lleva dentro no añade ninguna fuga, porque
`created_at` ya está en claro en la misma fila.

### Vaults y pertenencia

El tenant personal es un vault. Hoy todo usuario tiene exactamente uno, creado
dentro de la misma transacción que la cuenta, así que **cualquier código puede dar
por hecho que existe**.

Ser el vault personal de alguien es la relación `personal_for_user_id`, no una
columna booleana. El índice único sobre esa columna convierte «un solo vault
personal por usuario» en una garantía de la base de datos. Es nula en las vaults
compartidas que traerá el plan Team.

`vault_members` lleva rol desde ya, aunque de momento solo exista `owner`. La
tabla no es un pivot puro y por eso no se llama `vault_user`: cuando existan las
organizaciones llevará además estado de invitación.

**Toda query que toque datos de usuario lleva `vault_id`.** Sin excepciones de
conveniencia; ver `ADR-004`.

### La clave envuelta

`vault_members` guarda además **la clave de la vault, envuelta**: el resultado de
cifrar la clave que abre el contenido con una clave derivada de la contraseña
maestra de ese miembro. Son dos columnas, `wrapped_key` y `wrapped_key_iv`, y para
el servidor son bytes opacos exactamente igual que `ciphertext`.

Las dos son `NOT NULL`, y no por rigor decorativo: un miembro sin clave envuelta es
alguien que no puede abrir su propia vault, y no hay forma de repararlo después
porque la clave vivía en su dispositivo y en ningún otro sitio. Hay un test que lo
comprueba saltándose la capa de aplicación, que es la única manera de saber que la
restricción existe de verdad.

Está en `vault_members` y no en `vaults` ni en `users` porque **no describe a una
vault ni a una persona, sino a la relación entre las dos**: es la respuesta a «cómo
abre esta persona esta vault». En `vaults` habría una sola copia por vault y habría
que rehacerlo al haber dos miembros; en `users`, una sola por persona, y no
admitiría más de una vault.

Consecuencia para quien escriba código: **la clave de la vault es una sola, y lo que
hay por miembro son envoltorios distintos de la misma clave.** Invitar a alguien a
una vault compartida será escribir una fila más, no recifrar nada. Y cambiar la
contraseña maestra reescribe esa fila y ningún item.

El cliente averigua qué vaults tiene con `GET /api/vaults`, que devuelve
identificador, nombre, si es el personal, el rol y la clave envuelta. El servidor no
valida esa clave ni la interpreta: no puede. Es el único endpoint que no lleva vault
en la URL, porque es el que sirve para descubrirlos.

No se resolvió añadiéndolo a `/api/auth/me`, que habría sido más barato mientras
cada usuario tenga uno solo, para no tocar el contrato de autenticación. Esa
decisión se cobró en la Iteración 3: la clave envuelta pudo entrar aquí sin que
`/api/auth` cambiara nada.

### El segundo envoltorio, el de recuperación

Desde la Iteración 4, `vault_members` puede llevar además `recovery_wrapped_key` y
`recovery_wrapped_key_iv`: **la misma clave de vault, envuelta una segunda vez** con
la clave de recuperación de ese miembro en vez de con su clave maestra. Y `users`
lleva `recovery_auth_hash`, que es a la clave de recuperación lo que `password` es a
la contraseña maestra. Los tres los decide `ADR-010`.

Las tres columnas son **nulables**, al contrario que `wrapped_key`, y la diferencia
no es un descuido sino la decisión: un miembro sin `wrapped_key` es alguien que no
puede abrir su propia vault, un estado que no tiene sentido admitir; un miembro sin
`recovery_wrapped_key` es alguien que eligió no tener segunda llave, que es legítimo
y permanente.

Consecuencia para quien escriba código: **la clave de vault sigue siendo una sola.**
Lo que hay ahora son dos maneras de llegar a ella, no dos claves. Por eso cambiar la
contraseña maestra reescribe `wrapped_key` y **no toca** el envoltorio de
recuperación —la clave de vault no ha cambiado—, y por eso quien quiera invalidar
una clave de recuperación robada tiene que regenerarla explícitamente en vez de
confiar en que un cambio de contraseña la expulse.

El envoltorio de recuperación **no viaja en `GET /api/vaults`**. Solo lo entrega
`POST /api/auth/recover`, y solo a quien ha demostrado tener la clave de
recuperación.

### Rotar la contraseña maestra

`PUT /api/auth/master-password` reescribe `users.password` y el `wrapped_key` de
**todas** las vaults del usuario, en una transacción. Los `vault_items` **no se
tocan**: la clave de vault sigue siendo la misma, solo cambia con qué está envuelta.
Ese es el dividendo que compró `ADR-008`.

Exige el hash de autenticación actual además de la sesión, porque un token robado no
puede bastar para dejar fuera al dueño. Y revoca los demás tokens del usuario,
conservando el de la petición: quien cambia su contraseña sospechando un robo espera
que el otro dispositivo deje de entrar, y un token vivo no vuelve a mirar la
contraseña.

Manda todas las vaults o ninguna: el servidor rechaza la petición si faltan, porque
una vault sin reenvolver queda cerrada con una clave maestra que ya no existe y eso
no se descubre hasta que alguien intenta abrirla.


---

## 2) El contrato del blob

Es la parte del modelo que no se puede cambiar sin migrar datos de usuario que
nadie más que el usuario puede leer. Conviene leerla entera antes de tocar
`vault_items`.

### Qué NO tiene la tabla

No hay columna de nombre, ni de usuario, ni de URL, ni de notas, ni de tipo. No
es algo pendiente de una iteración futura.

El razonamiento: no basta con cifrar la contraseña de cada entrada. Si el nombre
de la entrada o su dirección viajaran en claro, el servidor sabría en qué
servicios tiene cuenta cada usuario. Ese metadato es, por sí solo, información
sensible: dice dónde atacar, y en algunos casos es más comprometedor que la
propia contraseña.

Por eso **todo lo que significa algo vive dentro del blob**, y el servidor
almacena bytes con los que no puede hacer nada: ni buscar, ni ordenar, ni
validar.

### Las columnas

| Columna | Tipo | Qué es |
|---|---|---|
| `id` | UUIDv7 | |
| `vault_id` | UUIDv7, FK con borrado en cascada | Obligatoria |
| `ciphertext` | `longText` | El texto cifrado en base64, tal y como lo mandó el cliente |
| `iv` | `string` | El nonce de AES-GCM, en base64 |
| `version` | `unsignedSmallInteger` | Versión del **esquema criptográfico**, no del item |
| `created_at`, `updated_at` | | |

`ciphertext` se guarda como el texto que llegó y no como binario decodificado. Si
el servidor lo decodificara para almacenarlo estaría interpretando el payload, y
cada conversión de ida y vuelta es una oportunidad de corromperlo.

Con AES-256-GCM la etiqueta de autenticación va concatenada al final del texto
cifrado, así que **no necesita columna propia**. Conviene saberlo para que nadie la
añada creyendo que falta.

### Qué va dentro del blob

El cliente serializa a JSON, lo cifra entero y manda el resultado. La forma del
objeto es cosa del cliente y el servidor no la conoce, pero fijarla aquí evita
que cada cliente invente la suya:

```json
{
  "nombre": "GitHub",
  "usuario": "ada@example.com",
  "password": "…",
  "url": "https://github.com",
  "notas": "…",
  "favorito": true,
  "etiquetas": ["trabajo", "dinero"],
  "totp": "otpauth://totp/GitHub:ada@example.com?secret=JBSWY3DPEHPK3PXP&issuer=GitHub"
}
```

| Clave | Tipo | Obligatoria | Qué es |
|---|---|---|---|
| `nombre` | `string` | **Sí** | Lo único que siempre está. Una entrada sin nombre no se puede mostrar ni encontrar |
| `usuario` | `string` | No | |
| `password` | `string` | No | |
| `url` | `string` | No | **No se valida como URL a propósito**: casi nadie escribe el esquema, y aquí solo sirve para reconocer la entrada de un vistazo |
| `notas` | `string` | No | |
| `favorito` | `true` | No | `true` **o ausente, nunca `false`**. Desmarcar borra la clave |
| `etiquetas` | `string[]` | No | **Omitida cuando está vacía, nunca `[]`**. Se comparan sin distinguir mayúsculas ni acentos, y se guarda y se muestra lo que el usuario escribió |
| `totp` | `string` | No | La **semilla** del segundo factor, como URI `otpauth://` o clave base32. **Nunca el código**, que son seis dígitos que caducan y se calculan con esto y el reloj |

Reglas de serialización: JSON UTF-8, claves ausentes en lugar de `null` para lo
que no se rellena, y ningún campo con valor semántico fuera de este objeto.

Que `favorito` sea `true` o nada, y que `etiquetas` desaparezca en vez de quedarse
vacía, **es esa regla aplicada y no una manía**: una clave que dice «no» en cada una
de las 370 entradas son bytes que se cifran, se guardan y se descargan en cada carga
para no llevar información.

### Estos nombres están en español y no se renombran

`nombre`, `usuario`, `password`, `url` y `notas` no son identificadores: **son el
formato del blob**. El objeto se serializa con `JSON.stringify` y se cifra tal cual,
así que sus claves son lo que hay escrito dentro de cada item ya guardado. Renombrar
`nombre` a `name` dejaría ilegible todo lo que hay en todas las vaults, **sin que el
compilador dijera una palabra y sin forma de repararlo**, porque el servidor no puede
leer esos datos para migrarlos.

`favorito` y `etiquetas` se unieron a esa convención, y ahí la elección **sí fue
libre**: se eligió español para no partir el mismo objeto serializado en dos idiomas,
que es peor que cualquiera de los dos. Lo que heredan de los cinco anteriores es lo
que importa: una vez escritos dentro de un item, no se renombran.

`totp` **no está en español, y también es una decisión**: no es una palabra de ningún
idioma sino la sigla del estándar, la misma cadena que usan los demás gestores y toda
URI `otpauth://`. Ponerle un nombre español sería nombrar en español algo que no tiene
nombre español. Hereda lo mismo que los otros: escrito dentro de un item, no se
renombra.

Está avisado también en `web/src/lib/vault/types.ts` y en `CLAUDE.md`, que lo recoge
como la primera de las seis cosas que parecen identificadores y son datos —con el
nombre del store de `localStorage`, la clave que los guards escriben en el `state` de
react-router, los ficheros de `api/database/migrations/`, las claves de
`config/throttling.php` y los `name:` de los workflows—. Está en los tres sitios
porque el compilador no vigila ninguno de ellos.

### Añadir un campo es barato, y qué hay que hacer al añadirlo

**No toca la API**: ni columna, ni endpoint, ni migración. Y **no obliga a subir
`version`**, que es la del esquema criptográfico y no la del contenido — un cliente
que no conozca la clave no la encuentra, porque las claves vacías se omiten.

Lo que sí obliga es a **no perder lo que no se entiende**:

> **Un cliente que lea un item con un campo que no conoce tiene que conservarlo al
> reescribirlo.** El `PUT` manda el contenido entero y no un parche, así que una clave
> que no viaja en la escritura **deja de existir**, en silencio y sin que nada falle.

Y esto no es una precaución teórica: **ya ha pasado**. El editor de entradas
reconstruye el contenido desde los campos del formulario, de modo que guardar una
entrada marcada como favorita la desmarcaba — la clave que el formulario no conocía se
quedaba fuera. Está en el issue #429, y es el motivo de que esta regla esté escrita
aquí en vez de darse por evidente.

La consecuencia práctica para quien añada el siguiente campo: el sitio donde hay que
mirar no es solo el editor, es **todo lo que escribe un item entero**.

**Y hay un campo que además no sale por todas las puertas**: `totp` viaja en el export
cifrado `.evault` como cualquier otro, y **nunca en el export en claro**. Lo decidió
`ADR-017` §2.3 y no es una omisión: una contraseña de un CSV se rota en cinco minutos,
una semilla obliga a reconfigurar el segundo factor cuenta por cuenta. Lo fija
`PLAIN_EXPORT` en `web/src/lib/vault/export.ts`, que es un `Record` sobre
`keyof ItemContent` y por tanto no compila hasta que un campo nuevo diga por cuál de
las dos puertas sale.

**Y un aviso para quien llegue desde `ADR-011`:** su §2.5 dice que «el esquema de un
item de eVault son cinco campos». Era cierto al escribirlo y ya no lo es. Los ADR son
inmutables, así que esa frase se queda ahí; **la cuenta vigente es la tabla de arriba**,
y este documento es el contrato.

### Registro de versiones

| Versión | Esquema | Estado |
|---|---|---|
| 1 | **Codificación reversible, sin criptografía.** base64 del JSON en claro | Retirada. Las filas se borraron en la Iteración 3 |
| 2 | AES-256-GCM con la clave de la vault, que a su vez viaja envuelta con una clave derivada por PBKDF2 de la contraseña maestra | **Vigente** desde la Iteración 3. Ver `ADR-008` |

Matiz sobre la versión 2 que conviene no perder: la clave que cifra un item **no
es** la derivada de la contraseña maestra. Es la clave de la vault, aleatoria, y lo
que la contraseña maestra hace es abrir el envoltorio que la guarda. Eso es lo que
permite cambiar la contraseña maestra sin tocar un solo item, y lo que hará posible
que dos personas lean la misma vault sin compartir contraseña.

Los datos escritos con la versión 1 **no se migran**: se descartan. No existe ruta
desde una contraseña que hasheó el servidor hacia una clave derivada en el cliente,
y lo hace legítimo la condición de no haber desplegado nunca con datos reales. El
cliente ya tolera un `version` que no sabe leer sin romper la lista, así que una
fila superviviente aparece como ilegible en vez de tumbar la pantalla.

**La versión 1 no era cifrado.** Fue la excepción deliberada de la Iteración 2: el
contrato quedaba en su forma definitiva desde el primer día y lo que cambiaba
después era solo el cliente, porque para el servidor siempre son bytes opacos. Es
el mismo patrón que se usó con la autenticación convencional de la Iteración 1, y
funcionó: al llegar el cifrado real no hubo que tocar ni la tabla ni la API.

La apuesta se pagó **retirando la excepción, no ampliándola**. La condición que la
acompañaba —no desplegar con datos reales hasta que la Iteración 3 cerrase— se
respetó, y por eso las filas de la versión 1 se pudieron borrar sin más: no eran
recuperables, porque recifrarlas habría exigido una clave que solo tiene el usuario,
y dejarlas habría llenado la vault de entradas ilegibles para siempre. Lo hace la
migración `descartar_vault_items_sin_cifrar`.

El registro está en la fila, y no en la configuración, precisamente para que la
migración a la versión 2 pueda ser progresiva: el cliente lee la versión de cada
item, decide cómo descifrarlo y lo reescribe con la nueva cuando le toque. No
hace falta una migración que reescriba la tabla entera de golpe, que además sería
imposible: el servidor no tiene las claves.

El servidor **no valida** la versión. Un cliente más nuevo tiene que poder
escribir un esquema que este servidor no conoce; opinar sobre criptografía que no
puede ejecutar solo serviría para bloquear despliegues escalonados. Hay un test
que lo fija.

---

## 3) Lo que el servidor sí sabe

Enumerado a propósito, porque es la superficie de metadatos que queda expuesta y
conviene que sea una lista corta y consciente en vez de una sorpresa:

- Cuántas vaults hay y a qué usuarios pertenecen
- El nombre de cada vault
- **Cuántos items tiene cada vault**
- Cuándo se creó y cuándo se modificó cada item
- El tamaño aproximado de cada item
- Que existe una clave envuelta por miembro, y cuándo se escribió por última vez.
  Su contenido, no: abrirla exige la contraseña maestra de ese miembro. Lo que sí
  delata es **cuándo alguien cambió su contraseña maestra**, que es la única
  operación que reescribe esa fila

Es inherente al modelo mientras las filas existan, y se asume igual que lo asume
Bitwarden. Ninguna de esas cosas revela contenido, pero sí patrones de uso.

Un matiz que los favoritos añadieron sin que fuera evidente: **marcar o desmarcar una
estrella reescribe el item entero**, porque el blob se cifra completo, así que mueve su
`updated_at` igual que cambiar una contraseña. El servidor no puede distinguir las dos
cosas —y eso juega a favor—, pero sí lo hace la consecuencia contraria: `updated_at`
**no dice cuándo cambió la contraseña de una entrada**, solo cuándo se reescribió su
blob. Renombrar una entrada la rejuvenece. Quien quiera responder «esta contraseña es
antigua» necesita una fecha **dentro** del blob, y hoy no existe.

Aviso sobre el nombre del vault: hoy es siempre el literal `Personal`, así que no
dice nada. Cuando lleguen las vaults compartidas será un texto escrito por el
usuario, y **entonces habrá que decidir si entra en el blob**. Es una decisión
pendiente, no un descuido.

---

## 4) Consecuencias para quien escriba código

- **El cliente se sincroniza la vault entera** y descifra en memoria. No hay
  paginación ni búsqueda en servidor, porque el servidor no puede filtrar lo que
  no puede leer. Eso acota cuántos items se pueden manejar con comodidad, y es
  una consecuencia asumida en `ADR-001`.
- **Ningún endpoint recibe ni devuelve un secreto descifrado.**
- **Ninguna lógica de servidor puede depender del contenido de un item.** Si una
  funcionalidad lo necesita, se rediseña la funcionalidad.
- Añadir una columna a `vault_items` es una decisión de seguridad, no de esquema.
  Hay un test que enumera las columnas existentes y falla al añadir cualquiera:
  está para forzar esa conversación, no para actualizarlo sin pensar.

### 404 y nunca 403

Pedir algo a lo que no se tiene acceso responde **404**, no 403, tanto si el
identificador no existe como si existe y pertenece a otro. Un 403 confirmaría que
el identificador es real, y con eso se pueden enumerar vaults e items ajenos sin
llegar a leer ninguno.

La propiedad que hay que conservar al añadir endpoints: **un recurso ajeno y uno
inexistente tienen que responder exactamente lo mismo**, mismo código y mismo
cuerpo. Hay tests que comparan las dos respuestas entre sí en lugar de comprobar
cada una por su lado, porque lo que importa es que sean indistinguibles.

### El double guard, en la práctica

La pertenencia al vault se comprueba **dos veces**, y no es redundancia
decorativa:

1. En presentación, con el middleware `EnsureVaultMembership`, que cubre todo el
   grupo de rutas para que una ruta nueva quede protegida sin que nadie se acuerde.
2. En la capa de aplicación, dentro de cada servicio, que no da por hecho el
   trabajo del middleware.

Lo que la segunda barrera protege es el día en que un comando de consola, un job
en cola o un endpoint nuevo llamen a un servicio sin pasar por el middleware. Hay
un test por servicio que lo llama directamente para comprobarlo.

Además, el acotado por `vault_id` al buscar un item vive en un solo sitio,
`VaultItemLocator`. Repetir esa consulta en cada servicio sería repartir por el
código tres oportunidades de olvidar el `where`, que es exactamente el fallo que
`ADR-004` señala como el más grave posible.
