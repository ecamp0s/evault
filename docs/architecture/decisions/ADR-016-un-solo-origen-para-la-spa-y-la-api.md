# eVault — Un solo origen para la SPA y la API

Fecha de decisión: 2026-08-19
Fecha de registro: 2026-08-19
Estado: Aprobada
Depende de: ADR-015 (acceso desde fuera de la red local), ADR-012 (estrategia de despliegue), ADR-005 (arquitectura self-hosteable), ADR-003 (monorepo)

## 1) Contexto

`ADR-015` decidió que la vault se alcanza desde fuera de la red local por Tailscale,
y que el camino local por `evault.local` se conserva para que el acceso desde casa no
dependa de ningún tercero. Esa es su decisión 4.

**No se podía implementar**, y se descubrió en la primera hora de #286.

### Los tres hechos que no encajan

1. **Tailscale da exactamente un nombre DNS por máquina**, con la forma
   `<máquina>.<tailnet>.ts.net`. No admite subdominios ni certificados alternativos
2. **El despliegue usa dos hostnames**: `evault.local` para la SPA y `evault-api.local`
   para la API, en `docker/web/Caddyfile.deploy`
3. **La URL de la API se hornea en el bundle en tiempo de build.** Vite sustituye
   `import.meta.env.VITE_API_URL` al construir, así que queda escrita literalmente
   dentro del JavaScript generado

De 1 y 2 sale que **no hay dónde poner el segundo host** en la tailnet. Y de 3, que
aunque lo hubiera, un artefacto apunta a una sola API: servir el mismo `dist/` por
`evault.local` y por el nombre de la tailnet es imposible, porque uno de los dos
pediría la API a un nombre que desde ahí no resuelve. La vault cargaría y no
funcionaría, que es peor que no cargar.

### Lo que esto dice de ADR-015, y se registra en vez de taparse

`ADR-015` decidió bien el qué —la vía, el criterio, el certificado— y **asumió sin
verificar que el cómo encajaba**. Su §2.3 razonó la conveniencia de conservar los dos
caminos sin bajar a si el frontal podía servirlos, y su §4 llegó a escribir el
lineamiento «el origen de CORS y el `VITE_API_URL` del build tienen que contemplar el
nombre nuevo», que da por hecha una arquitectura de dos hosts que no cabe en una
tailnet.

Es la misma familia de fallo que este repositorio lleva seis iteraciones documentando,
con una vuelta nueva: **no es una afirmación heredada de un documento viejo, sino una
escrita el mismo día y verificada al día siguiente por la implementación.** Poner la
decisión delante del código no evita el error; lo que hace es que aparezca en un
documento y no en una máquina con 370 contraseñas dentro. Eso es lo que compró aquí el
orden, y conviene decirlo así en vez de presentarlo como un fallo del método.

---

## 2) Opciones evaluadas

### 2.1) La forma del frontal

#### Opción A (elegida): un solo origen, con la API bajo `/api`

Caddy sirve la SPA y la API en el mismo hostname, y encamina a PHP-FPM lo que empieza
por `/api`.

Tradeoffs:

- **La URL de la API pasa a ser relativa**, así que un artefacto sirve para cualquier
  hostname. Es la propiedad entera de esta opción: es lo que hace implementable la
  decisión 4 de `ADR-015`, y sin ella #286 sigue bloqueado
- **CORS desaparece**, porque deja de haber cruce de orígenes. No es un efecto
  colateral menor: elimina una superficie de configuración que este proyecto ya pagó
  una vez, cuando el origen funcionaba solo con el puerto por defecto y rompía el
  camino documentado de cambiarlo
- **La CSP se simplifica** a `connect-src 'self'` y deja de construirse a partir de un
  valor de entorno
- Coste: **la API deja de tener nombre propio.** Alcanzarla desde fuera de la SPA
  —curl, un cliente futuro, depurar— pasa por conocer la ruta, no por un hostname
- Coste: el frontal gana una regla de encaminamiento, y con ella un modo de fallo
  nuevo que hay que cubrir a propósito. Ver §4

#### Opción B (descartada): un solo host en la tailnet, retirando `evault.local`

Tradeoffs:

- Es el cambio más pequeño: no toca el build, ni la CSP, ni CORS
- **Hace que el acceso a la vault de casa desde dentro de casa dependa de que un
  tercero funcione**, que es exactamente lo que `ADR-015` §2.3 decidió no pagar, con el
  argumento de que `ADR-013` §2.2 ya asume la intermitencia de la máquina y no hacía
  falta añadirle la de nadie más
- Se descarta porque resuelve el síntoma revirtiendo una decisión tomada con criterio,
  y no por haber encontrado que aquel criterio fuera malo

#### Opción C (descartada): dos artefactos, uno por camino

Construir un `dist/` para `evault.local` y otro para el nombre de la tailnet, servidos
por dos contenedores.

Tradeoffs:

