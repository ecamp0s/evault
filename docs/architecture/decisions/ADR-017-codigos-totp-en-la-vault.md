# eVault — Los códigos TOTP dentro de la vault

Fecha de decisión: 2026-08-28
Fecha de registro: 2026-08-28
Estado: Aprobada
Depende de: ADR-001 (zero-knowledge), ADR-008 (arquitectura de claves), ADR-007 (token de sesión en memoria), ADR-011 (formato de export e import), ADR-009 (proyecto personal y público)

## 1) Contexto

Un código TOTP es el número de seis dígitos que caduca cada treinta segundos y que
un servicio pide como segundo factor. Se genera a partir de dos cosas y nada más:
una **semilla** compartida al activarlo, y el **reloj**. No hay servidor que
consultar.

Eso lo pone al alcance de este proyecto sin tocar nada de lo construido: cabe entero
en el cliente, no necesita un endpoint nuevo, y la semilla es texto corto que ya sabe
viajar dentro del blob cifrado.

La pregunta, por tanto, **no es si se puede**. Es si se debe.

### Por qué se decide antes de escribir código

`ADR-009` §4 puso la funcionalidad nueva en tercer lugar y las dos columnas anteriores
se agotaron en las Iteraciones 7 a 11. TOTP era una de las dos candidatas al llegar a
la tercera —la otra es organizar la vault, que la Iteración 12 está haciendo—.

Y guardar la semilla junto a la contraseña **cambia el modelo de amenaza**. Este
proyecto ya sabe cómo termina un cambio de modelo que entra en un commit de
funcionalidad: se descubre meses después leyendo el código, sin que nadie recuerde si
se pensó. Por eso este ADR va **primero y solo**, como `ADR-015` en la Iteración 9 y
el issue #153 en la 5, y la implementación queda para después.

### Lo que se midió antes de escribir esto

El issue #374 contó, sobre la vault real de 370 entradas, cuántas semillas TOTP hay
ya dentro arrastradas por el import. La sospecha era razonable: `FIELD_MAP` de
`web/src/lib/vault/import.ts` no mapea la columna `login_totp` de Bitwarden, y lo que
no cabe se conserva en `notas` por decisión de `ADR-011` §2.4.

**El resultado fue cero**, y también fueron cero `otpauth`, `totp` y la cabecera
`Importado de otro gestor` que el import escribe cuando mueve algo. Ese último cero
es el que informa: **el import no movió ni un solo campo** en 370 entradas, lo que
descarta Bitwarden como origen y encaja con Chrome, cuyas cinco columnas están todas
mapeadas. Chrome no guarda TOTP.

Se verificó con un control positivo —añadir notas a un par de entradas y comprobar
que la búsqueda las encuentra— porque una búsqueda rota habría dado los mismos cuatro
ceros.

**Consecuencia para este ADR: no hay nada que migrar.** La decisión es enteramente
prospectiva, y eso la abarata. Conviene tenerlo escrito, porque si algún día se
importa desde un gestor que sí trae semillas, esa suposición deja de valer.

## 2) Opciones evaluadas

### 2.1) Si se guardan semillas TOTP en eVault

#### Lo que hay que mirar de frente

Un segundo factor existe para que **robar la contraseña no baste**. Si la semilla
vive en la misma vault que la contraseña, quien abra la vault tiene las dos mitades:
el segundo factor deja de ser un segundo factor **frente a ese atacante concreto**.

La frase corta que se repite —«convierte dos factores en uno y medio»— es cierta pero
imprecisa, y merece desglosarse, porque de los tres ataques que TOTP frena solo uno
se pierde:

| Ataque | ¿Lo frena TOTP? | ¿Lo sigue frenando si la semilla está en la vault? |
|---|---|---|
| Contraseña filtrada en una brecha del servicio | Sí | **Sí** |
| Contraseña reutilizada y probada en otro sitio | Sí | **Sí** |
| Phishing de la contraseña | Sí, parcialmente | **Sí**, igual |
| Quien ya abrió tu vault | Sí | **No** |

Es decir: **la protección se pierde exactamente contra quien ya tiene la contraseña
maestra**, y se conserva entera contra todo lo demás, que es la mayoría de lo que
ocurre de verdad.

