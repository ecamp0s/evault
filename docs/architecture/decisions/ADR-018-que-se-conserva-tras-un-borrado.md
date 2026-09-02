# eVault — Qué se conserva después de decir que ya no lo quieres

Fecha de decisión: 2026-09-02
Fecha de registro: 2026-09-02
Estado: Aprobada, con entrada en vigor diferida a una iteración por decidir
Depende de: ADR-001 (zero-knowledge), ADR-007 (token de sesión en memoria), ADR-008 (arquitectura de claves), ADR-011 (formato de export e import), ADR-017 (códigos TOTP en la vault)

## 1) Contexto

La Iteración 13 midió la vault real y el número no admite lectura amable: **246 de sus
369 contraseñas tienen algo que corregir, y una está compartida por 41 entradas**. El
recuento lo produjo el cliente porque nadie más puede producirlo, y con él la
Iteración 13 cerró su criterio 6 «a medias»: la mitad que se podía hacer sin tocar la
vault está hecha, y la otra mitad es entrar en 49 servicios reales y cambiar la
contraseña en cada uno.

Ese trabajo es el que motiva este documento, y no por lo que añade sino por lo que
descubre: **las tres operaciones que hay en ese camino son hoy irreversibles**.

- **Editar una contraseña la sobrescribe.** `toContent` en
  `web/src/lib/vault/schema.ts` reconstruye el contenido sobre el anterior, y el
  campo `password` se reemplaza. Lo que había antes no queda en ninguna parte.
- **Borrar una entrada es definitivo.** Está decidido por escrito en
  `api/app/Application/Vaults/DeleteVaultItem.php`: «no hay papelera y no hay borrado
  diferido».
- **Un token de sesión no caduca nunca.** `api/config/sanctum.php` tiene
  `'expiration' => null`, así que la fila del token vive indefinidamente aunque el
  cliente que lo pidió haya desaparecido.

### Por qué las tres juntas y no una por issue

Son tres preguntas distintas con una sola forma: **qué sobrevive cuando el usuario
dice que ya no quiere algo, y durante cuánto tiempo**. Responderlas por separado, en
tres issues escritos en semanas distintas, garantiza que se contradigan: una guardaría
para siempre, otra purgaría a los siete días y la tercera no purgaría nunca, y nadie
sabría después si esa mezcla se pensó o simplemente ocurrió.

Este proyecto ya sabe cómo termina un cambio de modelo que entra dentro de un commit
de funcionalidad. Por eso este ADR va **primero y solo**, como `ADR-015` en la
Iteración 9 y `ADR-017` en la 13, y la implementación queda para después.

### El camino de recuperación que ya existe, y por qué no basta

No es cierto que hoy no se pueda recuperar nada. La Iteración 8 construyó las copias
de seguridad y la 9 restauró una de verdad, con las 370 entradas dentro y el
ciphertext idéntico byte a byte. Existe y funciona.

Lo que no tiene es **granularidad ni ventana**.

- **Granularidad**: `RestoreCommand` vacía las cuatro tablas y las reescribe. Recuperar
  una entrada borrada por error es restaurar la instancia entera sobre la actual, es
  decir, perder todo lo hecho desde la copia. Para deshacer un clic se paga con el
  trabajo de días.
- **Ventana**: el cron de `DEPLOYMENT.md` §7 llama a `evault:backup` sin `--keep`, así
  que usa el valor por defecto del comando, que es **7**. La instancia conserva siete
  copias diarias. **Un borrado por error descubierto ocho días después ya no se
  recupera de ninguna parte.**

Esa segunda cifra es la que reordena la decisión, y conviene decir que estuve a punto
de escribir treinta: el comentario de `BackupCommand` habla de treinta copias, pero lo
hace razonando sobre otra comprobación, y el despliegue real no las pide.

### Lo que se midió antes de escribir esto

- **La vault real, el 1 de septiembre de 2026, sobre 369 contraseñas**: 200 repetidas,
  129 cortas, 30 de un solo tipo, 246 con algo que corregir. Un grupo de 41 entradas
  compartiendo contraseña y otro de 8.
