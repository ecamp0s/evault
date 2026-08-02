ITERACIÓN 2 — Historial y lecciones aprendidas

Archivo de la Iteración 2, cerrada el 2 de agosto de 2026. Recoge la intención de cada issue y lo que se aprendió al cerrarlo.

Está archivado, no muerto. Casi todas las lecciones de abajo salieron de abrir el navegador o de leer un aviso del linter en vez de silenciarlo, y ninguna es obvia a posteriori: que execCommand no puede vaciar el portapapeles pasados treinta segundos, que btoa no maneja acentos, que el nombre accesible de un botón se calcula distinto en Chrome que en jsdom, que Chrome no deja redimensionar la ventana por debajo de 500 px. Cuando algo se comporte de forma rara en una zona ya tocada, merece la pena buscar aquí antes de investigar desde cero.

El objetivo era que un usuario guardase, consultase, editase y borrase credenciales en su vault personal. Se cumplió de punta a punta.

Nota de formato: prosa plana sin Markdown, por la convención del proyecto.

QUÉ SE HIZO

La iteración se planificó como diez issues, del 50 al 59, más tres de deuda arrastrada, el 43, el 44 y el 46. Se cerraron todos salvo el 59, que es deuda por diseño y vive hasta la Iteración 3. Por el camino salieron cuatro issues nuevos: el 60 de planificación, el 62 y el 63 de comprobaciones de CI, y el 73 con la implementación de la decisión del 43.

El estado del backlog no se lee aquí, se lee en docs/planning/STATUS.md, que se genera desde GitHub.

El issue 50 introduce el modelo de dominio: las tablas vaults y vault_members, y el vault personal creado dentro de la misma transacción que el usuario. A partir de ahí, todo el código posterior puede dar por hecho que existe.

El issue 51 fija el contrato del blob: la tabla vault_items sin ninguna columna con significado, y el documento docs/architecture/FOUNDATION.md que lo explica.

El issue 52 son los cinco endpoints de items con el contexto de vault explícito en la ruta, el double guard en dos capas y los tests de aislamiento cross-tenant que ADR-004 exige.

El issue 53 es GET /api/vaults, el punto de entrada al contexto de tenant desde el cliente.

El issue 54 monta TanStack Query y la capa de datos de la web, incluido el módulo único donde se codifica y descodifica el blob.

Los issues 55 a 58 son las pantallas: la lista con sus estados, crear y editar en un diálogo, borrar con confirmación, y copiar y mostrar la contraseña.

El 43 decidió dónde vive el token de sesión y lo registró en ADR-007. El 46 hizo usable el shell en móvil. El 44 sacó la ruta styleguide del build de producción.

LECCIONES DEL BACKEND

attach() de Eloquent inserta sin pasar por ningún modelo, así que una clave primaria UUID en una tabla de pertenencia se queda sin generar y revienta contra el NOT NULL en cuanto alguien usa la relación de la forma idiomática. La salida fue clave primaria compuesta, que además es el diseño habitual de una tabla así.

Larastan en nivel max detecta que esparcir un array de un DTO dentro de create() pierde la comprobación de propiedades del modelo. Enumerar los campos uno a uno es más largo y hace que una columna renombrada salga como error en vez de perderse en silencio.

El genérico de BelongsToMany lleva el tipo del pivot, y declararlo mal hace que el tipo mienta sin que nada falle en tiempo de ejecución. Al necesitar el rol tipado apareció el aviso; la solución fue un modelo de pivot propio, VaultMember, y declararlo en los dos extremos de la relación.

Para comprobar que una transacción revierte de verdad no hace falta un doble: quitar una tabla con Schema::drop provoca el fallo real y hace subir la excepción por el camino de producción. Funciona porque SQLite admite DDL dentro de una transacción, y los tests siempre corren sobre SQLite.

Un test que enumera las columnas de vault_items vale más que cualquier comentario: si alguien añade una, el test falla y obliga a preguntarse si ese dato puede estar en claro en el servidor. Está puesto para forzar esa conversación, no para actualizarlo sin pensar.

Sobre el 404 frente al 403: lo que hay que conservar no es que cada caso devuelva 404, sino que un recurso ajeno y uno inexistente sean indistinguibles. Por eso los tests comparan las dos respuestas entre sí en lugar de comprobar cada una por su lado.