Y contra ese atacante concreto conviene ser honesto: quien abre la vault ya tiene
las contraseñas de las 370 cuentas. Que además tenga los segundos factores empeora
el desastre, pero no lo convierte de contenido en catastrófico — ya lo era.

#### Opción A (elegida): se guardan, dentro del mismo item

La semilla vive en el blob del item, junto a la contraseña de esa cuenta.

- **Gana**: el segundo factor está donde está la cuenta. Sin esto, TOTP en eVault
  sería un llavero aparte que nadie usaría, porque el gesto real es «abrir la entrada
  de este servicio» y no «buscar su código en otro sitio».
- **Gana**: no toca la API, no toca el esquema criptográfico, no necesita migración.
- **Paga**: la fila de la tabla de arriba.
- **Y es lo que hacen los demás**: 1Password, Bitwarden y KeePass guardan la semilla
  junto a la contraseña. No es argumento por sí solo, pero sí dice que el equilibrio
  entre comodidad y modelo de amenaza está resuelto así en productos que se lo han
  pensado.

#### Opción B (descartada): se guardan, en una vault aparte

Una segunda vault, con su propia contraseña maestra, solo para semillas.

- **Gana**: separa de verdad los factores. Quien abra la vault de contraseñas no
  tiene los códigos.
- **Paga**: dos contraseñas maestras que recordar, dos desbloqueos, dos claves de
  recuperación, y `ADR-004` ejercitado para algo que no es lo que motivó el
  multi-tenancy.
- **Y paga lo que de verdad lo mata**: en la práctica la segunda contraseña acaba
  siendo la misma, o acaba guardada en la primera vault. La separación sería
  nominal, y una separación nominal es peor que ninguna porque se cree real.

#### Opción C (descartada): no se guardan nunca

eVault no toca TOTP y quien lo quiera usa una aplicación aparte.

- **Gana**: el modelo de amenaza no cambia ni una línea. Es la opción más defendible
  sobre el papel.
- **Paga**: no es lo que hoy ocurre. `ADR-009` §1 dice que el propósito número uno es
  que el desarrollador use esto para sus propias contraseñas, y una vault que obliga
  a llevar una segunda aplicación para la mitad de las cuentas empuja al gestor
  anterior — que es el síntoma que `ADR-013` §2.2 registra como el riesgo real.
- **Y hay una asimetría que lo remata**: descartarlo hoy no es gratis ni reversible
  sin coste, porque cada cuenta cuyo TOTP se configure en otro sitio es una migración
  futura hecha a mano, código QR a código QR.

### 2.2) Dónde vive la semilla dentro del item

#### Opción A (elegida): un campo más del blob, `totp`

Un campo de texto en `ItemContent`, con la semilla en base32 o la URI `otpauth://`
completa, omitido cuando no se rellena.

- **No obliga a subir `version`**, que es la del **esquema criptográfico** y hoy vale
  2. `FOUNDATION.md` ya manda omitir las claves vacías, así que un cliente que no
  conozca el campo lo ignora y uno nuevo que lea un item viejo no lo encuentra. Es
  retrocompatible sin migración y sin que el servidor se entere.
- **El nombre del campo va en español si acompaña a los otros cinco.** `nombre`,
  `usuario`, `password`, `url` y `notas` están en español porque **no son
  identificadores sino el formato del blob**, y abrir un segundo idioma dentro del
  mismo objeto serializado es peor que cualquiera de los dos. La implementación fija
  el nombre exacto y lo escribe en `FOUNDATION.md`.

#### Opción B (descartada): una columna en `vault_items`

- **Se descarta sin evaluar tradeoffs**, y el motivo es `ADR-001`: una columna es algo
  que el servidor ve. Aquí no hay nada que sopesar.

### 2.3) Qué hace el export con una semilla

Esta es la parte que `ADR-011` §6 anticipó, y su trigger 1 dice literalmente que un
esquema de item que gana campos con estructura —«por ejemplo TOTP nativo»— obliga a
reevaluarlo y «probablemente» a subir la versión de formato.

**Se reevalúa aquí, y la conclusión es que no hay que subirla.** El trigger acertó al
pedir la revisión y erró en la previsión, y las dos cosas se registran.

#### El export `.evault`: sin cambios, y sin subir versión

El fichero `.evault` cifra `JSON.stringify({ items: contents })` sobre el contenido
entero de cada item, así que **un campo nuevo viaja solo**. Su `version` vale 1 y
describe la **forma del fichero** —cabecera en claro, KDF, cifrado—, no el esquema de
los items que lleva dentro.

