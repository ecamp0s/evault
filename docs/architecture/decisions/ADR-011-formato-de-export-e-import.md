# eVault — Formato de export e import

Fecha de decisión: 2026-08-03 (al planificar la Iteración 4, issue #114)
Fecha de registro: 2026-08-03
Estado: Aprobada
Depende de: ADR-001 (zero-knowledge), ADR-008 (arquitectura de claves)
Relacionado: ADR-009, cuyo criterio de priorización pone el export y el backup por delante de todo lo demás

## 1) Contexto

Hoy no hay ninguna forma de sacar los datos de eVault. Si la base de datos se
pierde, se perdieron; si alguien quiere irse a otro gestor, no puede. Las dos cosas
hay que resolverlas **antes** de meter contraseñas reales, y por eso `ADR-009` puso
el export en el primer grupo de su criterio de priorización.

Un fichero de export es un contrato con el futuro, y ahí está la razón de que esto
sea un ADR y no una decisión dentro del issue que lo implementa. Ese fichero lo va a
leer una versión posterior de eVault, en otra máquina, quizá años después, cuando
nadie recuerde qué se asumió al escribirlo. Un backup que no se puede abrir es peor
que no tener backup, porque además da la falsa sensación de estar cubierto.

Las seis preguntas abiertas al llegar aquí:

1. ¿Un formato o dos?
2. ¿Qué lleva el fichero cifrado además del texto cifrado?
3. ¿Reutiliza el módulo criptográfico de la vault?
4. ¿Qué hace el import con lo que ya existe en la vault?
5. ¿Qué formatos ajenos se aceptan?
6. ¿Qué pasa con los datos que no caben en el esquema de eVault?

## 2) Opciones evaluadas

### 2.1) Uno o dos formatos

#### Opción A (descartada): solo el formato cifrado

Todo export va cifrado. Es el más seguro y el único que no deja secretos legibles en
el disco.

- **Deja al usuario atrapado.** Solo eVault puede leer ese fichero, así que irse a
  otro gestor exige teclear las contraseñas a mano. Un gestor que no deja salir es
  peor que uno que no deja entrar, y en un producto cuyo argumento es que no confíes
  en el operador, negar la salida es contradictorio.

#### Opción B (descartada): solo el formato en claro

Un CSV y ya, como hacen varios gestores conocidos.

- Interopera con todo.
- **Convierte cada backup en una copia legible de toda la vault**, sentada en la
  carpeta de descargas y probablemente sincronizada a alguna nube sin que nadie lo
  piense. Para la función que más se va a usar —la copia de seguridad periódica— es
  el peor comportamiento posible por defecto.

#### Opción C (elegida): dos formatos, con propósitos distintos y explícitos

- **`.evault`, cifrado.** Es el formato por defecto. Sirve para la copia de
  seguridad y para trasladar una vault entre instancias.
- **CSV, en claro.** Sirve para migrar a otro gestor, y existe precisamente porque
  el usuario tiene derecho a irse.

Lo que hace que esto no sea «las dos cosas para no elegir» es que **el reparto de
propósitos es real**: el cifrado no interopera con nada y el CSV no sirve como
copia de seguridad. Cada uno hace bien una cosa, y la interfaz no los presenta como
dos sabores del mismo botón.

### 2.2) Qué lleva dentro el fichero cifrado

La decisión de fondo: **el fichero tiene que ser autodescriptivo**. Versión de
formato, algoritmo, parámetros de derivación y salt viajan dentro.

Es la decisión contraria a la que tomó `ADR-008` para la vault, y conviene ver por
qué no se contradicen. Allí los parámetros KDF quedaron fijos en el cliente porque
servirlos habría exigido un endpoint de prelogin, que sería un oráculo de
enumeración de cuentas; el precio aceptado fue que **subir las iteraciones deja
fuera a los usuarios ya registrados**. Un fichero no tiene ese problema: puede
llevar sus propios parámetros sin que nadie tenga que preguntárselos a un servidor.
Así que aquí no hay ninguna razón para pagar ese precio, y no se paga.

```json
{
  "format": "evault-export",
  "version": 1,
  "kdf": { "name": "PBKDF2", "hash": "SHA-256", "iterations": 600000, "salt": "…" },
  "cipher": { "name": "AES-256-GCM", "iv": "…" },
  "ciphertext": "…"
}
```

**Lo que deliberadamente NO lleva:** número de items, fecha de creación, correo del
propietario ni nombre de la vault. Todo eso es metadato que un fichero robado
regalaría gratis, y el proyecto ya rechazó guardar contadores en el servidor por el
mismo motivo. La fecha va en el nombre del fichero, donde el usuario puede quitarla
si le estorba; dentro no podría.

De no llevar el correo se sigue una propiedad útil: **el fichero no está atado a una
cuenta**, así que sirve para trasladar la vault a otra instancia con otro correo.

### 2.3) Si reutiliza el módulo criptográfico de la vault

**Se reutilizan las primitivas, no las constantes.** `crypto.ts` es código auditado y
con tests verificados rompiéndolos, así que volver a escribir AES-GCM al lado sería
absurdo. Pero las constantes de la vault —`ITERACIONES`, y sobre todo la decisión de
usar el correo como salt— no valen aquí:

- El salt del export es **aleatorio por fichero**, no el correo. No hace falta que
  sea derivable de nada, porque no hay que reproducirlo sin el fichero delante.
- Las iteraciones del export pueden subir sin arrastrar a la vault, porque viajan
  dentro.

### 2.4) Qué hace el import con lo que ya existe

#### Opción A (elegida): añadir siempre, nunca sustituir ni borrar

- **Nunca destruye.** Es la propiedad que importa: el peor resultado posible de esta
  funcionalidad es que alguien importe un fichero equivocado y pierda lo que tenía.
- Coste: importar dos veces el mismo fichero duplica los items.

#### Opción B (descartada): sustituir la vault entera

- Deja la vault exactamente como el fichero, que es lo que se quiere al restaurar en
  una instancia limpia.
- **Un clic de distancia entre restaurar y destruir.** En una instancia que ya tiene
  datos, elegir mal la opción borra lo que no estaba en el fichero. Restaurar sobre
  una vault vacía funciona igual con la Opción A, así que se descarta sin perder
  nada.

#### Opción C (descartada): fusionar automáticamente

- **No hay identificador estable entre dos instancias.** Los ids son de la base de
  datos de origen y no significan nada en el destino, así que «el mismo item» solo
  puede ser una heurística sobre nombre y usuario. Una heurística que se equivoca
  hacia el lado de fusionar **pierde datos en silencio**.

Se adopta **A**, con una previsualización que señale los que parecen repetidos —mismo
nombre y mismo usuario— y deje al usuario deseleccionarlos. La detección avisa; no
decide.

### 2.5) Qué formatos ajenos se aceptan, y qué se hace con lo que no cabe

Se aceptan el **CSV de Chrome** y el **CSV de Bitwarden**, que cubren la mayoría de
los casos reales. Ninguno tiene esquema formal y los dos cambian sin avisar, así que
el import detecta el formato por sus cabeceras y falla de forma explícita cuando no
reconoce ninguna, en vez de adivinar.

El esquema de un item de eVault son cinco campos: `nombre`, `usuario`, `password`,
`url` y `notas`. Otros gestores traen más —TOTP, campos personalizados, carpetas,
favoritos—, y la pregunta es qué hacer con ellos.

**Lo que no cabe se conserva en `notas`, etiquetado, y se dice cuántos.** No se
descarta en silencio, que es la peor forma en que esta funcionalidad puede fallar:
el usuario ve «importado» y borra el origen, y meses después descubre que faltaba
algo. Y no se rechaza el fichero entero por traer un campo de más, que dejaría la
migración bloqueada por un detalle.

## 3) Decisión final

Se adoptan las Opciones **C** de 2.1, **A** de 2.4, la cabecera autodescriptiva de
2.2 y la reutilización de primitivas de 2.3.

| Elemento | Definición |
|---|---|
| Formato por defecto | `.evault`, JSON con cabecera en claro y contenido cifrado |
| Clave del export | `PBKDF2-HMAC-SHA256(passphrase, salt aleatorio de 128 bits, ≥600.000 iteraciones, 256 bits)` |
| Cifrado del contenido | `AES-256-GCM` con IV de 96 bits aleatorio |
| Contenido cifrado | JSON UTF-8: lista de items con el mismo esquema del blob de `FOUNDATION.md` |
| Formato de salida | CSV, en claro, para migrar a otro gestor |
| Formatos de entrada | `.evault`, CSV propio, CSV de Chrome y CSV de Bitwarden |
| Política de import | Añadir. Nunca sustituir ni borrar |
| Versión de formato | Empieza en 1. Una desconocida se rechaza explicándolo |

### La passphrase del export es distinta de la contraseña maestra

Y no es una molestia gratuita: es lo que hace que la copia sirva **en el escenario
que más importa**, que es haber perdido el acceso a la vault original. Un export
cifrado con la contraseña maestra sería inútil el día que se olvida la contraseña
maestra, es decir, justo el día que se va a buscar el backup.

Tiene la consecuencia obvia: es un secreto más que custodiar. La interfaz tiene que
explicar la diferencia en vez de presentarla como un trámite.

### El export ocurre entero en el cliente

No hay endpoint de export y **no puede haberlo**: el servidor no puede leer los
items, así que no puede producir un fichero con su contenido. Lo mismo vale para el
import, que cifra cada item antes de enviarlo y usa el CRUD que ya existe.

Merece decirse en la propia interfaz, porque es una demostración del modelo más
convincente que cualquier explicación: la función que en otro producto sería un
botón del servidor, aquí no puede vivir ahí.

## 4) Lineamientos técnicos resultantes

- **La versión de formato se comprueba antes de tocar nada.** Un fichero de versión
  desconocida se rechaza con un mensaje que lo diga, no se intenta leer «a ver si
  suena».
- **Los parámetros de KDF se leen del fichero**, nunca se asumen. Un export escrito
  con 600.000 iteraciones tiene que seguir abriéndose el día que el valor por
  defecto sea otro.
- **Las iteraciones del export nunca son menos que las de la vault.** Un fichero
  cifrado es un objetivo de fuerza bruta offline: quien lo tenga puede atacarlo sin
  límite de intentos y sin que nadie se entere, que es una situación peor que la del
  servidor.
- **El fichero de origen no viaja al servidor.** Ni entero, ni en trozos, ni para
  «validar el formato». Va con test propio, del mismo estilo que los que vigilan que
  el token no se persista.
- **Nada se escribe antes de enseñar qué se va a escribir.** El import muestra
  cuántos items, cuántos parecen repetidos y qué campos no caben, y solo entonces
  pide confirmación.
- **Un item que no descifra no aborta el export en silencio.** Se exporta lo que sí
  abre y se dice claramente lo que no, porque quien tiene un item corrupto es
  exactamente quien más necesita la copia del resto.
- **El export en claro exige una confirmación que no se pueda dar por inercia**, y
  que describa lo que se está creando en vez de preguntar «¿estás seguro?».
- Los topes de `schema.ts` siguen aplicando al importar. Lo que no valide el
  cliente no lo valida nadie: es la excepción al double guard ya registrada, y un
  import masivo es su prueba de esfuerzo.

## 5) Consecuencias asumidas

1. **El export en claro es una copia legible de toda la vault.** Existe porque sin
   él el usuario queda atrapado, y esa razón vale el riesgo; pero el riesgo es real
   y no se disimula llamándolo de otro modo.
2. **La passphrase del export es un secreto más que se puede perder.** Un fichero
   cifrado cuya passphrase se olvidó es tan irrecuperable como una vault sin
   contraseña maestra, y por el mismo motivo.
3. **Importar dos veces duplica.** Es el precio de no fusionar automáticamente, y se
   prefiere a la alternativa: una fusión que se equivoca pierde datos sin avisar.
4. **Lo que no cabe acaba en `notas`, y eso incluye secretos.** Un TOTP importado de
   otro gestor pasa a ser texto dentro de un campo no estructurado. Sigue cifrado
   como todo lo demás, pero deja de ser un dato con forma; conviene registrarlo
   porque es una pérdida de estructura, aunque no de información.
5. **Descifrar la vault entera es la primera operación que toca todos los items a la
   vez.** La Iteración 3 midió que derivar no congela la interfaz, pero eso fue una
   derivación, no N descifrados. Si hace falta, habrá que enseñar progreso.
6. **Un export es una foto y envejece.** No hay nada que avise de que la copia tiene
   seis meses. Es lo que hace que el backup del servidor (#129) no sea redundante
   con esto, sino complementario.

## 6) Triggers de reevaluación

Reevaluar si se cumple uno o más:

1. **El esquema del item gana campos con estructura**, por ejemplo TOTP nativo o
   adjuntos. Cambia qué significa «lo que no cabe» y probablemente obligue a subir
   la versión de formato.
2. **Llegan las vaults compartidas.** Habrá que decidir si un export incluye varias
   vaults y qué pasa al importarlas en una instancia donde esa compartición no
   existe.
3. **Los CSV de Chrome o Bitwarden cambian de cabeceras.** Es previsible y por eso el
   import las detecta en vez de asumirlas.
4. **Aparece un formato de intercambio estándar de la industria** con adopción real.
   Hoy no lo hay, y es la razón de que esto se resuelva con CSV.

## 7) Impacto en APIs y contratos

**Ninguno.** No hay endpoint nuevo, ni campo nuevo, ni cambio de esquema.

El export lee con `GET /api/vaults/{vault}/items`, que ya existe, y el import escribe
con `POST` sobre la misma ruta. El formato del blob es el que ya fija
`FOUNDATION.md`, y `version` sigue valiendo 2.

Es el segundo ADR seguido cuyo impacto en el contrato es cero, después del `ADR-009`.
En este caso no es casualidad ni suerte: es consecuencia directa de que el servidor
no pueda participar en ninguna de las dos operaciones.
