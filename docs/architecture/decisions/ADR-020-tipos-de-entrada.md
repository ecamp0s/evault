# eVault — Los tipos de entrada de la vault

Fecha de decisión: 2026-09-08
Fecha de registro: 2026-09-08
Estado: Aprobada
Depende de: ADR-001 (zero-knowledge), ADR-008 (arquitectura de claves), ADR-011 (formato de export e import), ADR-017 (códigos TOTP en la vault), ADR-019 (la vault sin red)

## 1) Contexto

La vault guarda 370 entradas y las 370 son logins: nombre, usuario, contraseña, URL y
notas. Quien la usa a diario pidió el 3 de septiembre de 2026 poder guardar además
**tarjetas y notas**, que es lo que hoy no tiene sitio.

Y «no tiene sitio» no significa que no se guarde: significa que se guarda mal. Una
tarjeta hoy solo cabe metiendo el número en el campo de notas de un login, y ese campo
**lo indexa la búsqueda** y **sale en claro en la columna `note` del CSV**. El número
con el que se paga acaba tratado como un comentario.

### Lo que ya estaba preparado sin que fuera a propósito

Tres sitios del repositorio dan por supuesto que esto iba a llegar, y conviene saberlo
antes de diseñar nada:

- `web/src/lib/vault/audit.ts` **ya excluye del recuento las entradas sin contraseña**,
  y su comentario dice literalmente que una tarjeta o una nota no tienen nada que decir
  ahí. Es una afirmación sobre un caso que todavía no existe, así que hay que
  comprobarla y no heredarla.
- `EDITOR_FIELDS` en `schema.ts` y `PLAIN_EXPORT` en `export.ts` son dos `Record` sobre
  `keyof ItemContent`, de modo que **añadir un campo deja de compilar** hasta que
  alguien diga qué hace el editor con él y por qué puerta sale.
- `FOUNDATION.md` §2 ya dice que añadir un campo al blob no toca la API ni obliga a
  subir `version`.

## 2) Lo caro de deshacer: el nombre de un campo

Todo lo demás de esta decisión se puede rectificar en un PR. Una cosa no.

**Una clave escrita dentro de un item no se renombra nunca.** El objeto se serializa
con `JSON.stringify` y se cifra tal cual, así que sus claves son lo que hay escrito
dentro de cada entrada ya guardada. Renombrar una deja ilegible lo que hubiera bajo
ella, **sin que el compilador diga una palabra**, y el servidor no puede repararlo
porque no puede leerlo. Es lo que `FOUNDATION.md` fija para `nombre`, `usuario`,
`password`, `url` y `notas`, y lo que `ADR-017` §2.2 heredó al añadir `totp`.

De ahí que este ADR vaya **primero y solo**, como `ADR-015` en la Iteración 9 y
`ADR-017` en la 13: los nombres de los campos nuevos se eligen una vez.

## 3) Opciones evaluadas

**Opción A (elegida): un campo `tipo` opcional dentro del blob, y campos aditivos.**
`tipo` ausente significa login. Las entradas que ya existen no se tocan y no hay
migración de ninguna clase.

**Opción B (descartada): `tipo` obligatorio, con una migración del cliente.** Exigiría
reescribir las 370 entradas de la vault real —370 escrituras contra la instancia
donde están las contraseñas de verdad— para no ganar nada que la ausencia no dé ya. Y
si se interrumpe a la mitad deja la vault en un estado mixto que ningún test cubre y
que el servidor no puede diagnosticar.

**Opción C (descartada): una columna `type` en `vault_items`, o un endpoint por tipo.**
Es la que rompe el proyecto. El servidor pasaría a saber **cuántas tarjetas tiene cada
usuario**, que es exactamente el metadato que `ADR-001` y `FOUNDATION.md` §2 se niegan a
almacenar: no basta con cifrar el contenido si la forma de la fila cuenta la historia.

**Opción D (descartada): no hacer nada.** Es lo de hoy, y lo que la descarta no es la
comodidad sino dónde acaba el número de la tarjeta: en un campo que la búsqueda indexa
y que el export en claro publica como una nota.

## 4) Decisión final

