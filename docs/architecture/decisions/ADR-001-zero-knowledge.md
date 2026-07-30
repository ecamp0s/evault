# eVault — Modelo zero-knowledge

Fecha de decisión: planificación inicial del proyecto (marzo 2026)
Fecha de registro: 2026-07-30
Estado: Aprobada
Iteración: fundacional; implementación criptográfica planificada para la Iteración 3

## 1) Contexto

eVault almacena contraseñas y secretos personales. Es la categoría de dato con la
peor relación entre valor para un atacante y tolerancia al fallo: una única fuga
de la base de datos compromete de forma irreversible todas las cuentas de todos
los usuarios, en todos los servicios donde las hayan reutilizado.

La decisión de fondo es quién puede leer los secretos. Hay dos modelos posibles y
son incompatibles entre sí, porque condicionan el esquema de datos, la elección de
framework de frontend, el diseño de la API y el modelo de soporte al cliente. No
es una decisión que se pueda diferir ni revertir sin reescribir el producto.

Contexto adicional: el producto se ofrecerá como SaaS. Eso significa que el
operador del servicio —el propio desarrollador— es también un punto de riesgo, ya
sea por compromiso de sus credenciales, por coerción legal o por error operativo.

## 2) Opciones evaluadas

### Opción A (elegida): zero-knowledge, cifrado en cliente

El cliente deriva de la contraseña maestra, mediante PBKDF2, dos valores
distintos: una clave de cifrado que **nunca** abandona el dispositivo, y un hash
de autenticación que sí se envía al servidor para verificar identidad. Los vault
items se cifran con AES-256-GCM en el cliente antes de cada petición. El servidor
recibe y almacena blobs opacos.

Tradeoffs:

- Seguridad: máxima. Una fuga completa de la base de datos no expone ningún
  secreto en claro. El operador del servicio no puede leer los datos ni bajo
  coerción, porque no posee las claves.
- Complejidad: alta. Toda la criptografía vive en el cliente, que es el entorno
  más hostil para ejecutarla, y hay que resolver derivación de claves, rotación,
  cambio de contraseña maestra y compartición entre usuarios sin servidor de por
  medio.
- Recuperación: no existe recuperación de contraseña maestra. Si el usuario la
  pierde, sus datos son irrecuperables por diseño. Es una consecuencia funcional
  aceptada, no un defecto.
- Búsqueda y features de servidor: el servidor no puede buscar, indexar, ordenar
  ni validar el contenido. Todo eso se resuelve en el cliente.
- Soporte: el equipo de soporte no puede inspeccionar datos de usuario para
  diagnosticar. Los problemas se diagnostican con metadatos, no con contenido.

### Opción B (descartada): cifrado en servidor con claves gestionadas

El servidor cifra en reposo con una clave propia, gestionada por el operador o por
un KMS. El modelo habitual de una aplicación de negocio corriente.

Tradeoffs:

- Seguridad: insuficiente para esta categoría de producto. La clave y los datos
  cifrados están al alcance del mismo operador, así que un compromiso del servidor
  con privilegios suficientes expone todo. Protege frente al robo del disco, no
  frente al compromiso de la aplicación.
- Complejidad: baja. Es el camino corto.
- Recuperación: posible, incluido el reset de contraseña convencional.
- Features: el servidor puede buscar, indexar y validar sin restricciones.
- Posición competitiva: incompatible con lo que se espera de un gestor de
  contraseñas. Los productos de referencia de la categoría son zero-knowledge, y
  no serlo es un argumento en contra que no se puede compensar con funcionalidad.

## 3) Decisión final

Se adopta la **Opción A**.

Motivo: en un gestor de secretos, la garantía de que el operador no puede leer los
datos no es una característica más, es el producto. Aceptar el coste de
complejidad y la pérdida de funcionalidad del lado del servidor es el precio de
entrada a la categoría. El modelo de la Opción B obligaría a reescribir el
producto entero en el momento en que se quisiera corregir.

## 4) Lineamientos técnicos resultantes

- La contraseña maestra no se envía nunca al servidor, ni en claro ni hasheada por
  el servidor. El único derivado que viaja es el hash de autenticación.
- De la contraseña maestra se derivan con PBKDF2 dos valores independientes: clave
  de cifrado, que permanece en el dispositivo, y hash de autenticación, que se
  envía. Uno no debe poder derivarse del otro.
- Los vault items se cifran con AES-256-GCM en el cliente antes de salir del
  dispositivo. El servidor los trata como opacos.
- El servidor no expone ningún endpoint que reciba un secreto descifrado, y no
  implementa ninguna lógica que dependa del contenido de un item.
- Ninguna operación de servidor puede requerir leer el contenido de un item. Si
  una funcionalidad lo necesita, la funcionalidad se rediseña o se descarta.
- No hay recuperación de contraseña maestra. La UI debe comunicarlo de forma
  inequívoca antes de que el usuario cree su vault.

## 5) Consecuencias asumidas

1. Sin recuperación de cuenta. Se mitigará con un mecanismo explícito de clave o
   código de recuperación generado en el cliente, no con un reset por email.
2. Búsqueda y filtrado solo en cliente, sobre datos ya descifrados en memoria.
   Eso acota el número de items que se pueden manejar sin paginación cifrada.
3. El panel de administración no puede mostrar contenido de vaults. Ver ADR-002.
4. La compartición en vaults de equipo exige criptografía asimétrica adicional, no
   solo la clave derivada de la contraseña maestra. Queda fuera de la Iteración 1.
5. El coste de un bug criptográfico en el cliente es una pérdida de datos
   irreversible, no un error recuperable. Exige tests dedicados.

## 6) Plan por fases

1. **Iteración 1 (actual)**: autenticación deliberadamente convencional. La
   contraseña viaja al servidor y Laravel la hashea. **Esto no es
   zero-knowledge.** Se hace a propósito para validar el stack completo —API,
   SPA, tokens, CORS, tests, CI— antes de introducir criptografía. El contrato de
   la API, es decir rutas, forma de request y response y gestión de tokens, debe
   mantenerse estable para que la sustitución posterior sea mínima.
2. **Iteración 2**: modelo de datos de vaults e items con el campo de blob cifrado
   ya en su forma definitiva, aunque todavía se escriba sin cifrar de verdad.
3. **Iteración 3**: sustitución de la autenticación por el modelo derivado con
   PBKDF2, y cifrado real con AES-256-GCM en el cliente. Aquí se cumple el ADR.
4. **Posterior**: clave de recuperación, rotación de contraseña maestra y
   criptografía asimétrica para vaults compartidas.

## 7) Impacto en APIs y contratos

El contrato de la API queda condicionado de forma permanente: ningún endpoint
recibe ni devuelve secretos en claro, y el campo de contenido de un vault item es
siempre un blob cifrado con su nonce y sus metadatos de derivación.

La transición de la Iteración 1 a la 3 cambia el significado del campo de
contraseña en registro y login —de contraseña real a hash de autenticación— pero
no su forma. Esa es la razón de exigir estabilidad del contrato desde ahora.
