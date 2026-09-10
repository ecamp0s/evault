# eVault — Reconciliar al importar

Fecha de decisión: 2026-09-10 (al planificar la Iteración 17)
Fecha de registro: 2026-09-10
Estado: Aprobada
Depende de: ADR-001 (zero-knowledge), ADR-011 (formato de export e import), ADR-018 (qué se conserva tras un borrado), ADR-020 (tipos de entrada)
Relacionado: ADR-017, de donde ADR-018 heredó el criterio sobre qué sale en cada fichero de export; ADR-019, que fija qué se puede hacer sin red

## 1) Contexto

La vault está vacía desde el issue #544, que la vació para pagar el renombrado de
los campos del blob. Lo que tiene que entrar en ella son las contraseñas que hoy
viven repartidas entre varios gestores, y **entre ellos hay solapamiento**: la
misma cuenta guardada dos y tres veces, a veces con la misma contraseña y a veces
no.

`ADR-011` decidió que importar **añade y nunca sustituye**, que es la propiedad
que hace que un fichero equivocado no pueda destruir nada. Con esa política,
importar dos gestores que se solapan produce dos copias de cada entrada repetida,
y reconciliarlas después es trabajo manual sobre la vault ya cargada — el peor
momento para hacerlo, porque ya no se sabe cuál vino de dónde.

De ahí la pregunta de este ADR: **qué hace el import cuando reconoce que dos
entradas son la misma cuenta.**

### El historial de contraseñas ya estaba decidido, y esto no lo sabía

**`ADR-018` §2.1 creó el campo el 2 de septiembre de 2026**, un mes antes de que se
planificara esta iteración: una lista acotada de `{ contraseña, fecha }` dentro del
item, **tres por entrada**, con fecha informativa y olvido explícito por entrada y para
la vault entera. Está **aprobado y diferido**, «a una iteración por decidir».

Esta iteración se planificó proponiendo un campo nuevo para guardar la contraseña que
pierde una reconciliación, sin haber comprobado que ya existía uno decidido. Se dice
porque es la misma clase de fallo que este proyecto lleva corrigiendo desde la
Iteración 4 —una decisión escrita que nadie vuelve a leer— y porque el resultado es
mejor: el tope, la fecha y el olvido no hay que decidirlos aquí, ya lo están.

**El campo se llama `history` y no `historial`.** `ADR-018` lo nombra en español
veinticuatro veces porque se escribió siete días antes de que el #542 retirara esa
regla; el #571 dejó la corrección anotada y esta es la decisión que la ejecuta.

Lo que sí hay que decidir aquí es lo que `ADR-018` §2.3 cerró en la dirección
contraria, y está en §2.2.

### Lo que ya estaba preparado sin que fuera a propósito

`ADR-011` §2.4 no solo eligió «añadir siempre»: eligió añadir **con una
previsualización que señale los que parecen repetidos y deje al usuario
deseleccionarlos**, y cerró la sección con una frase que sigue mandando —«la
detección avisa; no decide»—. `findDuplicates` existe desde entonces, y el #442
la amplió para mirar también dentro del propio fichero.

Es decir: el proyecto ya tenía la mitad de este problema resuelto y la política
correcta escrita. Lo que faltaba era que la detección sirviera **entre gestores
distintos** y que hubiera algo que hacer con lo detectado, más allá de no
importarlo.

### Lo que se midió antes de escribir esto

Todo lo que sigue sale del issue #610, sobre los ficheros reales y no sobre
ejemplos.

**Eran cuatro fuentes previstas y son tres.** Passwords de iOS **no exporta CSV**:
lo único que ofrece es transferir directamente a otro gestor. La vía de transferir
el llavero a Chrome y reexportar se descartó porque mete el llavero de Apple en la
cuenta de Google, que es una decisión rara mientras se monta una vault
zero-knowledge. Y de las tres que quedan, **Firefox aporta 2 entradas de 997**:
esto es Chrome contra NordPass.

| Fuente | Entradas |
|---|---|
| Chrome | 618 |
| NordPass | 377 |
| Firefox | 2 |
| **Suma** | **997** |
| **Tras reconciliar** | **668** |

