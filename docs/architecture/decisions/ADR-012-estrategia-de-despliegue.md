# eVault — Estrategia de despliegue

Fecha de decisión: 2026-08-05
Fecha de registro: 2026-08-05
Estado: Aprobada
Depende de: ADR-005 (arquitectura self-hosteable), ADR-009 (proyecto personal y público), ADR-001 (zero-knowledge)

## 1) Contexto

`ADR-005` decidió que el proyecto fuera desplegable por terceros desde el primer
commit, y pagó por ello un coste continuo: ninguna URL, dominio ni origen
hardcodeado, todo por variables de entorno. `ADR-009` §4 fue más lejos y convirtió
el self-hosting en **el** modo de despliegue, no en una opción de un plan, con un
criterio de priorización que pone «despliegue reproducible» por delante de la
legibilidad y de la funcionalidad nueva.

**Y sin embargo no hay ninguna forma de desplegar eVault.** No existe `Dockerfile`,
ni Compose, ni configuración de servidor, ni guía. `docs/development/SETUP.md`
cubre el entorno local, que es otra cosa: ahí no hay dominio, ni TLS, ni servicio
que sobreviva a un reinicio, ni copias programadas. El `README.md` afirma en su
segunda frase que el proyecto está diseñado para auto-alojarse, y a día de hoy esa
afirmación no tiene detrás ni un comando.

Es la mayor distancia actual entre lo que el proyecto promete y lo que entrega, y
es de las primeras cosas que comprueba quien lea el repositorio evaluando criterio
técnico.

### Lo que este ADR no tiene que rescatar

Conviene decirlo antes de las opciones, porque cambia el tamaño del problema: **no
hay que desenterrar supuestos incrustados.** Eso es exactamente lo que `ADR-005`
compró y lo que hoy se cobra. Los orígenes CORS ya se leen de entorno y abortan si
faltan, la URL de la API ya es configuración, el almacenamiento ya pasa por el
sistema de ficheros de Laravel, y `evault:backup` ya funciona igual sobre MySQL y
sobre SQLite desde #129.

Lo que falta no es hacer el proyecto desplegable. Es **decidir cómo se despliega y
escribirlo**.

## 2) Opciones evaluadas

### 2.1) La forma del despliegue

#### Opción A (elegida): Docker Compose

Tres servicios: Caddy sirviendo los estáticos de la SPA y haciendo de reverse proxy
hacia la API, PHP-FPM ejecutando Laravel, y MySQL.

Tradeoffs:

- Convierte «clonar y levantar» en un comando, que es el objetivo declarado de la
  Iteración 5 y lo que decide si quien abre el repositorio llega a ver la
  aplicación o se queda en el README.
- Corre igual en el portátil y en el servidor, así que la guía de despliegue y el
  arranque de desarrollo dejan de ser dos procedimientos que divergen.
- No obliga a instalar PHP, Composer ni Node en la máquina anfitriona.
- Coste: una pieza más que entender, y un modo de fallo nuevo —el contenedor que
  funciona solo en la máquina donde se construyó— que hay que verificar
  explícitamente y no dar por bueno.

#### Opción B (descartada): guía de instalación manual sobre la máquina anfitriona

Instalar PHP, Composer, Node, MySQL y un servidor web, y documentar los pasos.

Tradeoffs:

- Es lo más parecido a lo que ya existe en `SETUP.md`, así que el coste inicial es
  bajo.
- Reproduce el problema que Docker resuelve: la deriva entre entornos. Una guía así
  envejece en silencio, porque nada falla cuando deja de ser cierta — simplemente
  deja de funcionar para el siguiente que la siga.
- Y el siguiente que la siga puede ser el propio autor dentro de un año, que es el
  caso de uso real de este proyecto.

#### Opción C (descartada): un PaaS gestionado

Fly, Railway o equivalente.

Tradeoffs:

- Trabajo de operaciones casi nulo.
- Ata el proyecto a un proveedor concreto, que es literalmente lo contrario de lo
  que decidió `ADR-005`, y lo hace en el componente que guarda los secretos.