Subirla a 2 tendría un coste real y ningún beneficio: obligaría a decidir qué hace un
cliente viejo ante un fichero nuevo, cuando lo que de verdad pasa es que lo abre y se
encuentra un campo que no conoce, exactamente igual que con un item guardado en el
servidor. **La retrocompatibilidad ya está resuelta por la forma del blob**, y una
versión que no distingue nada solo añade una comprobación que puede fallar.

#### El export en claro: la semilla NO sale nunca

El CSV existe para migrar a otro gestor, y por eso lleva las contraseñas legibles.
**La semilla TOTP se queda fuera igualmente**, y no es una omisión sino una decisión:

- Una contraseña en un CSV es un secreto en la carpeta de descargas. **Una semilla
  TOTP también lo es, y además es persistente**: una contraseña se puede rotar en
  cinco minutos, una semilla obliga a reconfigurar el segundo factor cuenta por
  cuenta, con su código QR y sus códigos de respaldo.
- Y llevarla no serviría de mucho: los CSV que los demás gestores **importan** no
  coinciden entre sí en cómo nombran ese campo.

**Pero no se descarta en silencio**, que es lo que `ADR-011` §2.4 prohíbe para el
camino contrario y que vale igual aquí: al exportar en claro se dice **cuántas
entradas llevan un segundo factor que no va en el fichero**. Quien migra tiene que
saber que eso le falta antes de borrar el origen, no después.

Eso se apoya en el issue #380 de la Iteración 12, que ya arregla que el export en
claro pierda campos nuevos en silencio.

### 2.4) El código en pantalla y el bloqueo por inactividad

#### Lo que ya está decidido y no se toca

`ADR-007` dice que el token de sesión vive solo en memoria, y de ahí que recargar
bloquee la vault. `autoLock.ts` avisa a los 14 minutos y bloquea a los 15.

#### Opción A (elegida): el código es contenido de la vault, y desaparece con ella

Un código TOTP se pinta solo con la vault desbloqueada, y **al bloquearse desaparece
con todo lo demás**, sin excepción.

- **Se dice porque la tentación existe**: un código que caduca en treinta segundos
  invita a dejarlo visible «solo un momento más», o a no contar el tiempo de mirarlo
  como actividad. Las dos cosas son agujeros: la primera deja un secreto en pantalla
  tras el bloqueo, y la segunda convierte «tengo la pestaña abierta con un código» en
  una vault que no se bloquea nunca.
- **Y hay un caso concreto que la implementación tiene que resolver**: un contador que
  se refresca cada segundo **no es actividad del usuario**. Si lo fuera, abrir una
  entrada con TOTP mantendría la vault viva indefinidamente. `autoLock.ts` compara
  marcas de tiempo en vez de usar temporizadores precisamente para no confundir
  reloj con presencia, y esa distinción hay que conservarla.

#### Sobre copiar el código

Se copia con `copySecret`, que ya borra el portapapeles a los **30 segundos**. La
coincidencia con la vida de un código TOTP es afortunada y no debe leerse como
diseño: son dos relojes distintos y el segundo no garantiza el primero.

## 3) Decisión final

Se adoptan las opciones **A de 2.1**, **A de 2.2**, lo dispuesto en **2.3** y **A de
2.4**.

| Elemento | Definición |
|---|---|
| Se guardan semillas TOTP | Sí, dentro del item, en el blob cifrado |
| Dónde | Un campo nuevo de `ItemContent`, omitido si está vacío |
| `version` del esquema criptográfico | **Sigue valiendo 2.** No cambia |
| `version` del formato `.evault` | **Sigue valiendo 1.** No cambia |
| Export `.evault` | Lleva la semilla, sin cambios en el formato |
| Export en claro (CSV) | **No la lleva nunca**, y dice a cuántas entradas afecta |
| Al bloquearse la vault | El código desaparece como todo lo demás |
| El contador de segundos | **No cuenta como actividad** para el bloqueo |
| API | No se toca. Ni columna, ni endpoint, ni migración |

## 4) Lineamientos técnicos resultantes

