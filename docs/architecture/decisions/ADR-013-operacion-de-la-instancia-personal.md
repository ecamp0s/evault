# eVault — Emplazamiento y operación de la instancia personal

Fecha de decisión: 2026-08-17
Fecha de registro: 2026-08-17
Estado: Aprobada
Depende de: ADR-009 (proyecto personal y público), ADR-012 (estrategia de despliegue), ADR-001 (zero-knowledge), ADR-011 (formato de export e import)

## 1) Contexto

`ADR-009` §1 declara que el propósito número uno de eVault es que su autor lo use
para sus propias contraseñas en un servidor propio. Ese propósito lleva sin cumplirse
desde que se escribió, y no por falta de capacidad técnica: desde la Iteración 5
existe una guía de despliegue verificada ejecutándola, y `ADR-012` fijó la forma del
despliegue. **Lo que faltaba era decidir dónde vive y en qué condiciones se opera.**

Este ADR cierra esa decisión. No es una decisión de arquitectura de software —no
cambia una línea de código— sino de operación, y se registra porque tiene
consecuencias que ningún commit deja ver: qué se asume sobre la disponibilidad de una
máquina doméstica, y dónde acaba la única copia de unos datos que no existen en
ningún otro sitio.

### Lo que cambia respecto a todo lo anterior

Hasta hoy, cualquier fallo de este proyecto era reproducible. Las bases de datos eran
de prueba, los ficheros de ejemplo estaban en el repositorio, y los despliegues se
podían tirar y rehacer — de hecho se hizo, y el criterio de salida 4 de la Iteración 5
lo exigía. **A partir de que la instancia guarde contraseñas reales, eso deja de ser
cierto**, y el servidor no puede reparar nada porque por `ADR-001` no puede leer nada.

Esa asimetría es la que justifica que este documento entre en detalles de operación
que en otro proyecto serían una nota en un README.

### Lo que este ADR NO decide, y una corrección a ADR-012

**No decide el acceso a la vault desde fuera de la red local.** Se discutió al
planificar la Iteración 7 y se dejó fuera a propósito, porque puede acabar
resolviéndose por una vía distinta —una instancia en hosting compartido— y esa
decisión merece su propio ADR. Queda en el issue de deuda correspondiente.

Lo que sí conviene dejar escrito aquí, para que no se vuelva a discutir desde cero:
**`ADR-012` §2.3 llama «túnel, Tailscale o Cloudflare» a su Opción C y les aplica a
las tres el mismo reproche**, el de que el tercero ve el JavaScript servido. Eso es
cierto de una y falso de otra:

| Opción | ¿Abre puertos? | ¿Quién termina el TLS? | ¿Ve el JavaScript servido? |
|---|---|---|---|
| Tailscale (VPN de malla) | No | La propia máquina | **No.** Solo transporta paquetes que no puede abrir |
| Cloudflare Tunnel | No | **Cloudflare, en su borde** | **Sí.** Aquí el reproche aplica |
| VPN propia (WireGuard) | Sí, UDP | La propia máquina | No |
| Hosting compartido | — | El proveedor | **Sí**, y además aloja la base de datos |

La distinción importa más en este proyecto que en cualquier otro, porque **quien
controla el JavaScript servido controla el cifrado en el cliente**: puede servir una
versión que se quede la contraseña maestra. Es el único vector que el README reconoce
como no cubierto por el modelo zero-knowledge, y `ADR-001` no protege de él.

`ADR-012` no se supersede por esto: su decisión —descartar el túnel por ahora— sigue
en pie y era correcta. Lo que se corrige es el razonamiento con el que agrupó cuatro
cosas distintas, para que quien retome el tema no herede la imprecisión.

## 2) Opciones evaluadas

### 2.1) El emplazamiento de la instancia

#### Opción A (elegida): el servidor doméstico que ya existe

La misma máquina donde se verificó la guía de despliegue en la Iteración 5, con el
despliegue de prueba retirado.

Tradeoffs:

- **La máquina ya está montada y la guía se verificó ahí**, así que el camino
  documentado es el que se va a recorrer y no una traducción de él a otro entorno.
- Cumple `ADR-009` §4 sin trabajo: al planificar la Iteración 7 se comprobó que el
  despliegue de prueba **ya estaba desmantelado** —cero contenedores y cero
  volúmenes—, de modo que el de la instancia personal es un despliegue desde cero y no
  una conversión. Lo único que queda son restos inertes: imágenes huérfanas y un
  servicio de publicación mDNS activo apuntando a nada.