- Para un proyecto cuyo propósito declarado es enseñar criterio técnico, delegar el
  despliegue completo enseña menos.

#### Opción D (descartada): imágenes publicadas en un registro

Construir imágenes en CI y publicarlas para que el despliegue sea solo un `pull`.

Tradeoffs:

- Sería lo correcto para un producto con usuarios.
- **Y no puede funcionar aquí, por un motivo técnico concreto** que se detalla en
  los lineamientos: el build de la SPA hornea la URL de la API dentro del
  JavaScript, así que una imagen del frontend solo sirve al dominio con el que se
  construyó. Publicar imágenes obligaría a construir una por despliegue, que es
  precisamente lo que un registro evita.
- Se reevalúa si alguna vez la SPA lee su configuración en tiempo de ejecución.

### 2.2) La base de datos del camino de referencia

#### Opción A (elegida): MySQL

Tradeoffs:

- **Paridad con el entorno de desarrollo**, que ya usa MySQL 8. Desplegar sobre el
  mismo motor con el que se desarrolla elimina una clase entera de sorpresas: las
  que aparecen solo en producción porque el motor se comporta distinto.
- Es el motor sobre el que se han escrito y comprobado las consultas reales del
  proyecto, incluida la verificación de #59 de que en la base de datos no se puede
  leer nada.
- Coste: un servicio más en el Compose, una contraseña más que gestionar y un
  volumen más que respaldar.

#### Opción B (descartada): SQLite

Tradeoffs:

- Bastaría de sobra. Una instancia personal es un usuario y unos cientos de items,
  y `evault:backup` ya la soporta desde #129.
- Quita un servicio entero, una contraseña y un volumen.
- **Se descarta por la divergencia**: dejaría el desarrollo sobre MySQL y el
  despliegue sobre SQLite, que es la asimetría que la Opción A existe para evitar.
  Ahorrar un contenedor no compensa que producción corra sobre un motor que nadie
  ejercita a diario.
- Los tests seguirán usando SQLite in-memory, y eso no contradice nada: ahí la
  asimetría se acepta a cambio de velocidad, y las consultas que importan tienen
  además su verificación contra MySQL real.

### 2.3) TLS y el modo de acceso

Esta es la decisión que más consecuencias tiene, y la que no se puede posponer,
porque **sin HTTPS eVault no arranca**. No se degrada: no arranca.

Fuera de `localhost`, la Web Crypto API no existe en contexto inseguro. Una
instancia servida por `http://` en un dominio propio o en una IP de la red local no
es una instalación limitada — es una donde no se puede registrar un usuario, ni
iniciar sesión, ni descifrar un solo item. Y el fallo no se explica solo: llega
como un `Uncaught (in promise)` sin mensaje, porque lo que revienta es una
propiedad de `undefined` dentro de una promesa. Eso ya costó una iteración entera
en local y lo documenta #91.

**La excepción de `.localhost` no ayuda aquí**, y conviene entender por qué antes de
intentar reutilizarla: los navegadores tratan como de confianza los hosts que
terminan en `.localhost` porque los resuelven a loopback ellos mismos. Eso funciona
en la máquina que ejecuta el navegador, no desde otro dispositivo de la red. Un
portátil que entra a `http://192.168.1.50` contra el servidor de casa no tiene
contexto seguro por ninguna vía.

#### Opción A (elegida): Caddy con `tls internal`, acceso por LAN o VPN

Caddy genera su propia autoridad certificadora local y emite el certificado.

Tradeoffs:

- **No hay que abrir un solo puerto del router.** Para una instancia que guarda las
  contraseñas reales del autor, esa es la propiedad que más vale, y encaja con
  `ADR-001`: el modelo zero-knowledge protege la base de datos y el tráfico, no la
  integridad del JavaScript servido, así que reducir quién puede alcanzar el
  servidor es una mitigación real y no una redundancia.
- No depende de ningún tercero, ni de un dominio, ni de una IP fija, ni de DDNS.
- Coste, y es el precio real de esta opción: **hay que instalar la CA raíz de Caddy
  en cada dispositivo** que use la vault. En un portátil es un comando; en iOS son
  dos pasos separados —instalar el perfil y después confiar en él en Ajustes— y el
  segundo no es evidente. Quien no lo haga verá un error de certificado y, si lo
  salta, seguirá sin `crypto.subtle`.