- **La generación es cliente y solo cliente**, en `web/src/lib/vault/`, junto al resto
  de la criptografía. RFC 6238 sobre HMAC-SHA1 con ventana de 30 segundos y 6 dígitos,
  que es lo que emiten los servicios reales; los parámetros se leen de la URI
  `otpauth://` cuando la traiga, y no se inventan valores por defecto silenciosos.
- **La semilla se trata como una contraseña en todo**: no se pinta en la lista, no se
  muestra sin una acción explícita, y no se escribe en ningún registro. Lo que se
  pinta es el código de seis dígitos, que caduca; la semilla, no.
- **El campo del blob se documenta en `FOUNDATION.md`** con su nombre exacto y la nota
  de que ese nombre no se renombra, por lo mismo que los otros cinco.
- **El import de otros gestores mapea la columna de TOTP** en vez de arrastrarla a
  `notas`. Hoy `login_totp` de Bitwarden acaba ahí, y eso deja una semilla en un campo
  que la búsqueda mira.
- **Un test que falle si la semilla aparece en el export en claro.** Es la clase de
  promesa que este proyecto cubre con un test que se rompe cuando la promesa deja de
  ser cierta, como ya hizo con el aviso de la clave de recuperación.
- **Un test que falle si el contador de TOTP cuenta como actividad** del bloqueo por
  inactividad.

## 5) Consecuencias asumidas

1. **Quien abra la vault tiene también los segundos factores.** Es la consecuencia
   central y no tiene mitigación dentro de esta decisión: la mitigación es todo lo que
   protege la vault —la contraseña maestra, PBKDF2 con 600.000 iteraciones, el bloqueo
   por inactividad, que el token no se persista—.
2. **El usuario tiene que entender lo que gana y lo que pierde.** Esto no se resuelve
   en un ADR que nadie lee: la interfaz lo dice donde se configura, con la misma regla
   que `ADR-010` impuso para la clave de recuperación —«donde se cambia la contraseña,
   no en una página de ayuda»—.
3. **Migrar a otro gestor será más incómodo**, porque el CSV en claro no lleva las
   semillas. Es deliberado, y el aviso al exportar es lo que impide que se descubra
   tarde.
4. **El reloj del dispositivo pasa a importar.** Un reloj desviado más de unos
   segundos produce códigos que el servicio rechaza, y eso se leerá como «eVault está
   roto». La implementación tiene que poder distinguir las dos cosas.
5. **Aparece una superficie de código criptográfico nueva** en el cliente que sirve el
   JavaScript que cifra las contraseñas, y `ADR-001` recuerda que el modelo protege la
   base de datos y no la integridad de ese JavaScript. HMAC-SHA1 está en `crypto.subtle`
   y no hace falta dependencia nueva; que no haga falta es parte de la decisión.

## 6) Triggers de reevaluación

Reevaluar si se cumple uno o más:

1. **Se importa desde un gestor que sí trae semillas.** La medición de #374 dice cero
   hoy, y toda la parte «no hay nada que migrar» de este ADR cuelga de ese cero.
2. **Llegan las vaults compartidas.** Compartir una entrada pasaría a compartir un
   segundo factor, que es una decisión distinta de compartir una contraseña.
3. **Aparece soporte real de passkeys** en los servicios que se usan. Una passkey no
   es un segundo factor sobre una contraseña sino su sustituto, y eso cambia la
   pregunta en vez de responderla.
4. **El reloj del dispositivo resulta ser un problema en la práctica** y no solo en
   teoría.

## 7) Impacto en APIs y contratos

**Ninguno.** No hay endpoint nuevo, ni columna, ni migración, ni cambio en el contrato
de `/api/vaults/{vault}/items`: lo que viaja sigue siendo `ciphertext`, `iv` y
`version`, y `version` sigue valiendo 2.

Cambia `ItemContent` en `web/src/lib/vault/types.ts` y su documentación en
`docs/architecture/FOUNDATION.md`, que es contrato **entre clientes** y no con el
servidor. Un cliente antiguo que lea un item con semilla no la muestra y no la pierde,
porque conserva el blob que no entiende al no reescribirlo.

### El estado de ADR-011

`ADR-011` §6 trigger 1 queda **ejercitado y resuelto**: se reevaluó el formato de
export al ganar el esquema un campo con estructura, y la conclusión es que la versión
del fichero **no sube**. `ADR-011` no queda superseded — su decisión sigue vigente
entera; lo que se registra aquí es el resultado de su propia revisión.