- Los datos no salen de la red doméstica ni pasan por ningún tercero. Es la lectura
  más estricta de `ADR-001`, y la que menos supuestos exige.
- **Coste, y es el que obliga a la sección 2.2: no está encendida siempre.** Se apaga
  a propósito —viajes, ausencias— y eso convierte la disponibilidad en un requisito
  que hay que tratar explícitamente en vez de suponer.

#### Opción B (descartada): otra máquina de la red, dejando la primera para pruebas

Tradeoffs:

- Es la lectura literal de `ADR-009` §4 y evita cualquier duda sobre convivencia.
- **Innecesaria, porque la duda no existe:** no hay despliegue de prueba con el que
  convivir. Y `ADR-009` §4 prohíbe compartir máquina con un despliegue de
  demostración, no tener una máquina que en el pasado alojó uno.
- Añadiría una máquina que mantener, actualizar y respaldar a cambio de resolver un
  problema que está resuelto.

#### Opción C (descartada por ahora): un VPS externo

Tradeoffs:

- Disponibilidad real, sin apagones domésticos, y resolvería de paso el acceso desde
  fuera de la red sin túnel ni VPN.
- **Reabre `ADR-012` §2.3 entero**, que descartó la exposición directa «por lo que
  protege esta máquina y no por sus méritos». Un VPS es una máquina expuesta a
  internet sirviendo el JavaScript que hace el cifrado.
- Implica confiar el cifrado en reposo del disco a un tercero, y sobre todo confiar la
  integridad del JavaScript servido a quien controla la máquina.
- No se descarta para siempre: es el trigger de reevaluación de la sección 6.

#### Opción D (descartada por ahora): hosting compartido

Tradeoffs:

- `ADR-012` §2.4 ya documenta que eVault cabe en uno, y es la clase de despliegue que
  tiene mucha gente.
- **Ese camino no está verificado, y hay que decir algo más incómodo: `ADR-012` §2.4
  afirma que «queda issue abierto para verificarlo sobre un hosting real», y ese issue
  nunca se creó.** Comprobado al planificar la Iteración 7 sobre los 117 issues del
  repositorio. Así que su estado real no es «pendiente de verificar» sino «nadie ha
  hecho nada».
- Y tiene una diferencia de fondo que conviene registrar antes de que se plantee como
  alternativa equivalente: **no es un modo de acceso a la instancia de casa, es otra
  instancia en otro sitio.** Eso abre preguntas que ningún ADR ha tratado — si hay una
  o dos instancias personales, dónde vive entonces la base de datos con los secretos, y
  qué pasa si son dos y divergen.

### 2.2) La disponibilidad, y qué se asume

La máquina no está encendida siempre. La intención es mantenerla encendida la mayor
parte del tiempo, con apagados **deliberados y conocidos**, no averías.

#### Opción A (elegida): asumir la intermitencia y documentar sus consecuencias

No se construye nada para garantizar disponibilidad. Se asume el comportamiento y se
deja escrito qué implica, porque **lo obvio no es lo único que implica**.

Lo obvio es que apagada no se puede acceder a la vault. Lo que hay que registrar es el
resto:

- **El cron de copias no corre.** Con un matiz que lo desdramatiza y que merece quedar
  escrito para no sobredimensionarlo: si nadie usa la vault mientras está apagada,
  tampoco hay datos nuevos que perder. **Lo que importa no es el tiempo apagada sino
  el desfase entre la última copia y el último cambio.** De ahí sale un lineamiento
  concreto en la sección 4: la comprobación útil no es «¿corrió hoy el cron?» sino
  «¿hay copia posterior al último cambio?».
- **Arranca desactualizada.** Semanas sin parches del sistema ni de las imágenes base,
  en la máquina que guarda las contraseñas. La consecuencia es de orden y no de
  herramienta: tras un apagado largo se actualiza **antes** de usarla.
- **La publicación mDNS queda activa apuntando a nada.** Comprobado: el servicio sigue
  `active` y `enabled` sin ningún contenedor detrás. Es inocuo —da un error de
  conexión— pero **confunde el diagnóstico, porque el nombre resuelve y el fallo
  parece de la aplicación cuando lo que pasa es que no hay aplicación.**
- **Lo que NO es un problema, y parece que lo sería:** los certificados de
  `tls internal`. Caddy emite hojas de vida corta y las renueva al arrancar, así que un
  apagado largo no deja la instancia sin TLS. Se registra para que nadie lo investigue
  dos veces.