- **El blob tiene ocho campos** y ninguno guarda historia, según
  `web/src/lib/vault/types.ts` y `docs/architecture/FOUNDATION.md` §2.
- **El export en claro ya sabe retener un campo**: `WITHHELD_FIELDS` en
  `web/src/lib/vault/export.ts` retiene `totp` y cuenta a cuántas entradas afecta, que
  es la maquinaria que `ADR-017` §2.3 pidió y que aquí se reutiliza sin inventar nada.
- **La copia de seguridad no lleva `personal_access_tokens`**, y está razonado en
  `BackupContents`: una sesión viva no es dato que restaurar. Se comprueba porque, de
  llevarlos, una copia antigua contendría credenciales válidas para siempre.

## 2) Opciones evaluadas

### 2.1) Si eVault guarda la contraseña anterior

#### Lo que hay que mirar de frente

Guardar la contraseña anterior es **guardar más secretos**, y algunos se cambiaron
precisamente porque estaban comprometidos. La vault pasaría de custodiar 369
contraseñas a custodiar 369 más su historia, y esa historia no la pidió nadie: es un
efecto de haber usado la aplicación.

Decir que «viaja dentro del blob cifrado, luego da igual» sería el argumento cómodo y
es falso en un punto concreto: no cambia quién puede leerlo —sigue siendo solo quien
tenga la clave— pero sí cambia **qué encuentra quien lo lea**. Una vault comprometida
entrega hoy las contraseñas actuales; con historial entrega también las que ya se
retiraron, que en otros servicios pueden seguir en uso.

#### Opción A (elegida): un campo más del blob, `historial`

Una lista acotada de `{ password, fecha }`, escrita por el cliente en el momento en
que la contraseña cambia, dentro del mismo item y del mismo blob.

- Es donde ya está el resto del contenido, así que no toca el servidor, ni el
  contrato de `/api/vaults/{vault}/items`, ni `version`.
- El punto de escritura existe y es único: `toContent`, que ya recibe el contenido
  anterior. Es una función pura, de modo que la promesa se puede probar por mutación
  de verdad y no contra una constante.
- Y resuelve el problema real: **cambiar una contraseña deja de ser una apuesta**. Si
  el servicio la rechaza, si el cambio no llegó a aplicarse, o si resulta que el sitio
  guardaba otra cosa, la anterior sigue ahí.

#### Opción B (descartada): no guardar nada, que el usuario copie la anterior

Es lo que se puede hacer hoy: copiar la contraseña a `notas` antes de cambiarla.

Descartada porque **es el camino que nadie recorre**, que es la lección que este
proyecto ha pagado cinco veces seguidas. Funciona la primera vez, la segunda y la
tercera; en la cuadragésima no, y la cuadragésima es exactamente la que hay que hacer
aquí. Además deja el secreto en un campo que la búsqueda mira y que el export en claro
sí exporta, así que el remedio empeora la postura.

#### Opción C (descartada): guardarla fuera del item

Un item aparte, o una tabla propia en el servidor.

Descartada por dos motivos. Una tabla obligaría al servidor a saber que el historial
existe, y con ello a conocer cuántas veces se cambia cada entrada, que es metadato del
tipo que `FOUNDATION.md` §2 mantiene fuera a propósito. Y un item aparte duplicaría el
modelo sin ganar nada: habría que ligarlo al original, mantener el vínculo al borrar, y
la auditoría tendría que aprender a ignorar una clase de item nueva.

### 2.2) Cuánto historial, y durante cuánto tiempo

#### El dato que decide, y no es de seguridad

**Dentro del blob no corre ningún reloj.** El servidor no puede leerlo, así que no hay
nada capaz de podar una entrada vieja por su fecha: una caducidad por tiempo solo se
podría aplicar cuando el cliente reescribe el item, es decir, **justo cuando el tope
por número ya está actuando**. Una política temporal sería, entonces, una promesa que
solo se cumple en las entradas que se siguen editando — o sea, en las que menos
importa.