- No toca la arquitectura ni ningún ADR
- **Duplica el artefacto y deja permanente la pregunta de cuál sirve cada host.** Dos
  configuraciones que hacen lo mismo divergen siempre, y la que se queda atrás no
  falla: sirve una versión vieja, que es el modo de fallo que menos se nota
- Y no arregla nada de fondo: el horneado de la URL sigue ahí, esperando al tercer
  camino

### 2.2) CORS, que se queda sin trabajo

Con un solo origen, la comprobación de CORS deja de ejercitarse en producción. La
pregunta no es si se puede retirar, sino qué se pierde.

**Lo que se pierde es menos de lo que parece.** CORS es una defensa del navegador
contra que *otro* origen use la sesión del usuario; no protege la API de un cliente
que no sea un navegador. Con la SPA en el mismo origen, ningún origen tercero tiene
nada que hacer contra la API, y la protección que queda —que es la que siempre estuvo
haciendo el trabajo real— es la autenticación por token de `ADR-007`.

**Lo que sí desaparece es una comprobación deliberada.** El `Caddyfile` de desarrollo
dice, con todas las letras, que hay dos hosts «que es lo que hace que CORS sea una
comprobación real y no decorativa». Esa intención era correcta mientras producción
usara dos orígenes. **Deja de serlo cuando producción usa uno**: ejercitar en
desarrollo un mecanismo que en producción no interviene no es rigor, es probar otra
aplicación.

**Y lo que no se decide aquí:** `SPRINT_CONTEXT` mantiene como clientes previstos una
app nativa iOS/Android y una extensión de navegador. Una app nativa no envía `Origin`
y CORS no le aplica. Una extensión sí puede necesitarlo, según desde dónde haga las
peticiones. **No se afirma que retirar CORS deje eso resuelto**, porque no se ha
comprobado y no toca comprobarlo hoy: queda como disparador en §6.

### 2.3) El desarrollo local

#### Opción A (elegida): unificar también en desarrollo

Tradeoffs:

- **Es lo único que impide que desarrollo y producción diverjan.** Un entorno de
  desarrollo con dos orígenes y una producción con uno significa que la configuración
  del frontal solo se prueba de verdad al desplegar, que es donde más caro sale
- Cuesta retirar `api.evault.localhost`, que lleva desde la Iteración 3 en `SETUP.md`,
  en `CLAUDE.md` y en la memoria de quien trabaja aquí
- Y cuesta la comprobación de CORS de §2.2, a propósito

#### Opción B (descartada): unificar solo en despliegue

Tradeoffs:

- No toca el entorno local ni la documentación de arranque
- Deja el frontal de producción como el único sitio donde una regla de encaminamiento
  se ejercita, y **este proyecto tiene la lección escrita cinco veces: el camino que
  nadie recorre es el que está roto**

### 2.4) Qué pasa con el nombre propio de la API

**Se retira.** `evault-api.local` y `api.evault.localhost` dejan de existir, en vez de
conservarse «por si acaso»: un segundo camino a la API que la SPA no usa es un camino
que nadie recorre, y con él vuelve el CORS que §2.2 acaba de retirar, ahora para servir
a un solo cliente hipotético.

Quien necesite hablar con la API sin la SPA lo hace por `https://<host>/api`, que es lo
que la SPA misma hace.

---

## 3) Decisión final

1. **La SPA y la API comparten origen.** Caddy sirve la SPA en la raíz y encamina a
   PHP-FPM lo que empieza por `/api`.
2. **La URL de la API pasa a ser relativa**, de modo que un artefacto construido una vez
   sirve para cualquier hostname. Es lo que hace implementable la decisión 4 de
   `ADR-015`.
3. **CORS se retira**, porque deja de haber cruce de orígenes. La protección de la API
   sigue siendo la autenticación de `ADR-007`, que es la que hacía el trabajo real.
4. **La CSP pasa a `connect-src 'self'`** y deja de construirse desde un valor de entorno.
5. **La unificación llega también a desarrollo.** `evault-api.local` y
   `api.evault.localhost` se retiran.
6. **De `ADR-012` §4 caen dos lineamientos**, y se dice cuáles en §7.

---

## 4) Lineamientos técnicos resultantes

- **El bloque de `/api` tiene que ganarle al `try_files` de la SPA.** Si no, una
  petición a la API devuelve el `index.html` con un **200**, el cliente lo parsea como
  JSON y falla lejos de la causa. Es el modo de fallo silencioso de este cambio y **la
  comprobación de que no ocurre es obligatoria**: una ruta de API inexistente tiene que
  devolver un error de la API, no la SPA.
- **El prefijo `/api` no se duplica ni se come.** Las rutas de Laravel ya empiezan por
  `/api`, así que el encaminamiento tiene que preservarlo. Es donde esto se rompe en una
  ruta y no en todas, que es la forma más cara de romperse.
- **Un mismo artefacto tiene que responder bien servido desde dos hostnames distintos.**
  Es la propiedad que desbloquea #286 y la única que no puede darse por supuesta: se
  verifica construyendo una vez y sirviendo desde los dos.