- **Y el riesgo de fondo, que no es técnico y es el que de verdad amenaza el propósito
  número uno:** si no se puede llegar a la vault cuando se necesita, no se usa; y si no
  se usa, se sigue con el gestor anterior. Entonces hay dos fuentes de verdad
  divergiendo y no se confía en ninguna. **El peligro de una instancia intermitente no
  es perder datos: es que la vault quede a medio poblar.**

Tradeoffs:

- Coste cero, y honesto: describe lo que va a pasar en vez de prometer otra cosa.
- No mitiga el riesgo de fondo. Solo lo nombra, para que se reconozca si ocurre.

#### Opción B (descartada): tratar la disponibilidad como requisito técnico

Alta disponibilidad, redundancia o un segundo nodo.

Tradeoffs:

- Sería lo correcto para un servicio con usuarios.
- Aquí es desproporcionado hasta el absurdo: es un gestor de contraseñas personal en
  una máquina, y `DEPLOYMENT.md` ya lo dice en su sección de qué no cubre. Construir
  redundancia para un único usuario que además controla cuándo se apaga la máquina es
  resolver un problema inventado.

### 2.3) El destino de la copia de seguridad

Es la decisión de fondo de este ADR, y no venía de un análisis de riesgos sino de una
pregunta hecha al planificar la iteración: *si la máquina está apagada, ¿supone algún
otro problema?* Al responderla apareció algo que no tiene nada que ver con estar
apagada:

**Una copia de seguridad en el mismo disco que los datos no es una copia de
seguridad.** Si los volúmenes de Docker y el fichero que escribe el cron están los dos
en la misma máquina, un fallo de ese disco se lleva las dos cosas a la vez.

`ADR-011` §5 ya apuntaba ahí sin llegar a decirlo:

> «Un export es una foto y envejece. […] Es lo que hace que el backup del servidor no
> sea redundante con esto, sino complementario.»

Complementario significa esto: el export protege del borrado accidental y de quedar
atrapado en eVault; la copia del servidor, de perder la instancia. **Y hasta hoy solo
existía la primera mitad de la segunda**, porque la copia no salía de la máquina.

#### Opción A (elegida): un almacenamiento remoto de terceros

Tradeoffs:

- **Es la única opción que sobrevive a la pérdida física del sitio**, no solo a un
  fallo de disco.
- **Funciona por diseño en este proyecto, y es un dividendo del modelo que casi nunca
  se cobra.** Verificado sobre `BackupCommand`: la copia contiene cuatro tablas en un
  formato JSON propio, con los mismos blobs opacos que guarda el servidor, y **no
  incluye el `.env` ni la `APP_KEY`**. El proveedor no puede leer la vault. El propio
  comando lo dice: «la copia se puede sacar de la máquina sin ceremonia».
- Y lo que sí lleva, que el comando tampoco esconde: los hashes de autenticación y las
  claves de vault envueltas. No permiten descifrar nada —de eso trata `ADR-008`— pero
  tampoco son material que convenga repartir. **Es la razón entera de la sección 2.4.**
- Coste: una dependencia externa, y una cuenta que hay que mantener viva.
- **No se ata a ningún proveedor concreto**, que es lineamiento de `ADR-005`. La
  decisión es «almacenamiento remoto», no «el almacenamiento de tal empresa».

#### Opción B (descartada como única): otro dispositivo de la red local

Tradeoffs:

- Sin terceros, y suficiente contra el riesgo concreto que estaba abierto: el fallo del
  disco de la máquina.
- **No cubre la pérdida del sitio** —robo, incendio, inundación—, que para la única
  copia de unas contraseñas reales es un escenario que merece cubrirse.
- Se descarta como destino único, no como complemento: la sección 4 la deja disponible.

#### Opción C (descartada): copia manual a un disco externo

Tradeoffs:

- Lo más simple y sin ninguna dependencia.
- **Vuelve a depender de que alguien se acuerde**, que es justamente lo que hay que
  quitar: una copia que hay que recordar hacer no es una copia de seguridad, es una
  intención.

### 2.4) El cifrado de la copia, y dónde vive la clave

La copia sale de la máquina hacia un tercero. El contenido de la vault ya va cifrado,
así que la pregunta es solo por los hashes de autenticación y las claves envueltas.

#### Opción A (elegida): cifrado asimétrico, con la clave pública en el servidor