#### Opción A (elegida): tope por número, tres por entrada, y olvido explícito

- **Tres**, y el número admite discusión pero no la mecánica: es la profundidad que
  cubre el caso real —cambiar una contraseña, que falle, volver a cambiarla— sin
  convertir el item en un archivo histórico.
- **La fecha se guarda como información, no como política.** Sirve para que el usuario
  sepa de cuándo es lo que está viendo; no dispara ninguna purga.
- **Se puede olvidar**, y en dos granularidades: el historial de una entrada, desde la
  propia entrada, y el de la vault entera, desde donde se gestiona la seguridad de la
  cuenta. Sin esto, la opción A sería irrevocable, que es precisamente el defecto que
  este ADR existe para corregir.

#### Opción B (descartada): sin tope

Descartada porque el coste no es visible y crece con el uso: cada rotación engorda el
blob que se cifra, se descifra y se vuelve a mandar entero en cada edición. La
Iteración 11 midió lo que cuesta escribir en esta vault y la 13 aprendió que
extrapolar una medida no es medirla; un crecimiento sin techo es exactamente lo que
nadie mide hasta que duele.

#### Opción C (descartada): solo la inmediatamente anterior, sin fecha

Más barato y casi suficiente. Descartada por un caso concreto y frecuente en el
trabajo que viene: cambiar la contraseña de un servicio dos veces seguidas porque la
primera nueva no cumplía sus reglas. Con una sola posición, el segundo cambio se lleva
la original, que era la única que servía para volver atrás.

### 2.3) Qué hace el export con el historial

#### El export `.evault`: lo lleva, y no sube versión

El fichero cifrado toma el contenido entero de cada item, así que el historial viaja
sin tocar nada. **`version` del esquema criptográfico sigue valiendo 2 y la del
formato `.evault` sigue valiendo 1**, por el mismo razonamiento que `ADR-017` §2.3:
añadir una clave al objeto no cambia cómo se cifra ni cómo se lee el fichero.

Con esto, el trigger 1 de `ADR-011` §6 queda **ejercitado por segunda vez y con el
mismo resultado**.

#### El export en claro: no lo lleva nunca

**El CSV no exporta el historial**, y el diálogo dice a cuántas entradas afecta, igual
que con la semilla TOTP.

El argumento es más fuerte aquí que allí. Un CSV en claro se escribe para llevárselo a
otro gestor, y ningún otro gestor tiene dónde meter un historial: lo mejor que puede
pasar es que ignore la columna, y lo peor —lo probable— es que la vuelque en un campo
de notas, dejando tres contraseñas antiguas en texto plano dentro de un fichero que
alguien va a olvidar en la carpeta de descargas.

#### Y una consecuencia que hay que decir en voz alta

**El import nunca crea historial.** Una entrada que llega de Chrome, de Firefox o de
Bitwarden llega sin pasado, y una vault restaurada desde un `.evault` conserva el que
tuviera. No hay forma de fabricar historia que no ocurrió, y no se intenta.

### 2.4) El borrado de una entrada

#### Lo que hay que mirar de frente

Una papelera en el servidor añade un metadato que hoy no existe: **cuándo dejaste de
querer algo**. La tabla ya guarda `created_at` y `updated_at`, así que el salto es
pequeño, pero `FOUNDATION.md` §2 mantiene fuera el metadato a propósito y la carga de
la prueba está en quien añade la columna, no en quien la cuestiona.

#### Opción A (elegida): papelera en el servidor, con purga

Una columna `deleted_at` en `vault_items`, excluida del listado, con listado propio,
restauración y purga a los **30 días**.

- **El servidor no aprende nada del contenido**: sigue viendo bytes opacos. Lo único
  que gana es una fecha, del mismo tipo que las dos que ya tiene.
- **Treinta días y no siete** porque la ventana es lo que la copia de seguridad no
  cubre. Con siete copias diarias, un borrado descubierto la semana siguiente ya no
  tiene de dónde volver. Alinear la papelera con la copia sería dejar el mismo agujero
  y llamarlo política.