**329 duplicados, un tercio del total.** Repartidos en **261 grupos**, de los
cuales **225 cruzan fuentes** y **36 son internos de una sola** —32 dentro de
Chrome y 4 dentro de NordPass—, porque Chrome guarda la misma cuenta una vez por
URL de formulario. El grupo mayor tiene **9 entradas del mismo host y usuario, con
dos contraseñas distintas entre ellas**.

Y el número que más decisiones cambió: **solo 25 de los 261 grupos tienen
contraseñas discrepantes**. En los otros 236 no hay nada que elegir.

## 2) Opciones evaluadas

### 2.1) Qué es «la misma cuenta»

No hay identificador estable entre dos gestores —`ADR-011` §2.4 ya lo dice—, así
que la identidad solo puede ser una heurística sobre lo que las entradas traen.
Cuatro candidatas, medidas sobre los mismos ficheros:

| Criterio | Grupos | Cruzan fuentes | Con contraseñas distintas |
|---|---|---|---|
| **A** `nombre + usuario` — el que ya existía | 131 | 93 | 16 |
| **B** `host + usuario` | 260 | 225 | 24 |
| **C** `host + usuario`, normalizados | **261** | **225** | **25** |
| **D** dominio registrable `+ usuario` | 262 | 222 | 41 |

#### Opción A (descartada): seguir con nombre y usuario

- Es lo que hay, no cuesta nada y **funciona para el caso que la vio nacer**:
  reimportar el mismo fichero, donde el nombre lo escribió el mismo programa.
- **Ve la mitad de los duplicados que hay: 131 de 261.** Y no por un defecto de
  implementación: el nombre es lo único que cada gestor escribe a su manera.
  Firefox no trae nombre en absoluto y `nameFromUrl` lo deriva del host, así que
  la misma cuenta se llama `GitHub` en Chrome y `github.com` en Firefox.

#### Opción D (descartada): el dominio registrable

- Agrupa lo que a una persona le parece el mismo sitio aunque el subdominio
  cambie, que es un caso real: `login.ejemplo.com` y `www.ejemplo.com`.
- **Funde entornos distintos, y está medido**: entre los grupos grandes aparecen
  `dev.`, `pre.` y `elcomercio.multidiario.com`, con 9, 6 y 7 entradas. Son
  desarrollo, preproducción y producción del mismo sitio, **con credenciales
  distintas a propósito**. D los presenta como una sola cuenta con tres
  contraseñas en conflicto.
- Sus 716 entradas agrupadas frente a las 590 de C son, en su mayoría, de esta
  clase. **Sube el ruido justo en los grupos que más cuesta revisar.**

#### Opción C (elegida): el host y el usuario, normalizados

- Encuentra **el doble** que el criterio actual y **no funde entornos distintos**,
  porque el host completo los distingue.
- Gana a B por poco —un grupo y cuatro entradas—, y lo que aporta la
  normalización a minúsculas no es volumen sino evitar que dos correos que solo
  difieren en la caja pasen por cuentas distintas. No cuesta nada.
- Coste asumido: **dos subdominios del mismo servicio se quedan separados**.
  Es el error en la dirección segura: quien lo vea puede unirlos a mano, mientras
  que lo que D fusionaba de más obliga a separarlo antes de guardar.

### 2.2) Si la reconciliación puede escribir en el historial

Solo importa en 25 grupos de 261, y es la decisión más cara de las que hay aquí, porque
**`ADR-018` §2.3 la cerró en la dirección contraria** con una frase que no deja lugar a
dudas:

> **El import nunca crea historial.** Una entrada que llega de Chrome, de Firefox o de
> Bitwarden llega sin pasado, y una vault restaurada desde un `.evault` conserva el que
> tuviera. No hay forma de fabricar historia que no ocurrió, y no se intenta.

#### Opción A (descartada): respetarla literalmente y descartar la contraseña perdedora

- Es lo que dice el documento, y no toca nada.
- **Irreversible, sobre el dato que precisamente no se conoce.** Quien importa dos
  gestores no sabe cuál de las dos contraseñas es la actual: ese es el problema, no un
  detalle de la solución. Elegir mal pierde la buena para siempre, y `ADR-011` §2.4
  llama a eso «la peor forma en que esta funcionalidad puede fallar».

#### Opción B (descartada): respetarla literalmente y mantener las dos entradas