El servidor cifra con una **clave pública**, que no es secreta. La clave privada que
descifra **no está en el servidor**.

Tradeoffs:

- **La propiedad que esto compra es la que decide la opción, y no es la obvia: la
  máquina que produce la copia no puede leerla.** Quien comprometa el servidor no
  obtiene los backups anteriores, ni los que ya están en la nube, ni podría descifrar
  los futuros — solo seguir produciéndolos. Un cifrado simétrico obliga a tener el
  secreto en la máquina para poder cifrar, y con él se abre todo.
- Es además coherente con la forma del proyecto: es la misma idea que hace que el
  servidor de eVault no pueda leer la vault, aplicada a las copias.
- No hay clave secreta en el cron, en el `.env` ni en ningún fichero del servidor.
- Coste: hay que custodiar una clave privada fuera de la máquina, y **si se pierde, los
  backups son basura.** Se trata en la sección 5.

Sobre la herramienta, y es una decisión con su propio motivo: se usa una que haga
cifrado asimétrico con **una clave corta y sin infraestructura alrededor** —del estilo
de `age`—, aunque haya que instalarla, en vez de `gpg`, que ya está en la máquina.
`gpg` sabe hacer esto y llevaría cero instalación, pero trae un modelo de confianza,
un keyring, caducidad de claves y la pregunta de qué usuario del sistema tiene acceso
a él. Para algo que tiene que seguir funcionando dentro de cinco años sin que nadie lo
mire, **cada pieza que puede caducar o desconfigurarse es un modo de fallo silencioso**,
y aquí el fallo se descubre el día de la restauración. La simplicidad gana a la
disponibilidad previa.

#### Opción B (descartada): sin cifrar

Tradeoffs:

- Es lo que el propio `BackupCommand` argumenta, y el argumento es bueno: los datos de
  usuario ya salen cifrados de fábrica.
- Menos piezas, ninguna clave que custodiar, y elimina de golpe el riesgo de perder la
  clave y quedarse sin copias utilizables.
- **Pero deja los hashes de autenticación en manos de un tercero.** No abren nada, y
  atacarlos por fuerza bruta es caro —PBKDF2 con 600.000 iteraciones— pero no
  imposible, y el coste de un ataque offline solo baja con el tiempo. Para el único
  sitio donde están las contraseñas reales, cerrar esa duda cuesta poco.

#### Opción C (descartada): cifrado simétrico con una passphrase

Tradeoffs:

- Más simple de entender, y no hay claves que generar.
- **Pierde la propiedad que hace valiosa a la Opción A**: la passphrase tiene que estar
  en la máquina para poder cifrar automáticamente, así que quien comprometa el servidor
  puede descifrar todas las copias.
- Y añade una segunda contraseña que recordar, con el riesgo de que acabe siendo la
  misma que la maestra, que acoplaría dos secretos que deben ser independientes.

## 3) Decisión final

La instancia personal vive en **el servidor doméstico que ya existe**, con el
despliegue de prueba retirado y sin nada más que conviva con ella.

Su **intermitencia se asume** y no se combate: apagados deliberados, no averías, con
las consecuencias de la sección 2.2 documentadas en vez de supuestas.

Las copias de seguridad se escriben en la máquina y **se suben cifradas a un
almacenamiento remoto**, con cifrado asimétrico cuya clave privada no vive en el
servidor.

Motivo de conjunto: es la combinación que no exige confiar en nadie para lo que
importa —el JavaScript servido y el contenido de la vault siguen bajo control propio—
y a cambio acepta confiar a un tercero un fichero que no puede leer. **La única
concesión real es de disponibilidad, y es la que el propietario controla.**

## 4) Lineamientos técnicos resultantes

- **La instancia personal no comparte máquina con ningún despliegue de demostración**,
  por `ADR-009` §4. La regla aplica a futuro: si vuelve a hacer falta un despliegue de
  prueba, no va en esta máquina.
- **Los restos de un despliegue anterior se retiran antes de desplegar encima**, no
  después. Incluye imágenes con el mismo tag, que si no pueden hacer que un despliegue
  arranque código que no es el que se cree, y servicios de publicación de nombres que
  resuelvan a algo que no existe.
- **La copia de seguridad sale de la máquina.** Una copia en el mismo disco que los
  datos no cuenta como copia. La copia local sigue existiendo y es la que se restaura
  primero por rapidez; la remota es la que sobrevive a perder la máquina.