- **Y la purga tiene que existir de verdad**, con su comando y su ejecución
  programada. Una papelera que no se vacía no es una papelera: es un borrado que no
  borra, y es peor que no tenerla porque el usuario cree que borró.

#### Opción B (descartada): deshacer solo en el cliente

Un aviso con «Deshacer» durante unos segundos, que reescribe el item si se pulsa.

Descartada por tres cosas, y la tercera es la que decide. Recargar lo pierde. El item
vuelve con otro `id`, así que no es la misma entrada sino una copia. Y sobre todo:
**un borrado por error no se descubre en los ocho segundos que dura un aviso**, se
descubre al ir a buscar la entrada, que es al día siguiente o la semana que viene.

No queda descartada como complemento: el aviso inmediato es cómodo y se puede tener
encima de la papelera. Lo que se descarta es que sea la única red.

#### Opción C (descartada): nada, y que la copia sea el único camino

Es lo que hay hoy. Descartada por la granularidad y la ventana de §1: para deshacer un
clic hay que restaurar la instancia entera, y solo durante siete días.

### 2.5) La caducidad de la sesión

#### Lo que `ADR-007` decidió y lo que no

`ADR-007` decidió que el token **no se persiste en el cliente**: vive en memoria y
muere al recargar. Esa decisión sigue vigente entera y este ADR no la toca.

Lo que aquel documento no miró fue el otro lado. Su §7 dice, con razón para lo que
decidía, que el impacto en la API es «ninguno»; la consecuencia es que **nadie ha
mirado nunca el lado del servidor**, donde `'expiration' => null` significa que la
fila del token sigue siendo válida indefinidamente aunque el navegador que la pidió se
haya cerrado hace meses.

De ahí salen dos cosas: `personal_access_tokens` acumula una fila por cada inicio de
sesión que nada retira, y un token que se filtre por cualquier vía sigue abriendo la
API para siempre.

#### Opción A (elegida): caducidad en el servidor, y cerrar las demás sesiones

- **Caducidad de 12 horas.** El número se elige por lo que no rompe: en la web el
  token ya muere al recargar, así que la caducidad **no le quita comodidad a nadie**;
  lo único que acorta es la vida de un token huérfano. Doce horas cubre una jornada de
  trabajo con la pestaña abierta, que es un uso legítimo, y no llega al día siguiente.
- **Un endpoint para cerrar las demás sesiones sin rotar la contraseña maestra.** Hoy
  la única vía es `PUT /api/auth/master-password`, que las revoca como efecto
  secundario de reescribir `users.password` y reenvolver las claves de todas las
  vaults. Usar eso para echar a un navegador es mover el mundo entero para cerrar una
  puerta.

#### Opción B (descartada): dejarlo como está

Descartada, pero conviene decir por qué es defendible: con `ADR-007`, el token no se
escribe en ningún disco, así que no hay un `localStorage` del que robarlo. El riesgo
que queda es el token en tránsito o en memoria de una máquina comprometida, y no es el
riesgo dominante de este proyecto.

Lo que la descarta no es el riesgo sino **la ausencia de recurso**: hoy, si sospechas
de una sesión, la única palanca es rotar la contraseña maestra. Un gestor de
contraseñas tiene que poder cerrar una sesión.

## 3) Decisión final

Se adoptan las opciones **A de 2.1**, **A de 2.2**, lo dispuesto en **2.3**, **A de
2.4** y **A de 2.5**.