- Es exactamente lo que `ADR-011` hace hoy, y no rompe nada.
- **Deja la vault con los duplicados que esta iteración existe para evitar.**

#### Opción C (elegida): escribir en el historial, con la marca que impide fabricar pasado

La frase de `ADR-018` tiene un motivo escrito, y el motivo es más estrecho que la
frase: **no fabricar historia que no ocurrió**. Un import de una sola fuente no sabe
nada del pasado de una entrada, así que cualquier historial que escribiera sería
inventado — y ahí `ADR-018` tiene razón entera.

Una reconciliación no está en ese caso. **Las dos contraseñas existen las dos**, cada
una escrita por un gestor real; lo que no se sabe no es si ocurrieron, sino **cuál es
la actual**. Guardar la que no gana no inventa nada: registra algo que es cierto.

Lo que sí sería inventar es **presentarla como una contraseña retirada**, que es lo que
significa una entrada de historial escrita por una rotación, y ponerle una fecha que
diría cuándo se retiró cuando lo que se sabe es cuándo se importó. Por eso cada entrada
del historial **nace sabiendo de dónde viene**:

- **De una rotación**: su dueño la cambió. Es historial en el sentido de `ADR-018`.
- **De una reconciliación, sin confirmar**: hay dos contraseñas conocidas y **nadie ha
  dicho cuál vale**. No afirma que esté retirada.

La marca no es un adorno de la interfaz: **es lo que hace que esta opción no contradiga
el motivo de `ADR-018`**. Sin ella, esta decisión sería la Opción A de aquel ADR
aplicada donde su autor dijo que no.

Coste asumido: **el historial deja de significar una sola cosa**, y todo lo que lo lea
—la pantalla, la auditoría, el export— tiene que saber cuál de las dos está mirando.

### 2.3) Si la fusión decide o propone

`ADR-011` §2.4 descartó la Opción C, *fusionar automáticamente*, con este
argumento: «una heurística que se equivoca hacia el lado de fusionar pierde datos
en silencio».

**Ese argumento sigue siendo correcto y no se revisa.** Lo que se revisa es su
alcance, y la distinción es estrecha a propósito:

- La heurística **agrupa y propone**. No escribe.
- **Decide una persona**, con las dos entradas y sus diferencias delante.
- Y lo que la persona descarta **no se pierde en silencio**: va al historial.

Es decir, las dos condiciones que hacían inaceptable la fusión automática —que
decidiera la heurística, y que lo descartado desapareciera— dejan de darse. La
frase de `ADR-011` que gobierna esto, «la detección avisa; no decide», **se
mantiene literalmente**.

Si esa acotación no se sostuviera, lo correcto sería no hacer esta iteración, no
estirar la definición.

### 2.4) Mismo host y ningún usuario en ninguna de las dos

Medido: **4 grupos, 8 entradas**. Uno de ellos, `google.com`, tiene dos
contraseñas distintas, así que casi seguro son dos cuentas y no un duplicado.

Se decide **agruparlas igual y dejar que se separen a mano**. Con cuatro casos, el
coste de separar lo que se agrupó de más es cuatro decisiones; el de no agrupar
nunca sin usuario es no ver duplicados reales, para siempre y en silencio. La
asimetría es lo que decide, no el número.

### 2.5) La identidad coincide y el tipo no

`ADR-020` fija que el tipo de una entrada **se fija al crearla y no se cambia
nunca**, porque cambiarlo dejaría los campos del tipo anterior viviendo
invisiblemente dentro: una contraseña que nadie ve dentro de una tarjeta.

Así que **dos entradas de tipo distinto no se fusionan aunque compartan
identidad**. No es un caso de laboratorio: el fichero de NordPass trae los dos
tipos, y las cuatro filas que no son logins no traen url ni usuario, así que en la
práctica quedan fuera de la reconciliación por sí solas.

### 2.6) Dónde se reconoce lo que hay que revisar

Guardar la contraseña perdedora resuelve la pérdida y crea un problema nuevo:
**cómo se sabe después qué entradas quedaron sin decidir**.

La distinción que lo hace utilizable es que **no todo historial hay que
revisarlo**. Una contraseña anterior porque su dueño la rotó es historial y ya
está; una que está ahí porque dos fuentes discrepaban y nadie dijo cuál valía es
un **conflicto sin resolver**. Cada entrada del historial nace sabiendo de cuál de
las dos cosas viene.

