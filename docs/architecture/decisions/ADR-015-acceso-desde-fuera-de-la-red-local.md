# eVault — Acceso a la vault desde fuera de la red local

Fecha de decisión: 2026-08-19
Fecha de registro: 2026-08-19
Estado: Aprobada
Depende de: ADR-013 (operación de la instancia personal), ADR-012 (estrategia de despliegue), ADR-001 (zero-knowledge), ADR-009 (proyecto personal y público)

## 1) Contexto

Desde la Iteración 7 la instancia personal guarda 370 contraseñas reales y vive en
la red local. Desde la 8 se sabe además que se pueden recuperar de una copia. Lo que
no se puede es **usarlas**, y una contraseña se necesita justo cuando no se está en
casa.

`ADR-013` §2.2 registró esto como el riesgo que de verdad amenaza el propósito número
uno de `ADR-009`: mientras la vault solo sirva dentro de casa, se sigue usando el
gestor anterior en paralelo, y entonces la vault propia no cumple aquello para lo que
se construyó. No es una carencia de comodidad, es la que decide si el proyecto sirve.

### Lo que este ADR decide, y por qué le toca a él

`ADR-013` §1 dejó este hueco abierto **a propósito y con nombre**:

> «No decide el acceso a la vault desde fuera de la red local. […] puede acabar
> resolviéndose por una vía distinta —una instancia en hosting compartido— y esa
> decisión merece su propio ADR.»

