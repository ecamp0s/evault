# eVault — Deja de ser un SaaS: instancia personal y repositorio público

Fecha de decisión: 2026-08-03
Fecha de registro: 2026-08-03
Estado: Aprobada
Depende de: ADR-001 (zero-knowledge), ADR-005 (arquitectura self-hosteable)
Deja parcialmente sin efecto: ADR-002 (la parte del panel de administración)

## 1) Contexto

Todo lo escrito hasta hoy asume que eVault es un producto comercial: SaaS con
planes Free y Team, self-hosting reservado al plan Enterprise, y un panel de
administración de plataforma para gestionar cuentas de clientes. Ese supuesto
está en `SPRINT_CONTEXT.md`, en `ADR-002` y en la motivación de `ADR-005`.

**Ya no es cierto.** El proyecto no se va a comercializar. Sus dos propósitos
reales son:

1. **Instancia personal.** El autor quiere usarlo para sus propias contraseñas,
   en un servidor propio, como haría cualquiera que clone el repositorio.
2. **Repositorio público como muestra de trabajo.** Quien lo lea estará evaluando
   criterio técnico —código, decisiones de seguridad, arquitectura y
   documentación— en el contexto de un proceso de selección.

La cuestión no es si el trabajo hecho sirve. Sirve. La cuestión es que el
backlog, las prioridades y buena parte de la documentación están orientados a un
destinatario que no va a existir, y seguir así significa construir durante meses
para un cliente imaginario.

### El dato que conviene registrar antes de nada

Este cambio de modelo de negocio **no obliga a modificar una sola línea de
código**. No hay una URL que reescribir, ni un origen que extraer a
configuración, ni una ruta que desacoplar.

Eso no es suerte: es exactamente lo que `ADR-005` compró cuando decidió no
hardcodear nada y tratar el despliegue como configuración desde el primer commit.
Aquel ADR justificaba el coste con un cliente Enterprise hipotético que nunca
llegó, y el beneficio ha acabado cobrándose por una vía que no estaba prevista.
Merece quedar escrito, porque es la clase de decisión cuyo rendimiento nunca se
mide.

## 2) Opciones evaluadas

### Opción A (elegida): proyecto personal self-hosted y repositorio público

El self-hosting deja de ser un plan comercial y pasa a ser el único modo de
despliegue. El backlog se reordena en torno a dos preguntas: si algo hace el
producto utilizable por su autor, y si algo hace el repositorio legible por un
tercero.

Tradeoffs:

- Elimina de golpe trabajo caro construido sobre suposiciones no validadas:
  vaults compartidas, organizaciones y panel de administración.
- Sube la prioridad de lo que antes parecía accesorio y ahora es central: el
  README, el arranque reproducible, el export y el backup.
- Aparece un criterio de calidad nuevo y exigente: el código y la documentación
  van a ser leídos por desconocidos que juzgan a su autor.
- Riesgo específico, tratado en la sección 5: que «queda bien en el portfolio»
  desplace a «hace falta» como criterio de decisión.

### Opción B (descartada): seguir construyendo hacia el SaaS por si acaso

Mantener el rumbo comercial aunque no haya intención de comercializar, con el
argumento de que un producto más completo luce más.

Tradeoffs:

- Coste alto y continuo, en la dirección equivocada: las vaults compartidas
  exigen criptografía asimétrica, que es semanas de trabajo delicado para servir
  a cero usuarios.
- Empeora lo que sí importa. Un repositorio con funcionalidad a medias en cuatro
  frentes se lee peor que uno terminado en uno solo.
- Deja el peor de los dos mundos: ni producto comercial, porque no se va a
  vender, ni herramienta usable, porque lo que falta para usarla a diario
  —export, backup, despliegue— seguiría postergado.

### Opción C (descartada): uso estrictamente personal, repositorio privado

Renunciar al propósito de muestra de trabajo y optimizar solo para el uso propio.

Tradeoffs:

- Barato: no obliga a README en inglés, ni a demo, ni a cuidar la legibilidad
  para terceros.
- Desperdicia lo que ya es el mayor activo del proyecto. Ocho ADR razonados y una
  suite que verifica promesas de seguridad no le sirven de nada a un lector que
  es la misma persona que los escribió.
- La disciplina de documentación existente solo se sostiene si alguien la va a
  leer. Sin ese destinatario tiende a relajarse, y con ella la calidad del resto.

## 3) Decisión final

Se adopta la **Opción A**: eVault es un proyecto personal self-hosted cuyo
repositorio es público y sirve como muestra de trabajo.

Motivo: es la única opción que atiende a los dos propósitos reales sin pagar por
un tercero inexistente. La Opción B financia trabajo para un cliente que no
llegará. La Opción C tira un activo ya construido y pagado.