El conflicto se marca en tres sitios, y ninguno es nuevo: el resumen del import,
la auditoría —como cuarto hallazgo— y la propia entrada. **Se apaga con un gesto
explícito y con ninguna otra cosa.**

La auditoría es el sitio porque ya es donde vive «lo que hay que arreglar», y
porque su propio código lleva escrita la advertencia que aquí importa: una
auditoría que marca casi todo se ignora entera. **Con 25 conflictos sobre 668
entradas, este hallazgo enciende el 4 % de la vault** — el más pequeño de los
cuatro, y por eso el que más probablemente se atiende.

### 2.7) Qué pasa cuando un grupo trae más contraseñas que el tope

**`ADR-018` fijó el tope en tres por entrada**, y lo fijó pensando en rotaciones: la
profundidad que cubre cambiar una contraseña, que falle y volver a cambiarla.

Una reconciliación puede llegar con más de una vez. El grupo mayor medido tiene **9
entradas**, aunque solo **dos contraseñas distintas** entre ellas, y en los 261 grupos
no aparece ninguno que traiga más de tres distintas. Así que hoy el caso no ocurre —
pero la regla tiene que existir antes de que ocurra, no después.

**El tope se respeta y se dice cuántas se dejaron fuera.** Es la regla de `ADR-011`
§2.4 aplicada al único sitio donde esta iteración puede perder algo: no se descarta en
silencio. Y se descartan **las que ya estaban confirmadas**, conservando las que están
sin decidir, porque una contraseña retirada hace tiempo vale menos que una que todavía
puede ser la buena.

Lo que **no** se hace es subir el tope para que quepan. Tres es una decisión con
argumento medido detrás —el coste de un blob que se cifra, se descifra y se manda
entero en cada edición— y llegar aquí con un caso hipotético no es motivo para moverlo.

### 2.8) Qué sale en cada fichero de export

**Ya está decidido y no se reabre.** `ADR-018` §2.3: el `.evault` lleva el historial y
el CSV en claro no lo lleva nunca, diciendo a cuántas entradas afecta. Ninguna de las
dos versiones sube, ni la del esquema criptográfico ni la del formato del fichero.

Lo único que esta decisión añade es que **la marca de origen viaja con cada entrada del
historial dentro del `.evault`**. Una copia que devolviera el historial perdiendo el
«sin confirmar» dejaría la revisión hecha sin que nadie la hubiera hecho.

## 3) Decisión final

Se adoptan la Opción **C** de 2.1, la **C** de 2.2, y lo decidido en 2.3 a 2.8.

| Elemento | Definición | De dónde sale |
|---|---|---|
| Identidad | `host` sin `www.` + `usuario`, ambos en minúsculas | Aquí, §2.1 |
| Qué hace la heurística | Agrupa y propone. No escribe | Aquí, §2.3 |
| Quién decide | Quien importa, con las diferencias delante | Aquí, §2.3 |
| Superviviente propuesto | La entrada más completa; a igualdad, la primera | Aquí, §2.1 |
| Campos que se fusionan | Los vacíos se rellenan; etiquetas en unión; notas concatenadas e identificadas | Aquí |
| Contraseña y semilla | No se fusionan nunca. La que no gana va al historial | Aquí, §2.2 |
| Tipos distintos | No se fusionan, aunque la identidad coincida | `ADR-020` |
| Sin usuario en ninguna | Se agrupan igual; se separan a mano | Aquí, §2.4 |
| Campo del historial | `history` de `ItemContent`, omitido cuando está vacío | `ADR-018` §2.1, con el nombre del #571 |
| Forma de cada entrada | Contraseña y fecha, **más la marca de origen** | `ADR-018` §2.2 + §2.2 de aquí |
| Cuántas por entrada | **Tres.** Sin caducidad por tiempo | `ADR-018` §2.2 |
| Si el grupo trae más de tres | Se respeta el tope y se dice cuántas quedaron fuera | Aquí, §2.7 |
| Se puede olvidar | Sí, por entrada y para la vault entera | `ADR-018` §2.2 |
| Marca de conflicto | Se apaga solo con un gesto explícito | Aquí, §2.6 |
| Export `.evault` | Lleva el historial, **con su marca de origen** | `ADR-018` §2.3 + §2.8 de aquí |
| Export en claro (CSV) | **No lo lleva nunca**, y dice a cuántas entradas afecta | `ADR-018` §2.3 |
| `version` del esquema y del `.evault` | **No suben ninguna de las dos** | `ADR-018` §2.3 |
| Política de import | **Sigue siendo añadir.** Nunca borra | `ADR-011` §2.4 |