| Elemento | Definición |
|---|---|
| Se guarda la contraseña anterior | Sí, dentro del item, en el blob cifrado |
| Dónde | Campo nuevo `historial` de `ItemContent`, omitido cuando está vacío |
| Cuántas | **Tres por entrada**, con fecha. Sin caducidad por tiempo |
| Se puede olvidar | Sí, por entrada y para la vault entera |
| `version` del esquema criptográfico | **Sigue valiendo 2.** No cambia |
| `version` del formato `.evault` | **Sigue valiendo 1.** No cambia |
| Export `.evault` | Lleva el historial |
| Export en claro (CSV) | **No lo lleva nunca**, y dice a cuántas entradas afecta |
| Import | **Nunca crea historial.** Lo importado llega sin pasado |
| Borrado de una entrada | Papelera en el servidor: `deleted_at`, listar, restaurar |
| Purga de la papelera | **30 días**, con comando propio y ejecución programada |
| Aviso «Deshacer» inmediato | Sí, **encima** de la papelera, nunca en lugar de ella |
| Caducidad del token | **12 horas** |
| Cerrar las demás sesiones | Endpoint propio, sin rotar la contraseña maestra |
| `ADR-007` | **No se toca.** El token sigue sin persistirse en el cliente |

## 4) Lineamientos técnicos resultantes

- **El historial lo escribe `toContent` y solo `toContent`.** Es el único sitio que ve
  a la vez el contenido anterior y el nuevo, y ser una función pura es lo que permite
  probarlo mutando. Escribirlo en el componente repetiría la lógica en el editor, en
  el generador y en cualquier camino futuro.
- **Un test que falle si el historial aparece en el export en claro**, de la misma
  familia que el de la semilla TOTP y el del aviso de la clave de recuperación: la
  promesa se cubre con un test que se rompe cuando deja de ser cierta.
- **Un test que falle si la auditoría cuenta el historial.** Una contraseña retirada no
  puede aparecer como «repetida» contra la actual de la misma entrada, ni engordar el
  recuento que esta iteración existe para bajar.
- **Los tests del tope se escriben con números concretos, no contra la constante.** La
  Iteración 13 dejó pasar diecinueve pruebas construidas a partir de `SHORT_BELOW`, que
  se movían con el umbral. Mover el tres tiene que romper tests.
- **La columna se llama `deleted_at` y la migración se escribe en inglés**, como fija
  el #160; las migraciones ya aplicadas no se renombran nunca.
- **El listado de items excluye lo borrado por defecto**, en la capa de aplicación y no
  solo en la consulta, que es el *double guard* que este proyecto aplica a todo lo que
  decide qué datos se ven.
- **La purga es un comando de Artisan** con la forma de `evault:backup`: se puede
  ejecutar a mano, dice qué hizo y se programa en el cron de `DEPLOYMENT.md`.
- **El campo del blob se documenta en `FOUNDATION.md`** con su nombre exacto y la nota
  de que no se renombra, por lo mismo que los otros ocho. Y la columna nueva, en la
  tabla de §2.
- **Se mide a 370 entradas y no a 120.** Lo que crece con el historial no es la vault
  sino las contraseñas que se han cambiado, que es la misma trampa del #450.

## 5) Consecuencias asumidas

1. **La vault custodia más secretos de los que el usuario metió.** Es la consecuencia
   central de 2.1 y no se disimula: quien comprometa una vault con historial obtiene
   también contraseñas retiradas, que en otros servicios pueden seguir vivas. La
   mitigación no está dentro de esta decisión —es todo lo que protege la vault— salvo
   por dos piezas que sí lo están: el tope de tres y el olvido explícito.
2. **El usuario tiene que saber que existe.** Un historial invisible es una sorpresa
   desagradable el día que se descubre. Se dice donde se cambia la contraseña, con la
   misma regla que `ADR-010` impuso para la clave de recuperación: «donde se cambia, no
   en una página de ayuda».
3. **El servidor aprende cuándo borras.** Es metadato nuevo, del mismo orden que
   `updated_at`, y la purga a 30 días lo acota. Se acepta a cambio de que deshacer un
   borrado deje de costar una restauración completa.
4. **Migrar a otro gestor pierde el historial**, porque el CSV en claro no lo lleva.
   Es deliberado, y el aviso al exportar es lo que impide que se descubra tarde.
5. **El blob crece con el uso.** Tres posiciones por entrada es el techo, pero el
   techo se alcanza precisamente en las entradas que más se tocan.
