# eVault — El token de sesión vive solo en memoria

Fecha de decisión: 2026-08-02 (durante el issue #43)
Fecha de registro: 2026-08-02
Estado: Aprobada, con entrada en vigor diferida a la Iteración 3
Depende de: ADR-001 (zero-knowledge), ADR-004 (API stateless)

## 1) Contexto

El token de sesión vive hoy en `localStorage`, en el store `evault.sesion` de
`web/src/lib/session.ts`. Es legible por cualquier JavaScript que llegue a
ejecutarse en el origen, así que un XSS se lo lleva.

Se aceptó a sabiendas al cerrar el issue #5, con un razonamiento explícito: el
token da acceso a una API que **todavía no guarda ningún secreto**. Mientras solo
hubiera usuarios y tokens, robarlo permitía suplantar una cuenta vacía.

**Ese razonamiento ya no vale.** La Iteración 2 introdujo los vault items, y la
Iteración 3 los cifrará de verdad. El token deja de ser la llave de una API vacía
y pasa a ser la llave de entrada a los secretos del usuario. En un gestor de
contraseñas eso cambia la conversación entera.

### El dato que reordena la comparación

Al evaluarlo apareció algo que no estaba en el planteamiento inicial del issue, y
que resulta ser lo más importante.

Por `ADR-001`, en la Iteración 3 el cliente deriva de la contraseña maestra una
clave de cifrado que nunca abandona el dispositivo. **Esa clave no se puede
persistir**: guardarla en `localStorage` la dejaría al alcance del mismo XSS del
que trata este documento, y con ella se descifra todo. Guardarla en IndexedDB como
`CryptoKey` no extraíble es más sutil —el material no se puede leer desde
JavaScript, solo usar— pero no resuelve el problema: un XSS seguiría descifrando
la vault mientras la pestaña esté abierta, y cualquiera con el dispositivo entraría
sin saber la contraseña maestra.

La consecuencia es que, a partir de la Iteración 3, **tras recargar la página el
usuario tendrá que reintroducir su contraseña maestra de todos modos** para poder
descifrar nada. Es lo que hacen los gestores de contraseñas del sector y lo que el
usuario espera de uno.

Y de ahí se sigue lo que decide este ADR: si la clave muere al recargar, persistir
el token solo mantiene viva una sesión incapaz de enseñar contenido. Se paga el
riesgo de un token robado a cambio de una comodidad que el modelo zero-knowledge
no deja disfrutar.

## 2) Opciones evaluadas

### Opción A (descartada): dejarlo en `localStorage`

Cero trabajo. Defendible únicamente acompañada de una CSP estricta y de disciplina
al añadir dependencias de frontend.

Tradeoffs:

- Coste inmediato: ninguno.
- Coste real: hoy **no hay CSP en ninguna parte** del proyecto, así que adoptar
  esta opción no sería «no hacer nada», sería adquirir el compromiso de escribir y
  mantener una.
- Riesgo: apuesta la llave de los secretos a que nunca haya un XSS, en el único
  tipo de producto donde esa apuesta no se puede perder ni una vez. Una fuga de
  sesión aquí no es una cuenta comprometida: es la vault entera.
- Lo que sí conserva: la sesión sobrevive a la recarga. Ventaja que, como se
  explica arriba, deja de existir en cuanto la vault haya que desbloquearla.

### Opción B (descartada): token en memoria más refresh token en cookie `httpOnly`

El estándar del sector para aplicaciones que no son gestores de contraseñas.

Tradeoffs:

- Seguridad: buena. Un XSS no se lleva la sesión persistente.
- Coste: alto y en el sitio equivocado. Exige un endpoint de refresh en la API, y
  las cookies obligan a decidir `SameSite` y a gestionar CSRF, que es exactamente
  la fricción que `ADR-004` evitó al descartar la variante cookie-based de
  Sanctum por stateful. Reintroducirla por la puerta de atrás contradice una
  decisión tomada con motivo.
- Lo que compra en este producto: poco. La sesión sobreviviría a la recarga, pero
  la vault seguiría bloqueada hasta escribir la contraseña maestra. Se paga
  complejidad de servidor por una continuidad que el usuario no llega a notar.

### Opción C (elegida): token solo en memoria, sin persistencia

El token vive en el store de sesión y muere al recargar o cerrar la pestaña,
igual que la clave de cifrado.

Tradeoffs:

- Seguridad: la mejor de las tres. Un XSS puede actuar mientras la pestaña esté
  abierta, que es un límite que ninguna de las opciones evita, pero no se lleva
  una sesión persistente con la que volver más tarde.
- Coste en la API: **ninguno**. Sin endpoint de refresh, sin cookies, sin CSRF,
  sin rozar el modo stateful. El contrato de la API no cambia, que es justo lo que
  `ADR-001` pide mantener estable hasta la Iteración 3.
- Coste en la interfaz: recargar cierra la sesión. Aislado suena hostil; junto al
  desbloqueo de la vault deja de serlo, porque «recargar te echa» se convierte en
  «recargar bloquea la vault», que es el comportamiento esperado del producto.
- Coherencia: la vida del token y la de la clave de cifrado pasan a ser la misma.
  Dos secretos con la misma vida son más fáciles de razonar que dos con vidas
  distintas.

## 3) Decisión final

Se adopta la **Opción C**, con entrada en vigor en la **Iteración 3**, junto con
la pantalla de desbloqueo por contraseña maestra.

Motivo de la opción: es la única cuyo coste está donde el producto ya iba a
pagarlo. Las otras dos compran continuidad de sesión, y en un producto
zero-knowledge esa continuidad no se puede usar: sin la clave de cifrado, una
sesión viva no enseña nada.

Motivo del calendario: implementarla antes de que exista el desbloqueo dejaría una
aplicación que expulsa en cada recarga sin ofrecer nada a cambio. La fricción
llegaría meses antes que el beneficio y sin nada que la explique al usuario.

Hasta entonces se mantiene `localStorage`, amparado por la condición que ya rige
la Iteración 2 y que está registrada en el issue de deuda #59: **no se despliega
con datos reales hasta que la Iteración 3 cierre**. Mientras esa condición se
respete, un token robado sigue dando acceso a datos que no son de nadie.

## 4) Lineamientos técnicos resultantes

- El token de sesión **no se persiste**: ni `localStorage`, ni `sessionStorage`,
  ni cookies, ni IndexedDB.
- La clave de cifrado derivada de la contraseña maestra tampoco se persiste, en
  ninguna forma, incluida `CryptoKey` no extraíble.
- Recargar la página bloquea la vault. La interfaz lo presenta como un bloqueo y
  no como una expulsión: el usuario sigue siendo el mismo, lo que falta es la
  contraseña maestra.
- El contrato de la API no cambia. No hay endpoint de refresh ni cookies de
  sesión.
- La CSP sigue siendo deseable como defensa en profundidad, y no depende de esta
  decisión. Que el token deje de persistirse reduce el botín de un XSS, no la
  probabilidad de que ocurra.

## 5) Consecuencias asumidas

1. **Cada recarga exige la contraseña maestra.** Es la consecuencia visible y no
   se disimula: forma parte de lo que se espera de un gestor de contraseñas.
2. Abrir la aplicación en varias pestañas implica desbloquear en cada una, salvo
   que más adelante se comparta el estado desbloqueado entre pestañas del mismo
   origen, que es trabajo aparte y con sus propios riesgos.
3. Un XSS sigue siendo grave mientras la pestaña está abierta y desbloqueada.
   Ninguna de las tres opciones evita eso; esta reduce la ventana, no la elimina.
4. No hay «recordar sesión». Si algún día se quiere, exigirá un mecanismo
   explícito con su propio ADR, no relajar este.

## 6) Triggers de reevaluación

Reevaluar si se cumple uno o más:

1. Aparece un cliente que no puede desbloquear con comodidad, por ejemplo una
   extensión de navegador con una interacción muy distinta.
2. Se adopta un desbloqueo alternativo, como biometría o PIN local, que cambie el
   coste de recargar para el usuario.
3. Métricas de uso muestran que el bloqueo al recargar expulsa gente de verdad, y
   no es solo una molestia asumida.

## 7) Impacto en APIs y contratos

Ninguno. Es el argumento principal a favor de la opción elegida: se resuelve
enteramente en el cliente, sin tocar rutas, ni forma de request o response, ni la
gestión de tokens del servidor.