Este es ese ADR. Y conviene decir qué **no** hace, porque el issue de deuda que lo
pedía (#229) afirma que hay que corregir el agrupamiento de `ADR-012` §2.3 —«túnel,
Tailscale o Cloudflare» bajo un mismo reproche—: **esa corrección ya la hizo
`ADR-013` §1**, el mismo día en que se escribió aquel issue. Su tabla de cuatro
vías, el criterio del JavaScript servido y la frase «`ADR-012` no se supersede por
esto» están ahí. Se deja registrado porque la planificación de la Iteración 9 copió
esa afirmación sin comprobarla, que es el fallo que este repositorio lleva cinco
iteraciones documentando.

Así que este ADR **no corrige: decide**. Y sí añade un matiz a la tabla de
`ADR-013`, en §2.1, que solo aparece al mirar el plano de control.

### Y no contradice a ADR-012: ejecuta su propio disparador

`ADR-012` §2.3 descartó el túnel «por ahora» y añadió que era «la primera candidata si el
acceso desde fuera de la LAN llega a hacer falta». Su §6 lo dejó como disparador explícito:

> «Se reevalúa el **modo de acceso y TLS** si hace falta consultar la vault desde fuera de
> la red local sin VPN. La primera candidata sería el túnel de la Opción C, no la
> exposición directa.»

**Esto es esa reevaluación**, y llega a esa misma candidata. `ADR-013` §6 remite igual,
apuntando a su propia tabla como punto de partida en lugar de a `ADR-012` §2.3.

Por eso **ninguno de los dos queda superseded**: sus decisiones siguen en pie —`tls
internal` se conserva, ver §2.3— y este ADR ocupa el hueco que las dos dejaron a
propósito. La consecuencia práctica de que los ADR sean inmutables es que las referencias
solo pueden ir hacia atrás: `ADR-012` y `ADR-013` no apuntan a este, y quien llegue a
ellos primero lo encuentra por el índice de `docs/README.md`.

### El criterio que decide, y por qué aquí pesa más que en cualquier otro proyecto

**Quien controla el JavaScript servido controla el cifrado en el cliente.** Puede
servir una versión que se quede la contraseña maestra antes de derivar nada, y el
usuario no tiene forma de notarlo. Es el único vector que el README reconoce como no
cubierto, y `ADR-001` no protege de él: el modelo zero-knowledge protege la base de
datos y el tráfico, no la integridad del código que hace el cifrado.

En un proyecto que sirviera contenido, meter un CDN o un túnel en el camino sería una
decisión de rendimiento. Aquí es una decisión sobre quién puede leer las contraseñas.

De ahí el orden de los criterios de esta decisión, y es deliberado que la disponibilidad
vaya la última:

1. **Quién puede servir el JavaScript.** No admite mitigación
2. **Qué superficie se expone a internet**
3. **Qué cuesta usar la vault desde un dispositivo nuevo**, que es lo que decide si se
   usa de verdad
4. **De quién se depende para que funcione**

---

## 2) Opciones evaluadas

### 2.1) La vía de acceso

El análisis de partida es la tabla de `ADR-013` §1 y no se rehace. Lo que sigue es la
decisión, con el matiz que la tabla no tenía.

#### Opción A (elegida): Tailscale

Una VPN de malla sobre WireGuard. Los dispositivos se unen a una red privada («tailnet»)
y se alcanzan por un nombre propio, sin abrir puertos y sin exponer nada a internet.

Tradeoffs:

- **No termina el TLS.** El certificado lo sirve la propia máquina, así que el
  JavaScript no pasa por manos de nadie. Es el criterio 1 y es el que decide
- **No abre ningún puerto del router**, que es la propiedad que `ADR-012` §2.3 valoró
  por encima de todo cuando eligió `tls internal`, y que aquí no se pierde
- **Resuelve el certificado**, y con él la mayor fricción de uso que tiene hoy el
  proyecto: instalar la CA interna de Caddy en cada dispositivo. Ver §2.2
- Coste: **se depende de un tercero para la coordinación de la malla.** No para el
  tráfico, que va cifrado extremo a extremo entre dispositivos, ni para el TLS
- Coste: hay que instalar un cliente en cada dispositivo desde el que se use la vault.
  Se cambia una fricción por otra, pero la nueva se paga una vez por dispositivo y no
  tiene el paso de dos fases de iOS que `ADR-012` §2.3 documentó como el que nadie
  completa

**El matiz que la tabla de `ADR-013` no tenía, y que este ADR registra.** Aquella tabla
dice de Tailscale «solo transporta paquetes que no puede abrir». Eso es cierto del
plano de datos y **descansa en la integridad del plano de control**: el servidor de
coordinación distribuye las claves públicas de los nodos, así que uno comprometido
podría anunciar un nodo con claves de un atacante, y entonces el cifrado extremo a
extremo no ayuda porque el extremo sería el atacante. Tailscale lo documenta él mismo
al presentar *tailnet lock*: «no importaría que el tráfico esté cifrado, porque el par
sería malicioso».

**Eso no iguala Tailscale con Cloudflare Tunnel, y la diferencia es la que sostiene la
decisión:** en Cloudflare, ver el JavaScript servido es el funcionamiento normal y no
requiere comprometer nada; en Tailscale requiere comprometer el plano de control. Y esa
última posibilidad **tiene una mitigación criptográfica con nombre** —*tailnet lock*,
que exige que un nodo nuevo venga firmado por claves que el servidor de coordinación no
genera, no guarda y no ve—, mientras que la de Cloudflare no tiene ninguna.

#### Opción B (descartada): VPN propia con WireGuard

Tradeoffs:

- Tampoco termina el TLS ni ve el JavaScript, y **no depende de ningún tercero**, que
  es su única ventaja real sobre la Opción A
- **Abre un puerto UDP** en el router de casa hacia la máquina que guarda las
  contraseñas reales. Es menos superficie que exponer 443, pero no es cero
- Exige IP fija o DDNS, que es la misma dependencia que hizo descartar Let's Encrypt
  por HTTP-01 en `ADR-012` §2.3
- **No resuelve el certificado.** Se seguiría instalando la CA interna de Caddy a mano
  en cada dispositivo, así que deja intacta la fricción que más pesa en el uso diario
- Se descarta porque paga la independencia del tercero con superficie expuesta y con la
  fricción que esta decisión venía a quitar. Es la primera candidata si la Opción A deja
  de ser aceptable

#### Opción C (descartada): Cloudflare Tunnel

Tradeoffs:

- HTTPS con certificado válido y sin abrir puertos, igual que la Opción A
- **Cloudflare termina el TLS en su borde, y por tanto ve y puede modificar el
  JavaScript servido.** No es un fallo ni un abuso hipotético: es cómo funciona
- Se descarta por el criterio 1, que no admite mitigación. Es el reproche que
  `ADR-012` §2.3 aplicaba a tres opciones y que **solo era cierto de esta**

#### Opción D (descartada): una instancia en hosting compartido

Tradeoffs:

- `ADR-012` §2.4 la documenta como alternativa viable y es la clase de despliegue que
  tiene mucha gente
- **El proveedor termina el TLS, ve el JavaScript y además aloja la base de datos.**
  Falla el criterio 1 por partida doble
- Y falla algo anterior: **no es un modo de acceso a la instancia de casa, es otra
  instancia en otro sitio.** `ADR-013` §2.1 Opción D ya lo registró — abre si hay una
  o dos instancias personales, dónde vive entonces la base de datos con los secretos y
  qué pasa si son dos y divergen, y ninguna de esas preguntas la ha tratado ningún ADR
- **Queda descartada como vía de acceso**, que es lo que este ADR decide. No se descarta
  como emplazamiento futuro: eso sigue siendo de `ADR-013` §2.1, que la dejó «descartada
  por ahora»

**Y se cierra aquí un cabo suelto que lleva dos ADR abierto.** `ADR-012` §2.4 afirma
que «queda issue abierto para verificarlo sobre un hosting real», y ese issue **nunca
se creó** — lo comprobó `ADR-013` §2.1 sobre los 117 issues del repositorio y sigue
siendo cierto hoy sobre los 134. No se deja otra vez como pendiente: con el hosting
compartido descartado como vía de acceso, **esa verificación deja de tener demanda** y
solo volvería a hacer falta si se reabriera como emplazamiento. Dicho, en vez de
heredado.

### 2.2) El certificado, y la fricción que este ADR viene a quitar

Instalar la CA interna de Caddy en cada dispositivo es hoy el paso manual que separa
«tener la vault» de «poder usarla desde el móvil», y `ADR-012` §2.3 lo registró como el
precio de su Opción A: «en iOS son dos pasos separados y el segundo no es evidente».

Tailscale emite certificados **de Let's Encrypt** para los nombres de la tailnet, lo que
hace que cualquier dispositivo confíe sin instalar nada.

#### Opción A (elegida): que Caddy los obtenga por su integración nativa

Caddy pide el certificado al demonio local de Tailscale al hacer el *handshake*, para
los dominios `.ts.net`, sin configuración adicional y **renovándolo él solo**.

Tradeoffs:

- **La renovación deja de ser un problema abierto**, y eso es lo que decide entre esta
  opción y la siguiente
- Requiere que Caddy pueda hablar con el demonio local, lo que en la práctica significa
  ejecutarlo como root o dar permiso explícito en `tailscaled`
- Añade a Caddy una dependencia de un servicio local que puede no estar arrancado

#### Opción B (descartada): `tailscale cert` y renovación por cron

Tradeoffs:

- No exige permisos especiales a Caddy
- **Y es exactamente el modo de fallo que este proyecto ya ha pagado dos veces.** Los
  certificados caducan a los 90 días; cuando se entregan como ficheros en disco, el
  demonio no sabe dónde dejar el renovado, así que la renovación queda en manos de un
  cron. Un cron que falle en una máquina que `ADR-013` §2.2 apaga a propósito no produce
  ningún efecto visible hasta el día que la vault deja de abrirse — que es palabra por
  palabra el fallo del issue #265 con las copias de seguridad, y el del #264 con su
  registro
- Se descarta porque cambia un problema resuelto por uno vigilado

#### Opción C (descartada): seguir con `tls internal` también desde fuera

Tradeoffs:

- Cero cambios
- Mantiene la fricción íntegra, y la traslada además a cualquier dispositivo desde el
  que se quiera consultar la vault estando fuera — que son justo los que menos se
  configuran con calma

### 2.3) Qué pasa con la CA interna de Caddy

#### Opción A (elegida): conviven — Tailscale para todo, y `evault.local` como respaldo

La instancia sigue sirviendo `evault.local` y `evault-api.local` con `tls internal`
desde la red local, además del nombre de la tailnet.

Tradeoffs:

- **La vault sigue abriéndose si Tailscale no está disponible**, ya sea porque el
  servicio de coordinación de un tercero está caído o porque el cliente no arranca en el
  dispositivo. `ADR-013` §2.2 asume la intermitencia de la máquina; añadir una
  dependencia dura de un tercero **para el acceso desde la propia casa** sería un
  retroceso frente a lo que hoy funciona
- **La CA interna deja de ser obligatoria**, que era el objetivo: un dispositivo nuevo
  no la necesita para nada. Se conserva instalada donde ya lo está, y quien quiera el
  camino de respaldo la instala a propósito
- Coste: dos nombres y dos certificados que mantener, y una configuración de Caddy con
  dos bloques en vez de uno

#### Opción B (descartada): retirar `tls internal` y quedarse solo con la tailnet

Tradeoffs:

- Una sola configuración, un solo nombre, nada duplicado
- Deja el acceso **a la vault de casa desde dentro de casa** dependiendo de que un
  tercero funcione. Es un precio que no hay ninguna necesidad de pagar, porque lo que
  se conserva ya está construido y verificado

### 2.4) El nombre de la máquina, y un registro público que nadie mira

**Todo certificado de la web se publica en el registro append-only de Certificate
Transparency, que es público y consultable por cualquiera.** Tailscale lo advierte de
forma explícita y poco habitual en su documentación: los nombres de máquina acaban en
ese registro, y **no hay que activar HTTPS si algún nombre de máquina contiene
información sensible**.

Para un gestor de contraseñas eso no es un detalle de privacidad genérico. Un nombre
como `evault` o `vault` publicado en un registro público anuncia a quien lo busque que
en esa tailnet hay un gestor de contraseñas y cuál es su nombre exacto de red. No rompe
`ADR-001` —no revela ni un byte de ciphertext, y el atacante seguiría sin poder alcanzar
la máquina sin estar en la tailnet— pero regala reconocimiento gratis, y este proyecto
ya decidió en `SPRINT_CONTEXT` no publicar los datos de la red doméstica aunque el
repositorio sea público.

**Decisión: el nombre de la máquina en la tailnet no nombra el proyecto.** Se reutiliza
el nombre del servidor, que no dice qué hay dentro. Y el criterio queda escrito en §4
para que no se rompa al añadir la siguiente máquina.

---

## 3) Decisión final

1. **La vault se alcanza desde fuera de la red local por Tailscale**, por el nombre de
   la máquina dentro de la tailnet. No se abre ningún puerto del router y no se expone
   nada a internet.
2. **El criterio que lo decide es quién puede servir el JavaScript**, no la comodidad ni
   el rendimiento. Cloudflare Tunnel y el hosting compartido quedan descartados por ahí,
   y la VPN propia por superficie expuesta y por no resolver el certificado.
3. **El certificado lo obtiene Caddy de la instancia local de Tailscale**, con renovación
   automática. No hay cron de renovación.
4. **`evault.local` con `tls internal` se conserva** como camino de respaldo desde la red
   local, que no depende de ningún tercero. La CA interna deja de ser obligatoria en
   dispositivos nuevos, pero no se retira de donde está.
5. **El hosting compartido queda descartado como vía de acceso**, y con él deja de tener
   demanda la verificación que `ADR-012` §2.4 dejó prometida y que nunca tuvo issue.
6. **El nombre de la máquina en la tailnet no nombra el proyecto**, porque acaba en un
   registro público.

---

## 4) Lineamientos técnicos resultantes

- **El nombre de la máquina y cualquier subdominio de la tailnet no contienen `evault`,
  `vault`, `password`, `secret` ni el nombre del usuario.** Se publican en Certificate
  Transparency. Aplica a toda máquina que se añada después, no solo a la primera.
- **La obtención del certificado es la integración nativa de Caddy con el demonio local**,
  no `tailscale cert` a fichero. Si en algún momento hubiera que pasar a ficheros, la
  renovación deja de ser automática y necesita su propia vigilancia — y entonces hace
  falta un aviso que se dispare **antes** de la caducidad, con la forma del que #265 puso
  para las copias.
- **Caddy necesita permiso para hablar con `tailscaled`.** Es un requisito de arranque,
  no un ajuste: sin él no hay certificado y sin certificado no hay `crypto.subtle`.
- **El origen de CORS de la API y el `VITE_API_URL` del build tienen que contemplar el
  nombre nuevo.** Es donde esto se rompe: la Iteración 5 ya pagó que el origen de CORS
  funcionara solo con el valor por defecto y rompiera el camino documentado de cambiarlo.
- **Tailscale tiene que sobrevivir al reinicio de la máquina**, que `ADR-013` §2.2 apaga
  a propósito.
- **`tailnet lock` se evalúa como endurecimiento**, no como parte de este despliegue. Es
  lo que convierte «el plano de control es de fiar» en una garantía criptográfica, y es la
  mitigación del único punto donde Tailscale depende de confianza. Queda en §6.
- **La verificación del acceso remoto se hace desde fuera de la red y con el wifi apagado**,
  apuntando el operador móvil. Una hecha desde el wifi de casa no verifica nada, porque
  todo funcionaría igual sin haber resuelto el problema. Y se comprueba el negativo: con
  Tailscale desconectado, la vault **no** responde.

---

## 5) Consecuencias asumidas

- **Se depende de un tercero para la coordinación de la malla.** No para el tráfico ni
  para el TLS, pero si Tailscale está caído no hay acceso desde fuera. Desde dentro sí,
  por la decisión 4.
- **El plano de control es el único punto de confianza que queda**, y está registrado en
  §2.1 en vez de tapado. Su mitigación existe y tiene nombre.
- **Los nombres de máquina de la tailnet son públicos** por Certificate Transparency, y
  eso condiciona cómo se nombran las máquinas para siempre, no solo hoy.
- **Cada dispositivo nuevo necesita un cliente instalado**, aunque ya no necesite la CA
  interna. La fricción no desaparece: cambia de forma y se paga una vez.
- **Hay dos caminos a la misma vault**, con dos nombres y dos certificados. Es más
  configuración que mantener, y es el precio de que el acceso local no dependa de nadie.
- **Un cambio en la política de precios o de servicio del tercero es ahora un riesgo del
  proyecto**, cosa que antes no era cierta.

---

## 6) Triggers de reevaluación

Se reevalúa **la vía de acceso** si Tailscale deja de ser gratuito para este tamaño de
uso, cambia su modelo de confianza, o si aparece una forma de que el plano de control
comprometa la malla que `tailnet lock` no cubra. La primera candidata sería la Opción B,
la VPN propia, y no la C.

Se activa **`tailnet lock`** si se añade a la tailnet cualquier dispositivo que no sea
del autor, o si el número de nodos crece hasta que revisar la lista deje de ser algo que
se hace de un vistazo.

Se reevalúa **conservar `tls internal`** si mantener dos caminos produce una divergencia
real —configuraciones que se desincronizan, o un camino que deja de probarse—. El criterio
es el de siempre: el camino que nadie recorre es el que está roto.

Se reevalúa **el emplazamiento**, y no esta decisión, si lo que falla es la
disponibilidad de la máquina. Eso es `ADR-013` §2.1 y §6, y su respuesta sería su Opción
C o D, no cambiar de túnel.

---

## 7) Impacto en APIs y contratos

Ninguno en el contrato de la API ni en el formato del blob. Los cambios son de
despliegue y de configuración:

- El origen permitido de CORS gana el nombre de la tailnet
- `VITE_API_URL` del build de producción pasa a apuntar al nombre de la tailnet
- La configuración de Caddy gana un bloque para `.ts.net` y conserva el de `.local`

**No hay cambios en `ADR-001`.** Lo que este ADR mueve es quién puede alcanzar la
máquina y quién sirve el certificado; el servidor sigue sin poder leer nada, y el
material que abre la vault sigue sin salir del dispositivo.