- Coste: sin VPN no hay acceso desde fuera de casa.

#### Opción B (descartada): Let's Encrypt por HTTP-01

Tradeoffs:

- Certificado válido en cualquier dispositivo sin instalar nada, que es justo la
  fricción de la Opción A.
- Exige exponer los puertos 80 y 443 a internet, un dominio apuntando a casa y
  DDNS por la IP dinámica.
- Se descarta porque **expone a internet la máquina que guarda las contraseñas
  reales** a cambio de comodidad. La relación entre lo que cuesta y lo que arriesga
  no sale.

#### Opción C (descartada): túnel, Tailscale o Cloudflare

Tradeoffs:

- HTTPS con certificado válido sin abrir un puerto. Es el punto intermedio honesto y
  no es una mala opción.
- Mete un tercero en el camino entre el navegador y la vault. Con `ADR-001` eso
  importa menos de lo que parece, porque ese tercero ve ciphertext; pero sí ve el
  JavaScript que se sirve, y ese es exactamente el vector que el propio README
  reconoce como el no cubierto por el modelo.
- Se descarta por ahora, y es la primera candidata si el acceso desde fuera de la
  LAN llega a hacer falta.

### 2.4) El hosting compartido sin Docker

#### Opción A (elegida): documentado como alternativa, marcado como no verificado

Tradeoffs:

- **eVault cabe en un hosting compartido y merece decirse**, porque es la clase de
  despliegue que tiene mucha gente: la SPA es un `dist/` estático que se sube tal
  cual y no necesita Node en el servidor, y la API es Laravel sobre PHP 8.4 y
  MySQL. Las fricciones son conocidas —apuntar el document root a `api/public`,
  `composer install` por SSH, cron para las copias— y ninguna es un impedimento.
- Coste: documentación que nadie ha ejecutado. Se mitiga **diciéndolo**: la guía
  marcará qué camino está verificado y cuál no, en vez de presentarlos como
  equivalentes.
- Queda issue abierto para verificarlo sobre un hosting real.

#### Opción B (descartada): declararlo fuera de soporte

- Más limpio y más fácil de sostener.
- Se descarta porque sería falso por omisión: el proyecto **sí** funciona ahí, y
  callarlo empuja a quien tenga ese hosting hacia la conclusión contraria.

## 3) Decisión final

**Docker Compose con Caddy, PHP-FPM y MySQL** como camino de referencia, servido
por HTTPS con la CA interna de Caddy, accesible en la red local o por VPN y sin
exponer ningún puerto a internet. El hosting compartido sin Docker se documenta
como alternativa, señalado explícitamente como no verificado.

Motivo: la Opción A de cada bloque es la que sostiene a la vez las dos exigencias
que este proyecto tiene y que no siempre tiran en la misma dirección — que el autor
pueda guardar ahí sus contraseñas de verdad, y que quien lea el repositorio pueda
levantarlo y entenderlo. Compose resuelve la segunda sin comprometer la primera;
`tls internal` resuelve la primera aceptando una fricción que solo paga quien
despliega, no quien lee.

## 4) Lineamientos técnicos resultantes

- **El estado vive fuera de los contenedores**: volumen para los datos de MySQL y
  para `storage/` de Laravel. Un contenedor debe poder destruirse y recrearse sin
  pérdida.
- **`APP_DEBUG=false` y `APP_ENV=production`** en cualquier despliegue. Con
  `APP_DEBUG=true`, una traza de Laravel expone configuración y fragmentos de
  entorno a cualquiera que provoque un error.
- **`CORS_ALLOWED_ORIGINS` lleva el dominio real** del despliegue. Ya aborta si
  falta y no admite comodín, y eso no se relaja para desplegar.
- **La copia de seguridad se programa con cron y se escribe fuera del volumen del
  contenedor.** Una copia dentro del mismo volumen que protege no es una copia.
  `evault:backup` conserva las siete últimas.
