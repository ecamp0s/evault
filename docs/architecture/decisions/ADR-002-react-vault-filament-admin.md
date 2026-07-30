# eVault — React para la vault, Filament solo para administración

Fecha de decisión: planificación inicial del proyecto (marzo 2026)
Fecha de registro: 2026-07-30
Estado: Aprobada
Depende de: ADR-001 (zero-knowledge)

## 1) Contexto

El desarrollador viene de eBudget, un proyecto construido íntegramente sobre
Filament, con muy buenos resultados en velocidad de desarrollo: CRUDs, tablas,
filtros, formularios y autorización resueltos casi sin escribir frontend.

La tentación evidente era repetir ese stack en eVault. La pregunta que resuelve
este ADR es si Filament puede servir la interfaz de la vault, y qué papel le queda
si no puede.

## 2) Opciones evaluadas

### Opción A (elegida): SPA React para la vault, Filament solo para el panel de plataforma

La interfaz donde el usuario gestiona sus secretos es una SPA React separada.
Filament se reserva para el panel de administración de la plataforma, donde se
gestionan usuarios, planes, suscripciones y soporte, y donde no se manejan
secretos de usuario.

Tradeoffs:

- Compatibilidad con ADR-001: es la única opción que la respeta.
- Velocidad de desarrollo de la vault: baja. Hay que construir a mano formularios,
  tablas, estados de carga y navegación que Filament daría hechos.
- Velocidad de desarrollo del panel admin: alta, se conserva la ventaja de
  Filament exactamente donde sí es aplicable.
- Complejidad de stack: dos frontends, dos toolchains, dos sistemas de diseño que
  mantener coherentes.
- Reutilización para otros clientes: alta. La API que consume la SPA es la misma
  que consumirán la app móvil y la extensión de Firefox.

### Opción B (descartada): todo en Filament

Tradeoffs:

- Compatibilidad con ADR-001: **incompatible**. Filament es server-side rendering:
  renderiza en PHP, en el servidor. Para mostrar un secreto tendría que
  descifrarlo en el servidor, lo que exige que la clave de cifrado llegue al
  servidor. Eso anula el modelo zero-knowledge por completo, no lo debilita.
- Velocidad de desarrollo: la más alta de las tres opciones.
- Complejidad: la más baja, un solo stack.
- Consecuencia: implicaría cambiar el ADR-001, es decir, cambiar el producto.

### Opción C (descartada): Filament con criptografía en JavaScript inyectado

Mantener Filament y hacer el cifrado y descifrado en JavaScript del lado del
cliente, dentro de las vistas de Livewire.

Tradeoffs:

- Compatibilidad con ADR-001: teóricamente posible, en la práctica frágil.
  Livewire sincroniza estado de componente con el servidor en cada interacción, y
  cualquier campo que entre en ese ciclo viaja al servidor. Garantizar que ningún
  valor descifrado toque nunca el estado del componente exige luchar contra el
  modelo de trabajo del framework en cada formulario y cada tabla.
- Complejidad: alta y del peor tipo, porque el riesgo no está en el código que se
  escribe sino en lo que el framework hace por debajo. Un error no falla de forma
  visible: simplemente filtra un secreto al servidor sin que nadie lo note.
- Auditabilidad: mala. Demostrar la propiedad zero-knowledge requeriría auditar
  todo el ciclo de vida de Livewire, no solo el código propio.

## 3) Decisión final

Se adopta la **Opción A**.

Motivo: la Opción B es directamente incompatible con el ADR-001, que es la
decisión raíz del producto. La Opción C es compatible solo en teoría y su modo de
fallo es silencioso, que es el peor modo de fallo posible para esta garantía. El
coste de la Opción A —construir la vault a mano— es alto pero acotado y conocido,
y se recupera en parte al reutilizar la misma API para móvil y extensión.

Filament no se descarta: se reubica. En el panel de plataforma no hay secretos de
usuario que proteger, así que su ventaja de velocidad aplica sin conflicto.

## 4) Lineamientos técnicos resultantes

- La SPA React en `web/` es el único cliente de la vault. Consume la API REST.
- Filament sirve exclusivamente el panel de plataforma, bajo su propio dominio y
  sus propias rutas, completamente separadas de las de la API.
- Ninguna vista de Filament accede a contenido de vault items. Si en el futuro el
  panel necesita mostrar información sobre un vault, será metadato: fecha de
  creación, número de items, tamaño, nunca contenido.
- El panel de plataforma no es un panel de administración de tenants: es soporte y
  operación del SaaS. La distinción importa para no acabar necesitando leer datos.
- La API se diseña para ser consumida por más de un cliente desde el principio, no
  como backend de la SPA. Eso condiciona versionado y estabilidad del contrato.

## 5) Consecuencias asumidas

1. Dos frontends con dos sistemas de diseño. Se mitiga limitando el panel Filament
   a su apariencia por defecto: no se invierte en su diseño visual.
2. Todo CRUD de la vault se escribe a mano. Se mitiga con el sistema de diseño de
   `web/` y componentes reutilizables, cerrado en el issue #4.
3. El soporte al cliente trabajará con metadatos y no con contenido. Es
   consecuencia del ADR-001, y este ADR solo la hace visible en la herramienta.

## 6) Triggers de reevaluación

Esta decisión no se reevalúa mientras el ADR-001 siga vigente: es una consecuencia
directa suya. Si algún día se abandonara el modelo zero-knowledge, habría que
reabrir esta decisión junto con aquella, no por separado.

## 7) Impacto en APIs y contratos

Ninguno inmediato. Fija que las rutas de API y las de administración estén
completamente separadas, lo que se concreta en el ADR-003.