- **La copia se cifra antes de salir, con una clave pública.** La privada no está en el
  servidor, ni en el `.env`, ni en el cron.
- **La clave privada de las copias se custodia con el mismo criterio que la clave de
  recuperación de la vault** (`ADR-010`): fuera del dispositivo y fuera de la máquina.
  No se guarda dentro de eVault, por una razón que no es teórica: haría falta para
  restaurar eVault.
- **La comprobación de que las copias funcionan no es «¿corrió el cron?» sino «¿hay
  copia posterior al último cambio, y se puede restaurar?».** La primera pregunta da
  falsos negativos con la máquina apagada y falsos positivos con un destino remoto
  inaccesible.
- **Una copia que no se ha restaurado nunca es un fichero, no una copia de seguridad.**
  Es el criterio que `ADR-012` y el issue de #129 ya aplicaron, y aquí se extiende al
  camino nuevo: hay que restaurar una copia **traída del destino remoto y descifrada**,
  no una local.
- **Tras un apagado largo se actualiza el sistema antes de usar la vault.**
- **La actualización de la instancia empieza comprobando que hay una copia
  restaurable**, no solo que se hizo.
- **El proveedor de almacenamiento no se hardcodea en ningún sitio**, por `ADR-005`.
  Cambiar de proveedor es cambiar configuración.

## 5) Consecuencias asumidas

1. **La vault no está disponible cuando la máquina está apagada**, y eso incluye
   momentos en los que se necesitaría. Es la consecuencia más visible y la más
   aceptada: es un apagado que el propietario decide.
2. **Perder la clave privada de las copias las convierte en basura**, y es la
   consecuencia nueva que este ADR introduce. Es simétrica a la que `ADR-001` ya asumía
   con la contraseña maestra, y se acepta por el mismo motivo: la alternativa —una
   clave que el servidor pueda usar para descifrar— destruye la propiedad por la que se
   eligió cifrar así. **Se mitiga custodiándola donde se custodia la clave de
   recuperación, y comprobándolo en la primera restauración y no el día que haga
   falta.**
3. **Hay un tercero en la cadena de custodia de un fichero derivado de la vault.** No
   puede leerlo, pero puede borrarlo, perderlo o cerrar la cuenta. De ahí que la copia
   local no se retire: son dos fallos independientes y hacen falta los dos para quedarse
   sin nada.
4. **La instancia queda por debajo de lo que ofrece cualquier gestor comercial en
   disponibilidad**, y eso puede empujar a no usarla. Es el riesgo de fondo de la
   sección 2.2 y no tiene mitigación técnica: se reconoce para poder detectarlo.
5. **Los datos reales no son reproducibles ni enseñables.** A partir de la migración,
   el repositorio deja de contener todo lo que hay que saber del proyecto: hay un estado
   vivo que ningún commit refleja. Es la primera vez que pasa, y obliga a que el cierre
   de la iteración registre qué se verificó y cómo, porque no habrá diff que lo
   demuestre.

## 6) Triggers de reevaluación

Se reevalúa el **emplazamiento** si la intermitencia deja de ser deliberada y pasa a
ser avería, o si el patrón de uso demuestra que la vault se queda a medio poblar por no
estar disponible. Ese es el síntoma del riesgo de la sección 2.2 materializándose, y la
respuesta natural no sería más redundancia doméstica sino la Opción C o la D.

Se reevalúa la **decisión de no salir de la red local** cuando se retome el acceso desde
fuera, que tiene su propio issue. La tabla de la sección 1 es el punto de partida, no
`ADR-012` §2.3.

Se reevalúa el **cifrado de las copias** si el destino remoto pasa a ser una máquina
propia, donde la Opción B recupera parte de su argumento.

**No se reevalúa** por el hecho de que aparezca una herramienta de backup más completa.
Lo que decide esta sección no es la herramienta sino dónde está la clave, y eso no lo
cambia ninguna.

## 7) Impacto en APIs y contratos

Ninguno. No cambia ninguna ruta, ningún campo, ningún esquema ni ningún formato
criptográfico. `BackupCommand` y su restauración se usan tal como están; lo que este
ADR añade ocurre **después** de que el fichero exista, y el propio comando ya dejó
escrito que sacarlo de la máquina es posible sin ceremonia.

Es el tercer ADR seguido con impacto cero en el contrato, y por el mismo motivo que
`ADR-009`: es una decisión sobre cómo se opera el producto, no sobre cómo se construye.