- **La SPA se construye por despliegue, y esto no es opcional.** Vite sustituye
  `import.meta.env.VITE_API_URL` en tiempo de build, así que la URL de la API queda
  escrita dentro del JavaScript generado — comprobado sobre un `dist/` real, que
  contiene `api.evault.localhost` literal. La CSP se genera igual, a partir del
  mismo valor. En consecuencia **un `dist/` construido para un despliegue no sirve
  para otro**, y el Compose construye el suyo con las variables de su entorno.
- **La instancia personal y cualquier despliegue de demostración no comparten
  máquina ni base de datos**, según `ADR-009` §4. No se reabre aquí.
- **HTTPS es requisito de funcionamiento, no de endurecimiento**, y la guía lo dice
  antes que ningún comando. Quien lo descubra después habrá desplegado dos veces.
- Nada de rutas absolutas de la máquina del autor en ficheros versionados, que sigue
  siendo lineamiento de `ADR-005` y ahora tiene dónde incumplirse.

## 5) Consecuencias asumidas

1. **La CA de Caddy hay que instalarla en cada dispositivo**, y en iOS el proceso
   tiene dos pasos de los que el segundo no es evidente. Es la consecuencia más
   molesta de esta decisión y la que más probablemente la haga reevaluar. Se asume
   a cambio de no exponer a internet la máquina que guarda las contraseñas reales.
2. **Sin VPN no hay acceso desde fuera de la red local.** Para el uso previsto
   —un gestor personal en una instancia propia— es aceptable; deja de serlo en
   cuanto haga falta consultar la vault desde el móvil fuera de casa.
3. **Un artefacto por despliegue.** No hay un build universal que distribuir, y por
   tanto tampoco imágenes publicadas útiles mientras la configuración se resuelva
   en tiempo de build. Es una limitación heredada de cómo Vite trata las variables,
   no una elección de este ADR.
4. **MySQL añade un servicio, una contraseña y un volumen** a un despliegue que con
   SQLite habría tenido uno menos de cada. Se acepta a cambio de que producción y
   desarrollo corran sobre el mismo motor.
5. **Habrá documentación no verificada** —la del hosting compartido— dentro de un
   repositorio cuya lección más cara de la iteración anterior fue precisamente dar
   por bueno lo no comprobado. La diferencia, y es toda la diferencia: aquí queda
   marcado como no verificado en el propio documento, en vez de afirmado como
   hecho.
6. **Docker pasa a ser una dependencia** para el camino de referencia. Quien no
   quiera o no pueda usarlo tiene la alternativa documentada, con su advertencia.

## 6) Triggers de reevaluación

Se reevalúa el **modo de acceso y TLS** si hace falta consultar la vault desde
fuera de la red local sin VPN. La primera candidata sería el túnel de la Opción C,
no la exposición directa.

Se reevalúa la **forma del despliegue** si aparece una instancia pública de
demostración: es un despliegue separado por `ADR-009` §4, y al no guardar secretos
reales admite Let's Encrypt y exposición directa, que aquí se descartaron por lo
que protege esta máquina y no por sus méritos.

Se reevalúa la **decisión sobre imágenes publicadas** si la SPA pasa a leer su
configuración en tiempo de ejecución en vez de en tiempo de build. Eso eliminaría
el motivo técnico de la Opción D y volvería a ponerla sobre la mesa.

No se reevalúa por el hecho de que el hosting compartido se verifique. Que un
camino alternativo funcione no lo convierte en el de referencia.

## 7) Impacto en APIs y contratos

Ninguno. No cambia ningún endpoint, ni el formato del blob, ni el contrato entre la
SPA y la API. Es la confirmación de lo que `ADR-009` §3 ya observó al dejar el
proyecto de ser un SaaS: no hubo que tocar una línea de código, y por el mismo
motivo — `ADR-005` trató el despliegue como configuración desde el principio.

Impacta en configuración y en documentación: `docs/operations/DEPLOYMENT.md` como
documento nuevo, y `.env.example` como su referencia de lo que hay que definir.