### Qué de `ADR-018` entra en vigor con esto, y qué sigue diferido

`ADR-018` está aprobado **con entrada en vigor diferida a una iteración por decidir**, y
decide tres cosas que no tienen por qué llegar juntas. Esta es esa iteración **solo para
la primera**:

- **Entra en vigor el historial de contraseñas** —§2.1, §2.2 y §2.3—, porque la
  reconciliación lo necesita para no perder nada.
- **Siguen diferidas la papelera con `deleted_at` y la caducidad del token a 12 horas.**
  No las necesita nada de esta iteración, y arrastrarlas por venir en el mismo documento
  sería exactamente lo que `ADR-018` §1 explica que se hizo al agruparlas: juntarlas para
  decidirlas, no para implementarlas a la vez.

### Por qué la regla del superviviente no mira fechas

Porque no las hay. **Ninguna de las tres fuentes exporta cuándo se cambió la
contraseña**: Chrome y NordPass no traen la columna, y la de Firefox está en
`NOISE_COLUMNS` desde el #381 por ser contabilidad del programa —y son dos
entradas—. El comentario de `findDuplicates` tenía razón cuando decía que no
existe forma de saber qué contraseña es la actual, y sigue sin existir.

Lo que quita peso a esa regla es que **decide poco**: en 236 de los 261 grupos las
contraseñas coinciden.

## 4) Lineamientos técnicos resultantes

**Todo ocurre en el cliente, y no por comodidad.** El servidor no puede agrupar lo
que no puede leer. Es `ADR-001` produciendo una funcionalidad en vez de una
restricción, igual que la búsqueda, el orden, la lista de etiquetas y la
auditoría. **La API no cambia**: ni un endpoint nuevo, ni una columna.

**El campo se llama `history`.** `ADR-018` lo nombra `historial` veinticuatro veces
porque se escribió siete días antes de que el #542 retirara esa regla, y el #571 dejó
anotado que implementarlo tal como está escrito fabricaría español nuevo dentro del
blob. Es un campo del blob, así que su nombre queda escrito dentro de cada entrada
guardada y **el servidor no puede convertirlo porque no puede leerlo**: renombrarlo
después se paga con una migración en el cliente o con una base vacía.

**Ausente cuando está vacío**, como `favourite` y `tags`, por la razón que ya está
medida: una clave que dice «no» en cada entrada son bytes que se cifran, se
guardan y se descargan para no decir nada. **Ninguna entrada existente necesita
migración.**

**El historial lo escribe `toContent`, y la reconciliación es la segunda puerta.**
`ADR-018` §4 pidió que fuera el único sitio, y el motivo sigue siendo bueno: es la única
función que ve a la vez el contenido anterior y el nuevo, y es pura, así que la promesa
se puede probar mutando. La reconciliación **no pasa por ahí** —no está editando una
entrada, está construyendo una a partir de dos—, así que se admite un segundo punto de
escritura, con dos condiciones: que sea uno solo, y que tenga sus propios tests de
mutación. Lo que no se hace es dejar que cada pantalla escriba historial.

**Las contraseñas del historial son contraseñas**: no se pintan en la lista, no las
indexa la búsqueda, y se copian con el helper que limpia el portapapeles.

**La auditoría no cuenta el historial**, que `ADR-018` §4 ya pedía con un test propio:
una contraseña retirada no puede aparecer como «repetida» contra la actual de su misma
entrada. El hallazgo que esta iteración añade es distinto —marca el conflicto sin
resolver, no la contraseña— y las dos cosas tienen que convivir sin que la segunda
reintroduzca la primera.

**Los tests del tope se escriben con números concretos y no contra la constante**, que
es lo que `ADR-018` §4 pidió recordando las diecinueve pruebas de la Iteración 13 que se
movían con el umbral. Mover el tres tiene que romper tests.