6. **Una sesión legítima puede caer a las 12 horas.** En la web casi no se nota,
   porque recargar ya obliga a desbloquear; se notará en cualquier cliente futuro que
   no recargue, y ese cliente tendrá que renovar en vez de asumir que el token es
   eterno.

## 6) Triggers de reevaluación

Reevaluar si se cumple uno o más:

1. **La papelera se llena de cosas que nadie restaura nunca.** Si en un año no se ha
   recuperado ni una entrada, la columna y su purga son coste sin beneficio y hay que
   decirlo en vez de conservarlos por inercia.
2. **El tope de tres resulta ser el número equivocado**, en cualquiera de los dos
   sentidos: que se llene en entradas donde importa, o que nadie mire nunca más allá
   de la primera posición.
3. **Llegan las vaults compartidas.** Compartir una entrada pasaría a compartir su
   historial, que es una decisión distinta de compartir su contraseña actual.
4. **Aparece un cliente que no recarga**, como la extensión de navegador prevista. Las
   12 horas de 2.5 se eligieron contra el comportamiento de la web y habría que
   reevaluarlas contra el suyo.
5. **La retención de las copias cambia.** El argumento de los 30 días de la papelera se
   apoya en que la copia conserva 7; si eso cambia, el razonamiento hay que rehacerlo,
   no heredarlo.

## 7) Impacto en APIs y contratos

**Hay impacto, al contrario que en `ADR-017`, y conviene que se vea de un vistazo.**

En el cliente y sin tocar el servidor: cambia `ItemContent` en
`web/src/lib/vault/types.ts` con el campo `historial`, y su documentación en
`docs/architecture/FOUNDATION.md`, que es contrato **entre clientes** y no con el
servidor. Un cliente antiguo que lea un item con historial no lo muestra y no lo
pierde, porque conserva el blob que no entiende al no reescribirlo. `version` no sube,
ni la del esquema criptográfico ni la del fichero de export.

En el servidor:

| Contrato | Cambio |
|---|---|
| `vault_items` | Columna `deleted_at`, con migración nueva |
| `GET /api/vaults/{vault}/items` | Excluye lo borrado. **La respuesta no cambia de forma** |
| Listar y restaurar lo borrado | Endpoints nuevos bajo el mismo prefijo y las mismas garantías de aislamiento |
| `DELETE /api/vaults/{vault}/items/{item}` | **Sigue devolviendo 204** y sigue sin distinguir lo que no existe de lo ajeno. Lo que cambia es lo que hace por dentro |
| `POST /api/auth/logout` | Sin cambios |
| Cerrar las demás sesiones | Endpoint nuevo bajo `/api/auth` |
| `config/sanctum.php` | `expiration` deja de ser `null` |

### La copia de seguridad

**No hay que tocarla, y es una propiedad y no una casualidad.** `BackupCommand` vuelca
cada tabla con `DB::table($table)->get()`, sin lista de columnas, de modo que
`deleted_at` viaja sola en los dos sentidos: una copia conserva la papelera y una
restauración la devuelve tal cual estaba. Se comprueba al implementarlo en vez de
darlo por bueno leyendo esta frase.

Y `personal_access_tokens` sigue fuera de la copia por la razón que `BackupContents`
ya escribe, que la caducidad de 2.5 refuerza: una sesión viva no es dato que restaurar.

### El estado de los ADR anteriores

- **`ADR-007` no queda superseded.** Su decisión —el token no se persiste en el
  cliente— sigue vigente entera y sin matices. Lo que este documento hace es cubrir el
  lado del servidor, que aquel no miró porque no tenía por qué.
- **`ADR-011` no queda superseded.** Su trigger 1 queda ejercitado por segunda vez y
  con el mismo resultado: el esquema gana un campo con estructura y la versión del
  fichero **no sube**.
- **`ADR-001` no se toca**, y merece decirse por dónde pasa cerca: el historial es
  contenido, se cifra en el cliente como todo lo demás y el servidor no puede saber
  que existe.
