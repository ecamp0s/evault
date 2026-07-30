# eVault — Arquitectura self-hosteable desde el principio

Fecha de decisión: planificación inicial del proyecto (marzo 2026)
Fecha de registro: 2026-07-30
Estado: Aprobada
Depende de: ADR-003 (estructura del proyecto)

## 1) Contexto

El modelo de negocio previsto es SaaS con planes Free y Team, más **self-hosting
para el plan Enterprise**. El self-hosting no es una idea vaga para el futuro: es
parte de la propuesta de valor, y para un gestor de secretos es un argumento de
venta de primer orden, porque hay clientes que no aceptan que sus credenciales
vivan en infraestructura ajena por mucho que estén cifradas.

La cuestión es cuándo se paga el coste de ser desplegable por terceros. Hay dos
momentos posibles: desde el primer commit, o cuando llegue el primer cliente
Enterprise.

La experiencia relevante es que la mayoría de los obstáculos al self-hosting no
son features que falten, sino supuestos incrustados: una URL absoluta en un
correo, un origen CORS escrito a mano, un dominio en un archivo de configuración,
una ruta del sistema de ficheros de la máquina de desarrollo. Cada uno es trivial
por separado, y desenterrarlos todos a la vez, meses después, no lo es.

## 2) Opciones evaluadas

### Opción A (elegida): self-hosteable desde el principio

Ninguna URL, dominio, origen o credencial hardcodeada. Todo por variables de
entorno, con el despliegue en contenedores como objetivo desde el diseño.

Tradeoffs:

- Coste inicial: bajo pero constante. Cada valor de entorno nuevo obliga a
  pensarlo, documentarlo y darle un valor por defecto sensato.
- Coste de la deuda evitada: alto. No hay una fase futura de "hacerlo
  desplegable", que es el tipo de trabajo que se estima mal y se posterga.
- Efecto colateral positivo: la configuración por entorno es también lo que hace
  posible tener desarrollo, staging y producción sin ramas divergentes.
- Riesgo: sobre-configurar, es decir, exponer como variable de entorno cosas que
  no son decisiones de despliegue sino de producto.

### Opción B (descartada): hardcodear ahora y extraer cuando haga falta

Tradeoffs:

- Coste inicial: nulo.
- Coste posterior: alto e incierto. Requiere auditar todo el código buscando
  supuestos, y el modo de fallo típico es descubrirlos en el despliegue del
  cliente, no antes.
- Riesgo específico de este producto: un origen o dominio mal fijado en un gestor
  de contraseñas no es una molestia de configuración, es potencialmente un fallo
  de seguridad.

### Opción C (descartada): abstracción de despliegue completa desde el principio

Helm charts, operadores, soporte de varios motores de base de datos y de varios
backends de almacenamiento desde el día uno.

Tradeoffs:

- Coste inicial: alto, y sobre suposiciones no validadas de lo que pedirán los
  clientes Enterprise, de los cuales todavía no hay ninguno.
- Beneficio: nulo hasta que exista ese cliente.

## 3) Decisión final

Se adopta la **Opción A**: SaaS primero como modelo de despliegue, pero con
arquitectura self-hosteable desde el principio.

Motivo: la Opción A cuesta poco de forma continua y evita una deuda cara y difícil
de estimar. La Opción C es especulación con coste inmediato. La Opción B convierte
el primer cliente Enterprise en una crisis de ingeniería en vez de en una venta.

## 4) Lineamientos técnicos resultantes

- **Ninguna URL, dominio u origen hardcodeado** en código ni en configuración
  versionada. Todo por variables de entorno.
- Los orígenes permitidos por CORS se leen de entorno, no se escriben en
  `config/cors.php`. Este es el punto que consume el issue #2.
- Todo valor de entorno tiene un valor por defecto sensato para desarrollo, de
  forma que un clon nuevo arranque sin configuración manual más allá de `.env`.
- `.env.example` se mantiene al día y es la documentación de facto de lo que hay
  que configurar para desplegar.
- Nada de rutas absolutas del sistema de ficheros de la máquina de desarrollo.
- El almacenamiento de blobs cifrados se abstrae por el sistema de ficheros de
  Laravel, para que el operador pueda elegir disco local u objeto compatible con
  S3 sin tocar código.
- Preparado para Docker: los procesos no asumen supervisión concreta, y el estado
  se mantiene fuera del contenedor.
- Nada de configuración que dependa del plan comercial en el código: un despliegue
  self-hosted no debe requerir un build distinto.

## 5) Consecuencias asumidas

1. Más variables de entorno que en un proyecto equivalente no desplegable por
   terceros. Se mitiga con valores por defecto y con `.env.example` cuidado.
2. Riesgo de sobre-configurar. Criterio para distinguir: si el valor cambia entre
   dos despliegues del mismo software, es entorno; si define cómo se comporta el
   producto igual en todos los despliegues, es código.
3. Un valor mal configurado falla en tiempo de ejecución y no en tiempo de
   compilación. Los valores críticos de seguridad, como los orígenes CORS, deben
   fallar de forma ruidosa y no degradar a permisivo.

## 6) Triggers de reevaluación

No se reevalúa la decisión de fondo mientras el self-hosting siga en la oferta
Enterprise. Sí se reevaluará el **grado** de abstracción de despliegue, es decir
si conviene ir hacia la Opción C, cuando exista el primer cliente Enterprise real
y sus requisitos concretos sustituyan las suposiciones.

## 7) Impacto en APIs y contratos

Ninguno en la forma del contrato. Impacta en configuración: la API no puede asumir
el dominio desde el que se la consume, lo que obliga a que los orígenes CORS y las
URLs de cliente sean configurables.