## 5) Consecuencias asumidas

1. **La vault custodia más secretos de los que el usuario metió**, que es la
   consecuencia central de `ADR-018` §5 y que esta decisión **amplía**: no solo guarda
   lo que se rotó, sino lo que dos gestores discrepaban. Las mitigaciones son las
   mismas: el tope de tres y el olvido explícito.
2. **El historial deja de significar una sola cosa.** Una entrada puede ser una
   contraseña retirada o una candidata sin confirmar, y todo lo que lo lea tiene que
   distinguirlas. Es el precio de §2.2 y se paga en cada pantalla que lo muestre.
3. **Dos subdominios del mismo servicio se quedan separados.** Es el coste de no elegir
   D, y es el error en la dirección segura.
4. **La reconciliación puede agrupar dos cuentas distintas.** Está medido en cuatro
   casos, todos sin usuario, y la pantalla permite decir «no eran la misma».
5. **Fusionar contra una entrada ya guardada la actualiza.** Es lo más cerca que esta
   iteración pasa de lo que `ADR-011` quiso prohibir, así que la pantalla tiene que
   enseñar que va a modificar algo existente, y lo editado a mano después de un import
   no se pisa sin decirlo.
6. **Lo que solo esté en el llavero de Apple no entra en la vault.** Consecuencia de
   descartar Passwords de iOS como fuente, escrita aquí para que no se descubra después.

## 6) Triggers de reevaluación

1. **Aparece un identificador estable entre gestores.** Toda la heurística existe
   porque no lo hay. Si algún formato de intercambio se estandariza y lo trae, la
   identidad deja de ser una heurística y §2.1 sobra.
2. **La marca de conflicto se enciende en mucho más del 4 % de la vault.** Sería la
   advertencia de `audit.ts` cumpliéndose, y habría que cambiar cómo se presenta
   antes de que la auditoría entera empiece a ignorarse.
3. **Un grupo llega con más de tres contraseñas distintas.** Hoy no ocurre en ninguno de
   los 261, y §2.7 decide qué hacer sin subir el tope. Si ocurriera a menudo, lo que
   habría que revisar es el tope de `ADR-018` §2.2, no esta sección.
4. **Apple añade exportación a CSV.** Volvería a haber una fuente descartada aquí
   por no existir el fichero, no por una decisión de diseño.
5. **Aparecen las vaults compartidas.** La identidad de una entrada tendría que
   valer entre dos personas, y «lo decide quien importa» deja de tener un sujeto
   único.

## 7) Impacto en APIs y contratos

**Ninguno en la API.** No hay endpoint nuevo, ni columna nueva, ni nada que el
servidor tenga que entender. Un item reconciliado se escribe con el mismo
`PATCH /api/vaults/{vault}/items/{item}` que cualquier edición.

**El contrato del blob gana el campo `history`**, que `ADR-018` §2.1 ya había decidido y
que se documenta en `FOUNDATION.md` §2 con el nombre corregido.

**`ADR-011` queda parcialmente revisado en su §2.4**, en el alcance de §2.3 de este
documento: lo que aquel descartó fue la fusión automática y silenciosa, y eso sigue
descartado.

**`ADR-018` queda parcialmente revisado en su §2.3**, en el alcance de §2.2: su regla de
que el import nunca crea historial sigue valiendo para un import de una sola fuente, que
es el caso que tenía delante. Lo que se admite es que una **reconciliación** escriba en
él, porque ahí las dos contraseñas existen de verdad y lo desconocido es cuál es la
actual — con la marca de origen impidiendo que una candidata se presente como retirada.

Los dos conservan su contenido intacto, porque un ADR cerrado es inmutable; lo que se
toca es su línea de estado.

### El estado de los ADR anteriores

`ADR-001` sostiene el argumento entero: la reconciliación solo puede ocurrir en el
cliente. `ADR-011` sigue vigente en todo lo demás —los dos formatos, la política de
añadir, qué se hace con lo que no cabe—. `ADR-018` entra en vigor en su primera parte y
sigue diferido en las otras dos. `ADR-020` es lo que impide fusionar tipos distintos.
`ADR-019` sigue mandando sobre lo que se puede hacer sin red.
