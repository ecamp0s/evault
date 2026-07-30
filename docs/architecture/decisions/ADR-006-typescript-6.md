# eVault — Permanecer en TypeScript 6 y no subir a 7

Fecha de decisión: 2026-07-28 (durante el issue #4)
Fecha de registro: 2026-07-30
Estado: Aprobada, con reevaluación condicionada
Depende de: ADR-003 (la SPA como proyecto propio con su toolchain)

## 1) Contexto

TypeScript 7.0 se publicó el 8 de julio de 2026, con el compilador reescrito en
Go. Es una versión mayor atractiva por rendimiento y es la que un proyecto nuevo
elegiría por defecto, dado que el resto del stack de `web/` está deliberadamente
al día: React 19, Vite 8, Tailwind 4, Node 24.

Hay dos hechos verificados en el proyecto que lo impiden hoy:

1. La **API programática estable** del nuevo compilador no llega hasta la 7.1. En
   7.0 existe, pero no como interfaz estable para herramientas de terceros.
2. **typescript-eslint no soporta 7.0**, y cerró la petición de soporte como no
   planificada.

La consecuencia práctica es concreta y no cosmética: subir a TypeScript 7 rompe el
linting, porque typescript-eslint necesita esa API programática para construir el
árbol de tipos que usan las reglas type-aware.

Esto convive con una política general del proyecto de no adelantarse a versiones
sin necesidad, política que en el issue #1 se aplicó mal por exceso de prudencia:
allí se dio por imposible Pest 5 sin comprobarlo, y la comprobación posterior
demostró que resolvía limpio. La diferencia entre los dos casos es lo que este ADR
quiere dejar registrado.

## 2) Opciones evaluadas

### Opción A (elegida): permanecer en TypeScript 6

Tradeoffs:

- Linting: funciona. typescript-eslint opera con normalidad.
- Rendimiento de compilación: se renuncia a la mejora del compilador en Go.
- Deuda: acotada y con fecha de revisión, no indefinida.
- Riesgo: bajo. TypeScript 6 está soportado y es la versión que el ecosistema de
  herramientas asume hoy.

### Opción B (descartada): subir a TypeScript 7 y renunciar al linting type-aware

Tradeoffs:

- Rendimiento: el mejor.
- Calidad de código: se pierde la clase de errores que solo detectan las reglas con
  información de tipos, que son precisamente las que más valen en un proyecto que
  manejará criptografía en el cliente.
- Coherencia con el proyecto: incompatible con haber montado un stack de calidad
  con Larastan en nivel max en el backend. Renunciar al linting del frontend
  mientras se exige el máximo rigor al backend no tiene defensa.

### Opción C (descartada): subir a 7 y sustituir typescript-eslint

Tradeoffs:

- No existe hoy un sustituto equivalente con soporte de 7.0 y con la cobertura de
  reglas type-aware de typescript-eslint.
- Coste: alto, y sobre herramienta inmadura.

## 3) Decisión final

Se adopta la **Opción A**: `web/` permanece en TypeScript 6.x y no se sube a 7.

Motivo: existe un bloqueador concreto, verificable y con consecuencia visible —el
linting deja de funcionar—, no una simple prudencia ante una versión nueva. La
Opción B sacrifica justo el tipo de comprobación que este producto más necesita.

## 4) Lineamientos técnicos resultantes

- `typescript` se mantiene en la línea 6.x en `web/package.json`.
- **`@types/node` se mantiene en la línea 24**, para coincidir con el runtime de
  Node instalado. No se sube a 26 salvo que se actualice Node primero. Es una
  restricción distinta de la de TypeScript, con su propio motivo: los tipos deben
  describir el runtime real, no uno más nuevo.
- `baseUrl` no se usa en `tsconfig.json` ni en `tsconfig.app.json`. TypeScript 6 lo
  marca deprecado con error TS5101 y deja de funcionar en 7, y bloqueaba
  `npm run build`. `paths` sigue funcionando sin él bajo
  `moduleResolution: bundler`, así que no hace falta ningún workaround. Esto es
  además trabajo de preparación para la futura subida a 7.
- Toda subida de versión mayor en el frontend se comprueba contra el linting antes
  de aceptarse, no solo contra el build.

## 5) Método para futuras decisiones de versión

Registrado aquí porque es la lección transversal de los issues #1 y #4, y aplica a
cualquier dependencia, no solo a TypeScript:

1. No fiarse del constraint que trae el `composer.json` o el `package.json` de un
   template: puede ser un valor por defecto y no un límite real. En el issue #1, el
   `^12.5` de phpunit hacía parecer imposible PHPUnit 13, y el `require-dev` de
   `laravel/framework` declaraba soporte explícito.
2. Leer el manifiesto del paquete real y comprobar la resolución con
   `composer require --dry-run` o el equivalente de npm antes de descartar una
   versión.
3. Distinguir **bloqueador verificado** de **prudencia**. Un bloqueador se puede
   nombrar, señalar en un issue del proyecto upstream y reproducir. Si no se puede
   nombrar, es prudencia, y la prudencia no justifica quedarse atrás.
4. Si se decide no subir, dejar registrada la condición exacta que levantaría el
   bloqueo, para que la revisión futura no vuelva a empezar de cero.

## 6) Triggers de reevaluación

Reevaluar la subida a TypeScript 7 cuando se cumplan **ambas**:

1. TypeScript 7.1 publicado con la API programática estable.
2. typescript-eslint con soporte confirmado para esa versión.

Mientras solo se cumpla la primera, la decisión sigue en pie.

## 7) Impacto en APIs y contratos

Ninguno. Es una restricción de toolchain del frontend, sin efecto en el contrato de
la API ni en el modelo de datos.
