# eVault — Multi-tenancy por vault, sin Spatie teams y con contexto explícito

Fecha de decisión: planificación inicial del proyecto (marzo 2026)
Fecha de registro: 2026-07-30
Estado: Aprobada
Depende de: ADR-003 (estructura del proyecto)
Relacionado: el `ADR-002` de un proyecto anterior del mismo autor, no público, cuya
conclusión se hereda

## 1) Contexto

eVault necesita aislar datos entre usuarios y, en los planes Team, permitir vaults
compartidas dentro de una organización. Es el mismo problema que un proyecto
anterior del mismo autor resolvió con households, y la experiencia acumulada allí
es directamente aplicable.

Hay dos decisiones que resolver, relacionadas pero distintas. La primera es qué
mecanismo sostiene el aislamiento y los permisos: `teams` nativo de
`spatie/laravel-permission` o un modelo propio. La segunda es cómo se transporta
el contexto del tenant activo en cada operación, y aquí eVault se separa de aquel
proyecto por una razón concreta: **la API es stateless y no tiene sesión donde
guardarlo.**

Allí el contexto activo vive en la sesión (`active_household_id`), lo que es
correcto para un panel Filament con sesión de servidor. Una API consumida por una
SPA, una app móvil y una extensión no tiene ese sitio donde guardarlo.

## 2) Opciones evaluadas

### Sobre el mecanismo de permisos

**Opción A (elegida): modelo propio de pertenencia, sin `teams` de Spatie.**

El tenant personal es un `Vault`. Los planes Team tienen una `Organization` con
vaults compartidas. La pertenencia y el rol viven en tablas propias, y los
servicios de aplicación validan pertenencia en cada operación.

Tradeoffs:

- Complejidad inmediata: baja. No hay que adoptar el modelo mental de `teams` ni
  su configuración global.
- Control: total sobre el significado de pertenencia y rol.
- Lock-in: bajo.
- Coste: la matriz de permisos se mantiene a mano y hay que ser disciplinado con
  el scoping en cada query.
- Evidencia previa: aquel proyecto evaluó exactamente esta decisión, resolvió
  **No-Go** para `teams`, y su modelo propio ha sostenido el producto en
  producción.

**Opción B (descartada): `teams` nativo de Spatie desde el principio.**

Tradeoffs:

- Complejidad inmediata: alta, y en el momento del proyecto en que menos aporta,
  porque todavía no hay ni modelo de vaults ni matriz de permisos que justifique la
  maquinaria.
- Ventaja a largo plazo: real si la colaboración multi-tenant crece mucho.
- Riesgo: acoplar las reglas de autorización a los detalles internos del paquete
  antes de saber qué reglas necesita el producto.

### Sobre el transporte del contexto activo

**Opción C (elegida): contexto explícito en cada llamada.**

Cada petición indica sobre qué vault opera, y el servicio valida que el usuario
autenticado pertenece a ese vault. Nada se infiere de estado previo.

Tradeoffs:

- Compatibilidad con API stateless: total. Es la única opción coherente con tener
  varios clientes sin sesión de servidor.
- Verbosidad: mayor. Cada endpoint y cada servicio lleva el identificador.
- Auditabilidad: mejor. La intención de cada petición es explícita y no depende de
  un estado invisible que pueda estar desincronizado.
- Riesgo de confusión de tenant: menor, porque no hay estado implícito que quede
  apuntando a otro vault.

**Opción D (descartada): contexto en sesión, como en el proyecto anterior.**

Tradeoffs:

- Verbosidad: menor, el identificador no viaja en cada llamada.
- Compatibilidad: incompatible con clientes sin sesión. Obligaría a sesión con
  cookies y, con ello, a la variante cookie-based de Sanctum y a toda la fricción
  de CSRF y dominios cruzados para móvil y extensión.
- Riesgo: un contexto activo obsoleto o mal fijado provoca operaciones sobre el
  tenant equivocado, que es el fallo más grave posible en un producto así.

## 3) Decisión final

Se adoptan la **Opción A** y la **Opción C**.

Motivo del mecanismo: se hereda la conclusión ya validada de aquel proyecto, cuyo
`ADR-002` resolvió No-Go para `teams` con el mismo tipo de problema y sin
arrepentimiento posterior. Adoptar `teams` ahora sería pagar complejidad antes de
tener el problema.

Motivo del transporte: es consecuencia obligada de servir una API stateless a tres
clientes distintos. La sesión no existe, así que el contexto tiene que viajar.

## 4) Lineamientos técnicos resultantes

- El tenant personal es un `Vault`. Los planes Team tienen una `Organization` con
  vaults compartidas.
- **Toda query lleva `vault_id`.** No hay excepciones "de conveniencia".
- Los servicios de aplicación validan pertenencia al vault en cada operación,
  recibiendo identificadores explícitos por parámetro. No acceden a sesión ni al
  usuario autenticado por su cuenta.
- No se usa `teams` de `spatie/laravel-permission`.
- **Double guard**: la validación se hace en la capa de presentación y también en
  la capa de aplicación. Nunca solo en una de las dos.
- **Tests de aislamiento cross-tenant obligatorios en todos los servicios
  críticos.** Un servicio que toca datos de vault sin test de aislamiento se
  considera incompleto.
- El contexto activo nunca se guarda en sesión en la API. Si un cliente quiere
  recordar el último vault usado, es estado suyo, no del servidor.

## 5) Consecuencias asumidas

1. La matriz de permisos se mantiene a mano. Es trabajo, pero explícito y legible.
2. El scoping por `vault_id` depende de disciplina, y la disciplina se olvida. Los
   tests de aislamiento son la red que lo detecta, no la buena intención.
3. Endpoints más verbosos por llevar el contexto explícito. Se acepta a cambio de
   no tener estado implícito de tenant.
4. Divergencia deliberada respecto al proyecto anterior en el transporte del
   contexto. Quien venga de aquel no debe asumir que aquí hay un contexto en
   sesión.

## 6) Triggers de reevaluación

Reevaluar la adopción de `teams` cuando se cumpla uno o más:

1. Entran invitaciones y colaboración avanzada entre organizaciones.
2. Se necesitan permisos por tenant más granulares de lo que el modelo propio
   sostiene con comodidad.
3. El coste de mantenimiento de la matriz propia produce incidentes recurrentes.

La decisión sobre el contexto explícito no se reevalúa mientras la API sirva a más
de un cliente sin sesión de servidor.

## 7) Impacto en APIs y contratos

Condiciona el contrato de forma permanente: los endpoints que operan sobre datos
de vault reciben el identificador de vault de forma explícita. Los endpoints de
autenticación del issue #3 son anteriores a la existencia de vaults y no lo llevan
todavía.