| Elemento | Definición |
|---|---|
| Cómo se distingue el tipo | Clave `tipo` **dentro del blob** |
| Tipos | `tarjeta`, `nota`, y **ausente = login** |
| Entradas existentes | **No se tocan.** Ninguna migración, ninguna reescritura |
| Cambiar el tipo | **No.** Se fija al crear; quien quiera otra cosa crea otra entrada |
| Campos nuevos | `titular`, `numero`, `caducidad`, `csc`, `pin`, todos opcionales |
| Campos de la nota | Ninguno nuevo: `nombre`, `notas` y `etiquetas` |
| Qué es secreto | `numero`, `csc` y `pin`, tratados como `password` |
| Validación | **Tope de longitud, sin forma** |
| Export cifrado | Se lo lleva todo, como cualquier campo |
| Export en claro | **Se lleva la tarjeta**, en columnas propias |
| Auditoría | **No cuenta** lo que no tiene contraseña |
| Documentos adjuntos | **Fuera.** Ver §7 |
| API | **No se toca.** Ni endpoint, ni columna, ni migración |
| `version` | No sube. Es la del esquema criptográfico, no la del contenido |
| `ADR-019` | **Sin cambios.** El caché guarda ciphertext y le da igual el contenido |

## 5) Los nombres de los campos, que es lo que no se rectifica

`titular`, `numero`, `caducidad` y `pin` van en español, como el resto del blob y por
el mismo motivo que `favorito` y `etiquetas`: partir el mismo objeto serializado en dos
idiomas es peor que cualquiera de los dos.

**`csc` y no `cvv`, y es una decisión y no una preferencia.** CSC —*Card Security
Code*— es el término genérico del código de seguridad; cada marca llama al suyo de otra
forma: **CVV2** en Visa, **CVC2** en Mastercard, **CID** en American Express y en
Discover. Llamarlo `cvv` metería el nombre de una marca dentro de todas las tarjetas
guardadas, y con él su suposición de que son tres dígitos.

Le aplica el precedente exacto de `totp`: es la sigla de un estándar y no una palabra
de ningún idioma, así que ponerle nombre español sería nombrar en español algo que no
lo tiene. Y hereda lo mismo que los demás: escrito dentro de un item, no se renombra.

**Lo que ve el usuario es otra cosa y va en español: «Código de seguridad».** Sirve para
las cuatro marcas, que es justo lo que «CVV» no hace.

**No hay campo de marca de tarjeta.** Detectarla exigiría una tabla de BIN dentro del
mismo cliente que sirve el JavaScript que cifra las contraseñas —de lo que avisa
`ADR-001`—, y equivocarse mostrando el icono de la marca que no es, sobre un campo que
además se valida distinto, es peor que no saberlo.

## 6) La regla que gobierna la validación: tamaño sí, forma no

Cualquier regla de forma sobre una tarjeta es una conjetura sobre las marcas que
tenemos delante, y equivocarse significa **negarse a guardar una tarjeta que el usuario
tiene en la mano**:

| Campo | Por qué no tiene forma fija |
|---|---|
| `numero` | Una American Express tiene **15 dígitos y no 16**, agrupados 4-6-5 |
| `csc` | **4 dígitos en Amex** y al anverso; 3 en las demás y al dorso |
| `pin` | No siempre son cuatro: hay emisores de cinco y de seis |
| `caducidad` | Se guarda lo que se escribe |

El repositorio ya tiene resuelto cuál de sus dos filosofías aplica. La URL **no** se
valida como URL a propósito, porque negarse a aceptar `github.com` sería pelearse con
el usuario. La semilla TOTP **sí** se valida a fondo, porque guardar una ilegible
produce seis dígitos plausibles que nadie acepta y para entonces el QR ya no está.

**La tarjeta es el primer caso**: si el número está mal, la tarjeta sigue encima de la
mesa y se vuelve a mirar. No hay ningún momento equivalente a «el QR ya no está».

Lo que sí se acota es la longitud, por el motivo de siempre: los campos viajan dentro
del blob, así que **lo que el cliente no valida no lo valida nadie**. Es la excepción
real al double guard, y un import masivo es su prueba de esfuerzo.

**Y el fallo concreto que esta regla existe para no cometer**: que un código de
seguridad de cuatro dígitos se trunque a tres en silencio.

## 7) Lo que queda fuera: los documentos adjuntos

Se pidieron junto con las tarjetas y las notas, y **no entran**. El motivo no es el
esfuerzo, es que no son un campo del blob:

- **`GET /items` devuelve todos los items, sin paginar ni filtrar**, y está escrito así
  a propósito en `ListVaultItems` porque el servidor no puede filtrar lo que no puede
  leer. Un adjunto dentro del blob se descargaría entero **en cada carga de la vault**.
- **`ADR-019` guarda ese mismo ciphertext en el dispositivo.** Los adjuntos acabarían
  en el IndexedDB de cada móvil que active el caché.
- **`VaultItemRequest` limita el ciphertext a 131.072 caracteres**, unos 96 KB de
  binario. No cabe la foto de un documento, y subir el techo no arregla lo anterior:
  lo empeora.

Un adjunto necesita **tabla y endpoint propios, con descarga bajo demanda**, y eso es
una decisión de API que merece su propio ADR y su propia iteración. Se anota aquí para
que no se reabra como si fuera un campo más.

## 8) Lineamientos técnicos resultantes

- **Ausente significa login, y por eso no hay migración.** Es el contrato que ya rigen
  `favorito` y `etiquetas`: se omite lo que no está.
- **El tipo no se cambia después de crear.** `toContent` construye sobre lo que había
  guardado —el arreglo de #429—, así que cambiar el tipo dejaría los campos del
  anterior viviendo invisibles dentro de la entrada.
- **Un cliente que no entienda un campo tiene que conservarlo.** Sigue siendo la regla
  de `FOUNDATION.md` §2, y ahora tiene un caso nuevo: un cliente viejo que abra una
  tarjeta la verá como una entrada rara, y **no puede destruirla al guardarla**.
- **El número no se pinta en la lista**, ni entero ni con los últimos cuatro dígitos.
  Hereda la regla de la contraseña, que tiene test: lo que no está en el DOM no lo lee
  una extensión ni una captura. Y los últimos cuatro dígitos son precisamente lo que
  pide un banco por teléfono.
- **La búsqueda no indexa los tres secretos.** Buscar por ellos significaría teclear un
  secreto en un campo que se muestra en claro y acaba en el historial del formulario.
- **La auditoría no cuenta lo que no tiene contraseña, y hay que comprobarlo por
  mutación**: quitar la exclusión tiene que poner un test en rojo. Un test que pasa con
  el arreglo y sin él es la lección de #360, y la 14 la reaprendió en sitio nuevo.

## 9) Consecuencias asumidas

1. **Un cliente anterior a esta decisión verá las tarjetas como entradas raras.** No
   rompe —los campos son opcionales— y no las destruye si respeta la regla de arriba,
   pero durante un tiempo puede haber un móvil con la versión vieja en caché mostrando
   una entrada que no entiende.
2. **El export en claro lleva ahora un número de tarjeta.** Es coherente con que lleve
   las contraseñas y con para qué existe ese fichero —irse—, pero sube lo que cuesta
   perderlo. No sigue a `totp` porque la semilla es **persistente**: rehacerla es
   reconfigurar el segundo factor servicio a servicio, mientras que una tarjeta se
   reemite en una llamada.
3. **El recuento de la auditoría cambia de denominador aunque no cambie de número.**
   Hoy es 246 de 369; con notas y tarjetas dentro, el 369 deja de ser «las entradas» y
   pasa a ser «las entradas con contraseña». Hay que decirlo donde se lea la cifra.
4. **La vault sembrada de `verify-large-vault` deja de parecerse a la real si no se
   actualiza.** Su proporción de contraseñas malas —dos de cada tres— está medida sobre
   la vault de verdad, y el límite de la revisión mide cuánto multiplica la página lo
   que está **mal**. Si esa proporción pasa a calcularse sobre el total, el límite pasa
   midiendo menos de lo que cree.

## 10) Impacto en APIs y contratos

**Ninguno.** No hay endpoint nuevo, ni columna, ni migración, ni cambio en la forma de
ninguna respuesta, ni subida de `version`. Todo ocurre dentro del blob, que el servidor
almacena sin interpretar.

Es una afirmación comprobable y por eso es criterio de salida de la iteración:
`git diff --stat master -- api/` tiene que salir vacío al cerrarla.

**Ningún ADR queda superseded.** `ADR-011` sigue fijando el formato de export y este
documento solo añade columnas dentro de él; `ADR-017` §2.3 sigue reteniendo la semilla
en el export en claro, y la §9 de este documento dice por qué la tarjeta no la
acompaña; y `ADR-019` no se entera de nada, porque cachea ciphertext.