LECCIONES DEL FRONTEND

btoa y atob solo manejan latin1. El primer nombre con eñe habría roto el guardado, así que la codificación pasa por UTF-8 de forma explícita en los dos sentidos. Hay test con acentos, emoji y kanji.

La regla react-hooks/set-state-in-effect señaló un efecto que resincronizaba el formulario al abrirlo. La salida correcta no era silenciar la regla sino quitar el efecto: montar el diálogo solo mientras está abierto y con key por entrada. Es lo que React recomienda para reiniciar estado cuando cambian las props, y de regalo elimina el fallo de abrir una entrada y ver un instante los datos de la anterior.

useBlocker de react-router solo funciona con un data router. Esta aplicación monta BrowserRouter, así que el aviso de cambios sin guardar se resolvió con un diálogo, donde todas las salidas pasan por el mismo sitio, en vez de migrar el router entero.

La regla react-refresh/only-export-components no admite que un fichero exporte a la vez un componente y funciones sueltas. Por eso la configuración de TanStack Query y su provider viven en ficheros separados.

El nombre accesible de un botón compuesto se calcula distinto en Chrome que en jsdom: Chrome une los textos con un espacio y jsdom no. Un test pasaba en navegador y fallaba en la suite. Taparlo con un regex habría escondido el problema real, que era que un lector de pantalla anunciaba los dos textos de corrido; la solución fue etiqueta explícita.

Los diálogos devuelven el foco al elemento que los abrió. Eso descarta poner el disparador dentro de un menú desplegable, porque el elemento de menú desaparece al cerrarse el menú y el foco se pierde.

jsdom no implementa matchMedia, y sonner lo llama al montar el Toaster. Sin un apaño en el setup de tests, cualquier test que compruebe un aviso revienta antes de la aserción.

LO QUE SOLO SE VE ABRIENDO EL NAVEGADOR

Dos de las lecciones más caras de la iteración no las habría encontrado ningún test, y las dos son de la misma familia: la interfaz prometiendo algo que no era verdad.

En el issue 55, el estado vacío decía que las contraseñas se guardan cifradas y solo legibles desde tus dispositivos. Durante la Iteración 2 eso es falso. Es el texto que sale solo al escribir un gestor de contraseñas. Además del arreglo se añadió un test que falla si alguien vuelve a prometer cifrado antes de que cierre el 59.

En el issue 58, el vaciado automático del portapapeles no funcionaba, y el aviso lo prometía igualmente. La causa: execCommand solo se ejecuta dentro de un gesto del usuario, así que en el setTimeout de treinta segundos después el navegador lo ignora. Se descubrió pegando el portapapeles pasado el plazo. Ahora la copia distingue si el vaciado ha llegado a programarse y el aviso solo menciona la cuenta atrás cuando va a ocurrir.

De ahí sale la regla práctica: cuando la interfaz haga una promesa sobre seguridad, escribir el test que falla si la promesa deja de ser cierta.

Relacionado, y también del 58: navigator.clipboard exige contexto seguro, y el entorno local sirve la web por http sobre un dominio que no es localhost, así que allí la API no existe. El plan B con execCommand no es un adorno para navegadores viejos, es el camino que se usa en desarrollo todos los días.

Y del 46: Chrome no deja redimensionar la ventana por debajo de 500 px. Comprobar un diseño a 375 px pide emulación de dispositivo; redimensionar da por bueno un tamaño que no es el que se quería probar.

LECCIONES DE PROCESO

La Definition of Done dice que al cerrar un issue se actualiza SPRINT_CONTEXT.md, pero nada lo comprueba, y se saltó en el 50, el 51 y el 52. Se puso al día de golpe en el 53, que es justo el fallo que la regla quiere evitar: escrito tres issues después, cuesta reconstruir el porqué de cada decisión. Quedó como criterio de aceptación del issue 62.

Un PR que solo toca documentación no dispara ningún check, y docs/GUIDE.md avisa de que ese es también el síntoma de un PR en conflicto. Las dos causas son indistinguibles, y pasó de verdad al mergear el 61. Es el issue 62.

Los conflictos en STATUS.md son estructurales y el procedimiento de GUIDE.md funciona, pero conviene crear los issues antes de abrir la rama: el bot regenera el fichero en master y cualquier rama viva que lo toque acaba chocando.
