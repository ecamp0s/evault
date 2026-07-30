# eVault — Monorepo con API y SPA como proyectos separados

Fecha de decisión: planificación inicial del proyecto (marzo 2026)
Fecha de registro: 2026-07-30
Estado: Aprobada
Depende de: ADR-002 (dos frontends: SPA React y panel Filament)

## 1) Contexto

El ADR-002 deja el proyecto con tres piezas de software: una API REST, una SPA
React y un panel Filament. A eso se suman dos clientes previstos pero aún no
empezados, una app móvil y una extensión de Firefox.

Hay que decidir cómo se reparten esas piezas entre repositorios y proyectos, con
dos condicionantes: el desarrollo lo lleva una sola persona, y la API es contrato
compartido por todos los clientes, así que un cambio en ella afecta a varios a la
vez.

## 2) Opciones evaluadas

### Opción A (elegida): un repositorio, API y panel admin en el mismo proyecto Laravel, SPA como proyecto separado dentro del repo

Estructura: `api/` es el proyecto Laravel que aloja tanto la API REST como el
panel Filament; `web/` es la SPA React; `mobile/` y `extension/` quedan creados y
vacíos, reservados.

Tradeoffs:

- Cambios que cruzan API y cliente: se hacen en un solo commit y un solo PR, con
  el contrato y su consumidor siempre en el mismo estado. Es el caso más frecuente
  del proyecto.
- Complejidad de tooling: media. Un `.gitignore` y un CI que tienen que distinguir
  qué parte se ha tocado; los workflows filtran por paths.
- Compartir modelos y autorización entre API y panel: inmediato, es el mismo
  proyecto Laravel. No hay duplicación de `User`, ni de migraciones, ni de lógica.
- Despliegue independiente de API y SPA: posible, cada una tiene su build.
- Riesgo de acoplamiento indebido entre API y panel: real, y se mitiga con
  separación estricta de rutas.

### Opción B (descartada): repositorios separados para API y para cada cliente

Tradeoffs:

- Cambios que cruzan API y cliente: exigen dos PR coordinados y un momento en que
  los repos están en estados incompatibles. Con un solo desarrollador es fricción
  pura sin ninguna ventaja de aislamiento de equipos que la justifique.
- Complejidad de tooling: baja por repo, alta en conjunto: cinco repos con cinco
  CI y cinco ciclos de release para un solo desarrollador.
- Versionado del contrato: obligaría a versionar la API en serio desde el primer
  día, o a romper clientes sin darse cuenta.

### Opción C (descartada): dos proyectos Laravel separados, uno para API y otro para el panel

Tradeoffs:

- Aislamiento entre API y panel: el mejor de los tres. Ningún riesgo de que una
  ruta de admin acabe colgando del middleware de la API o al revés.
- Duplicación: alta e inevitable. Los mismos modelos, migraciones, factories y
  configuración de base de datos en dos proyectos, con dos `composer.json` y dos
  vendor. Cualquier cambio de esquema se aplica dos veces.
- Coste operativo: dos aplicaciones PHP que desplegar y mantener sincronizadas
  contra la misma base de datos.

## 3) Decisión final

Se adopta la **Opción A**.

Motivo: el patrón de cambio dominante en este proyecto es "toco la API y toco el
cliente que la consume", y la Opción A es la única que lo resuelve en un solo
commit. La Opción C paga duplicación permanente de modelo de datos por un
aislamiento que se consigue igual de bien con disciplina de rutas. La Opción B
resuelve un problema de coordinación entre equipos que aquí no existe.

## 4) Lineamientos técnicos resultantes

- Estructura de la raíz: `api/` Laravel con API y panel, `web/` SPA React,
  `docs/`, `scripts/`, y `mobile/` y `extension/` reservados.
- Las rutas de API y las de administración están **completamente separadas**: la
  API bajo prefijo `/api` con su propio grupo de middleware, y el panel bajo su
  propio dominio y su propio guard. Ningún middleware se comparte por accidente.
- Los workflows de CI filtran por paths: no se analiza el backend cuando el PR solo
  toca `web/`, y viceversa.
- Un PR por issue, con squash, aunque toque `api/` y `web/` a la vez.
- La API se trata como contrato público desde el principio, no como backend
  privado de la SPA, porque `mobile/` y `extension/` la consumirán igual.

## 5) Consecuencias asumidas y lecciones ya aprendidas

1. El `.gitignore` de la raíz es un punto de fallo específico de esta estructura, y
   ya falló una vez. Ignoraba `api/bootstrap/cache` y los directorios de
   `api/storage`, pisando los `.gitignore` anidados del skeleton de Laravel, cuyo
   patrón de asterisco más excepción existe precisamente para ignorar el contenido
   pero conservar el directorio. En un checkout limpio esos directorios no
   existían y artisan fallaba. **Regla resultante: no ignorar desde la raíz del
   monorepo un directorio que el framework espera que exista.**
2. El repositorio debe ser clonable y ejecutable desde cero. Que funcione en la
   máquina de desarrollo no prueba nada, porque ahí los directorios ya existen. Se
   verifica reconstruyendo un checkout limpio con `git archive` y un
   `composer install` real dentro.
3. Un monorepo invita a compartir lo que no debe compartirse. La separación de
   rutas entre API y panel es la única barrera, así que es explícita y no
   incidental.

## 6) Triggers de reevaluación

Reevaluar si se cumple alguno:

1. Entra más de un desarrollador y los ciclos de release de API y clientes
   necesitan desacoplarse de verdad.
2. El panel de plataforma crece hasta ser un producto con su propio ciclo de vida.
3. El CI del monorepo se vuelve lo bastante lento como para que el filtrado por
   paths ya no lo compense.

## 7) Impacto en APIs y contratos

Ninguno en la forma del contrato. Fija el prefijo `/api` y la separación estricta
respecto a las rutas de administración, que es la parte que consume el issue #2.