- **El mensaje de arranque de `web/src/lib/env.ts` se revisa.** Nació en #107 para que
  un `dist/` sin `VITE_API_URL` no diera una página en blanco; si la URL deja de ser
  configurable, un mensaje que pida copiar `.env` manda a quien lo lea a un sitio
  equivocado.
- **`SETUP.md`, `DEPLOYMENT.md` y `CLAUDE.md` pierden `api.evault.localhost`.** Es un
  nombre que lleva desde la Iteración 3 en la documentación y en la memoria de quien
  trabaja aquí; dejarlo escrito en un sitio es garantizar que alguien lo teclee.
- **No se retira la comprobación de que la API rechaza lo que debe.** Lo que desaparece
  es el cruce de orígenes, no la autenticación ni el aislamiento cross-tenant, que
  siguen teniendo sus tests.

---

## 5) Consecuencias asumidas

- **La API deja de ser alcanzable por un nombre propio.** Depurar con `curl` y cualquier
  cliente que no sea la SPA pasan por conocer la ruta.
- **Se pierde el ejercicio real de CORS**, que era deliberado desde la Iteración 1. Se
  acepta porque ejercitar un mecanismo que producción no usa no prueba la aplicación que
  se despliega.
- **El frontal concentra más responsabilidad.** Antes cada host tenía un bloque
  independiente; ahora hay un orden de reglas del que depende que la API responda.
- **El día que llegue un cliente de otro origen habrá que volver aquí.** No se afirma
  que esté resuelto, y está en §6.
- **Dos lineamientos de `ADR-012` §4 dejan de ser ciertos**, y uno de ellos estaba
  verificado sobre un `dist/` real. Un lineamiento comprobado también caduca cuando
  cambia la premisa que lo hacía cierto.

---

## 6) Triggers de reevaluación

Se reevalúa **la retirada de CORS** el día que exista un cliente que hable con la API
desde otro origen —la extensión de navegador es el caso concreto—. Entonces la pregunta
no es «volver a activarlo» sino qué origen se permite y con qué criterio, y eso es una
decisión con su propio tamaño.

Se reevalúa **la Opción D de `ADR-012` §2.1** —publicar imágenes en un registro— si
alguna vez interesa distribuir eVault para que otros lo desplieguen. Su descarte no fue
de criterio sino técnico: «el build de la SPA hornea la URL de la API, así que una imagen
del frontend solo sirve al dominio con el que se construyó». **Ese motivo desaparece con
esta decisión**, y el propio `ADR-012` §6 lo dejó como disparador. No se reabre ahora
porque `ADR-009` decidió que el proyecto no se comercializa y publicar imágenes es
trabajo de distribución sin nadie que lo consuma — pero **queda dicho que el bloqueo
técnico cayó**, para que quien lo retome no herede un motivo que ya no aplica.

Se reevalúa **conservar un nombre propio para la API** si aparece un consumidor legítimo
que no sea la SPA y al que la ruta compartida le estorbe de verdad, no por comodidad de
depuración.

---

## 7) Impacto en APIs y contratos

El contrato de la API no cambia: las mismas rutas, los mismos verbos, la misma forma de
las respuestas. Lo que cambia es **dónde vive**, que pasa de un hostname propio a una
ruta del hostname de la SPA.

Tampoco cambia nada de `ADR-001`: el servidor sigue sin poder leer nada, y el material
que abre la vault sigue sin salir del dispositivo.

### El estado de ADR-012

**`ADR-012` no queda superseded, y esto se mira en vez de heredarse de `ADR-015`.** Sus
decisiones siguen en pie: Docker Compose como forma del despliegue (§2.1 Opción A),
MySQL (§2.2), `tls internal` con acceso por LAN (§2.3 Opción A) y el hosting compartido
documentado como alternativa no verificada (§2.4).

**Lo que sí queda superseded son dos de sus lineamientos técnicos de §4**, y se nombran
para que nadie los aplique al leerlos:

1. **«`CORS_ALLOWED_ORIGINS` lleva el dominio real del despliegue».** Ya no hay CORS que
   configurar.
2. **«La SPA se construye por despliegue, y esto no es opcional» y su corolario «un
   `dist/` construido para un despliegue no sirve para otro».** Deja de ser cierto: con
   la URL relativa, un `dist/` sirve para cualquier despliegue. Es el lineamiento que
   este ADR existe para tumbar.

La diferencia con `ADR-015` es real y por eso se dice: allí `ADR-012` quedó intacto y
solo se ejecutó su disparador; aquí **caen dos lineamientos**, uno de ellos verificado
en su momento sobre un `dist/` real. No basta para superseder el ADR entero —su decisión
no cambia—, pero sí para que quede escrito qué partes ya no rigen.

Y hay una consecuencia de método que este proyecto no había necesitado hasta ahora: los
ADR son inmutables, así que **estos dos lineamientos siguen escritos y con autoridad en
`ADR-012`**, y lo único que los corrige es este apartado. Quien llegue a `ADR-012`
directamente no tiene forma de saberlo desde ahí.