Los dos propósitos, además, **se disciplinan mutuamente**, y en eso se apoya la
decisión. El uso personal impide que el repositorio derive en escaparate: una
herramienta que uno usa a diario para sus propias contraseñas no tolera
funcionalidad decorativa ni atajos de fiabilidad. Y el carácter público impide
que el uso personal derive en chapuza tolerada, porque nadie publica bajo su
nombre lo que no defendería en una conversación técnica.

## 4) Lineamientos técnicos resultantes

- **El self-hosting es el modo de despliegue, no una opción de un plan.** `ADR-005`
  sigue vigente sin cambios y no se supersede: lo que cambia es su motivación, no
  su contenido. Todos sus lineamientos se mantienen.
- **Sale del alcance** lo que solo existía por el modelo de negocio: vaults
  compartidas entre varias personas, organizaciones, plan Team y panel de
  administración de plataforma. No se retira código por ello, porque ninguno
  llegó a escribirse.
- **No se retira el multi-tenancy** de `ADR-004`, aunque una instalación personal
  tenga un único usuario. Está construido, funciona, tiene tests de aislamiento y
  es la base sobre la que unas vaults compartidas cabrían si alguna vez hacen
  falta. Retirarlo sería trabajo destructivo a cambio de nada.
- **El repositorio es público y la licencia es MIT.**
- **La documentación se segmenta por audiencia, no por idioma.** El `README.md` de
  la raíz es la puerta de entrada y va en inglés; la documentación de trabajo
  —`SPRINT_CONTEXT`, `STATUS`, `SETUP`, `GUIDE` y los propios ADR— va en español.
  No se mantienen versiones duplicadas en dos idiomas: divergen siempre, y la que
  se queda atrás miente con autoridad. La regla y su excepción están en
  `CLAUDE.md`.
- **La instancia personal y cualquier despliegue de demostración son despliegues
  separados**, sin compartir base de datos ni servidor. La razón está en `ADR-001`
  y en el README: el modelo zero-knowledge protege la base de datos, no la
  integridad del JavaScript servido, así que una instancia con secretos reales no
  comparte infraestructura con una expuesta al público.
- **Criterio de priorización**, en este orden: primero lo que hace el producto
  fiable para quien lo usa de verdad —export, backup, despliegue reproducible—;
  después lo que lo hace legible para quien lo lee; y solo después funcionalidad
  nueva.

## 5) Consecuencias asumidas

1. **El multi-tenancy queda sobredimensionado** para el uso real, que es un
   usuario con una vault. Se asume a sabiendas: el coste ya está pagado y el
   aislamiento correcto no estorba.
2. **Riesgo de que el portfolio corrompa las decisiones.** Es la consecuencia más
   seria de esta decisión, porque no se manifiesta como un error sino como una
   preferencia: elegir la tecnología que suena mejor en una entrevista antes que
   la que resuelve el problema, o construir lo vistoso antes que lo necesario. El
   contrapeso es el propósito personal, que es exigente y no admite adornos, y la
   regla de priorización de la sección 4, que pone la fiabilidad por delante de
   la legibilidad. Si alguna vez hay que elegir entre las dos, gana el uso real.
3. **Ninguna funcionalidad puede volver a justificarse por «los clientes lo
   pedirán».** Cuando se proponga algo, la justificación tiene que ser que lo
   necesita el autor para su vault, que sin ello el repositorio no se entiende, o
   que cierra una promesa ya hecha en la documentación.
4. **Documentación en dos idiomas dentro del mismo repositorio**, con la
   incomodidad de que la portada y su contenido no coinciden. Se acepta y se
   avisa al final del propio README.
5. **La contradicción con `ADR-002` es parcial y hay que leerla con cuidado.** La
   mitad de aquella decisión —React para la vault, porque el renderizado en
   servidor rompería el zero-knowledge— sigue plenamente vigente y es
   estructural. La otra mitad —Filament para el panel de administración de
   plataforma— se queda sin sujeto: no hay plataforma que administrar. Por eso
   `ADR-002` no se marca como superseded, que daría a entender que React ha
   dejado de ser la elección correcta, sino como parcialmente sin efecto.

## 6) Triggers de reevaluación

Se reevalúa esta decisión si aparece alguien que no sea el autor queriendo usar
la instancia, o si el proyecto empieza a recibir contribuciones externas
sostenidas. Cualquiera de las dos cosas reintroduce preguntas que hoy se dan por
cerradas: gestión de usuarios, políticas de actualización y compromisos de
compatibilidad.

No se reevalúa por el hecho de que el repositorio reciba atención pública. Tener
lectores no es tener clientes, y confundir las dos cosas es precisamente lo que
la Opción B proponía.

## 7) Impacto en APIs y contratos

Ninguno. No cambia ninguna ruta, ningún campo, ningún esquema de base de datos ni
ningún formato criptográfico. Es una decisión sobre el alcance y el destinatario
del producto, no sobre su construcción, y el hecho de que pueda tomarse sin tocar
código es lo que se registra en la sección 1.
